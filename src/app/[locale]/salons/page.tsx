import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { prisma } from "@/server/db/prisma";
import type { GenderFocus } from "@/generated/prisma/enums";

const GENDER_VALUES: GenderFocus[] = ["MEN", "WOMEN", "UNISEX"];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    city?: string;
    gender?: string;
    category?: string;
  }>;
};

function isGenderFocus(value: string | undefined): value is GenderFocus {
  return !!value && GENDER_VALUES.includes(value as GenderFocus);
}

export default async function SalonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { q, city, gender, category } = await searchParams;
  const t = await getTranslations("Salons");
  const tGender = await getTranslations("GenderFocus");
  const format = await getFormatter();

  const query = q?.trim();

  const [salons, cities, categories] = await Promise.all([
    prisma.salon.findMany({
      where: {
        // Never surface salons that haven't cleared admin verification.
        status: "APPROVED",
        ...(city ? { city } : {}),
        ...(isGenderFocus(gender) ? { genderFocus: gender } : {}),
        ...(category
          ? { services: { some: { isActive: true, category: { slug: category } } } }
          : {}),
        ...(query
          ? {
              OR: [
                { nameEn: { contains: query, mode: "insensitive" as const } },
                { nameAr: { contains: query } },
                { city: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        services: { where: { isActive: true }, select: { price: true } },
      },
      orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }, { nameEn: "asc" }],
    }),
    prisma.salon.findMany({
      where: { status: "APPROVED" },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
    prisma.category.findMany({ orderBy: { nameEn: "asc" } }),
  ]);

  const hasFilters = Boolean(query || city || gender || category);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        <span className="text-gradient-brand">{t("title")}</span>
      </h1>

      {/* Plain GET form: no client JS, and filters stay shareable in the URL.
          An empty action submits to the current path, preserving the locale.

          Two columns on a phone rather than a wrapping flex row: at 393px the
          row broke label/field pairs onto separate lines, so a label could sit
          above a field it did not belong to. */}
      <form className="mt-6 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query ?? ""}
            placeholder={t("searchPlaceholder")}
            className="rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="city" className="text-sm font-medium">
            {t("city")}
          </label>
          <select
            id="city"
            name="city"
            defaultValue={city ?? ""}
            className="rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            <option value="">{t("all")}</option>
            {cities.map((row) => (
              <option key={row.city} value={row.city}>
                {row.city}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="gender" className="text-sm font-medium">
            {t("genderFocus")}
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={gender ?? ""}
            className="rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            <option value="">{t("all")}</option>
            {GENDER_VALUES.map((value) => (
              <option key={value} value={value}>
                {tGender(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-sm font-medium">
            {t("category")}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ""}
            className="rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
          >
            <option value="">{t("all")}</option>
            {categories.map((row) => (
              <option key={row.id} value={row.slug}>
                {localized(row, "name", locale)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn-brand rounded-full px-5 py-2.5 font-medium"
        >
          {t("apply")}
        </button>

        {hasFilters && (
          <Link
            href="/salons"
            className="self-center px-2 py-2.5 text-sm font-medium text-brand hover:underline"
          >
            {t("clear")}
          </Link>
        )}
      </form>

      <p className="mt-6 text-sm text-muted">
        {t("results", { count: salons.length })}
      </p>

      {salons.length === 0 ? (
        <p className="mt-8 text-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {salons.map((salon) => {
            const prices = salon.services.map((service) => Number(service.price));
            const from = prices.length ? Math.min(...prices) : null;

            return (
              <li key={salon.id}>
                <Link
                  href={`/salons/${salon.slug}`}
                  className="card-surface group block h-full rounded-2xl p-5"
                >
                  {/* Gradient ribbon so a text-only card still carries brand color. */}
                  <span className="gradient-brand mb-4 block h-1.5 w-12 rounded-full" aria-hidden />

                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold transition group-hover:text-brand">
                      {localized(salon, "name", locale)}
                    </h2>
                    <span className="shrink-0 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {tGender(salon.genderFocus)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-muted">{salon.city}</p>

                  <p className="mt-3 line-clamp-2 text-sm text-muted">
                    {localized(salon, "description", locale)}
                  </p>

                  <p className="mt-4 text-sm font-semibold text-brand">
                    {from === null
                      ? t("noPrices")
                      : t("from", {
                          price: format.number(from, {
                            style: "currency",
                            currency: "SAR",
                            maximumFractionDigits: 0,
                          }),
                        })}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
