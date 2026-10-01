import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import { getVideoById } from "./videoService";
import type { VideoListEntry } from "./types";

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

  const videos = await Promise.all(records.map((r) => getVideoById(r.videoid)));

  return records.flatMap((r, i): VideoListEntry[] => {
    const video = videos[i];
    return video ? [{ id: r.id, videoid: video, createdAt: r.timestamp }] : [];
  });
};

export const removeFromWatchLater = async (watchLaterId: string) => {
  await deleteDoc(doc(db, "watchlater", watchLaterId));
};
