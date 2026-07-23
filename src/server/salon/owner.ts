import { prisma } from "@/server/db/prisma";
import { auth } from "@/server/auth/config";

/**
 * The owner's salon, or null if they have not created one yet.
 *
 * One salon per owner is an assumption, not a schema constraint — `Salon.ownerId`
 * has no unique index, so a chain with several branches is representable. The
 * dashboard picks the oldest deterministically; revisit when multi-branch owners
 * are a real requirement rather than a possibility.
 */
export async function getOwnedSalon(ownerId: string) {
  return prisma.salon.findFirst({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Authorisation for every owner action: resolves the session and the salon it
 * is allowed to touch in one step. Actions are reachable by direct POST, so
 * this runs inside the action, never only in the page that rendered the form.
 */
export async function requireOwnedSalon(): Promise<
  { ok: true; ownerId: string; salonId: string } | { ok: false; reason: "auth" | "salon" }
> {
  const session = await auth();

  if (!session?.user || session.user.role !== "SALON_OWNER") {
    return { ok: false, reason: "auth" };
  }

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return { ok: false, reason: "salon" };

  return { ok: true, ownerId: session.user.id, salonId: salon.id };
}

/**
 * URL-safe Latin slug, shared across locales so a link survives a language
 * switch. Arabic names transliterate to nothing useful here, so the English
 * name is the source and a numeric suffix resolves collisions.
 */
export async function uniqueSlug(nameEn: string): Promise<string> {
  const base =
    nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "salon";

  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.salon.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
}
