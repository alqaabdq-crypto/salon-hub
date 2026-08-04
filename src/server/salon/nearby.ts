import { boundingBox, haversineKm, type Coords } from "@/lib/geo";
import type { Prisma } from "@/generated/prisma/client";

/** Radii offered in the browse UI, in kilometres. */
export const RADIUS_OPTIONS = [2, 5, 10, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 10;

/** Guards the JS-side distance sort from an unbounded read on a hand-edited URL. */
export const MAX_NEARBY_RESULTS = 200;

export function parseRadiusKm(value: string | undefined): number {
  const parsed = Number(value);
  return RADIUS_OPTIONS.includes(parsed as (typeof RADIUS_OPTIONS)[number])
    ? parsed
    : DEFAULT_RADIUS_KM;
}

/**
 * The `where` fragment restricting a salon query to a bounding box.
 *
 * This is the cheap half of proximity search: an index range scan that
 * over-selects at the corners of the box, because a box drawn around a circle
 * contains area the circle does not. `withinRadius` below discards those. The
 * null checks matter — a salon whose owner has not dropped a pin has no
 * coordinates and must not appear in a distance-ordered list at all.
 */
export function boundingBoxWhere(centre: Coords, radiusKm: number): Prisma.SalonWhereInput {
  const box = boundingBox(centre, radiusKm);

  return {
    lat: { not: null, gte: box.minLat, lte: box.maxLat },
    lng: { not: null, gte: box.minLng, lte: box.maxLng },
  };
}

/**
 * Attaches a true distance to each row, drops the box's corner over-selection,
 * and orders nearest first.
 *
 * Done in JavaScript rather than SQL because Haversine in Postgres without
 * PostGIS means an expression that no index can serve — the bounding box has
 * already cut the candidate set to something small enough that the difference
 * does not matter.
 */
export function withinRadius<T extends { lat: number | null; lng: number | null }>(
  rows: T[],
  centre: Coords,
  radiusKm: number,
): Array<T & { distanceKm: number }> {
  return rows
    .flatMap((row) => {
      if (row.lat === null || row.lng === null) return [];
      const distanceKm = haversineKm(centre, { lat: row.lat, lng: row.lng });
      return distanceKm <= radiusKm ? [{ ...row, distanceKm }] : [];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
