"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import {
  BOOKING_HORIZON_DAYS,
  getDayAvailability,
} from "@/server/booking/schedule";
import { setBookingStatus } from "@/server/booking/status";
import { refundIfPaid } from "@/server/payments/service";
import {
  addDays,
  isIsoDate,
  MINUTES_PER_DAY,
  riyadhMinutesToInstant,
  riyadhToday,
} from "@/server/booking/time";
import { Prisma } from "@/generated/prisma/client";

/**
 * The name Postgres gives the partial EXCLUDE constraint (see the M3 migration).
 * Matching on the message rather than a Prisma error code is deliberate: an
 * exclusion violation is SQLSTATE 23P01, which Prisma has no mapped code for,
 * so it arrives as an unknown request error whose shape is not guaranteed.
 */
const OVERLAP_CONSTRAINT = "BookingItem_staff_no_overlap";

const localeSchema = z.enum(routing.locales);

const createBookingSchema = z.object({
  locale: localeSchema,
  slug: z.string().min(1),
  date: z.string().refine(isIsoDate, "Not a calendar date"),
  start: z.coerce.number().int().min(0).max(MINUTES_PER_DAY),
  // A visit of more than a handful of services is a data-entry accident, and
  // the availability search is quadratic in this length.
  serviceIds: z.array(z.string().min(1)).min(1).max(8),
  notes: z.string().max(500).optional(),
});

/** Back to the form the customer came from, with their choices intact. */
function bookingPath(
  slug: string,
  { date, services = [], error }: { date: string; services?: string[]; error?: string },
): string {
  const query = new URLSearchParams({ date });
  // Repeated key, matching the checkbox group the page renders.
  for (const id of services) query.append("services", id);
  if (error) query.set("error", error);

  return `/salons/${slug}/book?${query.toString()}`;
}

export async function createBooking(formData: FormData): Promise<void> {
  const raw = {
    locale: formData.get("locale"),
    slug: formData.get("slug"),
    date: formData.get("date"),
    start: formData.get("start"),
    serviceIds: formData.getAll("services"),
    notes: formData.get("notes") || undefined,
  };

  const parsed = createBookingSchema.safeParse(raw);

  // Fall back to the default locale for the error redirect: a request this
  // malformed did not come from our own form.
  const locale = localeSchema.safeParse(raw.locale).data ?? routing.defaultLocale;

  if (!parsed.success) {
    return redirect({ href: "/salons", locale });
  }

  const { slug, date, start, serviceIds, notes } = parsed.data;

  // Server Actions are reachable by direct POST, so authorisation is checked
  // here and not only on the page that renders the form.
  const session = await auth();
  if (!session?.user) {
    return redirect({ href: "/auth/login", locale });
  }

  // Owners and admins have their own dashboards; a booking belongs to a
  // customer account, and /account is CUSTOMER-only.
  if (session.user.role !== "CUSTOMER") {
    return redirect({ href: "/", locale });
  }

  const today = riyadhToday(new Date());
  if (date < today || date > addDays(today, BOOKING_HORIZON_DAYS)) {
    return redirect({
      href: bookingPath(slug, { date: today, services: serviceIds, error: "date" }),
      locale,
    });
  }

  const salon = await prisma.salon.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true },
  });

  if (!salon) {
    return redirect({ href: "/salons", locale });
  }

  // Recomputed from scratch. The posted start is only used to pick which of the
  // slots we just derived is wanted — never as the source of the times written.
  const availability = await getDayAvailability({
    salonId: salon.id,
    serviceIds,
    date,
    now: new Date(),
  });

  const slot = availability?.slots.find((candidate) => candidate.start === start);

  if (!availability || !slot) {
    return redirect({
      href: bookingPath(slug, { date, services: serviceIds, error: "unavailable" }),
      locale,
    });
  }

  const priceByService = new Map(
    availability.services.map((service) => [service.id, service.price]),
  );

  const items = slot.assignments.map((assignment, position) => ({
    serviceId: assignment.serviceId,
    staffId: assignment.staffId,
    startTime: riyadhMinutesToInstant(date, assignment.start),
    endTime: riyadhMinutesToInstant(date, assignment.end),
    durationMinutes: assignment.end - assignment.start,
    price: priceByService.get(assignment.serviceId)!,
    position,
    // Denormalised from the booking below; the EXCLUDE constraint reads it.
    status: "PENDING" as const,
  }));

  const totalPrice = items.reduce(
    (sum, item) => sum.plus(item.price),
    new Prisma.Decimal(0),
  );

  let bookingId: string;

  try {
    // A nested create is one implicit transaction, so a staff clash on the
    // second item rolls back the booking rather than leaving a half-written one.
    const booking = await prisma.booking.create({
      data: {
        customerId: session.user.id,
        salonId: salon.id,
        startTime: riyadhMinutesToInstant(date, slot.start),
        endTime: riyadhMinutesToInstant(date, slot.end),
        status: "PENDING",
        totalPrice,
        notes,
        items: { create: items },
      },
      select: { id: true },
    });

    bookingId = booking.id;
  } catch (error) {
    // Someone took the slot between our availability check and this insert.
    // Not an error condition — the customer picks again.
    if (error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT)) {
      return redirect({
        href: bookingPath(slug, { date, services: serviceIds, error: "taken" }),
        locale,
      });
    }

    throw error;
  }

  return redirect({ href: `/account?booked=${bookingId}`, locale });
}

const cancelBookingSchema = z.object({
  locale: localeSchema,
  bookingId: z.string().min(1),
});

export async function cancelBooking(formData: FormData): Promise<void> {
  const parsed = cancelBookingSchema.safeParse({
    locale: formData.get("locale"),
    bookingId: formData.get("bookingId"),
  });

  if (!parsed.success) {
    return redirect({ href: "/", locale: routing.defaultLocale });
  }

  const { locale, bookingId } = parsed.data;

  const session = await auth();
  if (!session?.user) {
    return redirect({ href: "/auth/login", locale });
  }

  // Scoping the update by customerId is the authorisation check: another
  // customer's id simply matches nothing.
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      customerId: session.user.id,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true },
  });

  // setBookingStatus keeps Booking and BookingItem in step — the items are what
  // the EXCLUDE constraint reads, so a cancellation that missed them would go on
  // reserving staff for a visit that is not happening.
  let refundError: string | undefined;

  if (booking) {
    await setBookingStatus(booking.id, "CANCELLED");

    // Free the slot first, refund second. If the gateway refuses, the customer
    // still has their cancellation and the salon still has its slot back; the
    // money is the part a human can put right, and saying so beats silence.
    const refund = await refundIfPaid(booking.id);
    refundError = refund.error;
  }

  revalidatePath(`/${locale}/account`);
  return redirect({
    href: refundError ? "/account?error=refund" : "/account",
    locale,
  });
}
