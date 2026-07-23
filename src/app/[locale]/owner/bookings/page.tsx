import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/content";
import { NeedsSalon } from "@/components/needs-salon";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { getOwnedSalon } from "@/server/salon/owner";
import { updateBookingStatus } from "@/server/salon/actions";
import { nextStatuses } from "@/server/booking/status";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; show?: string }>;
};

export default async function OwnerBookingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error, show } = await searchParams;
  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const tStatus = await getTranslations("BookingStatus");
  const tPayment = await getTranslations("PaymentStatus");
  const format = await getFormatter();

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return <NeedsSalon />;

  const past = show === "past";
  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      salonId: salon.id,
      ...(past ? { endTime: { lt: now } } : { endTime: { gte: now } }),
    },
    include: {
      customer: { select: { name: true, phone: true, email: true } },
      payment: { select: { status: true, amount: true } },
      items: {
        include: {
          service: { select: { nameEn: true, nameAr: true } },
          staff: { select: { name: true } },
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { startTime: past ? "desc" : "asc" },
    take: 100,
  });

  return (
    <div className="mt-8">
      {saved && (
        <p role="status" className="mb-4 rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {error === "transition" ? t("errorTransition") : t("errorInvalid")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("navBookings")}</h2>
        <div className="flex gap-3 text-sm">
          <a href="?" className={past ? "underline" : "font-medium"}>
            {t("upcoming")}
          </a>
          <a href="?show=past" className={past ? "font-medium" : "underline"}>
            {t("past")}
          </a>
        </div>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-4 text-gray-600 dark:text-gray-300">{t("noBookings")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {bookings.map((booking) => (
            <li key={booking.id} className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {format.dateTime(booking.startTime, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {booking.customer.name}
                    {booking.customer.phone ? ` · ${booking.customer.phone}` : ""}
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
                        {t("withStaff", { staff: item.staff.name })}
                      </span>
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">
                      {"⁦"}
                      {format.dateTime(item.startTime, { timeStyle: "short" })} –{" "}
                      {format.dateTime(item.endTime, { timeStyle: "short" })}
                      {"⁩"}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {format.number(Number(booking.totalPrice), {
                    style: "currency",
                    currency: "SAR",
                  })}
                  {booking.payment && (
                    <span className="ms-2 font-normal text-gray-600 dark:text-gray-300">
                      · {tPayment(booking.payment.status)}
                    </span>
                  )}
                </p>

                {/* Only transitions the state machine actually permits are
                    offered — the same table the action re-checks server-side. */}
                <div className="flex flex-wrap gap-2">
                  {nextStatuses(booking.status).map((status) => (
                    <form action={updateBookingStatus} key={status}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <input type="hidden" name="status" value={status} />
                      <button
                        type="submit"
                        className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:border-gray-500 dark:border-gray-700 dark:hover:border-gray-400"
                      >
                        {t(`action${status}` as "actionCONFIRMED")}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
