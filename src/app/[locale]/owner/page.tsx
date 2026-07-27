import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { NeedsSalon } from "@/components/needs-salon";
import { RevenueChart, type RevenueBar } from "@/components/revenue-chart";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { getOwnedSalon } from "@/server/salon/owner";
import { BLOCKING_STATUSES } from "@/server/booking/schedule";
import { riyadhDayStart, riyadhToday } from "@/server/booking/time";

type Props = { params: Promise<{ locale: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function OwnerOverviewPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const tStatus = await getTranslations("SalonStatus");
  const format = await getFormatter();

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return <NeedsSalon />;

  const today = riyadhToday(new Date());
  const dayStart = riyadhDayStart(today);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const [services, staff, upcoming, todays] = await Promise.all([
    prisma.service.count({ where: { salonId: salon.id, isActive: true } }),
    prisma.staff.count({ where: { salonId: salon.id, isActive: true } }),
    prisma.booking.count({
      where: {
        salonId: salon.id,
        status: { in: BLOCKING_STATUSES },
        endTime: { gte: new Date() },
      },
    }),
    prisma.booking.findMany({
      where: {
        salonId: salon.id,
        status: { in: BLOCKING_STATUSES },
        startTime: { gte: dayStart, lt: dayEnd },
      },
      include: {
        customer: { select: { name: true } },
        items: {
          include: { service: { select: { nameEn: true, nameAr: true } } },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const isLive = salon.status === "APPROVED";

  // Monthly net revenue for the last 6 months, bucketed by the booking's date.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, date: d };
  });

  const revenuePayments = await prisma.payment.findMany({
    where: {
      status: "SUCCEEDED",
      booking: { salonId: salon.id, startTime: { gte: months[0].date } },
    },
    select: { salonNet: true, booking: { select: { startTime: true } } },
  });

  const netByMonth = new Map<string, number>();
  for (const payment of revenuePayments) {
    const d = payment.booking.startTime;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + Number(payment.salonNet ?? 0));
  }

  const revenueBars: RevenueBar[] = months.map(({ key, date }) => {
    const value = netByMonth.get(key) ?? 0;
    return {
      label: format.dateTime(date, { month: "short" }),
      value,
      display: format.number(value, { maximumFractionDigits: 0 }),
    };
  });

  const revenueTotal = revenueBars.reduce((sum, bar) => sum + bar.value, 0);
  const revenueChartAria = `${t("revChartTitle")}: ${revenueBars
    .map((b) => `${b.label} ${format.number(b.value, { style: "currency", currency: "SAR", maximumFractionDigits: 0 })}`)
    .join(", ")}`;

  return (
    <div>
      <section className="mt-8 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{localized(salon, "name", locale)}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {salon.address}, {salon.city}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              isLive
                ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            }`}
          >
            {tStatus(salon.status)}
          </span>
        </div>

        {isLive ? (
          <Link href={`/salons/${salon.slug}`} className="mt-3 inline-block text-sm underline">
            {t("viewPublicPage")}
          </Link>
        ) : (
          // Says why the listing is invisible, so an owner does not conclude the
          // product is broken while an admin has simply not reviewed them yet.
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            {t("notLiveExplainer")}
          </p>
        )}
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: t("statServices"), value: services, href: "/owner/services" },
          { label: t("statStaff"), value: staff, href: "/owner/staff" },
          { label: t("statUpcoming"), value: upcoming, href: "/owner/bookings" },
        ].map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className="rounded-xl border border-gray-200 p-5 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
          >
            <p className="text-3xl font-bold">{format.number(stat.value)}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{stat.label}</p>
          </Link>
        ))}
      </section>

      {/* Monthly revenue chart — a compact view of the Revenue tab. */}
      <section className="mt-6 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("revChartTitle")}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t("revChartHint")}</p>
          </div>
          <Link href="/owner/revenue" className="text-sm underline">
            {t("navRevenue")}
          </Link>
        </div>

        {revenueTotal > 0 ? (
          <div className="mt-4">
            <RevenueChart bars={revenueBars} ariaSummary={revenueChartAria} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{t("revChartEmpty")}</p>
        )}
      </section>

      {/* An empty catalog is the most common reason a freshly approved salon
          gets no bookings, so the prompt is on the page they land on. */}
      {(services === 0 || staff === 0) && (
        <p className="mt-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {services === 0 ? t("addServicesFirst") : t("addStaffFirst")}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("todaysBookings")}</h2>

        {todays.length === 0 ? (
          <p className="mt-3 text-gray-600 dark:text-gray-300">{t("nothingToday")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {todays.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
              >
                <div>
                  <p className="font-medium">
                    {"⁦"}
                    {format.dateTime(booking.startTime, { timeStyle: "short" })} –{" "}
                    {format.dateTime(booking.endTime, { timeStyle: "short" })}
                    {"⁩"}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {booking.customer.name} ·{" "}
                    {booking.items
                      .map((item) => localized(item.service, "name", locale))
                      .join(" + ")}
                  </p>
                </div>
                <Link href="/owner/bookings" className="text-sm underline">
                  {t("manage")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
