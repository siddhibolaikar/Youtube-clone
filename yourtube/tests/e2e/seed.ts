// Seeds emulator users that are signed-in, OTP-verified and friends.
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
const AUTH = "127.0.0.1:9099";
const app = getApps()[0] ?? initializeApp({ projectId: "demo-yourtube" });
export const db = getFirestore(app);

export interface SeedUser {
  uid: string;
  email: string;
  password: string;
  name: string;
}

export async function seedUser(name: string): Promise<SeedUser> {
  const email = `${name.toLowerCase()}-${Date.now()}@example.com`;
  const password = "password123";
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }),
  });
  const { localId } = (await r.json()) as { localId: string };
  await db.doc(`users/${localId}`).set({ email, name, channelname: name, description: "", image: "" });
  return { uid: localId, email, password, name };
}

/** The OTP session must match the auth_time of the browser's own sign-in, so seed it after signing in. */
export async function markOtpForLatestSignIn(user: SeedUser, authTime: number) {
  await db.doc(`sessions/${user.uid}`).set({ authTime, channel: "email", verifiedAt: new Date() });
}

export async function makeFriends(a: SeedUser, b: SeedUser) {
  const card = (u: SeedUser) => ({ name: u.name, email: u.email, image: "", since: new Date() });
  await db.doc(`users/${a.uid}/friends/${b.uid}`).set({ status: "accepted", ...card(b) });
  await db.doc(`users/${b.uid}/friends/${a.uid}`).set({ status: "accepted", ...card(a) });
}
