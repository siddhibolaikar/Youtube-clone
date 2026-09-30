import { mkdtempSync, readdirSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAuth, adminDb, api, createUser, phoneSignIn, signInAgain, startServer, stopServer, type TestUser } from "./harness";

const MAIL_DIR = mkdtempSync(path.join(os.tmpdir(), "yourtube-otp-mail-"));
const SOUTH = { "x-test-region": "KL" };
const NORTH = { "x-test-region": "MH" };

/** The most recent emailed code for this address. */
function lastCodeFor(email: string): string {
  const mails = readdirSync(MAIL_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(MAIL_DIR, f), "utf8")) as { to: string; subject: string })
    .filter((m) => m.to === email);
  return mails[mails.length - 1].subject.match(/^(\d{6}) /)![1];
}

beforeAll(async () => {
  await startServer({ MAIL_CAPTURE_DIR: MAIL_DIR });
  await adminDb().doc("videos/otp-video").set({ videotitle: "v", uploader: "x", likes: 0, views: 0 });
});
afterAll(stopServer);

const fresh = (name: string) => createUser(name, { otp: false });
const send = (u: TestUser, channel: string, headers = SOUTH) =>
  api("/api/otp/send", { method: "POST", user: u, body: { channel }, headers });
const verify = (u: TestUser, code: string, headers = SOUTH) =>
  api("/api/otp/verify", { method: "POST", user: u, body: { code }, headers });
const protectedCall = (u: TestUser) =>
  api("/api/comments", { method: "POST", user: u, body: { videoId: "otp-video", text: "hello" }, headers: SOUTH });

describe("channel by region", () => {
  it("south → email, elsewhere → sms", async () => {
    const u = await fresh("chan");
    expect((await api("/api/otp/status", { user: u, headers: SOUTH })).body).toMatchObject({ channel: "email", verified: false });
    for (const r of ["TN", "KA", "AP", "TG"]) {
      expect((await api("/api/otp/status", { user: u, headers: { "x-test-region": r } })).body.channel).toBe("email");
    }
    expect((await api("/api/otp/status", { user: u, headers: NORTH })).body.channel).toBe("sms");
    expect((await api("/api/otp/status", { user: u, headers: { "x-test-region": "DL" } })).body.channel).toBe("sms");
  });

  it("the server, not the client, picks the channel", async () => {
    const u = await fresh("wrongchan");
    expect((await send(u, "email", NORTH)).body.reason).toBe("WRONG_CHANNEL");
    expect((await send(u, "sms", SOUTH)).body.reason).toBe("WRONG_CHANNEL");
  });
});

