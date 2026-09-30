import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { AppUser, Channel } from "./types";

// users/{uid} is private (email, phone, plan). channels/{uid} is the public
// card that channel pages read.

export const getOrCreateUser = async (
  uid: string,
  data: { email: string; name: string | null; image: string }
): Promise<AppUser> => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const newUser = {
      email: data.email,
      name: data.name || "",
      channelname: data.name || "",
      description: "",
      image: data.image,
      joinedon: serverTimestamp(),
    };
    await setDoc(userRef, newUser);
    return { uid, ...newUser, joinedon: new Date() };
  }

  return { uid, ...userSnap.data() } as AppUser;
};

export const getOwnProfile = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? ({ uid, ...snap.data() } as AppUser) : null;
};

export const updateUser = async (
  uid: string,
  data: { channelname: string; description: string; name: string; image: string }
): Promise<AppUser> => {
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, { channelname: data.channelname, description: data.description });
  await setDoc(doc(db, "channels", uid), data);
  const updated = await getDoc(userRef);
  return { uid, ...updated.data() } as AppUser;
};

export const getChannelById = async (uid: string): Promise<Channel | null> => {
  const snap = await getDoc(doc(db, "channels", uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as Channel;
};
