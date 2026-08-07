import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { prisma } from "@/server/db/prisma";
import { setSalonStatus } from "@/server/admin/actions";
import type { SalonStatus } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

/** What an admin may set from each state. Rejected salons can be reconsidered. */
const ACTIONS: Record<SalonStatus, SalonStatus[]> = {
  PENDING_VERIFICATION: ["APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  REJECTED: ["APPROVED"],
  SUSPENDED: ["APPROVED"],
};

export default async function AdminPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error } = await searchParams;
  const t = await getTranslations("Admin");
  const tStatus = await getTranslations("SalonStatus");
  const tSupport = await getTranslations("Support");
  const format = await getFormatter();

  const [salons, customers, owners, bookings, openTickets, feeTotals] = await Promise.all([
    prisma.salon.findMany({
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { services: true, staff: true, bookings: true } },
      },
      // Pending first: the queue is the job, the rest is reference.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.user.count({ where: { role: "SALON_OWNER" } }),
    prisma.booking.count(),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    // Platform commission to date. Summed by the database rather than pulled
    // into memory — the dashboard only needs the one number.
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { platformFee: true },
    }),
  ]);

  const platformFees = feeTotals._sum.platformFee ?? 0;

  const pending = salons.filter((salon) => salon.status === "PENDING_VERIFICATION");
  const rest = salons.filter((salon) => salon.status !== "PENDING_VERIFICATION");

  function SalonRow({ salon }: { salon: (typeof salons)[number] }) {
    return (
      <li className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{localized(salon, "name", locale)}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {salon.city} · {salon.owner.name} · {salon.owner.email}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {t("counts", {
                services: salon._count.services,
                staff: salon._count.staff,
                bookings: salon._count.bookings,
              })}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700">
            {tStatus(salon.status)}
          </span>
        </div>

        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {localized(salon, "description", locale)}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {salon.status === "APPROVED" ? (
            <Link href={`/salons/${salon.slug}`} className="text-sm underline">
              {t("viewListing")}
            </Link>
          ) : (
            <span className="text-sm text-gray-500">{salon.slug}</span>
          )}

          <div className="flex flex-wrap gap-2">
            {ACTIONS[salon.status].map((status) => (
              <form action={setSalonStatus} key={status}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="salonId" value={salon.id} />
                <input type="hidden" name="status" value={status} />
                <button
                  type="submit"
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:border-gray-500 dark:border-gray-700 dark:hover:border-gray-400"
                >
                  {t(`action${status}` as "actionAPPROVED")}
                </button>
              </form>
            ))}
          </div>
        </div>

        {/* Taking a salon offline cancels its live bookings, which is not
            obvious from a button labelled "Suspend". */}
        {salon.status === "APPROVED" && salon._count.bookings > 0 && (
          <p className="mt-3 text-xs text-gray-500">{t("suspendWarning")}</p>
        )}
      </li>
    );
  }

  return (
    <div>
      {saved && (
        <p role="status" className="mt-6 rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("errorGeneric")}
        </p>
      )}

      {/* The other two things an admin comes here to do, rather than leaving them
          reachable only by typing the URL. */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/support"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 px-5 py-4 transition hover:border-brand/60"
        >
          <span className="font-medium">{tSupport("adminTitle")}</span>
          <span className="rounded-full bg-brand px-3 py-0.5 text-sm font-bold text-[#10130a]">
            {format.number(openTickets)}
          </span>
        </Link>

        <Link
          href="/admin/revenue"
          className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 px-5 py-4 transition hover:border-brand/60"
        >
          <span className="font-medium">{t("revTitle")}</span>
          <span className="text-sm font-bold text-brand">
            {format.number(Number(platformFees), {
              style: "currency",
              currency: "SAR",
              maximumFractionDigits: 0,
            })}
          </span>
        </Link>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          { label: t("statPending"), value: pending.length },
          { label: t("statSalons"), value: salons.length },
          { label: t("statCustomers"), value: customers },
          { label: t("statBookings"), value: bookings },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <p className="text-3xl font-bold">{format.number(stat.value)}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{stat.label}</p>
          </div>
        ))}
      </section>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
        {t("ownerCount", { count: owners })}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("queue")}</h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-gray-600 dark:text-gray-300">{t("queueEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pending.map((salon) => (
              <SalonRow key={salon.id} salon={salon} />
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("allSalons")}</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {rest.map((salon) => (
              <SalonRow key={salon.id} salon={salon} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
