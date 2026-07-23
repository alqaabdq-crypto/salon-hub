import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * A salon owner signs up before they have a salon, so every owner page has to
 * cope with there being nothing to manage yet.
 */
export async function NeedsSalon() {
  const t = await getTranslations("Owner");

  return (
    <div className="mt-8 rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
      <p className="text-gray-600 dark:text-gray-300">{t("noSalon")}</p>
      <Link
        href="/owner/profile"
        className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
      >
        {t("createSalon")}
      </Link>
    </div>
  );
}
