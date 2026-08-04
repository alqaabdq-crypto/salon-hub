/**
 * Geographic maths, kept pure so it is testable without a database or a browser.
 *
 * There is no PostGIS in this deployment, so proximity is done in two steps: a
 * bounding box narrows the candidate rows in SQL (an index range scan), and
 * Haversine gives the true distance for ordering. The box is deliberately the
 * cheap, wrong-but-generous filter — it over-selects at the corners, and the
 * exact distance filter afterwards discards those.
 */

/** Mean Earth radius. Haversine on a sphere is accurate to ~0.5% — far below the
 *  precision anyone needs to decide which salon is closer. */
const EARTH_RADIUS_KM = 6371;

/** Saudi Arabia's approximate bounding box, used to reject obviously bad input —
 *  a transposed lat/lng pair lands in the Indian Ocean, not in Riyadh. */
export const SAUDI_BOUNDS = {
  minLat: 16.0,
  maxLat: 32.2,
  minLng: 34.5,
  maxLng: 55.7,
} as const;

export type Coords = { lat: number; lng: number };

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

  // atan2 rather than asin: numerically stable for antipodal points, where the
  // asin form can push its argument past 1 and return NaN.
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * A latitude/longitude box guaranteed to contain every point within `radiusKm`.
 *
 * Longitude degrees shrink toward the poles, so the longitude span is divided by
 * cos(latitude). Near a pole that divisor approaches zero and the span explodes,
 * so it is clamped to the whole world rather than allowed to produce Infinity —
 * irrelevant for Saudi Arabia, but this function should not return NaN anywhere.
 */
export function boundingBox(
  centre: Coords,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);

  const cosLat = Math.cos(toRadians(centre.lat));
  const lngDelta = cosLat < 1e-6 ? 180 : latDelta / cosLat;

  return {
    minLat: Math.max(-90, centre.lat - latDelta),
    maxLat: Math.min(90, centre.lat + latDelta),
    minLng: Math.max(-180, centre.lng - lngDelta),
    maxLng: Math.min(180, centre.lng + lngDelta),
  };
}

/**
 * Parses a coordinate pair off a query string or form post.
 *
 * Returns null for anything that is not a finite, in-range pair — the callers
 * treat null as "no location given" and fall back to the unsorted listing, so a
 * hand-edited URL degrades instead of erroring.
 */
export function parseCoords(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): Coords | null {
  if (lat === null || lat === undefined || lat === "") return null;
  if (lng === null || lng === undefined || lng === "") return null;

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (parsedLat < -90 || parsedLat > 90) return null;
  if (parsedLng < -180 || parsedLng > 180) return null;

  return { lat: parsedLat, lng: parsedLng };
}

/** Whether a point falls inside the Saudi bounding box. */
export function isInSaudiArabia({ lat, lng }: Coords): boolean {
  return (
    lat >= SAUDI_BOUNDS.minLat &&
    lat <= SAUDI_BOUNDS.maxLat &&
    lng >= SAUDI_BOUNDS.minLng &&
    lng <= SAUDI_BOUNDS.maxLng
  );
}

/**
 * Distance rounded for display: metres under 1km, one decimal under 10km, whole
 * kilometres above. Returns the number and unit separately so the caller can
 * format them through next-intl rather than concatenating an English string.
 */
export function formatDistance(km: number): { value: number; unit: "m" | "km" } {
  if (km < 1) return { value: Math.round(km * 1000), unit: "m" };
  if (km < 10) return { value: Math.round(km * 10) / 10, unit: "km" };
  return { value: Math.round(km), unit: "km" };
}

/** Riyadh — the map's opening view when a salon has no coordinates yet. */
export const DEFAULT_CENTRE: Coords = { lat: 24.7136, lng: 46.6753 };
