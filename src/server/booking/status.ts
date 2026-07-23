import { prisma } from "@/server/db/prisma";
import type { BookingStatus } from "@/generated/prisma/enums";

/**
 * Which status can follow which. Everything terminal stays terminal — in
 * particular **nothing returns to a blocking status**. Reviving a cancelled
 * booking would ask the database for a staff slot that someone else has very
 * likely taken since, and the EXCLUDE constraint would reject it at the worst
 * possible moment. A customer who changes their mind books again.
 */
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function nextStatuses(from: BookingStatus): BookingStatus[] {
  return ALLOWED[from];
}

/**
 * The only supported way to change a booking's status.
 *
 * `BookingItem.status` is denormalised from `Booking.status` so the partial
 * EXCLUDE constraint can decide which rows reserve a staff member (see the M3
 * migration). The two must therefore move together, atomically: leave the items
 * behind on a cancellation and they go on blocking that slot for ever.
 *
 * Guarded by the transition table and by the caller's expected current status,
 * which is checked inside the transaction — two owners clicking "Confirm" and
 * "Cancel" at the same moment cannot both win.
 */
export async function setBookingStatus(
  bookingId: string,
  to: BookingStatus,
): Promise<{ ok: true } | { ok: false; reason: "missing" | "transition" }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) return { ok: false as const, reason: "missing" as const };

    if (!canTransition(booking.status, to)) {
      return { ok: false as const, reason: "transition" as const };
    }

    await tx.booking.update({ where: { id: bookingId }, data: { status: to } });
    await tx.bookingItem.updateMany({ where: { bookingId }, data: { status: to } });

    return { ok: true as const };
  });
}
