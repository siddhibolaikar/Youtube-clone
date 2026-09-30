// Peer-to-peer calls with Firestore as the signalling channel (the Firebase
// WebRTC codelab pattern): calls/{id} holds offer/answer, and ICE candidates
// go to calls/{id}/callerCandidates and calleeCandidates.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type CallStatus = "ringing" | "accepted" | "declined" | "ended" | "missed";

export interface CallDoc {
  callerUid: string;
  calleeUid: string;
  callerName: string;
  calleeName: string;
  status: CallStatus;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  createdAt?: unknown;
}

export const RING_TIMEOUT_MS = 45_000;

/** Google STUN plus optional TURN (needed across mobile networks / CGNAT). */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

type Role = "caller" | "callee";
const ownCandidates = (role: Role) => (role === "caller" ? "callerCandidates" : "calleeCandidates");
const peerCandidates = (role: Role) => (role === "caller" ? "calleeCandidates" : "callerCandidates");

/** Publish our ICE candidates and apply the other side's as they arrive. */
export function exchangeCandidates(pc: RTCPeerConnection, callId: string, role: Role): Unsubscribe {
  const mine = collection(db, "calls", callId, ownCandidates(role));
  pc.addEventListener("icecandidate", (e) => {
    if (e.candidate) addDoc(mine, e.candidate.toJSON()).catch((err) => console.warn("ICE publish failed", err));
  });
  return onSnapshot(collection(db, "calls", callId, peerCandidates(role)), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch((err) => console.warn("ICE add failed", err));
      }
    });
  });
}

/** Caller: create the call doc with an offer. Returns the call id. */
export async function createCall(
  pc: RTCPeerConnection,
  info: Pick<CallDoc, "callerUid" | "calleeUid" | "callerName" | "calleeName">,
  /** Called once the doc exists and before the offer, to start candidate exchange. */
  onCreated: (callId: string) => void
): Promise<string> {
  const ref = doc(collection(db, "calls"));
  // Candidates fire once the local description is set. The doc must exist
  // first (the candidate rules read its participants), and the icecandidate
  // listener must be attached before setLocalDescription.
  await setDoc(ref, { ...info, status: "ringing", createdAt: serverTimestamp() } satisfies CallDoc);
  onCreated(ref.id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await updateDoc(ref, { offer: { type: offer.type, sdp: offer.sdp } });
  return ref.id;
}

/** Callee: answer an offer. */
export async function answerCall(pc: RTCPeerConnection, callId: string, offer: RTCSessionDescriptionInit) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await updateDoc(doc(db, "calls", callId), { answer: { type: answer.type, sdp: answer.sdp }, status: "accepted" });
}

export const listenCall = (callId: string, cb: (call: CallDoc | null) => void): Unsubscribe =>
  onSnapshot(doc(db, "calls", callId), (snap) => cb(snap.exists() ? (snap.data() as CallDoc) : null));

export const setCallStatus = (callId: string, status: CallStatus) =>
  updateDoc(doc(db, "calls", callId), { status }).catch(() => {});

/** Remove the call and its candidate subcollections (children first; rules read the parent). */
export async function deleteCall(callId: string) {
  try {
    for (const sub of ["callerCandidates", "calleeCandidates"]) {
      const snap = await getDocs(collection(db, "calls", callId, sub));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(doc(db, "calls", callId));
  } catch (err) {
    // The other participant may have cleaned up first.
    console.warn("Call cleanup:", err);
  }
}
