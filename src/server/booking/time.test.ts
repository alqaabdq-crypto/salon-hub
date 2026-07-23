import { describe, expect, it } from "vitest";
import {
  addDays,
  formatClock,
  instantToRiyadhMinutes,
  isIsoDate,
  parseClock,
  riyadhDayOfWeek,
  riyadhDayStart,
  riyadhMinutesToInstant,
  riyadhToday,
} from "@/server/booking/time";

describe("isIsoDate", () => {
  it("accepts a real date", () => {
    expect(isIsoDate("2026-07-23")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isIsoDate("2026-7-23")).toBe(false);
    expect(isIsoDate("23-07-2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("rejects dates that parse but do not exist", () => {
    // Date.UTC would silently roll these over to March; the round-trip check
    // is what catches them.
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("riyadhDayStart", () => {
  it("is 21:00 UTC the previous day", () => {
    expect(riyadhDayStart("2026-07-23").toISOString()).toBe(
      "2026-07-22T21:00:00.000Z",
    );
  });

  it("does not shift across a summer month, since KSA has no DST", () => {
    // The same offset in January and July is the whole point of the fixed offset.
    expect(riyadhDayStart("2026-01-15").toISOString()).toBe(
      "2026-01-14T21:00:00.000Z",
    );
  });
});

describe("riyadhDayOfWeek", () => {
  it("maps dates to the right weekday", () => {
    expect(riyadhDayOfWeek("2026-07-23")).toBe("THU");
    expect(riyadhDayOfWeek("2026-07-24")).toBe("FRI");
    expect(riyadhDayOfWeek("2026-07-25")).toBe("SAT");
  });
});

describe("minute/instant round trip", () => {
  it("converts a Riyadh wall time to the matching UTC instant", () => {
    // 10:00 in Riyadh is 07:00 UTC.
    expect(riyadhMinutesToInstant("2026-07-23", 600).toISOString()).toBe(
      "2026-07-23T07:00:00.000Z",
    );
  });

  it("round-trips", () => {
    const instant = riyadhMinutesToInstant("2026-07-23", 795);
    expect(instantToRiyadhMinutes("2026-07-23", instant)).toBe(795);
  });

  it("reports instants outside the day as out-of-range minutes", () => {
    // An appointment that ran past midnight is negative against the next day —
    // the overlap arithmetic needs that, so it must not be clamped.
    const lateLastNight = riyadhMinutesToInstant("2026-07-22", 1410); // 23:30
    expect(instantToRiyadhMinutes("2026-07-23", lateLastNight)).toBe(-30);
  });
});

describe("parseClock / formatClock", () => {
  it("parses working-hour strings", () => {
    expect(parseClock("10:00")).toBe(600);
    expect(parseClock("22:30")).toBe(1350);
    expect(parseClock("00:00")).toBe(0);
  });

  it("returns null on nonsense rather than NaN", () => {
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("10:60")).toBeNull();
    expect(parseClock("ten")).toBeNull();
  });

  it("formats back", () => {
    expect(formatClock(600)).toBe("10:00");
    expect(formatClock(1350)).toBe("22:30");
    expect(formatClock(0)).toBe("00:00");
  });
});

describe("riyadhToday", () => {
  it("has already turned over when UTC is still on the previous day", () => {
    // 22:00 UTC on the 22nd is 01:00 on the 23rd in Riyadh.
    expect(riyadhToday(new Date("2026-07-22T22:00:00.000Z"))).toBe("2026-07-23");
  });

  it("is still the previous day just before 21:00 UTC", () => {
    expect(riyadhToday(new Date("2026-07-22T20:59:00.000Z"))).toBe("2026-07-22");
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("goes backwards", () => {
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });
});
