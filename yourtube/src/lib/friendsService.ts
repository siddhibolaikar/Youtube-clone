import { collection, documentId, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { apiFetch } from "./apiClient";
import { toDate, type FirestoreDate } from "./types";

export type FriendStatus = "incoming" | "outgoing" | "accepted";

export interface Friend {
  uid: string;
  status: FriendStatus;
  name: string;
  email: string;
  image: string;
}

/** Live list of users/{me}/friends. */
export function listenFriends(uid: string, cb: (friends: Friend[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "users", uid, "friends"), (snap) =>
    cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Friend, "uid">) })))
  );
}

/** Someone counts as online if their heartbeat is under 2 minutes old. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const HEARTBEAT_MS = 45 * 1000;

/** Live lastSeen for the given users (Firestore "in" queries take 30 ids at a time). */
export function listenPresence(uids: string[], cb: (lastSeen: Record<string, number>) => void): Unsubscribe {
  const latest: Record<string, number> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
  const unsubs = chunks.map((ids) =>
    onSnapshot(query(collection(db, "presence"), where(documentId(), "in", ids)), (snap) => {
      snap.docs.forEach((d) => (latest[d.id] = toDate(d.get("lastSeen") as FirestoreDate).getTime() || 0));
      cb({ ...latest });
    })
  );
  return () => unsubs.forEach((u) => u());
}

export const sendFriendRequest = (email: string) =>
  apiFetch<{ uid: string; status: "outgoing" | "accepted" }>("/api/friends/request", { method: "POST", body: { email } });

export const respondToRequest = (uid: string, accept: boolean) =>
  apiFetch("/api/friends/respond", { method: "POST", body: { uid, accept } });

export const removeFriend = (uid: string) => apiFetch(`/api/friends/${uid}`, { method: "DELETE" });
