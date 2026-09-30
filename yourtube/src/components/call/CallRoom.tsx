import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { doc, getDoc } from "firebase/firestore";
import { Circle, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Square, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { useUser } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import {
  RING_TIMEOUT_MS,
  answerCall,
  createCall,
  deleteCall,
  exchangeCandidates,
  getIceServers,
  listenCall,
  setCallStatus,
  type CallDoc,
} from "@/lib/webrtc";
import { CallRecorder, pickSaveLocation, recordingFilename, saveRecording, type RecorderLayout } from "@/lib/callRecorder";
import { formatClock } from "@/lib/watchLimit";

type Phase = "starting" | "ringing" | "connecting" | "connected" | "ended";

/** Messages on the "control" data channel. */
type ControlMessage = { type: "recording"; on: boolean } | { type: "sharing"; on: boolean };

interface CallRoomProps {
  /** Caller: the friend to ring. */
  to?: string;
  /** Callee: the call being answered. */
  callId?: string;
}

async function getCameraAndMic(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
  } catch (err) {
    // No camera (or it's in use): fall back to audio only.
    console.warn("Camera unavailable, trying audio only:", err);
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

export default function CallRoom({ to, callId: incomingId }: CallRoomProps) {
  const router = useRouter();
  const { user } = useUser();

  const [phase, setPhase] = useState<Phase>("starting");
  const [peerName, setPeerName] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteSharing, setRemoteSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [endReason, setEndReason] = useState("");

  const localVideo = useRef<HTMLVideoElement>(null); // what I show (camera or my shared screen)
  const cameraVideo = useRef<HTMLVideoElement>(null); // hidden, always my camera (for recording PiP)
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const displayStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream>(new MediaStream());
  const shareAudioCtx = useRef<AudioContext | null>(null);
  const recorder = useRef<CallRecorder | null>(null);
  const callIdRef = useRef<string | null>(incomingId ?? null);
  const unsubs = useRef<Array<() => void>>([]);
  const ended = useRef(false);
  const sharingRef = useRef({ local: false, remote: false });

  const send = (msg: ControlMessage) => {
    if (channel.current?.readyState === "open") channel.current.send(JSON.stringify(msg));
  };

  const setupChannel = useCallback((dc: RTCDataChannel) => {
    channel.current = dc;
    dc.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ControlMessage;
      if (msg.type === "recording") setRemoteRecording(msg.on);
      if (msg.type === "sharing") {
        sharingRef.current.remote = msg.on;
        setRemoteSharing(msg.on);
      }
    };
  }, []);

  // ---- teardown ------------------------------------------------------------------
  const stopRecording = useCallback(async (handle: Awaited<ReturnType<typeof pickSaveLocation>> = null) => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecording(false);
    send({ type: "recording", on: false });
    const blob = await rec.stop();
    const name = recordingFilename();
    if (handle === "cancelled") {
      toast("Recording not saved", {
        duration: 30_000,
        action: { label: "Download instead", onClick: () => saveRecording(blob, name, null) },
      });
      return;
    }
    await saveRecording(blob, name, handle);
    toast.success(`Saved ${name}`);
  }, []);

  const cleanup = useCallback(
    async (reason: string, { notifyPeer = true }: { notifyPeer?: boolean } = {}) => {
      if (ended.current) return;
      ended.current = true;
      setEndReason(reason);
      setPhase("ended");
      // A call that ends mid-recording still gets saved (as a download: no click to open a picker).
      if (recorder.current) await stopRecording(null);
      unsubs.current.forEach((u) => u());
      unsubs.current = [];
      pc.current?.close();
      camStream.current?.getTracks().forEach((t) => t.stop());
      displayStream.current?.getTracks().forEach((t) => t.stop());
      shareAudioCtx.current?.close().catch(() => {});
      const id = callIdRef.current;
      if (id) {
        if (notifyPeer) await setCallStatus(id, "ended");
        await deleteCall(id);
      }
    },
    [stopRecording]
  );

  // ---- setup --------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Set once this run has created or answered the call. Only then may its
    // teardown tell the other side and delete the signalling docs.
    let joined = false;
    let runPeer: RTCPeerConnection | null = null;
    let runStream: MediaStream | null = null;
    // React Strict Mode (dev) mounts effects twice; the first run's cleanup
    // must not leave the real run looking "ended".
    ended.current = false;
    unsubs.current = [];
    setPhase("starting");
    setEndReason("");

    const start = async () => {
      const peer = new RTCPeerConnection({ iceServers: getIceServers() });
      runPeer = peer;
      pc.current = peer;
      peer.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.current.addTrack(t));
        if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream.current;
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setPhase("connected");
          setConnectedAt((t) => t ?? Date.now());
        }
        if (peer.connectionState === "failed") {
          toast.error("Couldn't connect. One of you may be behind a strict network; a TURN server helps.");
          cleanup("Connection failed");
        }
      };

      const stream = await getCameraAndMic();
      runStream = stream;
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      camStream.current = stream;
      setCamOn(stream.getVideoTracks().length > 0);
      if (localVideo.current) localVideo.current.srcObject = stream;
      if (cameraVideo.current) cameraVideo.current.srcObject = stream;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      // Always negotiate a video m-line so screen share can replace it later,
      // even when joining audio-only.
      if (!stream.getVideoTracks().length) peer.addTransceiver("video", { direction: "sendrecv" });

      if (to) {
        // ---- caller
        const friend = await getDoc(doc(db, "users", user.uid, "friends", to));
        if (friend.get("status") !== "accepted") throw new Error("You can only call accepted friends");
        const name = (friend.get("name") as string) || "your friend";
        setPeerName(name);
        setupChannel(peer.createDataChannel("control"));
        const id = await createCall(
          peer,
          { callerUid: user.uid, calleeUid: to, callerName: user.name || "Someone", calleeName: name },
          (created) => {
            joined = true;
            callIdRef.current = created;
            unsubs.current.push(exchangeCandidates(peer, created, "caller"));
          }
        );
        setPhase("ringing");
        const timeout = setTimeout(() => {
          if (!peer.currentRemoteDescription) {
            setCallStatus(id, "missed");
            cleanup(`${name} didn't answer`, { notifyPeer: false });
          }
        }, RING_TIMEOUT_MS);
        unsubs.current.push(() => clearTimeout(timeout));
        unsubs.current.push(
          listenCall(id, (call) => {
            if (!call || call.status === "ended") return cleanup(`${name} ended the call`, { notifyPeer: false });
            if (call.status === "declined") return cleanup(`${name} declined the call`, { notifyPeer: false });
            if (call.answer && !peer.currentRemoteDescription) {
              setPhase("connecting");
              peer.setRemoteDescription(new RTCSessionDescription(call.answer)).catch(console.error);
            }
          })
        );
      } else if (incomingId) {
        // ---- callee
        peer.ondatachannel = (e) => setupChannel(e.channel);
        const snap = await getDoc(doc(db, "calls", incomingId));
        const call = snap.data() as CallDoc | undefined;
        if (!call || call.calleeUid !== user.uid || call.status !== "ringing" || !call.offer) {
          throw new Error("This call is no longer available");
        }
        if (cancelled) return;
        setPeerName(call.callerName);
        setPhase("connecting");
        unsubs.current.push(exchangeCandidates(peer, incomingId, "callee"));
        joined = true;
        await answerCall(peer, incomingId, call.offer);
        unsubs.current.push(
          listenCall(incomingId, (c) => {
            if (!c || c.status === "ended") cleanup(`${call.callerName} ended the call`, { notifyPeer: false });
          })
        );
      }
    };

    start().catch((err) => {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Couldn't start the call");
      cleanup(err instanceof Error ? err.message : "Couldn't start the call");
    });

    return () => {
      cancelled = true;
      if (joined) {
        cleanup("You left the call");
      } else {
        // Abandoned before joining (e.g. Strict Mode's first dev mount): release
        // local resources only; the call itself belongs to the next run.
        runPeer?.close();
        runStream?.getTracks().forEach((t) => t.stop());
      }
    };
    // Runs once per call; cleanup/setupChannel are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, to, incomingId]);

  // Leaving the page (tab close) ends the call for the other side too.
  useEffect(() => {
    const onUnload = () => {
      if (callIdRef.current && !ended.current) setCallStatus(callIdRef.current, "ended");
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    if (!connectedAt || phase === "ended") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [connectedAt, phase]);

  // ---- controls -----------------------------------------------------------------
  const toggleMic = () => {
    const track = camStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCam = () => {
    const track = camStream.current?.getVideoTracks()[0];
    if (!track) return toast.info("No camera available");
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  const sender = (kind: "audio" | "video") =>
    pc.current?.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender ?? null;

  const stopShare = useCallback(async () => {
    const display = displayStream.current;
    if (!display) return;
    displayStream.current = null;
    display.getTracks().forEach((t) => t.stop());
    await sender("video")?.replaceTrack(camStream.current?.getVideoTracks()[0] ?? null);
    await sender("audio")?.replaceTrack(camStream.current?.getAudioTracks()[0] ?? null);
    shareAudioCtx.current?.close().catch(() => {});
    shareAudioCtx.current = null;
    if (localVideo.current) localVideo.current.srcObject = camStream.current;
    sharingRef.current.local = false;
    setSharing(false);
    send({ type: "sharing", on: false });
  }, []);

  const startShare = async () => {
    try {
      // Browsers don't let a page pick the tab for the user; these are hints.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      } as DisplayMediaStreamOptions);
      displayStream.current = display;
      const screenTrack = display.getVideoTracks()[0];
      screenTrack.onended = () => stopShare();
      await sender("video")?.replaceTrack(screenTrack);

      // If the tab's audio was shared, send it mixed with the mic.
      const tabAudio = display.getAudioTracks()[0];
      const mic = camStream.current?.getAudioTracks()[0];
      if (tabAudio) {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(new MediaStream([tabAudio])).connect(dest);
        if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
        shareAudioCtx.current = ctx;
        await sender("audio")?.replaceTrack(dest.stream.getAudioTracks()[0]);
        recorder.current?.addAudioStream(new MediaStream([tabAudio]));
      }

      if (localVideo.current) localVideo.current.srcObject = display;
      sharingRef.current.local = true;
      setSharing(true);
      send({ type: "sharing", on: true });
    } catch (err) {
      if ((err as DOMException)?.name !== "NotAllowedError") toast.error("Screen sharing failed");
    }
  };

  const layout = (): RecorderLayout => {
    const local = localVideo.current!;
    const cam = cameraVideo.current!;
    const remote = remoteVideo.current!;
    if (sharingRef.current.local) return { mode: "share", big: local, pips: [remote, cam] };
    if (sharingRef.current.remote) return { mode: "share", big: remote, pips: [cam] };
    return { mode: "side", left: cam, right: remote };
  };

  const toggleRecording = async () => {
    if (recorder.current) {
      // Open the save dialog first, while this click still counts as user activation.
      const handle = await pickSaveLocation(recordingFilename());
      await stopRecording(handle);
      return;
    }
    if (typeof MediaRecorder === "undefined") return toast.error("Recording isn't supported in this browser");
    const audio = [camStream.current, remoteStream.current, displayStream.current].filter((s): s is MediaStream => !!s);
    recorder.current = new CallRecorder({ layout, audioStreams: audio });
    setRecording(true);
    send({ type: "recording", on: true });
    toast.info("Recording started. The other person can see it.");
  };

  const hangUp = () => cleanup("You ended the call");

  // ---- render -------------------------------------------------------------------
  const elapsed = connectedAt ? formatClock((now - connectedAt) / 1000) : null;
  const status =
    phase === "starting"
      ? "Starting camera…"
      : phase === "ringing"
        ? `Ringing ${peerName}…`
        : phase === "connecting"
          ? `Connecting to ${peerName}…`
          : phase === "connected"
            ? `${peerName} · ${elapsed}`
            : endReason;

  if (phase === "ended") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center" data-testid="call-ended">
        <PhoneOff className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">{endReason || "Call ended"}</p>
        {elapsed && <p className="text-sm text-muted-foreground">Duration {elapsed}</p>}
        <Button onClick={() => router.push("/call")}>Back to friends</Button>
      </div>
    );
  }

  const anyRecording = recording || remoteRecording;

  return (
    <div className="space-y-3" data-testid="call-room">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium tabular-nums" data-testid="call-status">
          {status}
        </p>
        {anyRecording && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white"
            data-testid="recording-indicator"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {recording ? "REC" : `${peerName} is recording`}
          </span>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-contain" data-testid="remote-video" />
        {phase !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">{status}</div>
        )}
        {remoteSharing && (
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {peerName} is sharing their screen
          </span>
        )}
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          className={`absolute bottom-3 right-3 w-32 rounded-lg border-2 border-white/70 bg-black object-cover shadow-lg sm:w-56 ${
            sharing ? "" : "-scale-x-100"
          } aspect-video`}
          data-testid="local-video"
        />
        {/* Always the camera, for the recording's picture-in-picture. */}
        <video ref={cameraVideo} autoPlay playsInline muted className="hidden" />
      </div>

      {sharing && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
          You&apos;re sharing your screen. Pick the YouTube tab to watch together, and tick &ldquo;Share tab audio&rdquo; so
          they can hear it.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant={micOn ? "secondary" : "destructive"} onClick={toggleMic} aria-label={micOn ? "Mute" : "Unmute"}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          <span className="hidden sm:inline">{micOn ? "Mute" : "Unmute"}</span>
        </Button>
        <Button variant={camOn ? "secondary" : "destructive"} onClick={toggleCam} aria-label={camOn ? "Camera off" : "Camera on"}>
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          <span className="hidden sm:inline">{camOn ? "Camera off" : "Camera on"}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={sharing ? stopShare : startShare}
          disabled={phase !== "connected" || !navigator.mediaDevices?.getDisplayMedia}
          title="Pick the YouTube tab to watch together"
        >
          {sharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          <span className="hidden sm:inline">{sharing ? "Stop sharing" : "Share screen"}</span>
        </Button>
        <Button
          variant={recording ? "destructive" : "secondary"}
          onClick={toggleRecording}
          disabled={phase !== "connected"}
          data-testid="record-button"
        >
          {recording ? <Square className="h-5 w-5 fill-current" /> : <Circle className="h-5 w-5 fill-red-600 text-red-600" />}
          <span className="hidden sm:inline">{recording ? "Stop recording" : "Record"}</span>
        </Button>
        <Button variant="destructive" onClick={hangUp} data-testid="hangup-button">
          <PhoneOff className="h-5 w-5" />
          <span className="hidden sm:inline">Hang up</span>
        </Button>
      </div>
      {!sharing && phase === "connected" && (
        <p className="text-center text-xs text-muted-foreground">Tip: Share screen and pick the YouTube tab to watch together.</p>
      )}
    </div>
  );
}
