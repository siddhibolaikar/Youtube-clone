import { describe, expect, it } from "vitest";
import { computeQuota, downloadDayKey, quotaLabel } from "./downloadQuota";
import { istStartOfDay } from "./ist";

// 2026-09-30 18:29:59Z is 23:59:59 IST; 18:30:00Z is 00:00:00 IST on Oct 1.
const beforeMidnightIst = new Date("2026-09-30T18:29:59.999Z");
const atMidnightIst = new Date("2026-09-30T18:30:00.000Z");

describe("download quota day boundary (IST)", () => {
  it("switches day at IST midnight, not UTC midnight", () => {
    expect(downloadDayKey(beforeMidnightIst)).toBe("20260930");
    expect(downloadDayKey(atMidnightIst)).toBe("20261001");
  });

  it("UTC midnight is 05:30 IST and still the same IST day", () => {
    expect(downloadDayKey(new Date("2026-10-01T00:00:00Z"))).toBe("20261001");
    expect(downloadDayKey(new Date("2026-09-30T23:59:59Z"))).toBe("20261001");
  });

  it("start of the IST day is 18:30Z the previous UTC day", () => {
    expect(istStartOfDay(new Date("2026-10-01T10:00:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("resetsAt is the next IST midnight", () => {
    expect(computeQuota(false, 1, beforeMidnightIst).resetsAt).toBe("2026-09-30T18:30:00.000Z");
    expect(computeQuota(false, 0, atMidnightIst).resetsAt).toBe("2026-10-01T18:30:00.000Z");
  });

  it("handles month and year rollover", () => {
    expect(downloadDayKey(new Date("2026-12-31T18:30:00Z"))).toBe("20270101");
  });
});

describe("computeQuota", () => {
  const now = new Date("2026-09-30T06:00:00Z");

  it("free: 1 per day", () => {
    expect(computeQuota(false, 0, now)).toMatchObject({ limit: 1, remaining: 1 });
    expect(computeQuota(false, 1, now)).toMatchObject({ limit: 1, remaining: 0 });
    expect(quotaLabel(computeQuota(false, 1, now))).toBe("0 of 1 left today");
  });

  it("premium: unlimited", () => {
    const q = computeQuota(true, 25, now);
    expect(q).toMatchObject({ limit: null, remaining: null, isPremium: true });
    expect(quotaLabel(q)).toBe("Unlimited · Premium");
  });
});
