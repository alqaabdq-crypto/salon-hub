import type { DayOfWeek } from "@/generated/prisma/enums";

// Booking times are stored as UTC instants, but everything a salon states — its
// working hours, the day a customer picks, the slot they see — is Riyadh local.
// These helpers are the only place the two representations meet.
//
// Saudi Arabia is UTC+3 year-round and has never observed daylight saving, so a
// fixed offset is exact here, not an approximation. It also keeps the engine
// pure and testable: no Intl timezone database, no server-clock dependency.
// Revisit only if the product ever serves a DST-observing country.
export const RIYADH_UTC_OFFSET_MINUTES = 180;

export const MINUTES_PER_DAY = 1440;

// Sunday-indexed, matching Date.prototype.getUTCDay().
const DAYS: DayOfWeek[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;

/** A Riyadh calendar date, "YYYY-MM-DD". Never an instant. */
export type IsoDate = string;

/** Rejects both malformed strings and real-looking impossibilities like 2026-02-30. */
export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

/** Midnight Riyadh on `date`, as the UTC instant it actually is. */
export function riyadhDayStart(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day) - RIYADH_UTC_OFFSET_MINUTES * 60_000,
  );
}

export function riyadhDayOfWeek(date: IsoDate): DayOfWeek {
  const [year, month, day] = date.split("-").map(Number);
  return DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** Minutes past Riyadh midnight on `date` → the UTC instant. */
export function riyadhMinutesToInstant(date: IsoDate, minutes: number): Date {
  return new Date(riyadhDayStart(date).getTime() + minutes * 60_000);
}

/**
 * A UTC instant → minutes past Riyadh midnight on `date`. Deliberately not
 * clamped: an instant before or after that day yields a negative value or one
 * past 1440, which is exactly what the overlap arithmetic needs to see.
 */
export function instantToRiyadhMinutes(date: IsoDate, at: Date): number {
  return (at.getTime() - riyadhDayStart(date).getTime()) / 60_000;
}

/** "10:00" → 600. Returns null rather than NaN so callers must handle bad data. */
export function parseClock(value: string): number | null {
  const match = CLOCK.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** 600 → "10:00". Minutes past midnight, so 1440 formats as "24:00". */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** The Riyadh calendar date `now` falls on. */
export function riyadhToday(now: Date): IsoDate {
  const shifted = new Date(now.getTime() + RIYADH_UTC_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** `date` shifted by whole days, staying on the Riyadh calendar. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
