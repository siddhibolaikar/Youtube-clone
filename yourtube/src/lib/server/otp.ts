import crypto from "crypto";
import type { NextApiRequest } from "next";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { isSouthernIndia } from "../regions";
import type { OtpChannel } from "../otpRules";
import { adminDb } from "./firebaseAdmin";
import { getGeo, type GeoInfo } from "./geo";

/** Southern states get the code by email; everyone else (including unknown location) by SMS. */
export const channelForGeo = (geo: GeoInfo): OtpChannel =>
  isSouthernIndia(geo.country, geo.regionCode) ? "email" : "sms";

export async function resolveChannel(req: NextApiRequest): Promise<{ channel: OtpChannel; geo: GeoInfo }> {
  const geo = await getGeo(req);
  return { channel: channelForGeo(geo), geo };
}

export const generateOtpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export const hashOtp = (code: string, salt: string) =>
  crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");

export function otpMatches(code: string, salt: string, expectedHash: string): boolean {
  const a = Buffer.from(hashOtp(code, salt), "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Stored at otps/{uid}. Only the hash of the code is kept. */
export interface OtpDoc {
  channel: OtpChannel;
  codeHash: string | null;
  salt: string | null;
  expiresAt: number | null;
  attempts: number;
  /** The Google sign-in (auth_time) this code belongs to. */
  authTime: number;
  sendLog: number[];
}

/**
 * Mark this sign-in as having passed the second factor. withAuth and the
 * Firestore rules compare sessions/{uid}.authTime with the ID token's auth_time.
 * Also publishes the user's public channel card if they have a channel.
 */
export async function markOtpVerified(user: DecodedIdToken, channel: OtpChannel) {
  const db = adminDb();
  const profile = await db.collection("users").doc(user.uid).get();
  const batch = db.batch();
  batch.set(db.collection("sessions").doc(user.uid), {
    authTime: user.auth_time,
    channel,
    verifiedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(db.collection("otps").doc(user.uid));
  if (profile.get("channelname")) {
    batch.set(
      db.collection("channels").doc(user.uid),
      {
        channelname: profile.get("channelname"),
        description: profile.get("description") ?? "",
        name: profile.get("name") ?? "",
        image: profile.get("image") ?? "",
      },
      { merge: true }
    );
  }
  await batch.commit();
}
