import { useEffect } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { HEARTBEAT_MS } from "./friendsService";

/** Writes presence/{uid}.lastSeen while the tab is visible. */
export function usePresence(uid: string | null) {
  useEffect(() => {
    if (!uid) return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        setDoc(doc(db, "presence", uid), { lastSeen: serverTimestamp() }).catch(() => {});
      }
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [uid]);
}
