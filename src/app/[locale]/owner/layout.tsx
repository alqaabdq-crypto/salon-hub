import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { LogoutButton } from "@/components/logout-button";
import { requireRole } from "@/server/auth/rbac";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function OwnerLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The proxy already redirected non-owners optimistically; this is the
  // authoritative server-side check, and it must stay (see README).
  await requireRole(["SALON_OWNER"], locale);

  const t = await getTranslations("Owner");

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <LogoutButton className="px-4 py-1.5 text-sm" />
      </div>

      <div className="mt-4">
        <DashboardNav
          links={[
            { href: "/owner", label: t("navOverview") },
            { href: "/owner/bookings", label: t("navBookings") },
            { href: "/owner/revenue", label: t("navRevenue") },
            { href: "/owner/services", label: t("navServices") },
            { href: "/owner/staff", label: t("navStaff") },
            { href: "/owner/profile", label: t("navProfile") },
          ]}
        />
      </div>

      {children}
    </div>
  );
}
