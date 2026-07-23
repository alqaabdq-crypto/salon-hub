import { describe, expect, it } from "vitest";
import {
  findSlots,
  type RequestedService,
  type StaffAvailability,
} from "@/server/booking/availability";

// 10:00–22:00, the seeded salon day.
const FULL_DAY = [{ start: 600, end: 1320 }];

const CUT: RequestedService = { id: "cut", durationMinutes: 45 };
const COLOUR: RequestedService = { id: "colour", durationMinutes: 120 };

function staffMember(
  id: string,
  overrides: Partial<StaffAvailability> = {},
): StaffAvailability {
  return {
    id,
    serviceIds: ["cut", "colour"],
    shifts: FULL_DAY,
    busy: [],
    ...overrides,
  };
}

describe("findSlots", () => {
  it("offers quarter-hour starts across the shift", () => {
    const slots = findSlots({ services: [CUT], staff: [staffMember("layla")] });

    expect(slots[0].start).toBe(600);
    expect(slots[1].start).toBe(615);
    // The last slot must finish by closing time, not merely start before it.
    expect(slots.at(-1)!.end).toBe(1320);
    expect(slots.at(-1)!.start).toBe(1275);
  });

  it("returns nothing when no service is requested", () => {
    expect(findSlots({ services: [], staff: [staffMember("layla")] })).toEqual([]);
  });

  it("returns nothing when nobody is working", () => {
    const off = staffMember("layla", { shifts: [] });
    expect(findSlots({ services: [CUT], staff: [off] })).toEqual([]);
  });

  it("returns nothing when the visit is longer than the day", () => {
    const marathon: RequestedService = { id: "cut", durationMinutes: 1000 };
    expect(findSlots({ services: [marathon], staff: [staffMember("layla")] })).toEqual(
      [],
    );
  });

  it("skips a member's existing booking", () => {
    const layla = staffMember("layla", { busy: [{ start: 720, end: 780 }] });
    const starts = findSlots({ services: [CUT], staff: [layla] }).map((s) => s.start);

    // A 45-minute cut is blocked from 11:30 (would run past 12:00) to 13:00.
    expect(starts).toContain(660); // 11:00, ends 11:45
    expect(starts).toContain(675); // 11:15, ends exactly at 12:00
    expect(starts).not.toContain(690); // 11:30, overlaps
    expect(starts).not.toContain(765); // 12:45, overlaps
    expect(starts).toContain(780); // 13:00, starts as the booking ends
  });

  it("treats touching intervals as free, not as an overlap", () => {
    // A booking ending at 12:00 must not block one starting at 12:00.
    const layla = staffMember("layla", { busy: [{ start: 675, end: 720 }] });
    const starts = findSlots({ services: [CUT], staff: [layla] }).map((s) => s.start);

    expect(starts).toContain(720);
    expect(starts).toContain(630); // ends exactly at 11:15
  });

  it("falls through to a second member when the first is busy", () => {
    const layla = staffMember("layla", { busy: [{ start: 600, end: 1320 }] });
    const noura = staffMember("noura");

    const slot = findSlots({ services: [CUT], staff: [layla, noura] })[0];

    expect(slot.start).toBe(600);
    expect(slot.assignments[0].staffId).toBe("noura");
  });

  it("only offers a service to members qualified for it", () => {
    const colourist = staffMember("noura", { serviceIds: ["colour"] });
    const stylist = staffMember("layla", { serviceIds: ["cut"] });

    const slot = findSlots({ services: [CUT], staff: [colourist, stylist] })[0];
    expect(slot.assignments[0].staffId).toBe("layla");

    expect(
      findSlots({ services: [{ id: "facial", durationMinutes: 60 }], staff: [stylist] }),
    ).toEqual([]);
  });

  it("lays a multi-service visit end to end", () => {
    const slot = findSlots({
      services: [CUT, COLOUR],
      staff: [staffMember("layla")],
    })[0];

    expect(slot.start).toBe(600);
    expect(slot.end).toBe(765); // 45 + 120
    expect(slot.assignments).toEqual([
      { serviceId: "cut", staffId: "layla", start: 600, end: 645 },
      { serviceId: "colour", staffId: "layla", start: 645, end: 765 },
    ]);
  });

  it("splits a visit across members when one cannot cover both parts", () => {
    // Layla does the cut; she is booked solid from 10:45 so the colour must
    // go to Noura, who cannot cut.
    const layla = staffMember("layla", {
      serviceIds: ["cut"],
      busy: [{ start: 645, end: 1320 }],
    });
    const noura = staffMember("noura", { serviceIds: ["colour"] });

    const slot = findSlots({ services: [CUT, COLOUR], staff: [layla, noura] })[0];

    expect(slot.start).toBe(600);
    expect(slot.assignments.map((a) => a.staffId)).toEqual(["layla", "noura"]);
  });

  it("rejects a start where only the first service can be staffed", () => {
    const layla = staffMember("layla", { serviceIds: ["cut"] });

    // Nobody can do the colour at all, so no start works.
    expect(findSlots({ services: [CUT, COLOUR], staff: [layla] })).toEqual([]);
  });

  it("respects a shorter shift as a hard boundary", () => {
    const morning = staffMember("layla", { shifts: [{ start: 600, end: 720 }] });
    const slots = findSlots({ services: [CUT], staff: [morning] });

    expect(slots.at(-1)!.end).toBe(720);
    expect(slots.every((slot) => slot.end <= 720)).toBe(true);
  });

  it("does not straddle a split shift", () => {
    // 10:00–13:00 and 16:00–20:00, with a break between.
    const split = staffMember("layla", {
      shifts: [
        { start: 600, end: 780 },
        { start: 960, end: 1200 },
      ],
    });
    const starts = findSlots({ services: [CUT], staff: [split] }).map((s) => s.start);

    expect(starts).toContain(735); // 12:15, ends 13:00
    expect(starts).not.toContain(750); // 12:30 would run past 13:00 into the break
    expect(starts).not.toContain(900); // 15:00, during the break
    expect(starts).toContain(960); // 16:00, the second shift opens
  });

  it("drops slots that have already started today", () => {
    const starts = findSlots({
      services: [CUT],
      staff: [staffMember("layla")],
      earliestStart: 800, // 13:20
    }).map((slot) => slot.start);

    expect(starts[0]).toBe(810); // rounded up to the next quarter hour
    expect(starts).not.toContain(795);
  });

  it("blocks this morning with a booking that started yesterday", () => {
    // Negative minutes: an overnight visit still occupying 10:00–10:30 today.
    const layla = staffMember("layla", { busy: [{ start: -60, end: 630 }] });
    const starts = findSlots({ services: [CUT], staff: [layla] }).map((s) => s.start);

    expect(starts).not.toContain(600);
    expect(starts[0]).toBe(630);
  });
});
