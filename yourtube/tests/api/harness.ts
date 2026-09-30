// Shared setup for API tests: a `next dev` server wired to the emulators,
// emulator users with ID tokens, and an Admin SDK handle for seeding/asserts.
import { spawn, type ChildProcess } from "child_process";
import path from "path";

export const PROJECT_ID = "demo-yourtube";
export const PORT = 3100;
export const BASE = `http://127.0.0.1:${PORT}`;

const EMU_ENV = {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_PROJECT_ID: PROJECT_ID,
  GCLOUD_PROJECT: PROJECT_ID,
};
Object.assign(process.env, EMU_ENV);

// Imported after the env is set so the Admin SDK talks to the emulators.
const { adminDb, adminAuth } = await import("../../src/lib/server/firebaseAdmin");
export { adminDb, adminAuth };

let server: ChildProcess | null = null;

export async function startServer(extraEnv: Record<string, string> = {}) {
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.resolve(__dirname, "../.."),
    env: {
      ...process.env,
      ...EMU_ENV,
      NEXT_PUBLIC_ENABLE_TEST_OVERRIDES: "true",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stderr?.on("data", (d) => process.env.DEBUG_API && process.stderr.write(d));
  server.stdout?.on("data", (d) => process.env.DEBUG_API && process.stdout.write(d));
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      // First hit also compiles the route.
      const res = await fetch(`${BASE}/api/geo?testRegion=MH`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next dev did not start");
}

export function stopServer() {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

export interface TestUser {
  uid: string;
  token: string;
  authTime: number;
  email: string;
}

/** Create an emulator user and return a fresh ID token. */
export async function createUser(name: string, { otp = true } = {}): Promise<TestUser> {
  const email = `${name}-${Date.now()}@example.com`;
  const res = await fetch(
    `http://${EMU_ENV.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", displayName: name, returnSecureToken: true }),
    }
  );
  const data = (await res.json()) as { localId: string; idToken: string };
  const payload = JSON.parse(Buffer.from(data.idToken.split(".")[1], "base64url").toString()) as { auth_time: number };
  const user = { uid: data.localId, token: data.idToken, authTime: payload.auth_time, email };
  await adminDb().doc(`users/${user.uid}`).set({ email, name, channelname: name, description: "", image: "" });
  if (otp) await markOtpVerified(user);
  return user;
}

/** Sign in again as an existing emulator user: a new auth_time, so OTP is needed again. */
export async function signInAgain(user: TestUser): Promise<TestUser> {
  await new Promise((r) => setTimeout(r, 1100)); // auth_time has 1 s resolution
  const res = await fetch(
    `http://${EMU_ENV.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "password123", returnSecureToken: true }),
    }
  );
  const data = (await res.json()) as { idToken: string };
  const payload = JSON.parse(Buffer.from(data.idToken.split(".")[1], "base64url").toString()) as { auth_time: number };
  return { ...user, token: data.idToken, authTime: payload.auth_time };
}

/** Firebase Phone Auth against the emulator: returns the phone user's ID token. */
export async function phoneSignIn(phoneNumber: string): Promise<{ idToken: string; uid: string }> {
  const base = `http://${EMU_ENV.FIREBASE_AUTH_EMULATOR_HOST}`;
  const sent = (await (
    await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, recaptchaToken: "ignored-by-emulator" }),
    })
  ).json()) as { sessionInfo: string };
  const codes = (await (await fetch(`${base}/emulator/v1/projects/${PROJECT_ID}/verificationCodes`)).json()) as {
    verificationCodes: { sessionInfo: string; code: string }[];
  };
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
  const signed = (await (
    await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
    })
  ).json()) as { idToken: string; localId: string };
  return { idToken: signed.idToken, uid: signed.localId };
}

export const markOtpVerified = (user: TestUser) =>
  adminDb().doc(`sessions/${user.uid}`).set({ authTime: user.authTime, verifiedAt: new Date() });

export async function api(
  pathname: string,
  { method = "GET", body, user, headers = {} }: { method?: string; body?: unknown; user?: TestUser; headers?: Record<string, string> } = {}
) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: json };
}
