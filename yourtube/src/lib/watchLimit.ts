// Per-video watch-time budget. Each time a video is opened the viewer gets
// their plan's limit of *played* time. Seeking doesn't spend budget, but the
// playhead can't be moved past the limit either, so skipping ahead can't be
// used to watch beyond it.

export interface WatchState {
  /** Seconds of actual playback so far in this viewing. */
  played: number;
  /** currentTime at the previous tick, or null before the first tick / after a seek. */
  lastTime: number | null;
}

export const initialWatchState = (): WatchState => ({ played: 0, lastTime: null });

/**
 * timeupdate fires every ~250 ms (up to ~1 s when throttled); at 2x speed
 * that's up to ~2 s of media per tick. Anything larger is a seek.
 */
export const MAX_TICK_SECONDS = 2.5;

/** Account for a timeupdate tick. Backward jumps and large forward jumps count as seeks. */
export function recordTick(state: WatchState, currentTime: number): WatchState {
  if (state.lastTime === null) return { ...state, lastTime: currentTime };
  const delta = currentTime - state.lastTime;
  const played = delta > 0 && delta <= MAX_TICK_SECONDS ? state.played + delta : state.played;
  return { played, lastTime: currentTime };
}

/** Call on "seeking": the next tick starts a fresh measurement. */
export const recordSeek = (state: WatchState): WatchState => ({ ...state, lastTime: null });

/** Where a seek is allowed to land. */
export function clampSeekTarget(target: number, limitSec: number | null): number {
  if (limitSec === null) return target;
  return Math.min(Math.max(0, target), Math.max(0, limitSec - 0.25));
}

export function remainingSeconds(state: WatchState, limitSec: number | null): number | null {
  if (limitSec === null) return null;
  return Math.max(0, limitSec - state.played);
}

export function isLimitReached(state: WatchState, currentTime: number, limitSec: number | null): boolean {
  if (limitSec === null) return false;
  return state.played >= limitSec || currentTime >= limitSec;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
