import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATFORM_COMMISSION,
  halalasToSar,
  resolveCommissionRate,
  sarToHalalas,
  splitCommission,
} from "@/server/payments/money";

describe("sarToHalalas", () => {
  it("converts the stored decimal string", () => {
    expect(sarToHalalas("150.00")).toBe(15000);
    expect(sarToHalalas("0.05")).toBe(5);
    expect(sarToHalalas(420)).toBe(42000);
  });

  it("survives the float that trips naive conversion", () => {
    // 8.7 * 100 is 869.9999999999999 in IEEE754; truncating would lose a halala.
    expect(sarToHalalas("8.70")).toBe(870);
    expect(sarToHalalas("1.10")).toBe(110);
    expect(sarToHalalas("2.30")).toBe(230);
  });

  it("round-trips", () => {
    for (const sar of ["0.01", "9.99", "150.00", "12345.67"]) {
      expect(halalasToSar(sarToHalalas(sar))).toBe(sar);
    }
  });
});

describe("resolveCommissionRate", () => {
  it("prefers the salon's negotiated override", () => {
    expect(resolveCommissionRate({ salonRate: 0.08, planRate: 0.1 })).toBe(0.08);
  });

  it("falls back to the plan rate", () => {
    expect(resolveCommissionRate({ salonRate: null, planRate: 0.1 })).toBe(0.1);
  });

  it("falls back to the platform default", () => {
    expect(resolveCommissionRate({ salonRate: null, planRate: null })).toBe(
      DEFAULT_PLATFORM_COMMISSION,
    );
  });

  it("treats a zero rate as a real deal, not a missing one", () => {
    // `??` rather than `||` — a salon that pays no commission is a negotiated
    // outcome, and must not silently fall through to the platform default.
    expect(resolveCommissionRate({ salonRate: 0, planRate: 0.1 })).toBe(0);
  });

  it("clamps nonsense rather than trusting the row", () => {
    expect(resolveCommissionRate({ salonRate: -0.5 })).toBe(0);
    expect(resolveCommissionRate({ salonRate: 3 })).toBe(1);
    expect(resolveCommissionRate({ salonRate: Number.NaN })).toBe(0);
  });
});

describe("splitCommission", () => {
  it("splits a round amount", () => {
    expect(splitCommission(15000, 0.15)).toEqual({
      platformFee: 2250,
      salonNet: 12750,
    });
  });

  it("always adds back to the amount, whatever the rounding", () => {
    // The awkward cases: a fee that lands on a half-halala.
    for (const amount of [1, 7, 33, 999, 12345, 8_675_309]) {
      for (const rate of [0, 0.03, 0.15, 0.175, 1 / 3, 1]) {
        const { platformFee, salonNet } = splitCommission(amount, rate);
        expect(platformFee + salonNet).toBe(amount);
        expect(platformFee).toBeGreaterThanOrEqual(0);
        expect(salonNet).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("gives everything to the salon at a zero rate", () => {
    expect(splitCommission(15000, 0)).toEqual({ platformFee: 0, salonNet: 15000 });
  });
});
