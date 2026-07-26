"use client";

import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";

// Ghost/outline button — deliberately not the brand gradient Button, so the
// primary action on any page (register, book, pay) stays visually singular.
export function LogoutButton({ className = "" }: { className?: string }) {
  const t = useTranslations("Nav");
  const locale = useLocale();

  return (
    <button
      className={`rounded-full border border-brand/40 font-medium text-brand transition hover:bg-brand/10 ${className}`}
      onClick={() => signOut({ callbackUrl: `/${locale}` })}
    >
      {t("logout")}
    </button>
  );
}
