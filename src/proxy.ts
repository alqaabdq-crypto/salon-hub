import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { auth } from "@/server/auth/config";
import { routing } from "@/i18n/routing";
import type { Role } from "@/generated/prisma/client";

const handleI18nRouting = createMiddleware(routing);

const roleForSection: Record<string, Role> = {
  account: "CUSTOMER",
  owner: "SALON_OWNER",
  admin: "ADMIN",
};

export default auth((req) => {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const [maybeLocale, section] = segments;
  const locale = routing.locales.includes(maybeLocale as (typeof routing.locales)[number])
    ? maybeLocale
    : routing.defaultLocale;

  const requiredRole = section ? roleForSection[section] : undefined;

  if (requiredRole) {
    const session = req.auth;

    if (!session?.user) {
      return NextResponse.redirect(new URL(`/${locale}/auth/login`, req.url));
    }

    if (session.user.role !== requiredRole) {
      return NextResponse.redirect(new URL(`/${locale}`, req.url));
    }
  }

  return handleI18nRouting(req);
});

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
