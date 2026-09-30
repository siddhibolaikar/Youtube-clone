"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/router";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import { getPlan } from "@/lib/plans";
import { getClientOverrides } from "@/lib/testOverrides";
import { useWatchLimit } from "@/lib/useWatchLimit";
import { clampSeekTarget, formatClock } from "@/lib/watchLimit";
import { createTapResolver, resolveGesture, SEEK_STEP_S, zoneFor, type GestureAction } from "@/lib/gestures";
import { requestOpenComments } from "@/lib/uiEvents";
import type { Video } from "@/lib/types";
import { Button } from "./ui/button";
import { TimeRemainingChip, WatchLimitOverlay } from "./WatchLimitOverlay";

interface VideoPlayerProps {
  video: Pick<Video, "id" | "videotitle" | "videoUrl">;
  /** The RelatedVideos list; its first entry is "next video". */
  relatedVideos?: Pick<Video, "id" | "videotitle">[];
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CONTROLS_HIDE_MS = 3000;
const ICON_BTN = "h-8 w-8 text-white hover:bg-white/15 hover:text-white";

type Ripple = { side: "left" | "right"; key: number };
type Flash = { playing: boolean; key: number };
type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function VideoPlayer({ video, relatedVideos = [] }: VideoPlayerProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useUser();

  // Logged-out viewers get the Free limit.
  const plan = getPlan(user?.plan);
  // Demo aid: ?testWatchLimit=20 shortens a limited plan's budget (never lifts Gold's).
  const testLimit = plan.watchLimitSec === null ? undefined : getClientOverrides().watchLimit;
  const limitSec = testLimit ?? plan.watchLimitSec;
  const { remaining, locked } = useWatchLimit(videoRef, limitSec, video.id);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  // ---- actions ---------------------------------------------------------------
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || locked) return;
    const willPlay = v.paused;
    if (willPlay) v.play().catch(() => {});
    else v.pause();
    setFlash({ playing: willPlay, key: Date.now() });
  }, [locked]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || locked) return;
      const max = isFinite(v.duration) ? v.duration : Infinity;
      v.currentTime = clampSeekTarget(Math.min(max, Math.max(0, v.currentTime + delta)), limitSec);
      setRipple({ side: delta > 0 ? "right" : "left", key: Date.now() });
    },
    [locked, limitSec]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    const v = videoRef.current as FullscreenVideo | null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    // iOS Safari only supports fullscreen on the <video> itself.
    else v?.webkitEnterFullscreen?.();
  }, []);

  const goNext = useCallback(() => {
    const next = relatedVideos[0];
    if (!next) {
      toast.info("No next video");
      return;
    }
    toast(`Up next: ${next.videotitle}`);
    router.push(`/watch/${next.id}`);
  }, [relatedVideos, router]);

  // Browsers only let window.close() close tabs that a script opened, so fall
  // back to an in-page "session ended" screen when the tab is still open.
  const closeSite = useCallback(() => {
    videoRef.current?.pause();
    window.close();
    setTimeout(() => {
      if (!window.closed) setSessionEnded(true);
    }, 300);
  }, []);

  const act = useCallback(
    (action: GestureAction) => {
      switch (action) {
        case "togglePlay":
          return togglePlay();
        case "seekForward":
          return seekBy(SEEK_STEP_S);
        case "seekBack":
          return seekBy(-SEEK_STEP_S);
        case "toggleControls":
          return setControlsVisible((v) => !v);
        case "nextVideo":
          return goNext();
        case "closeSite":
          return closeSite();
        case "openComments":
          return requestOpenComments();
      }
    },
    [togglePlay, seekBy, goNext, closeSite]
  );

  // One resolver for the component's lifetime; it calls the latest `act`.
  const actRef = useRef(act);
  useEffect(() => {
    actRef.current = act;
  }, [act]);
  const resolver = useMemo(
    () => createTapResolver({ onResolve: (zone, count) => actRef.current(resolveGesture(zone, count)) }),
    []
  );
  useEffect(() => () => resolver.cancel(), [resolver]);

  const onGesturePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    resolver.tap(zoneFor(e.clientX - rect.left, rect.width));
  };

  // ---- media element state -----------------------------------------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setPlaying(!v.paused);
      setCurrent(v.currentTime);
      setDuration(isFinite(v.duration) ? v.duration : 0);
      setVolume(v.volume);
      setMuted(v.muted);
      setRate(v.playbackRate);
    };
    const events = ["play", "pause", "timeupdate", "durationchange", "loadedmetadata", "volumechange", "ratechange", "seeked"];
    events.forEach((ev) => v.addEventListener(ev, sync));
    sync();
    return () => events.forEach((ev) => v.removeEventListener(ev, sync));
  }, [video.id]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-hide the control bar while playing.
  useEffect(() => {
    if (!playing || !controlsVisible || speedOpen) return;
    const t = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [playing, controlsVisible, speedOpen]);

  // Keyboard: Space/K play-pause, J/L ∓10 s, F fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (key === "j") seekBy(-SEEK_STEP_S);
      else if (key === "l") seekBy(SEEK_STEP_S);
      else if (key === "f") toggleFullscreen();
      else return;
      setControlsVisible(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen]);

  const onSeekInput = (value: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = clampSeekTarget(value, limitSec);
  };

  const showControls = (controlsVisible || !playing) && !locked;
  const limitMarkPct = limitSec !== null && duration > limitSec ? (limitSec / duration) * 100 : null;

  return (
    <>
      <div
        ref={containerRef}
        className={`relative bg-black overflow-hidden select-none ${fullscreen ? "w-screen h-screen" : "aspect-video rounded-lg"}`}
        onMouseMove={() => !controlsVisible && setControlsVisible(true)}
        data-testid="video-player"
      >
        <video ref={videoRef} key={video.id} src={video.videoUrl} className="w-full h-full" playsInline preload="metadata">
          Your browser does not support the video tag.
        </video>

        {/* Gesture surface: left 30% / centre 40% / right 30% */}
        {!locked && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            style={{ touchAction: "manipulation" }}
            onPointerUp={onGesturePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            data-testid="gesture-overlay"
          />
        )}

        {ripple && (
          <div
            key={ripple.key}
            className={`pointer-events-none absolute inset-y-0 z-20 flex w-[30%] items-center justify-center bg-white/10 animate-yt-ripple ${
              ripple.side === "left" ? "left-0 rounded-r-[50%]" : "right-0 rounded-l-[50%]"
            }`}
            data-testid={`ripple-${ripple.side}`}
          >
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
              {ripple.side === "left" ? "« 10s" : "» 10s"}
            </span>
          </div>
        )}

        {flash && (
          <div
            key={flash.key}
            className="pointer-events-none absolute left-1/2 top-1/2 z-20 rounded-full bg-black/60 p-4 text-white animate-yt-flash"
            data-testid="play-flash"
          >
            {flash.playing ? <Play className="h-8 w-8 fill-current" /> : <Pause className="h-8 w-8 fill-current" />}
          </div>
        )}

        {remaining !== null && !locked && <TimeRemainingChip remaining={remaining} />}

        {/* Control bar sits above the gesture surface, so its taps aren't gestures. */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
          data-testid="player-controls"
        >
          {/* Only the controls themselves catch taps; the gradient passes them to the gesture layer. */}
          <div className={`relative ${showControls ? "pointer-events-auto" : ""}`}>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(current, duration || 0)}
              onChange={(e) => onSeekInput(Number(e.target.value))}
              className="h-1 w-full cursor-pointer accent-red-600"
              aria-label="Seek"
            />
            {limitMarkPct !== null && (
              <div
                className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-amber-400"
                style={{ left: `${limitMarkPct}%` }}
                title="Your plan's watch limit"
              />
            )}
          </div>
          <div className={`mt-1 flex items-center gap-1 text-sm ${showControls ? "pointer-events-auto" : ""}`}>
            <Button variant="ghost" size="icon" className={ICON_BTN} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={ICON_BTN}
              onClick={() => {
                const v = videoRef.current;
                if (v) v.muted = !v.muted;
              }}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.volume = Number(e.target.value);
                v.muted = v.volume === 0;
              }}
              className="hidden w-20 cursor-pointer accent-white sm:block"
              aria-label="Volume"
            />
            <span className="ml-2 tabular-nums" data-testid="player-time">
              {formatClock(current)} / {formatClock(duration)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {/* Inline menu (not a portal) so it still shows in fullscreen. */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-white hover:bg-white/15 hover:text-white"
                  onClick={() => setSpeedOpen((o) => !o)}
                  aria-label="Playback speed"
                  aria-expanded={speedOpen}
                >
                  {rate}x
                </Button>
                {speedOpen && (
                  <ul className="absolute bottom-10 right-0 w-24 overflow-hidden rounded-md bg-black/90 py-1 text-sm shadow-lg" role="menu">
                    {SPEEDS.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={s === rate}
                          className={`w-full px-3 py-1.5 text-left hover:bg-white/15 ${s === rate ? "font-semibold text-red-400" : ""}`}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.playbackRate = s;
                            setSpeedOpen(false);
                          }}
                        >
                          {s === 1 ? "Normal" : `${s}x`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={ICON_BTN}
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              >
                {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {locked && <WatchLimitOverlay plan={plan} testLimitSec={testLimit} />}
      </div>

      {sessionEnded && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
          role="dialog"
          aria-modal="true"
          data-testid="session-ended"
        >
          <X className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-semibold">Session ended</h2>
          <p className="max-w-sm text-muted-foreground">
            You can close this tab now. (Browsers only let a website close tabs it opened itself.)
          </p>
          <Button onClick={() => setSessionEnded(false)}>Go back</Button>
        </div>
      )}
    </>
  );
}
