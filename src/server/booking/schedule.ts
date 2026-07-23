import { prisma } from "@/server/db/prisma";
import {
  findSlots,
  type Slot,
  type StaffAvailability,
} from "@/server/booking/availability";
import {
  instantToRiyadhMinutes,
  parseClock,
  riyadhDayOfWeek,
  riyadhDayStart,
  riyadhToday,
  type IsoDate,
} from "@/server/booking/time";
import type { BookingStatus } from "@/generated/prisma/enums";

/**
 * Statuses that reserve a staff member. Kept in step with the partial EXCLUDE
 * constraint in the M3 migration — if one changes, the other has to, or the
 * database will reject bookings the UI just offered.
 */
export const BLOCKING_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED"];

/** How far ahead a customer may book. Bounds the date picker and the action. */
export const BOOKING_HORIZON_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BookableService = {
  id: string;
  durationMinutes: number;
  price: string;
};

export type DayAvailability = {
  date: IsoDate;
  /** In the order requested, which is the order they will be performed. */
  services: BookableService[];
  slots: Slot[];
};

/**
 * Availability for one salon, one day, one set of services.
 *
 * Returns null when the request does not describe a bookable visit at all —
 * unknown, inactive or other-salon services. An empty `slots` array is the
 * different, ordinary answer of "that day is full".
 */
export async function getDayAvailability({
  salonId,
  serviceIds,
  date,
  now,
}: {
  salonId: string;
  serviceIds: string[];
  date: IsoDate;
  now: Date;
}): Promise<DayAvailability | null> {
  // The same service twice in one visit is not supported: the engine matches
  // staff by service id, so a repeat would be indistinguishable from the first.
  const requested = [...new Set(serviceIds)];
  if (requested.length === 0) return null;

  const services = await prisma.service.findMany({
    where: { id: { in: requested }, salonId, isActive: true },
    select: { id: true, durationMinutes: true, price: true },
  });

  // A missing row means the id was invented, retired, or belongs elsewhere.
  if (services.length !== requested.length) return null;

  const byId = new Map(services.map((service) => [service.id, service]));
  const ordered = requested.map((id) => byId.get(id)!);

  const dayStart = riyadhDayStart(date);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const staff = await prisma.staff.findMany({
    where: {
      salonId,
      isActive: true,
      staffServices: { some: { serviceId: { in: requested } } },
    },
    select: {
      id: true,
      staffServices: { select: { serviceId: true } },
      workingHours: {
        where: { dayOfWeek: riyadhDayOfWeek(date) },
        select: { startTime: true, endTime: true },
      },
      // Overlap, not containment: a week-long holiday has neither endpoint
      // inside the queried day but blocks all of it.
      timeOff: {
        where: { startDateTime: { lt: dayEnd }, endDateTime: { gt: dayStart } },
        select: { startDateTime: true, endDateTime: true },
      },
      bookingItems: {
        where: {
          status: { in: BLOCKING_STATUSES },
          startTime: { lt: dayEnd },
          endTime: { gt: dayStart },
        },
        select: { startTime: true, endTime: true },
      },
    },
    // Stable order so the same request always assigns the same people.
    orderBy: { name: "asc" },
  });

  const availability: StaffAvailability[] = staff.map((member) => ({
    id: member.id,
    serviceIds: member.staffServices.map((link) => link.serviceId),
    shifts: member.workingHours.flatMap((hour) => {
      const start = parseClock(hour.startTime);
      const end = parseClock(hour.endTime);
      // Unparseable or inverted hours are dropped rather than trusted — bad
      // data should narrow availability, never widen it.
      return start === null || end === null || end <= start
        ? []
        : [{ start, end }];
    }),
    busy: [...member.timeOff, ...member.bookingItems].map((interval) => ({
      start: instantToRiyadhMinutes(
        date,
        "startDateTime" in interval ? interval.startDateTime : interval.startTime,
      ),
      end: instantToRiyadhMinutes(
        date,
        "endDateTime" in interval ? interval.endDateTime : interval.endTime,
      ),
    })),
  }));

  const today = riyadhToday(now);

  // A day already past has no slots at all; today's are cut off at the current
  // minute. Nothing here trusts the client's idea of "now".
  const earliestStart =
    date < today
      ? Number.POSITIVE_INFINITY
      : date === today
        ? instantToRiyadhMinutes(date, now)
        : undefined;

  return {
    date,
    services: ordered.map((service) => ({
      id: service.id,
      durationMinutes: service.durationMinutes,
      price: service.price.toFixed(2),
    })),
    slots: findSlots({
      services: ordered.map((service) => ({
        id: service.id,
        durationMinutes: service.durationMinutes,
      })),
      staff: availability,
      earliestStart,
    }),
  };
}
