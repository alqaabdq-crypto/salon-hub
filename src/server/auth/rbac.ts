import { redirect } from "next/navigation";
import { auth } from "@/server/auth/config";
import type { Role } from "@/generated/prisma/client";

export async function requireRole(allowedRoles: Role[], locale: string) {
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/auth/login`);
  }

  if (!allowedRoles.includes(session.user.role)) {
    redirect(`/${locale}`);
  }

  return session;
}
