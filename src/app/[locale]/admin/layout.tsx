import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogoutButton } from "@/components/logout-button";
import { requireRole } from "@/server/auth/rbac";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Authoritative check. The proxy's optimistic redirect is a convenience, not
  // the authorization boundary (see README).
  await requireRole(["ADMIN"], locale);

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <LogoutButton className="px-4 py-1.5 text-sm" />
      </div>

      {children}
    </div>
  );
}
