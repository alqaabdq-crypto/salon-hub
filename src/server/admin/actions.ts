"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { setBookingStatus } from "@/server/booking/status";
import type { SalonStatus } from "@/generated/prisma/enums";

const localeSchema = z.enum(routing.locales);

const salonStatusSchema = z.object({
  locale: localeSchema,
  salonId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED", "SUSPENDED", "PENDING_VERIFICATION"]),
});

/**
 * Statuses that take a salon off the marketplace. Suspending or rejecting one
 * with a full diary would otherwise leave customers holding appointments at a
 * salon they can no longer find, so those bookings are cancelled with it.
 */
const OFFLINE: SalonStatus[] = ["REJECTED", "SUSPENDED"];

export async function setSalonStatus(formData: FormData): Promise<void> {
  const parsed = salonStatusSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return redirect({ href: "/auth/login", locale });
  }

  if (!parsed.success) {
    return redirect({ href: "/admin?error=invalid", locale });
  }

  const { salonId, status } = parsed.data;

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true },
  });

  if (!salon) {
    return redirect({ href: "/admin?error=missing", locale });
  }

  await prisma.salon.update({ where: { id: salon.id }, data: { status } });

  if (OFFLINE.includes(status)) {
    const live = await prisma.booking.findMany({
      where: { salonId: salon.id, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { id: true },
    });

    // One at a time through setBookingStatus rather than a bulk update: it is
    // the only thing that keeps BookingItem.status in step, and items left on a
    // blocking status would go on reserving staff for visits that cannot happen.
    for (const booking of live) {
      await setBookingStatus(booking.id, "CANCELLED");
    }
  }

  revalidatePath(`/${locale}/admin`);
  return redirect({ href: "/admin?saved=1", locale });
}
