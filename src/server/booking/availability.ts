// The availability engine, deliberately free of Prisma and of the clock: it
// takes plain intervals in and gives slots out, so it can be unit-tested
// exhaustively. `schedule.ts` is the thin layer that loads rows and calls in.
//
// Every number here is minutes past Riyadh midnight on the day being queried
// (see time.ts). Values outside 0–1440 are legal and meaningful — an overnight
// booking that started yesterday shows up as a busy interval with a negative
// start, and still has to block this morning.

/** Half-open: [start, end). Touching intervals do not overlap. */
export type Interval = { start: number; end: number };

export type StaffAvailability = {
  id: string;
  /** Services this member is qualified to perform. */
  serviceIds: string[];
  /** Shifts on the queried day. A member with none is off. */
  shifts: Interval[];
  /** Existing bookings and time off, merged by the caller. */
  busy: Interval[];
};

export type RequestedService = {
  id: string;
  durationMinutes: number;
};

export type Assignment = {
  serviceId: string;
  staffId: string;
  start: number;
  end: number;
};

export type Slot = {
  start: number;
  end: number;
  /** One per requested service, in the order requested, laid end to end. */
  assignments: Assignment[];
};

/**
 * Customers are offered quarter-hour starts. Service durations themselves are
 * arbitrary (25, 40, 45 minutes in the seed data) — this only quantises when a
 * visit may begin, so the grid stays readable.
 */
export const SLOT_GRANULARITY_MINUTES = 15;

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function isFree(member: StaffAvailability, window: Interval): boolean {
  return (
    member.shifts.some((shift) => contains(shift, window)) &&
    !member.busy.some((busy) => overlaps(busy, window))
  );
}

/**
 * Assigns each service, in order, to a qualified member who is free for its
 * window. No backtracking is needed: the services in a visit run back to back
 * and never overlap, so committing a member to one service leaves every later
 * service's options untouched — including reusing the same member.
 *
 * Returns null when any service in the chain cannot be staffed.
 */
function assignChain(
  services: RequestedService[],
  start: number,
  staff: StaffAvailability[],
): Assignment[] | null {
  const assignments: Assignment[] = [];
  let cursor = start;

  for (const service of services) {
    const window = { start: cursor, end: cursor + service.durationMinutes };

    // First qualified free member wins. The caller controls the order, so the
    // choice is stable across identical requests rather than arbitrary.
    const member = staff.find(
      (candidate) =>
        candidate.serviceIds.includes(service.id) && isFree(candidate, window),
    );

    if (!member) return null;

    assignments.push({
      serviceId: service.id,
      staffId: member.id,
      start: window.start,
      end: window.end,
    });
    cursor = window.end;
  }

  return assignments;
}

export type FindSlotsInput = {
  /** In the order the customer will receive them. */
  services: RequestedService[];
  staff: StaffAvailability[];
  /**
   * Slots starting before this are not offered — the past, on today's date.
   * Omit for a day that hasn't begun.
   */
  earliestStart?: number;
  granularityMinutes?: number;
};

export function findSlots({
  services,
  staff,
  earliestStart = Number.NEGATIVE_INFINITY,
  granularityMinutes = SLOT_GRANULARITY_MINUTES,
}: FindSlotsInput): Slot[] {
  if (services.length === 0) return [];

  const totalDuration = services.reduce(
    (sum, service) => sum + service.durationMinutes,
    0,
  );

  const shifts = staff.flatMap((member) => member.shifts);
  if (shifts.length === 0) return [];

  // No slot can begin before the first shift opens or end after the last one
  // closes, whoever is working them — a narrower bound than the calendar day.
  const openAt = Math.min(...shifts.map((shift) => shift.start));
  const closeAt = Math.max(...shifts.map((shift) => shift.end));

  const first = roundUpTo(Math.max(openAt, earliestStart), granularityMinutes);
  const last = closeAt - totalDuration;

  const slots: Slot[] = [];

  for (let start = first; start <= last; start += granularityMinutes) {
    const assignments = assignChain(services, start, staff);
    if (assignments) {
      slots.push({ start, end: start + totalDuration, assignments });
    }
  }

  return slots;
}
