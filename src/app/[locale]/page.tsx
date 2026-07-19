import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Landing");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <p className="text-lg text-gray-600 dark:text-gray-300">{t("subtitle")}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/salons"
          className="rounded-full bg-foreground px-6 py-3 text-background font-medium"
        >
          {t("browse")}
        </Link>
        <Link
          href="/auth/register"
          className="rounded-full border border-gray-300 px-6 py-3 font-medium dark:border-gray-700"
        >
          {t("cta")}
        </Link>
      </div>
    </main>
  );
}
