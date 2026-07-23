import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { LogoutButton } from "@/components/logout-button";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { cancelBooking } from "@/server/booking/actions";
import { startPayment } from "@/server/payments/actions";
import { isPaymentConfigured } from "@/server/payments/moyasar";
import type { BookingStatus } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ booked?: string; error?: string }>;
};

/** Statuses a customer can still call off. Mirrors the guard in cancelBooking. */
const CANCELLABLE: BookingStatus[] = ["PENDING", "CONFIRMED"];

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { booked, error } = await searchParams;

  // The layout's requireRole has already redirected anyone without a session.
  const session = (await auth())!;
  const t = await getTranslations("Account");
  const tStatus = await getTranslations("BookingStatus");
  const tPayment = await getTranslations("PaymentStatus");
  const format = await getFormatter();
  const paymentsOn = isPaymentConfigured();

  const bookings = await prisma.booking.findMany({
    where: { customerId: session.user.id },
    include: {
      payment: { select: { status: true } },
      salon: { select: { slug: true, nameEn: true, nameAr: true } },
      items: {
        include: {
          service: { select: { nameEn: true, nameAr: true } },
          staff: { select: { name: true } },
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // "Upcoming" is about the visit still being on, not merely in the future: a
  // cancelled appointment next week belongs with the history.
  const now = new Date();
  const upcoming = bookings.filter(
    (booking) =>
      booking.endTime >= now && CANCELLABLE.includes(booking.status),
  );
  const past = bookings
    .filter((booking) => !upcoming.includes(booking))
    .reverse();

  function BookingCard({ booking }: { booking: (typeof bookings)[number] }) {
    const isCancellable =
      booking.endTime >= now && CANCELLABLE.includes(booking.status);

    return (
      <li className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href={`/salons/${booking.salon.slug}`}
              className="font-semibold underline"
            >
              {localized(booking.salon, "name", locale)}
            </Link>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {format.dateTime(booking.startTime, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
          </div>

          <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700">
            {tStatus(booking.status)}
          </span>
        </div>

        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {booking.items.map((item) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {localized(item.service, "name", locale)}{" "}
                <span className="text-gray-600 dark:text-gray-300">
                  {t("with", { staff: item.staff.name })}
                </span>
              </span>
              <span className="text-gray-600 dark:text-gray-300">
                {/* Bidi isolation, as on the opening-hours list: an RTL line
                    would otherwise reverse the range. */}
                {"⁦"}
                {format.dateTime(item.startTime, { timeStyle: "short" })} –{" "}
                {format.dateTime(item.endTime, { timeStyle: "short" })}
                {"⁩"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">
            {t("total", {
              price: format.number(Number(booking.totalPrice), {
                style: "currency",
                currency: "SAR",
              }),
            })}
            {booking.payment && (
              <span className="ms-2 text-sm font-normal text-gray-600 dark:text-gray-300">
                · {tPayment(booking.payment.status)}
              </span>
            )}
          </p>

          <div className="flex items-center gap-4">
            {/* Paying is what confirms the visit, so the prompt sits on the
                booking itself. Hidden entirely when no gateway is configured,
                rather than offering a button that cannot work. */}
            {paymentsOn && booking.status === "PENDING" && isCancellable && (
              <form action={startPayment}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <button
                  type="submit"
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
                >
                  {t("payNow")}
                </button>
              </form>
            )}

            {isCancellable && (
              <form action={cancelBooking}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <button type="submit" className="text-sm underline">
                  {t("cancel")}
                </button>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">
          {t("greeting", { name: session.user.name ?? session.user.email ?? "" })}
        </h1>
        <LogoutButton />
      </div>

      {booked && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100"
        >
          {paymentsOn ? t("bookedPayNext") : t("booked")}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {/* A failed refund is the one error here a customer must not be left
              to guess about — it means money is still with us. */}
          {error === "refund"
            ? t("errorRefund")
            : error === "gateway"
              ? t("errorGateway")
              : t("errorGeneric")}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("upcoming")}</h2>

        {upcoming.length === 0 ? (
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            {t("none")}{" "}
            <Link href="/salons" className="underline">
              {t("browse")}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {upcoming.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("past")}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {past.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
