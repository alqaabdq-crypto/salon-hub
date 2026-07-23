import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { fetchPayment, isPaidStatus } from "@/server/payments/moyasar";
import { settleFromGateway } from "@/server/payments/service";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    booking?: string;
    /** Moyasar appends these to the callback URL. */
    id?: string;
    status?: string;
    message?: string;
  }>;
};

/**
 * Where Moyasar sends the customer back to.
 *
 * The query string it arrives with is **not** evidence: it is attacker-supplied,
 * since anyone can visit this URL with `status=paid`. The payment id is used
 * only to look the payment up through the API with our secret key, and that
 * answer is what gets recorded. The webhook does the same work independently, so
 * a customer who closes the tab still ends up confirmed.
 */
export default async function PaymentReturnPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { booking: bookingId, id: gatewayPaymentId } = await searchParams;
  const t = await getTranslations("Payment");

  const session = (await auth())!;

  let paid = false;

  if (gatewayPaymentId) {
    const result = await fetchPayment(gatewayPaymentId);

    if (result.ok) {
      // settleFromGateway matches on the metadata Moyasar echoes back, so a
      // payment id belonging to someone else cannot settle this customer's
      // booking; it settles its own, or nothing.
      await settleFromGateway(result.data);
      paid = isPaidStatus(result.data.status);
    }
  }

  // Fall back to our own record: the webhook may have arrived first, and on a
  // second visit to this page there is no payment id in the URL at all.
  if (!paid && bookingId) {
    const payment = await prisma.payment.findFirst({
      where: {
        bookingId,
        status: "SUCCEEDED",
        booking: { customerId: session.user.id },
      },
      select: { id: true },
    });

    paid = Boolean(payment);
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-6 text-center">
      <h1 className="mt-10 text-2xl font-bold">{paid ? t("paidTitle") : t("notPaidTitle")}</h1>

      <p className="mt-3 text-gray-600 dark:text-gray-300">
        {paid ? t("paidBody") : t("notPaidBody")}
      </p>

      <Link
        href="/account"
        className="mt-8 inline-block rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
      >
        {t("backToBookings")}
      </Link>
    </main>
  );
}
