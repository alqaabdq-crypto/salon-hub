"use server";

import { headers } from "next/headers";
import { redirect as externalRedirect } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { createInvoice, isPaymentConfigured } from "@/server/payments/moyasar";
import { ensurePayment, HOLD_MINUTES } from "@/server/payments/service";
import { sarToHalalas } from "@/server/payments/money";

const localeSchema = z.enum(routing.locales);

const startPaymentSchema = z.object({
  locale: localeSchema,
  bookingId: z.string().min(1),
});

/**
 * The public origin of this deployment, taken from the request.
 *
 * Deliberately *not* an environment variable: the project has a standing rule
 * against AUTH_URL/NEXTAUTH_URL precisely because a pinned origin sends
 * redirects to the wrong host on preview builds and behind proxies. The gateway
 * has to send the customer back to whichever host they actually came from.
 */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

export async function startPayment(formData: FormData): Promise<void> {
  const parsed = startPaymentSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;

  if (!parsed.success) {
    return redirect({ href: "/account", locale });
  }

  const session = await auth();
  if (!session?.user) {
    return redirect({ href: "/auth/login", locale });
  }

  if (!isPaymentConfigured()) {
    return redirect({ href: "/account?error=payments-off", locale });
  }

  // Scoped by customerId: another customer's booking id matches nothing. Only a
  // booking still awaiting confirmation can be paid for.
  const booking = await prisma.booking.findFirst({
    where: {
      id: parsed.data.bookingId,
      customerId: session.user.id,
      status: "PENDING",
    },
    select: {
      id: true,
      totalPrice: true,
      salon: { select: { nameEn: true } },
    },
  });

  if (!booking) {
    return redirect({ href: "/account?error=unpayable", locale });
  }

  const payment = await ensurePayment(booking.id);
  if (!payment) {
    return redirect({ href: "/account?error=unpayable", locale });
  }

  const origin = await requestOrigin();

  const invoice = await createInvoice({
    amountHalalas: sarToHalalas(booking.totalPrice.toString()),
    description: `Salon Hub — ${booking.salon.nameEn}`,
    callbackUrl: `${origin}/${locale}/account/payment-return?booking=${booking.id}`,
    bookingId: booking.id,
    // Expire the invoice with the hold itself, so a link opened tomorrow cannot
    // pay for a slot that was released this evening.
    expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
  });

  if (!invoice.ok) {
    console.error("[moyasar] invoice creation failed:", invoice.error);
    return redirect({ href: "/account?error=gateway", locale });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { gatewayInvoiceId: invoice.data.id },
  });

  // Leaves the app for Moyasar's hosted page, so this is next/navigation's
  // redirect — next-intl's is for locale-prefixed internal paths only.
  externalRedirect(invoice.data.url);
}
