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
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      {/* Plain GET form: no client JS, and filters stay shareable in the URL.
          An empty action submits to the current path, preserving the locale. */}
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            {t("search")}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query ?? ""}
            placeholder={t("searchPlaceholder")}
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
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
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
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
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
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
            className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
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
          className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
        >
          {t("apply")}
        </button>

        {hasFilters && (
          <Link href="/salons" className="px-2 py-2.5 text-sm underline">
            {t("clear")}
          </Link>
        )}
      </form>

      <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
        {t("results", { count: salons.length })}
      </p>

      {salons.length === 0 ? (
        <p className="mt-8 text-gray-600 dark:text-gray-300">{t("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {salons.map((salon) => {
            const prices = salon.services.map((service) => Number(service.price));
            const from = prices.length ? Math.min(...prices) : null;

            return (
              <li key={salon.id}>
                <Link
                  href={`/salons/${salon.slug}`}
                  className="block h-full rounded-xl border border-gray-200 p-5 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{localized(salon, "name", locale)}</h2>
                    <span className="shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700">
                      {tGender(salon.genderFocus)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {salon.city}
                  </p>

                  <p className="mt-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                    {localized(salon, "description", locale)}
                  </p>

                  <p className="mt-3 text-sm font-medium">
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