describe("email OTP", () => {
  it("protected APIs are blocked until the code is verified", async () => {
    const u = await fresh("email");
    expect((await protectedCall(u)).body.reason).toBe("OTP_REQUIRED");

    expect((await send(u, "email")).status).toBe(200);
    const code = lastCodeFor(u.email);
    // Only the hash is stored.
    const stored = (await adminDb().doc(`otps/${u.uid}`).get()).data()!;
    expect(JSON.stringify(stored)).not.toContain(code);

    const wrong = code === "000000" ? "111111" : "000000";
    expect((await verify(u, wrong)).body).toMatchObject({ reason: "WRONG_CODE", attemptsLeft: 4 });
    expect((await verify(u, code)).body).toEqual({ verified: true });
    expect((await adminDb().doc(`sessions/${u.uid}`).get()).get("authTime")).toBe(u.authTime);
    expect((await protectedCall(u)).status).toBe(201);
    // Code is single-use.
    expect((await verify(u, code)).body.reason).toBe("NO_CODE");
  });

  it("a new Google sign-in needs a new OTP", async () => {
    const u = await fresh("again");
    await send(u, "email");
    await verify(u, lastCodeFor(u.email));
    const later = await signInAgain(u);
    expect(later.authTime).toBeGreaterThan(u.authTime);
    expect((await protectedCall(later)).body.reason).toBe("OTP_REQUIRED");
    expect((await api("/api/otp/status", { user: later, headers: SOUTH })).body.verified).toBe(false);
  });

  it("rate limits: 30 s cooldown", async () => {
    const u = await fresh("cooldown");
    expect((await send(u, "email")).status).toBe(200);
    const again = await send(u, "email");
    expect(again.status).toBe(429);
    expect(again.body.reason).toBe("COOLDOWN");
    expect(Number(again.body.retryAfterMs)).toBeGreaterThan(25_000);
  });

  it("rate limits: 5 per hour", async () => {
    const u = await fresh("hourly");
    const now = Date.now();
    await adminDb().doc(`otps/${u.uid}`).set({ sendLog: [1, 2, 3, 4, 5].map((i) => now - i * 60_000), attempts: 0 });
    expect((await send(u, "email")).body.reason).toBe("HOURLY_LIMIT");
  });

  it("locks after 5 wrong attempts, even for the right code", async () => {
    const u = await fresh("brute");
    await send(u, "email");
    const code = lastCodeFor(u.email);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await verify(u, wrong);
    expect((await verify(u, code)).body.reason).toBe("TOO_MANY_ATTEMPTS");
  });

  it("expires after 5 minutes", async () => {
    const u = await fresh("expired");
    await send(u, "email");
    const code = lastCodeFor(u.email);
    await adminDb().doc(`otps/${u.uid}`).update({ expiresAt: Date.now() - 1 });
    expect((await verify(u, code)).body.reason).toBe("EXPIRED");
  });
});

describe("SMS OTP (Firebase Phone Auth)", () => {
  const phone = "+919876500001";

  it("requires a mobile number, validates it, and it can't be swapped later", async () => {
    const u = await fresh("addphone");
    expect((await send(u, "sms", NORTH)).body.reason).toBe("PHONE_REQUIRED");
    const setPhone = (p: string) => api("/api/profile/phone", { method: "POST", user: u, body: { phone: p } });
    expect((await setPhone("12345")).status).toBe(400);
    expect((await setPhone("98765 00002")).body).toEqual({ phone: "+919876500002" });
    expect((await setPhone("9876500003")).body.reason).toBe("PHONE_EXISTS");
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("phone")).toBe("+919876500002");
  });

  it("a fresh phone sign-in on the registered number verifies; the throwaway phone user is deleted", async () => {
    const u = await fresh("sms");
    await api("/api/profile/phone", { method: "POST", user: u, body: { phone } });
    expect((await send(u, "sms", NORTH)).status).toBe(200);
    const phoneUser = await phoneSignIn(phone);
    const r = await api("/api/otp/verify-phone", { method: "POST", user: u, body: { phoneIdToken: phoneUser.idToken }, headers: NORTH });
    expect(r.body).toEqual({ verified: true });
    expect((await adminDb().doc(`sessions/${u.uid}`).get()).get("channel")).toBe("sms");
    await expect(adminAuth().getUser(phoneUser.uid)).rejects.toThrow();
  });

  it("rejects a different number, a non-phone token, and the wrong region", async () => {
    const u = await fresh("smsbad");
    await api("/api/profile/phone", { method: "POST", user: u, body: { phone: "+919876500004" } });
    const other = await phoneSignIn("+919876500005");
    const vp = (token: string, headers = NORTH) =>
      api("/api/otp/verify-phone", { method: "POST", user: u, body: { phoneIdToken: token }, headers });
    expect((await vp(other.idToken)).body.reason).toBe("PHONE_MISMATCH");
    expect((await vp(u.token)).body.reason).toBe("BAD_PHONE_TOKEN");
    const mine = await phoneSignIn("+919876500004");
    expect((await vp(mine.idToken, SOUTH)).body.reason).toBe("WRONG_CHANNEL");
    expect((await vp("garbage")).status).toBe(401);
  });
});
