import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Video } from "./types";

export const getAllVideos = async (): Promise<Video[]> => {
  const snap = await getDocs(collection(db, "videos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Video);
};

export const getVideoById = async (id: string): Promise<Video | null> => {
  const snap = await getDoc(doc(db, "videos", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Video;
};

export const getVideosByUploader = async (uid: string): Promise<Video[]> => {
  const q = query(collection(db, "videos"), where("uploader", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Video);
};

const uploadToCloudinary = (
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset!);
    formData.append("resource_type", "video");

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        resolve(res.secure_url);
      } else {
        reject(new Error("Cloudinary upload failed"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Upload error")));
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
    xhr.send(formData);
  });
};

export const uploadVideo = async (
  file: File,
  metadata: { videotitle: string; videochanel: string; uploader: string },
  onProgress: (progress: number) => void
): Promise<void> => {
  const videoUrl = await uploadToCloudinary(file, onProgress);
  await addDoc(collection(db, "videos"), {
    videotitle: metadata.videotitle,
    filename: file.name,
    filetype: file.type,
    videoUrl,
    filesize: `${Math.round(file.size / (1024 * 1024))}MB`,
    videochanel: metadata.videochanel,
    likes: 0,
    views: 0,
    uploader: metadata.uploader,
    createdAt: serverTimestamp(),
  });
};

export const incrementViews = async (videoId: string) => {
  await updateDoc(doc(db, "videos", videoId), { views: increment(1) });
};
