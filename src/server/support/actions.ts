"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { requireRole } from "@/server/auth/rbac";

const localeSchema = z.enum(routing.locales);

const TOPICS = ["BOOKING", "PAYMENT", "SALON", "ACCOUNT", "OTHER"] as const;

const ticketSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  topic: z.enum(TOPICS),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(4000),
  bookingId: z.string().trim().optional(),
});

/**
 * Raises a support ticket.
 *
 * Open to guests by design — the person most in need of help is often the one
 * who cannot sign in — which is also why it is the most abusable endpoint on the
 * site. The mitigations are deliberately ones that survive JavaScript being off:
 * a honeypot field, length limits, and a per-sender cap. None of them stop a
 * determined attacker; see PROGRESS.md for what would.
 */
export async function createSupportTicket(formData: FormData): Promise<void> {
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;

  // Honeypot. A field hidden from people and irresistible to form-filling bots;
  // a hit is accepted with a normal success redirect rather than an error, so
  // the bot learns nothing about why nothing happened.
  if (String(formData.get("website") ?? "") !== "") {
    return redirect({ href: "/help?sent=1", locale });
  }

  const parsed = ticketSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return redirect({ href: "/help?error=invalid", locale });
  }

  const { bookingId, ...fields } = parsed.data;
  const session = await auth();
  const customerId = session?.user?.id ?? null;

  // Only accept a booking reference the sender actually owns. Otherwise the
  // field is a way to read back whether an arbitrary booking id exists.
  const linkedBookingId =
    bookingId && customerId
      ? (
          await prisma.booking.findFirst({
            where: { id: bookingId, customerId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

  // A cap rather than true rate limiting: it needs no store beyond the table
  // that is already being written, and it bounds the damage one address can do
  // between an admin looking at the queue.
  const openForSender = await prisma.supportTicket.count({
    where: { email: fields.email, status: "OPEN" },
  });

  if (openForSender >= 5) {
    return redirect({ href: "/help?error=too-many", locale });
  }

  await prisma.supportTicket.create({
    data: { ...fields, customerId, bookingId: linkedBookingId },
  });

  revalidatePath(`/${locale}/help`);
  return redirect({ href: "/help?sent=1", locale });
}

const replySchema = z.object({
  ticketId: z.string().min(1),
  reply: z.string().trim().min(1).max(4000),
  resolve: z.string().optional(),
});

/**
 * Answers a ticket. Admin only — `requireRole` is the authorization boundary
 * here, not the fact that the form is rendered on an admin page.
 */
export async function replyToTicket(formData: FormData): Promise<void> {
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  await requireRole(["ADMIN"], locale);

  const parsed = replySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return redirect({ href: "/admin/support?error=invalid", locale });
  }

  await prisma.supportTicket.update({
    where: { id: parsed.data.ticketId },
    data: {
      adminReply: parsed.data.reply,
      answeredAt: new Date(),
      // Answering and closing are separate acts: most replies invite a follow-up,
      // so a ticket only reaches RESOLVED when the admin says it is done.
      status: parsed.data.resolve === "on" ? "RESOLVED" : "ANSWERED",
    },
  });

  revalidatePath(`/${locale}/admin/support`);
  return redirect({ href: "/admin/support?saved=1", locale });
}

const statusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(["OPEN", "ANSWERED", "RESOLVED"]),
});

/** Moves a ticket's status without writing a reply — reopening, or closing one
 *  that was handled by phone. */
export async function setTicketStatus(formData: FormData): Promise<void> {
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  await requireRole(["ADMIN"], locale);

  const parsed = statusSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return redirect({ href: "/admin/support?error=invalid", locale });
  }

  await prisma.supportTicket.update({
    where: { id: parsed.data.ticketId },
    data: { status: parsed.data.status },
  });

  revalidatePath(`/${locale}/admin/support`);
  return redirect({ href: "/admin/support?saved=1", locale });
}
