import { describe, expect, it } from "vitest";
import { istHourNow, themeFor } from "./theme";
import { istParts } from "./ist";

const IN = "IN";

describe("themeFor: time edges in a southern state", () => {
  // IST = UTC+5:30, so these instants hit the exact edges.
  it.each([
    ["09:59 IST", "2026-09-30T04:29:00Z", "dark"],
    ["10:00 IST", "2026-09-30T04:30:00Z", "light"],
    ["11:59 IST", "2026-09-30T06:29:00Z", "light"],
    ["12:00 IST", "2026-09-30T06:30:00Z", "dark"],
  ])("%s → %s", (_label, iso, expected) => {
    const hour = istParts(new Date(iso)).hour;
    expect(themeFor({ hour, regionCode: "KL", country: IN })).toBe(expected);
  });
});

describe("themeFor: regions at 11:00 IST", () => {
  it.each(["TN", "KL", "KA", "AP", "TG", "TS", "kl"])("%s → light", (regionCode) => {
    expect(themeFor({ hour: 11, regionCode, country: IN })).toBe("light");
  });

  it.each(["MH", "DL", "GJ", "WB", "PY", "GA"])("%s → dark", (regionCode) => {
    expect(themeFor({ hour: 11, regionCode, country: IN })).toBe("dark");
  });

  it("unknown location → dark", () => {
    expect(themeFor({ hour: 11, regionCode: null, country: null })).toBe("dark");
  });

  it("same region code outside India → dark", () => {
    // "KA" is also a region code elsewhere; only Indian states count.
    expect(themeFor({ hour: 11, regionCode: "KA", country: "US" })).toBe("dark");
  });
});

describe("themeFor: other hours in the south", () => {
  it.each([0, 6, 9, 12, 13, 18, 23])("%i:00 → dark", (hour) => {
    expect(themeFor({ hour, regionCode: "TN", country: IN })).toBe("dark");
  });
});

describe("istHourNow", () => {
  it("uses IST regardless of the machine time zone", () => {
    expect(istHourNow(undefined, new Date("2026-09-30T20:00:00Z"))).toBe(1); // 01:30 IST next day
  });
  it("test override wins", () => {
    expect(istHourNow(11, new Date("2026-09-30T20:00:00Z"))).toBe(11);
  });
});
