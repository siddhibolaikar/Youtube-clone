import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Video, VideoListEntry } from "./types";

type ListRecord = { viewer: string; videoid: string; timestamp: string };

export const addToHistory = async (videoId: string, userId: string) => {
  const q = query(
    collection(db, "history"),
    where("viewer", "==", userId),
    where("videoid", "==", videoId)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    await deleteDoc(snap.docs[0].ref);
  }
  await addDoc(collection(db, "history"), {
    viewer: userId,
    videoid: videoId,
    timestamp: new Date().toISOString(),
  });
};

export const getHistory = async (userId: string) => {
  const q = query(collection(db, "history"), where("viewer", "==", userId));
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ListRecord) }));

  const videoDocs = await Promise.all(
    records.map((r) => getDoc(doc(db, "videos", r.videoid)))
  );

  return records.flatMap((r, i): VideoListEntry[] =>
    videoDocs[i].exists()
      ? [{ id: r.id, videoid: { id: videoDocs[i].id, ...videoDocs[i].data() } as Video, createdAt: r.timestamp }]
      : []
  );
};

export const removeFromHistory = async (historyId: string) => {
  await deleteDoc(doc(db, "history", historyId));
};
