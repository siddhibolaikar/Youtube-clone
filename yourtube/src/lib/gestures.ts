// Tap gestures on the video player. Pure logic so it can be unit-tested; the
// player component only maps pointer events in and actions out.

export type Zone = "left" | "center" | "right";

export type GestureAction =
  | "toggleControls"
  | "seekBack"
  | "seekForward"
  | "togglePlay"
  | "nextVideo"
  | "closeSite"
  | "openComments"
  | "none";

export const TAP_WINDOW_MS = 300;
export const SEEK_STEP_S = 10;

/** Left 30% / centre 40% / right 30% of the player width. */
export function zoneFor(x: number, width: number): Zone {
  const f = width > 0 ? x / width : 0.5;
  if (f < 0.3) return "left";
  if (f >= 0.7) return "right";
  return "center";
}

/**
 * zone × tap count → action. Counts above 3 are treated as 3; combinations
 * the spec doesn't define (e.g. two taps in the centre) do nothing.
 */
export function resolveGesture(zone: Zone, count: number): GestureAction {
  const n = Math.min(Math.max(Math.floor(count), 0), 3);
  if (n === 0) return "none";
  switch (zone) {
    case "center":
      return n === 1 ? "togglePlay" : n === 3 ? "nextVideo" : "none";
    case "right":
      return n === 1 ? "toggleControls" : n === 2 ? "seekForward" : "closeSite";
    case "left":
      return n === 1 ? "toggleControls" : n === 2 ? "seekBack" : "openComments";
  }
}

interface TapResolverOptions {
  windowMs?: number;
  onResolve: (zone: Zone, count: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Counts taps; a sequence resolves `windowMs` after its last tap. A tap in a
 * different zone ends the current sequence immediately and starts a new one.
 */
export function createTapResolver({
  windowMs = TAP_WINDOW_MS,
  onResolve,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: TapResolverOptions) {
  let zone: Zone | null = null;
  let count = 0;
  let timer: unknown = null;

  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (zone && count > 0) onResolve(zone, count);
    zone = null;
    count = 0;
  };

  return {
    tap(z: Zone) {
      if (zone !== null && z !== zone) flush();
      zone = z;
      count += 1;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, windowMs);
    },
    /** Drop any pending sequence without resolving it (e.g. on unmount). */
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      zone = null;
      count = 0;
    },
  };
}
