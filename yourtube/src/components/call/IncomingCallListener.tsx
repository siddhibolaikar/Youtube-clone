import { useEffect } from "react";
import { useRouter } from "next/router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { useUser } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";
import { RING_TIMEOUT_MS, setCallStatus, type CallDoc } from "@/lib/webrtc";
import { toDate, type FirestoreDate } from "@/lib/types";

/** Real-time "X is calling" toast with Accept / Decline, on every page. */
export default function IncomingCallListener() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "calls"), where("calleeUid", "==", user.uid), where("status", "==", "ringing"));
    return onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        const id = change.doc.id;
        if (change.type === "removed") {
          toast.dismiss(id);
          return;
        }
        if (change.type !== "added") return;
        const call = change.doc.data() as CallDoc;
        // Ignore stale ringing docs (e.g. a caller who crashed mid-ring).
        const age = Date.now() - toDate(call.createdAt as FirestoreDate).getTime();
        if (age > RING_TIMEOUT_MS) return;
        toast(`${call.callerName} is calling`, {
          id,
          description: "Video call",
          duration: RING_TIMEOUT_MS,
          action: { label: "Accept", onClick: () => router.push(`/call?id=${id}`) },
          cancel: { label: "Decline", onClick: () => setCallStatus(id, "declined") },
        });
      });
    });
  }, [user, router]);

  return null;
}
