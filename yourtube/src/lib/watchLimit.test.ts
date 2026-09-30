import { describe, expect, it } from "vitest";
import {
  clampSeekTarget,
  formatClock,
  initialWatchState,
  isLimitReached,
  recordSeek,
  recordTick,
  remainingSeconds,
  type WatchState,
} from "./watchLimit";

const play = (state: WatchState, from: number, to: number, step = 0.25) => {
  let s = state;
  for (let t = from; t <= to + 1e-9; t += step) s = recordTick(s, t);
  return s;
};

describe("recordTick", () => {
  it("accumulates normal playback", () => {
    const s = play(initialWatchState(), 0, 60);
    expect(s.played).toBeCloseTo(60, 5);
  });

  it("counts 2x speed ticks", () => {
    const s = play(initialWatchState(), 0, 60, 0.5);
    expect(s.played).toBeCloseTo(60, 5);
  });

  it("a forward jump (seek) spends nothing", () => {
    let s = play(initialWatchState(), 0, 10);
    s = recordTick(s, 200);
    expect(s.played).toBeCloseTo(10, 5);
    s = play(s, 200, 205);
    expect(s.played).toBeCloseTo(15, 5);
  });

  it("seeking back and rewatching does spend budget", () => {
    let s = play(initialWatchState(), 0, 100);
    s = recordSeek(s);
    s = play(s, 0, 100);
    expect(s.played).toBeCloseTo(200, 5);
  });

  it("recordSeek prevents the post-seek tick counting", () => {
    let s = play(initialWatchState(), 0, 5);
    s = recordSeek(s);
    s = recordTick(s, 7); // first tick after seek just re-anchors
    expect(s.played).toBeCloseTo(5, 5);
  });
});

describe("limits", () => {
  const FREE = 300;

  it("locks when cumulative playback reaches the limit", () => {
    const s = play(initialWatchState(), 0, 299.75);
    expect(isLimitReached(s, 299.75, FREE)).toBe(false);
    const done = recordTick(s, 300);
    expect(isLimitReached(done, 120, FREE)).toBe(true);
    expect(remainingSeconds(done, FREE)).toBe(0);
  });

  it("locks when the playhead reaches the limit position", () => {
    expect(isLimitReached(initialWatchState(), 300, FREE)).toBe(true);
  });

  it("seeks are clamped below the limit", () => {
    expect(clampSeekTarget(1200, FREE)).toBe(299.75);
    expect(clampSeekTarget(-5, FREE)).toBe(0);
    expect(clampSeekTarget(42, FREE)).toBe(42);
  });

  it("unlimited (Gold) never locks", () => {
    const s = play(initialWatchState(), 0, 5000, 1);
    expect(isLimitReached(s, 5000, null)).toBe(false);
    expect(remainingSeconds(s, null)).toBeNull();
    expect(clampSeekTarget(99999, null)).toBe(99999);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [59.9, "0:59"],
    [300, "5:00"],
    [3725, "1:02:05"],
  ])("%s → %s", (s, out) => expect(formatClock(s)).toBe(out));
});
