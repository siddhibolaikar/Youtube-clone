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

export const toggleWatchLater = async (
  videoId: string,
  userId: string
): Promise<boolean> => {
  const q = query(
    collection(db, "watchlater"),
    where("viewer", "==", userId),
    where("videoid", "==", videoId)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    await addDoc(collection(db, "watchlater"), {
      viewer: userId,
      videoid: videoId,
      timestamp: new Date().toISOString(),
    });
    return true;
  } else {
    await deleteDoc(snap.docs[0].ref);
    return false;
  }
};

export const getWatchLater = async (userId: string) => {
  const q = query(
    collection(db, "watchlater"),
    where("viewer", "==", userId)
  );
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

export const removeFromWatchLater = async (watchLaterId: string) => {
  await deleteDoc(doc(db, "watchlater", watchLaterId));
};
