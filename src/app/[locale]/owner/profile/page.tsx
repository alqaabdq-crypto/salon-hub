import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { getOwnedSalon } from "@/server/salon/owner";
import { saveSalon } from "@/server/salon/actions";
import { LocationPicker } from "@/components/map/location-picker";
import type { GenderFocus } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

const GENDERS: GenderFocus[] = ["MEN", "WOMEN", "UNISEX"];

const field =
  "rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent";

export default async function OwnerProfilePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error } = await searchParams;
  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const tGender = await getTranslations("GenderFocus");

  const salon = await getOwnedSalon(session.user.id);

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">
        {salon ? t("editSalon") : t("createSalon")}
      </h2>

      {salon === null && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t("createSalonExplainer")}
        </p>
      )}

      {saved && (
        <p role="status" className="mt-4 rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("errorInvalid")}
        </p>
      )}

      {/* Both languages are required, not optional: the catalog is fully
          bilingual, and a half-translated listing reads as broken to whichever
          audience is missing. */}
      <form action={saveSalon} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("nameEn")}</span>
            <input name="nameEn" required defaultValue={salon?.nameEn ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("nameAr")}</span>
            <input name="nameAr" required dir="rtl" defaultValue={salon?.nameAr ?? ""} className={field} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("descriptionEn")}</span>
            <textarea name="descriptionEn" required rows={4} defaultValue={salon?.descriptionEn ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("descriptionAr")}</span>
            <textarea name="descriptionAr" required rows={4} dir="rtl" defaultValue={salon?.descriptionAr ?? ""} className={field} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("genderFocus")}</span>
            <select name="genderFocus" defaultValue={salon?.genderFocus ?? "UNISEX"} className={field}>
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {tGender(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("city")}</span>
            <input name="city" required defaultValue={salon?.city ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("phone")}</span>
            <input name="phone" required type="tel" defaultValue={salon?.phone ?? ""} className={field} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("address")}</span>
          <input name="address" required defaultValue={salon?.address ?? ""} className={field} />
        </label>

        {/* The written address is what a customer reads; the pin is what puts the
            salon in "near me" results. Both are kept — a geocoder cannot be
            trusted to turn a Saudi street address into the right shopfront. */}
        <LocationPicker lat={salon?.lat ?? null} lng={salon?.lng ?? null} />

        <div>
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
          >
            {salon ? t("save") : t("createSalon")}
          </button>
        </div>
      </form>

      {salon && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          {/* The slug is the public URL and is not regenerated on rename —
              moving it would break every link the salon has shared. */}
          {t("slugFixed", { slug: salon.slug })}
        </p>
      )}
    </div>
  );
}
