import { describe, expect, it } from "vitest";
import {
  boundingBox,
  DEFAULT_CENTRE,
  formatDistance,
  haversineKm,
  isInSaudiArabia,
  parseCoords,
} from "./geo";

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const JEDDAH = { lat: 21.4858, lng: 39.1925 };
const DAMMAM = { lat: 26.4207, lng: 50.0888 };

describe("haversineKm", () => {
  it("is zero for a point against itself", () => {
    expect(haversineKm(RIYADH, RIYADH)).toBe(0);
  });

  it("matches the known Riyadh–Jeddah distance", () => {
    // ~845 km great-circle. Allow 1% for the spherical approximation.
    expect(haversineKm(RIYADH, JEDDAH)).toBeGreaterThan(835);
    expect(haversineKm(RIYADH, JEDDAH)).toBeLessThan(855);
  });

  it("matches the known Riyadh–Dammam distance", () => {
    // ~390 km great-circle (the road is longer, around 400).
    expect(haversineKm(RIYADH, DAMMAM)).toBeGreaterThan(385);
    expect(haversineKm(RIYADH, DAMMAM)).toBeLessThan(396);
  });

  it("is symmetric", () => {
    expect(haversineKm(RIYADH, JEDDAH)).toBeCloseTo(haversineKm(JEDDAH, RIYADH), 9);
  });

  it("does not return NaN for antipodal points", () => {
    // The asin form of Haversine can push its argument past 1 here and yield NaN.
    const distance = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(distance)).toBe(false);
    expect(distance).toBeGreaterThan(20000);
  });

  it("handles a short distance across a city", () => {
    // ~1.1 km: 0.01 degrees of latitude.
    const near = { lat: RIYADH.lat + 0.01, lng: RIYADH.lng };
    expect(haversineKm(RIYADH, near)).toBeGreaterThan(1.0);
    expect(haversineKm(RIYADH, near)).toBeLessThan(1.2);
  });
});

describe("boundingBox", () => {
  it("contains every point inside the radius", () => {
    const box = boundingBox(RIYADH, 10);

    // Sample points on the compass rose at just under the radius.
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const radians = (bearing * Math.PI) / 180;
      // Rough offset in degrees for ~9.5 km, which must stay inside the box.
      const dLat = (9.5 / 111) * Math.cos(radians);
      const dLng = (9.5 / (111 * Math.cos((RIYADH.lat * Math.PI) / 180))) * Math.sin(radians);
      const point = { lat: RIYADH.lat + dLat, lng: RIYADH.lng + dLng };

      expect(point.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(point.lat).toBeLessThanOrEqual(box.maxLat);
      expect(point.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(point.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it("widens the longitude span with latitude", () => {
    // Longitude degrees shrink toward the poles, so the same radius needs a
    // wider span in degrees the further north you go.
    const near = boundingBox({ lat: 5, lng: 0 }, 50);
    const far = boundingBox({ lat: 60, lng: 0 }, 50);

    expect(far.maxLng - far.minLng).toBeGreaterThan(near.maxLng - near.minLng);
  });

  it("clamps rather than exploding at the pole", () => {
    const box = boundingBox({ lat: 90, lng: 0 }, 50);

    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });

  it("never runs past the coordinate limits", () => {
    const box = boundingBox({ lat: -89, lng: 179 }, 500);

    expect(box.minLat).toBeGreaterThanOrEqual(-90);
    expect(box.maxLng).toBeLessThanOrEqual(180);
  });
});

describe("parseCoords", () => {
  it("parses numeric strings", () => {
    expect(parseCoords("24.7136", "46.6753")).toEqual(RIYADH);
  });

  it("parses numbers", () => {
    expect(parseCoords(24.7136, 46.6753)).toEqual(RIYADH);
  });

  it("accepts zero, which is a real coordinate", () => {
    expect(parseCoords(0, 0)).toEqual({ lat: 0, lng: 0 });
  });

  it("rejects a missing half of the pair", () => {
    expect(parseCoords("24.7", undefined)).toBeNull();
    expect(parseCoords(undefined, "46.6")).toBeNull();
    expect(parseCoords("", "")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseCoords("here", "there")).toBeNull();
    expect(parseCoords("NaN", "1")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseCoords("91", "0")).toBeNull();
    expect(parseCoords("0", "181")).toBeNull();
    expect(parseCoords("-90.1", "0")).toBeNull();
  });

  it("rejects infinities", () => {
    expect(parseCoords("Infinity", "0")).toBeNull();
  });
});

describe("isInSaudiArabia", () => {
  it("accepts the three seeded cities", () => {
    expect(isInSaudiArabia(RIYADH)).toBe(true);
    expect(isInSaudiArabia(JEDDAH)).toBe(true);
    expect(isInSaudiArabia(DAMMAM)).toBe(true);
  });

  it("rejects a transposed pair", () => {
    // Riyadh with lat and lng swapped lands outside the country entirely —
    // the single most likely coordinate mistake.
    expect(isInSaudiArabia({ lat: RIYADH.lng, lng: RIYADH.lat })).toBe(false);
  });

  it("rejects null island", () => {
    expect(isInSaudiArabia({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("formatDistance", () => {
  it("uses metres below a kilometre", () => {
    expect(formatDistance(0.4)).toEqual({ value: 400, unit: "m" });
  });

  it("uses one decimal below ten kilometres", () => {
    expect(formatDistance(3.46)).toEqual({ value: 3.5, unit: "km" });
  });

  it("uses whole kilometres above ten", () => {
    expect(formatDistance(42.7)).toEqual({ value: 43, unit: "km" });
  });

  it("does not round a near-kilometre up into metres", () => {
    expect(formatDistance(0.9999)).toEqual({ value: 1000, unit: "m" });
  });
});

describe("DEFAULT_CENTRE", () => {
  it("is inside Saudi Arabia", () => {
    expect(isInSaudiArabia(DEFAULT_CENTRE)).toBe(true);
  });
});
