import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { prisma } from "@/server/db/prisma";
import { formatDistance, parseCoords } from "@/lib/geo";
import {
  boundingBoxWhere,
  MAX_NEARBY_RESULTS,
  parseRadiusKm,
  RADIUS_OPTIONS,
  withinRadius,
} from "@/server/salon/nearby";
import { NearMeButton } from "@/components/map/near-me-button";
import { SalonsMap, type MappedSalon } from "@/components/map/salons-map";
import type { GenderFocus } from "@/generated/prisma/enums";

const GENDER_VALUES: GenderFocus[] = ["MEN", "WOMEN", "UNISEX"];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    city?: string;
    gender?: string;
    category?: string;
    lat?: string;
    lng?: string;
    radius?: string;
  }>;
};

function isGenderFocus(value: string | undefined): value is GenderFocus {
  return !!value && GENDER_VALUES.includes(value as GenderFocus);
}

export default async function SalonsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { q, city, gender, category, lat, lng, radius } = await searchParams;
  const t = await getTranslations("Salons");
  const tGender = await getTranslations("GenderFocus");
  const format = await getFormatter();

  const query = q?.trim();

  // A coordinate that fails to parse is treated as absent rather than an error:
  // a hand-edited URL degrades to the ordinary listing.
  const centre = parseCoords(lat, lng);
  const radiusKm = parseRadiusKm(radius);

  const [rows, cities, categories] = await Promise.all([
    prisma.salon.findMany({
      where: {
        // Never surface salons that haven't cleared admin verification.
        status: "APPROVED",
        // Narrow to a bounding box in SQL; the exact circle is applied below.
        ...(centre ? boundingBoxWhere(centre, radiusKm) : {}),
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
      // Only capped on the proximity path, where the rows are re-sorted in JS
      // and an unbounded read would be doing that work for nothing.
      ...(centre ? { take: MAX_NEARBY_RESULTS } : {}),
    }),
    prisma.salon.findMany({
      where: { status: "APPROVED" },
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
    }),
    prisma.category.findMany({ orderBy: { nameEn: "asc" } }),
  ]);

  // Drop the bounding box's corner over-selection and order nearest first. With
  // no centre the rating order from SQL stands and every salon keeps its place.
  const salons = centre
    ? withinRadius(rows, centre, radiusKm)
    : rows.map((row) => ({ ...row, distanceKm: null as number | null }));

  const hasFilters = Boolean(query || city || gender || category || centre);

  /** Distance rendered through next-intl, so Arabic gets Arabic numerals. */
  function distanceLabel(distanceKm: number | null): string | null {
    if (distanceKm === null) return null;
    const { value, unit } = formatDistance(distanceKm);
    return t(unit === "m" ? "distanceMetres" : "distanceKm", {
      value: format.number(value, { maximumFractionDigits: 1 }),
    });
  }

  const mapped: MappedSalon[] = salons.flatMap((salon) =>
    salon.lat === null || salon.lng === null
      ? []
      : [
          {
            id: salon.id,
            name: localized(salon, "name", locale),
            slug: salon.slug,
            lat: salon.lat,
            lng: salon.lng,
            avgRating: salon.avgRating,
            reviewCount: salon.reviewCount,
            distanceLabel: distanceLabel(salon.distanceKm),
          },
        ],
  );

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

        {/* Distance filter. Only meaningful once a centre is known, and carried
            through the GET form as hidden fields so applying another filter does
            not silently drop the location the user just shared. */}
        {centre && (
          <>
            <input type="hidden" name="lat" value={centre.lat} />
            <input type="hidden" name="lng" value={centre.lng} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="radius" className="text-sm font-medium">
                {t("radius")}
              </label>
              <select
                id="radius"
                name="radius"
                defaultValue={String(radiusKm)}
                className="rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
              >
                {RADIUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("radiusOption", { km: option })}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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

      {/* Outside the filter form: it navigates by itself rather than submitting,
          and nesting a button that does that inside a form invites a stray
          submit. */}
      <div className="mt-4">
        <NearMeButton active={centre !== null} />
      </div>

      <p className="mt-6 text-sm text-muted">
        {centre
          ? t("resultsNearby", { count: salons.length, km: radiusKm })
          : t("results", { count: salons.length })}
      </p>

      {/* Salons with no pin cannot appear on the map. Say so rather than letting
          the count above quietly disagree with the number of markers. */}
      {centre === null && mapped.length < salons.length && salons.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t("unmappedCount", { count: salons.length - mapped.length })}
        </p>
      )}

      <SalonsMap salons={mapped} centre={centre} locale={locale} />

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

                  {/* City, distance and rating on one line — the three things a
                      customer scans a nearby list for. */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    <span>{salon.city}</span>

                    {salon.distanceKm !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-medium text-brand">
                          {distanceLabel(salon.distanceKm)}
                        </span>
                      </>
                    )}

                    <span aria-hidden>·</span>
                    {salon.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden className="text-amber-400">★</span>
                        <span className="font-medium text-foreground">
                          {format.number(salon.avgRating, { maximumFractionDigits: 1 })}
                        </span>
                        <span>{t("reviewCount", { count: salon.reviewCount })}</span>
                      </span>
                    ) : (
                      <span>{t("notRated")}</span>
                    )}
                  </div>

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
