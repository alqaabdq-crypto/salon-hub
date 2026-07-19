"use client";

import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LogoutButton({ className = "" }: { className?: string }) {
  const t = useTranslations("Nav");
  const locale = useLocale();

  return (
    <Button
      className={`bg-transparent text-foreground border border-gray-300 dark:border-gray-700 ${className}`}
      onClick={() => signOut({ callbackUrl: `/${locale}` })}
    >
      {t("logout")}
    </Button>
  );
}
