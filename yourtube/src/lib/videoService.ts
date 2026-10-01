import { collection, getDocs, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase";
import { SAMPLE_VIDEOS } from "./sampleVideos";
import type { Video } from "./types";

// Video metadata is hardcoded in sampleVideos.ts; Firestore only supplies the
// live view/like counters. If Firestore is unreachable the videos still show.

type Counters = Pick<Video, "views" | "likes">;

const withCounters = (v: Video, c?: Counters): Video => ({ ...v, views: c?.views ?? 0, likes: c?.likes ?? 0 });

async function allCounters(): Promise<Map<string, Counters>> {
  try {
    const snap = await getDocs(collection(db, "videos"));
    return new Map(snap.docs.map((d) => [d.id, { views: d.get("views"), likes: d.get("likes") }]));
  } catch (error) {
    console.error("Could not load view/like counts:", error);
    return new Map();
  }
}

export const getAllVideos = async (): Promise<Video[]> => {
  const counters = await allCounters();
  return SAMPLE_VIDEOS.map((v) => withCounters(v, counters.get(v.id)));
};

export const getVideoById = async (id: string): Promise<Video | null> => {
  const video = SAMPLE_VIDEOS.find((v) => v.id === id);
  if (!video) return null;
  try {
    const snap = await getDoc(doc(db, "videos", id));
    return withCounters(video, snap.exists() ? { views: snap.get("views"), likes: snap.get("likes") } : undefined);
  } catch (error) {
    console.error("Could not load view/like counts:", error);
    return withCounters(video);
  }
};

export const getVideosByUploader = async (uid: string): Promise<Video[]> =>
  (await getAllVideos()).filter((v) => v.uploader === uid);

export const incrementViews = async (videoId: string) => {
  await updateDoc(doc(db, "videos", videoId), { views: increment(1) });
};
