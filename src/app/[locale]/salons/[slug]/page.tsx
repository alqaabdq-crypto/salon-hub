import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { prisma } from "@/server/db/prisma";
import { StaffAvatar } from "@/components/staff-avatar";
import type { DayOfWeek } from "@/generated/prisma/enums";

// Saturday-first: the working week in Saudi Arabia runs Sunday–Thursday, and
// weekends read more naturally leading with Saturday than with Monday.
const WEEK_ORDER: DayOfWeek[] = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const salon = await prisma.salon.findFirst({
    where: { slug, status: "APPROVED" },
    select: { nameEn: true, nameAr: true, descriptionEn: true, descriptionAr: true },
  });

  if (!salon) return {};

  return {
    title: localized(salon, "name", locale),
    description: localized(salon, "description", locale),
  };
}

export default async function SalonPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Salon");
  const tGender = await getTranslations("GenderFocus");
  const tDay = await getTranslations("Day");
  const format = await getFormatter();

  const salon = await prisma.salon.findFirst({
    // A salon awaiting verification must not be reachable by guessing its slug.
    where: { slug, status: "APPROVED" },
    include: {
      services: {
        where: { isActive: true },
        include: { category: true },
        orderBy: { price: "asc" },
      },
      staff: {
        where: { isActive: true },
        include: { workingHours: true },
        orderBy: { name: "asc" },
      },
      reviews: {
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!salon) {
    notFound();
  }

  // Salon-level hours are not modelled yet (only staff have them), so opening
  // hours are the union across the team — the widest window anyone is available.
  const hoursByDay = new Map<DayOfWeek, { start: string; end: string }>();
  for (const member of salon.staff) {
    for (const hour of member.workingHours) {
      const current = hoursByDay.get(hour.dayOfWeek);
      hoursByDay.set(hour.dayOfWeek, {
        start: current && current.start < hour.startTime ? current.start : hour.startTime,
        end: current && current.end > hour.endTime ? current.end : hour.endTime,
      });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <header className="card-surface rounded-2xl p-6">
        <span className="gradient-brand mb-4 block h-1.5 w-14 rounded-full" aria-hidden />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {localized(salon, "name", locale)}
          </h1>
          <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            {tGender(salon.genderFocus)}
          </span>
        </div>

        <p className="mt-2 text-muted">
          {salon.address}, {salon.city}
        </p>

        <p className="mt-1 text-sm">
          {salon.reviewCount > 0 ? (
            <span className="font-medium">
              <span className="text-gold">★</span>{" "}
              {format.number(salon.avgRating, { maximumFractionDigits: 1 })}{" "}
              <span className="text-muted">· {t("reviewCount", { count: salon.reviewCount })}</span>
            </span>
          ) : (
            <span className="text-muted">{t("reviewCount", { count: 0 })}</span>
          )}
        </p>

        <p className="mt-4">{localized(salon, "description", locale)}</p>
      </header>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-bold before:h-5 before:w-1.5 before:rounded-full before:bg-brand before:content-['']">{t("services")}</h2>
        {salon.services.length === 0 ? (
          <p className="mt-3 text-muted">{t("noServices")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {salon.services.map((service) => (
              <li key={service.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{localized(service, "name", locale)}</p>
                  <p className="text-sm text-muted">
                    {localized(service.category, "name", locale)} ·{" "}
                    {t("minutes", { count: service.durationMinutes })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-brand">
                    {format.number(Number(service.price), {
                      style: "currency",
                      currency: "SAR",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                  {/* Preselects this service; more can be added on the form. */}
                  <Link
                    href={`/salons/${salon.slug}/book?services=${service.id}`}
                    className="btn-brand rounded-full px-4 py-1.5 text-xs font-medium"
                  >
                    {t("book")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-bold before:h-5 before:w-1.5 before:rounded-full before:bg-brand before:content-['']">{t("team")}</h2>
        {salon.staff.length === 0 ? (
          <p className="mt-3 text-muted">{t("noStaff")}</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {salon.staff.map((member) => (
              <li
                key={member.id}
                className="card-surface flex items-start gap-3 rounded-2xl p-4"
              >
                <StaffAvatar name={member.name} photoId={member.photoId} />
                <div className="min-w-0">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted">
                    {localized(member, "bio", locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-bold before:h-5 before:w-1.5 before:rounded-full before:bg-brand before:content-['']">{t("hours")}</h2>
        <ul className="mt-3 divide-y divide-hairline">
          {WEEK_ORDER.map((day) => {
            const hours = hoursByDay.get(day);
            return (
              <li key={day} className="flex items-center justify-between py-2 text-sm">
                <span>{tDay(day)}</span>
                <span
                  className={hours ? "font-medium" : "text-muted"}
                >
                  {/* Bidi isolation: without it an RTL paragraph flips the range
                      to read 22:00–10:00. */}
                  {hours ? `⁦${hours.start} – ${hours.end}⁩` : t("closed")}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-xl font-bold before:h-5 before:w-1.5 before:rounded-full before:bg-brand before:content-['']">{t("reviews")}</h2>
        {salon.reviews.length === 0 ? (
          <p className="mt-3 text-muted">{t("noReviews")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {salon.reviews.map((review) => (
              <li
                key={review.id}
                className="card-surface rounded-2xl p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{review.customer.name}</p>
                  <p className="text-sm text-gold">{"★".repeat(review.rating)}</p>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm text-muted">
                    {review.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
