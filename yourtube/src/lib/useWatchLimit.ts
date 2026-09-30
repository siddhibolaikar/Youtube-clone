import { useEffect, useRef, useState, type RefObject } from "react";
import {
  clampSeekTarget,
  initialWatchState,
  isLimitReached,
  recordSeek,
  recordTick,
  remainingSeconds,
  type WatchState,
} from "./watchLimit";

export interface WatchLimitStatus {
  /** Whole seconds of budget left; null when unlimited. */
  remaining: number | null;
  locked: boolean;
}

/**
 * Enforce a per-viewing playback budget on a <video>. Resets when `videoKey`
 * changes; if the limit rises (upgrade), the player unlocks without losing
 * the time already watched.
 */
export function useWatchLimit(
  videoRef: RefObject<HTMLVideoElement | null>,
  limitSec: number | null,
  videoKey: string
): WatchLimitStatus {
  const stateRef = useRef<WatchState>(initialWatchState());
  const limitRef = useRef(limitSec);
  const [status, setStatus] = useState<WatchLimitStatus>({ remaining: limitSec, locked: false });

  useEffect(() => {
    stateRef.current = initialWatchState();
    setStatus({ remaining: limitRef.current, locked: false });
  }, [videoKey]);

  useEffect(() => {
    limitRef.current = limitSec;
    const video = videoRef.current;
    const s = stateRef.current;
    setStatus({
      remaining: remainingSeconds(s, limitSec),
      locked: isLimitReached(s, video?.currentTime ?? 0, limitSec),
    });
  }, [limitSec, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      const limit = limitRef.current;
      const locked = isLimitReached(stateRef.current, video.currentTime, limit);
      const remaining = remainingSeconds(stateRef.current, limit);
      if (locked && !video.paused) video.pause();
      setStatus((prev) => {
        const r = remaining === null ? null : Math.ceil(remaining);
        return prev.locked === locked && prev.remaining === r ? prev : { locked, remaining: r };
      });
    };

    const onTimeUpdate = () => {
      if (!video.paused) stateRef.current = recordTick(stateRef.current, video.currentTime);
      else stateRef.current = { ...stateRef.current, lastTime: video.currentTime };
      update();
    };
    const onSeeking = () => {
      const target = clampSeekTarget(video.currentTime, limitRef.current);
      if (target !== video.currentTime) video.currentTime = target;
      stateRef.current = recordSeek(stateRef.current);
    };
    const onPlay = () => {
      if (isLimitReached(stateRef.current, video.currentTime, limitRef.current)) video.pause();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("play", onPlay);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("play", onPlay);
    };
  }, [videoRef, videoKey]);

  return status;
}
