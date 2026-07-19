"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Each locale is labelled in its own script, so the target is readable to someone
// who cannot read the current one.
const labels: Record<string, string> = {
  en: "English",
  ar: "العربية",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  // Locale-stripped path, so switching stays on the current page.
  const pathname = usePathname();
  const target = routing.locales.find((candidate) => candidate !== locale) ?? locale;

  return (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      hrefLang={target}
      className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-900"
    >
      {labels[target] ?? target}
    </Link>
  );
}
