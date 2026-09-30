import { FieldValue, type Firestore } from "firebase-admin/firestore";

export type FriendStatus = "incoming" | "outgoing" | "accepted";

/** users/{uid}/friends/{friendUid}: the friend's display info plus the relationship state. */
export interface FriendDoc {
  status: FriendStatus;
  name: string;
  email: string;
  image: string;
  since: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export const friendRef = (db: Firestore, owner: string, friend: string) =>
  db.collection("users").doc(owner).collection("friends").doc(friend);

export async function publicCard(db: Firestore, uid: string) {
  const p = await db.collection("users").doc(uid).get();
  return { name: (p.get("name") as string) || "User", email: (p.get("email") as string) || "", image: (p.get("image") as string) || "" };
}

export const friendDoc = (status: FriendStatus, card: { name: string; email: string; image: string }): FriendDoc => ({
  status,
  ...card,
  since: FieldValue.serverTimestamp(),
});
