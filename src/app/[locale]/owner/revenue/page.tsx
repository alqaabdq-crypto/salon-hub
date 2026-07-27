import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { NeedsSalon } from "@/components/needs-salon";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { getOwnedSalon } from "@/server/salon/owner";
import { Prisma } from "@/generated/prisma/client";

type Props = {
  params: Promise<{ locale: string }>;
};

const ZERO = new Prisma.Decimal(0);

export default async function OwnerRevenuePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const tPayment = await getTranslations("PaymentStatus");
  const format = await getFormatter();

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return <NeedsSalon />;

  // Revenue reaches a salon through its bookings' payments. The commission split
  // (salonNet / platformFee) was frozen at capture time, so these figures never
  // shift when a rate changes later.
  const payments = await prisma.payment.findMany({
    where: {
      booking: { salonId: salon.id },
      status: { in: ["SUCCEEDED", "REFUNDED"] },
    },
    include: {
      booking: {
        select: {
          startTime: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const succeeded = payments.filter((p) => p.status === "SUCCEEDED");

  const money = (rows: typeof succeeded, key: "amount" | "platformFee" | "salonNet") =>
    rows.reduce((sum, p) => sum.plus(p[key] ?? ZERO), ZERO);

  const net = money(succeeded, "salonNet");
  const gross = money(succeeded, "amount");
  const fees = money(succeeded, "platformFee");
  const awaitingPayout = money(
    succeeded.filter((p) => p.payoutId === null),
    "salonNet",
  );

  const sar = (value: Prisma.Decimal) =>
    format.number(Number(value), { style: "currency", currency: "SAR" });

  const tiles = [
    { label: t("revNet"), value: sar(net), hint: t("revNetHint"), emphasis: true },
    { label: t("revGross"), value: sar(gross), hint: t("revGrossHint"), emphasis: false },
    { label: t("revFees"), value: sar(fees), hint: t("revFeesHint"), emphasis: false },
    { label: t("revPaidCount"), value: String(succeeded.length), hint: t("revPaidHint"), emphasis: false },
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("navRevenue")}</h2>
          <p className="mt-1 text-sm text-muted">{t("revSubtitle")}</p>
        </div>
        {succeeded.length > 0 && (
          <p className="rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
            {t("revAwaiting", { amount: sar(awaitingPayout) })}
          </p>
        )}
      </div>

      {/* Summary tiles. */}
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

      {/* Recent payments. */}
      <h3 className="mt-10 text-base font-semibold">{t("revRecent")}</h3>
      {payments.length === 0 ? (
        <p className="mt-3 rounded-xl border border-hairline bg-surface/40 p-6 text-sm text-muted">
          {t("revEmpty")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/40 p-4"
            >
              <div>
                <p className="font-medium">{payment.booking.customer.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {format.dateTime(payment.booking.startTime, { dateStyle: "medium" })}
                </p>
              </div>
              <div className="text-end">
                <p className="font-semibold text-brand">
                  {payment.status === "SUCCEEDED"
                    ? sar(payment.salonNet ?? ZERO)
                    : sar(ZERO)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("revGrossOf", { amount: sar(payment.amount) })} ·{" "}
                  {tPayment(payment.status)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
