import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTapResolver, resolveGesture, zoneFor, type Zone } from "./gestures";

describe("resolveGesture", () => {
  it.each([
    ["right", 2, "seekForward"],
    ["left", 2, "seekBack"],
    ["center", 1, "togglePlay"],
    ["center", 3, "nextVideo"],
    ["right", 3, "closeSite"],
    ["left", 3, "openComments"],
    ["left", 1, "toggleControls"],
    ["right", 1, "toggleControls"],
    ["center", 2, "none"],
    ["center", 0, "none"],
  ] as const)("%s × %i → %s", (zone, count, action) => {
    expect(resolveGesture(zone, count)).toBe(action);
  });

  it("treats 4+ taps as 3", () => {
    expect(resolveGesture("right", 5)).toBe("closeSite");
    expect(resolveGesture("center", 4)).toBe("nextVideo");
  });
});

describe("zoneFor", () => {
  it.each([
    [0, "left"],
    [299, "left"],
    [300, "center"],
    [500, "center"],
    [699, "center"],
    [700, "right"],
    [1000, "right"],
  ] as const)("x=%i of 1000 → %s", (x, zone) => {
    expect(zoneFor(x, 1000)).toBe(zone);
  });
});

describe("createTapResolver (300 ms window)", () => {
  let resolved: Array<[Zone, number]>;
  let r: ReturnType<typeof createTapResolver>;

  beforeEach(() => {
    vi.useFakeTimers();
    resolved = [];
    r = createTapResolver({ onResolve: (z, n) => resolved.push([z, n]) });
  });
  afterEach(() => vi.useRealTimers());

  it("resolves a single tap 300 ms after it, not before", () => {
    r.tap("center");
    vi.advanceTimersByTime(299);
    expect(resolved).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(resolved).toEqual([["center", 1]]);
  });

  it("counts taps that each land within 300 ms of the previous one", () => {
    r.tap("right");
    vi.advanceTimersByTime(250);
    r.tap("right");
    vi.advanceTimersByTime(250);
    r.tap("right");
    vi.advanceTimersByTime(300);
    expect(resolved).toEqual([["right", 3]]);
  });

  it("a gap of 300 ms or more starts a new sequence", () => {
    r.tap("left");
    vi.advanceTimersByTime(300);
    r.tap("left");
    vi.advanceTimersByTime(300);
    expect(resolved).toEqual([
      ["left", 1],
      ["left", 1],
    ]);
  });

  it("switching zones ends the current sequence immediately", () => {
    r.tap("left");
    r.tap("left");
    r.tap("right");
    expect(resolved).toEqual([["left", 2]]);
    vi.advanceTimersByTime(300);
    expect(resolved).toEqual([
      ["left", 2],
      ["right", 1],
    ]);
  });

  it("cancel drops a pending sequence", () => {
    r.tap("center");
    r.cancel();
    vi.advanceTimersByTime(1000);
    expect(resolved).toEqual([]);
  });
});
