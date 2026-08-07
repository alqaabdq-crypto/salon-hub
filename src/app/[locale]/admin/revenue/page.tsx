import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { RevenueChart, type RevenueBar } from "@/components/revenue-chart";
import { prisma } from "@/server/db/prisma";
import { riyadhToday } from "@/server/booking/time";
import { Prisma } from "@/generated/prisma/client";

type Props = { params: Promise<{ locale: string }> };

const ZERO = new Prisma.Decimal(0);

export default async function AdminRevenuePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Admin");
  const format = await getFormatter();

  const today = riyadhToday(new Date());

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, date: d };
  });

  // Every settled payment on the platform, with the salon it belongs to. The
  // split (platformFee / salonNet) was frozen at capture time, so these totals
  // never move when a commission rate changes later.
  //
  // Aggregated in JS rather than by SQL `groupBy`: the grouping key lives on the
  // related Booking, which Prisma cannot group by directly. Fine at this size —
  // and the reason there is a `take` below rather than an unbounded read.
  const payments = await prisma.payment.findMany({
    where: { status: "SUCCEEDED" },
    select: {
      amount: true,
      platformFee: true,
      salonNet: true,
      booking: {
        select: {
          startTime: true,
          salon: {
            select: { id: true, nameEn: true, nameAr: true, slug: true, city: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  type Row = {
    salon: (typeof payments)[number]["booking"]["salon"];
    bookings: number;
    gross: Prisma.Decimal;
    fee: Prisma.Decimal;
    net: Prisma.Decimal;
  };

  const bySalon = new Map<string, Row>();
  const feeByMonth = new Map<string, number>();

  let gross = ZERO;
  let fees = ZERO;
  let net = ZERO;

  for (const payment of payments) {
    const salon = payment.booking.salon;
    const row = bySalon.get(salon.id) ?? {
      salon,
      bookings: 0,
      gross: ZERO,
      fee: ZERO,
      net: ZERO,
    };

    row.bookings += 1;
    row.gross = row.gross.plus(payment.amount);
    row.fee = row.fee.plus(payment.platformFee ?? ZERO);
    row.net = row.net.plus(payment.salonNet ?? ZERO);
    bySalon.set(salon.id, row);

    gross = gross.plus(payment.amount);
    fees = fees.plus(payment.platformFee ?? ZERO);
    net = net.plus(payment.salonNet ?? ZERO);

    const d = payment.booking.startTime;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    feeByMonth.set(key, (feeByMonth.get(key) ?? 0) + Number(payment.platformFee ?? 0));
  }

  // Biggest earners first: the question this page answers is which salons carry
  // the marketplace, and that is the order it should be readable in.
  const rows = [...bySalon.values()].sort((a, b) => b.net.comparedTo(a.net));

  const sar = (value: Prisma.Decimal) =>
    format.number(Number(value), { style: "currency", currency: "SAR" });

  const bars: RevenueBar[] = months.map(({ key, date }) => {
    const value = feeByMonth.get(key) ?? 0;
    return {
      label: format.dateTime(date, { month: "short" }),
      value,
      display: format.number(value, { maximumFractionDigits: 0 }),
    };
  });

  const chartTotal = bars.reduce((sum, bar) => sum + bar.value, 0);
  const chartAria = `${t("revChartTitle")}: ${bars
    .map(
      (bar) =>
        `${bar.label} ${format.number(bar.value, { style: "currency", currency: "SAR", maximumFractionDigits: 0 })}`,
    )
    .join(", ")}`;

  const tiles = [
    { label: t("revPlatform"), value: sar(fees), hint: t("revPlatformHint"), emphasis: true },
    { label: t("revGross"), value: sar(gross), hint: t("revGrossHint"), emphasis: false },
    { label: t("revSalons"), value: sar(net), hint: t("revSalonsHint"), emphasis: false },
    {
      label: t("revPaidCount"),
      value: format.number(payments.length),
      hint: t("revPaidHint"),
      emphasis: false,
    },
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("revTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("revSubtitle")}</p>
        </div>
        <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
          <span aria-hidden>←</span> {t("title")}
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-2xl border p-4 ${
              tile.emphasis ? "border-brand/40 bg-brand/10" : "border-hairline bg-surface/40"
            }`}
          >
            <p className="text-xs font-medium text-muted">{tile.label}</p>
            <p
              className={`mt-1.5 text-2xl font-extrabold tracking-tight ${
                tile.emphasis ? "text-brand" : ""
              }`}
            >
              {tile.value}
            </p>
            <p className="mt-1 text-xs text-muted">{tile.hint}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 rounded-2xl border border-hairline bg-surface/40 p-5">
        <h3 className="text-base font-semibold">{t("revChartTitle")}</h3>
        {chartTotal > 0 ? (
          <div className="mt-4">
            <RevenueChart bars={bars} ariaSummary={chartAria} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">{t("revChartEmpty")}</p>
        )}
      </section>

      <h3 className="mt-10 text-base font-semibold">{t("revPerSalon")}</h3>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-hairline bg-surface/40 p-6 text-sm text-muted">
          {t("revEmpty")}
        </p>
      ) : (
        // Scrolls inside its own container: six numeric columns will not fit a
        // phone, and the page itself must never scroll sideways.
        <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface/60 text-start">
                <th className="p-3 text-start font-medium">{t("revColSalon")}</th>
                <th className="p-3 text-end font-medium">{t("revColBookings")}</th>
                <th className="p-3 text-end font-medium">{t("revColGross")}</th>
                <th className="p-3 text-end font-medium">{t("revColFee")}</th>
                <th className="p-3 text-end font-medium">{t("revColNet")}</th>
                <th className="p-3 text-end font-medium">{t("revColRate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.salon.id} className="border-b border-hairline last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/salons/${row.salon.slug}`}
                      className="font-medium hover:text-brand hover:underline"
                    >
                      {localized(row.salon, "name", locale)}
                    </Link>
                    <span className="ms-2 text-xs text-muted">{row.salon.city}</span>
                  </td>
                  <td className="p-3 text-end tabular-nums">{format.number(row.bookings)}</td>
                  <td className="p-3 text-end tabular-nums text-muted">{sar(row.gross)}</td>
                  <td className="p-3 text-end tabular-nums text-muted">{sar(row.fee)}</td>
                  <td className="p-3 text-end font-semibold tabular-nums text-brand">
                    {sar(row.net)}
                  </td>
                  <td className="p-3 text-end tabular-nums text-muted">
                    {/* The rate actually realised, not the configured one — a
                        salon whose rate changed mid-period sits between the two. */}
                    {row.gross.isZero()
                      ? "—"
                      : format.number(Number(row.fee.dividedBy(row.gross)), {
                          style: "percent",
                          maximumFractionDigits: 1,
                        })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline bg-surface/60 font-semibold">
                <td className="p-3">{t("revTotal")}</td>
                <td className="p-3 text-end tabular-nums">{format.number(payments.length)}</td>
                <td className="p-3 text-end tabular-nums">{sar(gross)}</td>
                <td className="p-3 text-end tabular-nums">{sar(fees)}</td>
                <td className="p-3 text-end tabular-nums text-brand">{sar(net)}</td>
                <td className="p-3 text-end tabular-nums">
                  {gross.isZero()
                    ? "—"
                    : format.number(Number(fees.dividedBy(gross)), {
                        style: "percent",
                        maximumFractionDigits: 1,
                      })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">{t("revNote")}</p>
    </div>
  );
}
