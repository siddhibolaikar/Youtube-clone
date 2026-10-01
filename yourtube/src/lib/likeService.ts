import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";
import { getVideoById } from "./videoService";
import type { VideoListEntry } from "./types";

type ListRecord = { viewer: string; videoid: string; likedon: string };

export const toggleLike = async (
  videoId: string,
  userId: string
): Promise<boolean> => {
  const q = query(
    collection(db, "likes"),
    where("viewer", "==", userId),
    where("videoid", "==", videoId)
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    await addDoc(collection(db, "likes"), {
      viewer: userId,
      videoid: videoId,
      likedon: new Date().toISOString(),
    });
    await updateDoc(doc(db, "videos", videoId), { likes: increment(1) });
    return true;
  } else {
    await deleteDoc(snap.docs[0].ref);
    await updateDoc(doc(db, "videos", videoId), { likes: increment(-1) });
    return false;
  }
};

export const getLikedVideos = async (userId: string) => {
  const q = query(
    collection(db, "likes"),
    where("viewer", "==", userId)
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ListRecord) }));

  const videos = await Promise.all(records.map((r) => getVideoById(r.videoid)));

  return records.flatMap((r, i): VideoListEntry[] => {
    const video = videos[i];
    return video ? [{ id: r.id, videoid: video, createdAt: r.likedon }] : [];
  });
};

export const checkLiked = async (
  videoId: string,
  userId: string
): Promise<boolean> => {
  const q = query(
    collection(db, "likes"),
    where("viewer", "==", userId),
    where("videoid", "==", videoId)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};
