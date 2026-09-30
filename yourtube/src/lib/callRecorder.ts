// Records a call locally: both videos composited onto a canvas, both audio
// tracks mixed with Web Audio, encoded by MediaRecorder, saved to the device.
import { istParts } from "./ist";

export type RecorderLayout =
  | { mode: "side"; left: HTMLVideoElement; right: HTMLVideoElement }
  /** A screen share drawn large with the cameras as picture-in-picture. */
  | { mode: "share"; big: HTMLVideoElement; pips: HTMLVideoElement[] };

export interface RecorderSources {
  /** Asked every frame, so the layout follows screen sharing starting/stopping. */
  layout: () => RecorderLayout;
  /** Streams whose audio tracks are mixed into the recording. */
  audioStreams: MediaStream[];
}

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

export function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/** yourtube-call-YYYYMMDD-HHmm.webm, in IST like the rest of the app. */
export function recordingFilename(at: Date = new Date()): string {
  const p = istParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `yourtube-call-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}.webm`;
}

/** Draw `video` into the box, letterboxed to keep its aspect ratio. */
function drawContain(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, w, h);
  if (video.readyState < 2 || !video.videoWidth) return;
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
  const dw = video.videoWidth * scale;
  const dh = video.videoHeight * scale;
  ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * A timer that keeps ticking in background tabs. requestAnimationFrame stops
 * and setInterval drops to 1 Hz when the page is hidden (e.g. while you're on
 * the tab you're screen-sharing); worker timers are throttled far less.
 */
function workerTicker(fps: number, onTick: () => void): () => void {
  const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)});onmessage=()=>clearInterval(t);`;
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  const worker = new Worker(url);
  worker.onmessage = onTick;
  return () => {
    worker.postMessage("stop");
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}

export class CallRecorder {
  private canvas = document.createElement("canvas");
  private audioCtx = new AudioContext();
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private stopTicker: () => void;
  private stopped: Promise<Blob>;
  private dest: MediaStreamAudioDestinationNode;

  constructor(private src: RecorderSources) {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const ctx = this.canvas.getContext("2d")!;

    this.stopTicker = workerTicker(FPS, () => this.draw(ctx));
    const video = this.canvas.captureStream(FPS);

    this.dest = this.audioCtx.createMediaStreamDestination();
    src.audioStreams.forEach((s) => this.addAudioStream(s));
    const mixed = new MediaStream([...video.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);

    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(mixed, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.stopped = new Promise((resolve) => {
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType || "video/webm" }));
    });
    this.recorder.start(1000);
  }

  /** Mix in audio that starts mid-recording (e.g. shared tab audio). */
  addAudioStream(stream: MediaStream) {
    if (stream.getAudioTracks().length) this.audioCtx.createMediaStreamSource(stream).connect(this.dest);
  }

  get mimeType() {
    return this.recorder.mimeType;
  }

  private draw(ctx: CanvasRenderingContext2D) {
    const layout = this.src.layout();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (layout.mode === "side") {
      drawContain(ctx, layout.left, 0, 0, WIDTH / 2, HEIGHT);
      drawContain(ctx, layout.right, WIDTH / 2, 0, WIDTH / 2, HEIGHT);
      return;
    }
    drawContain(ctx, layout.big, 0, 0, WIDTH, HEIGHT);
    const pw = 288;
    const ph = 162;
    layout.pips.forEach((v, i) => {
      const x = WIDTH - pw - 16;
      const y = HEIGHT - (ph + 16) * (i + 1);
      drawContain(ctx, v, x, y, pw, ph);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, pw, ph);
    });
  }

  /** Stop and return the recording. */
  async stop(): Promise<Blob> {
    if (this.recorder.state !== "inactive") this.recorder.stop();
    const blob = await this.stopped;
    this.stopTicker();
    this.audioCtx.close().catch(() => {});
    return blob;
  }
}

type SaveHandle = { createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> };
type WindowWithPicker = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
};

/**
 * Ask where to save, while we still have the click's user activation
 * (showSaveFilePicker refuses otherwise). Returns null where unsupported,
 * or "cancelled" if the user closed the dialog.
 */
export async function pickSaveLocation(filename: string): Promise<SaveHandle | null | "cancelled"> {
  const w = window as WindowWithPicker;
  if (!w.showSaveFilePicker) return null;
  try {
    return await w.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "WebM video", accept: { "video/webm": [".webm"] } }],
    });
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "cancelled";
    return null;
  }
}

export async function saveRecording(blob: Blob, filename: string, handle: SaveHandle | null) {
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
