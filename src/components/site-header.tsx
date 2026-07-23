import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import type { Role } from "@/generated/prisma/client";

const dashboardPathByRole: Record<Role, string> = {
  CUSTOMER: "/account",
  SALON_OWNER: "/owner",
  ADMIN: "/admin",
};

// Reads the session, so every page under this layout renders dynamically. That's
// the right trade for a marketplace where the header is always account-aware —
// and with the JWT strategy this is cookie verification, not a database round-trip.
export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const session = await auth();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      {/* whitespace-nowrap throughout: at 393px this nav is tight enough that
          flex will otherwise break "Salon Hub" and "Log out" across two lines
          mid-phrase. Wrapping the row is fine; wrapping a label is not. */}
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 p-4 sm:gap-x-4">
        <Link href="/" className="font-bold whitespace-nowrap">
          {t("brand")}
        </Link>
        <Link href="/salons" className="text-sm whitespace-nowrap hover:underline">
          {t("salons")}
        </Link>

        <div className="ms-auto flex items-center gap-3">
          <LocaleSwitcher />
          {session?.user ? (
            <>
              <Link
                href={dashboardPathByRole[session.user.role]}
                className="text-sm whitespace-nowrap hover:underline"
              >
                {t("dashboard")}
              </Link>
              <LogoutButton className="px-4 py-1.5 text-sm whitespace-nowrap" />
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm whitespace-nowrap hover:underline">
                {t("login")}
              </Link>
              <Link
                href="/auth/register"
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium whitespace-nowrap text-background"
              >
                {t("register")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
