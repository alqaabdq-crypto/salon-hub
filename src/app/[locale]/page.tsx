import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Landing");
  const tNav = await getTranslations("Nav");

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-hidden p-8 text-center">
      {/* Soft brand glow behind the hero. */}
      <div
        aria-hidden
        className="gradient-brand pointer-events-none absolute -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
      />

      <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 px-4 py-1.5 text-sm font-medium text-brand backdrop-blur">
        <span className="gradient-brand h-2 w-2 rounded-full" aria-hidden />
        {tNav("brand")}
      </span>

      <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-6xl">
        <span className="text-gradient-brand">{t("title")}</span>
      </h1>
      <p className="max-w-xl text-lg text-muted">{t("subtitle")}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/salons"
          className="btn-brand rounded-full px-7 py-3 font-semibold"
        >
          {t("browse")}
        </Link>
        <Link
          href="/auth/register"
          className="rounded-full border border-brand/40 px-7 py-3 font-semibold text-brand transition hover:bg-brand/10"
        >
          {t("cta")}
        </Link>
      </div>
    </main>
  );
}
