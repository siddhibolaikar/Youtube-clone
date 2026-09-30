import { readFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const AUTH_TIME = 1_700_000_000;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yourtube",
    firestore: { rules: readFileSync(path.resolve(__dirname, "../../../firestore.rules"), "utf8") },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), {
      email: "alice@example.com",
      name: "Alice",
      channelname: "Alice",
      description: "",
      image: "",
      plan: "free",
    });
    await setDoc(doc(db, "sessions/alice"), { authTime: AUTH_TIME });
    await setDoc(doc(db, "videos/v1"), { uploader: "bob", videotitle: "t", likes: 0, views: 0 });
    await setDoc(doc(db, "comments/c1"), { videoid: "v1", userid: "bob", commentbody: "hi", likes: [], dislikes: [] });
    await setDoc(doc(db, "payments/p1"), { uid: "alice", amount: 9900 });
    await setDoc(doc(db, "users/alice/friends/bob"), { status: "accepted" });
    await setDoc(doc(db, "users/alice/friends/carol"), { status: "outgoing" });
  });
});

/** Alice, signed in and past the OTP step for this sign-in. */
const alice = () => env.authenticatedContext("alice", { auth_time: AUTH_TIME, email: "alice@example.com" }).firestore();
/** Alice from a newer Google sign-in that has not done the OTP yet. */
const aliceNoOtp = () =>
  env.authenticatedContext("alice", { auth_time: AUTH_TIME + 60, email: "alice@example.com" }).firestore();
const mallory = () => env.authenticatedContext("mallory", { auth_time: AUTH_TIME }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("users", () => {
  it("owner can read own profile; others and anon cannot", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
    await assertFails(getDoc(doc(mallory(), "users/alice")));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });

  it.each([
    ["plan", "gold"],
    ["planExpiry", 9999999999],
    ["isPremium", true],
    ["phone", "+919999999999"],
    ["downloadsToday", 0],
  ])("owner cannot write server-only field %s", async (field, value) => {
    await assertFails(updateDoc(doc(alice(), "users/alice"), { [field]: value }));
  });

  it("owner can edit channel fields after OTP, not before", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "users/alice"), { channelname: "New" }));
    await assertFails(updateDoc(doc(aliceNoOtp(), "users/alice"), { channelname: "New" }));
  });

  it("new profile cannot smuggle in a plan", async () => {
    const db = env.authenticatedContext("dave", { email: "dave@example.com" }).firestore();
    const base = { email: "dave@example.com", name: "D", channelname: "D", description: "", image: "" };
    await assertFails(setDoc(doc(db, "users/dave"), { ...base, plan: "gold" }));
    await assertFails(setDoc(doc(db, "users/dave"), { ...base, email: "someone@else.com" }));
    await assertSucceeds(setDoc(doc(db, "users/dave"), base));
  });

  it("downloads and friends subcollections are server-only", async () => {
    await assertFails(addDoc(collection(alice(), "users/alice/downloads"), { videoId: "v1" }));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/downloads/x")));
    await assertFails(setDoc(doc(alice(), "users/alice/friends/mallory"), { status: "accepted" }));
  });
});

describe("comments", () => {
  it("anyone can read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "comments/c1")));
  });

  it("clients cannot create, edit, react or delete directly", async () => {
    await assertFails(addDoc(collection(alice(), "comments"), { videoid: "v1", userid: "alice", commentbody: "x" }));
    await assertFails(updateDoc(doc(alice(), "comments/c1"), { dislikes: [] }));
    await assertFails(updateDoc(doc(alice(), "comments/c1"), { likes: ["alice"] }));
    await assertFails(deleteDoc(doc(alice(), "comments/c1")));
  });
});

describe("server-only collections", () => {
  it("payments: own read only, never write", async () => {
    await assertSucceeds(getDoc(doc(alice(), "payments/p1")));
    await assertFails(getDoc(doc(mallory(), "payments/p1")));
    await assertFails(setDoc(doc(alice(), "payments/p2"), { uid: "alice", amount: 1 }));
  });

  it("otps are invisible; sessions are read-only to the owner", async () => {
    await assertFails(getDoc(doc(alice(), "otps/alice")));
    await assertSucceeds(getDoc(doc(alice(), "sessions/alice")));
    await assertFails(setDoc(doc(aliceNoOtp(), "sessions/alice"), { authTime: AUTH_TIME + 60 }));
  });
});

describe("videos", () => {
  it("views can only go up by one", async () => {
    await assertSucceeds(updateDoc(doc(anon(), "videos/v1"), { views: 1 }));
    await assertFails(updateDoc(doc(anon(), "videos/v1"), { views: 1000 }));
    await assertFails(updateDoc(doc(anon(), "videos/v1"), { videotitle: "pwned" }));
  });

  it("uploads require OTP and must be your own", async () => {
    const v = { uploader: "alice", videotitle: "x", likes: 0, views: 0 };
    await assertSucceeds(addDoc(collection(alice(), "videos"), v));
    await assertFails(addDoc(collection(aliceNoOtp(), "videos"), v));
    await assertFails(addDoc(collection(alice(), "videos"), { ...v, uploader: "bob" }));
  });
});

describe("per-user lists", () => {
  it("likes need OTP and your own viewer id", async () => {
    await assertSucceeds(addDoc(collection(alice(), "likes"), { viewer: "alice", videoid: "v1" }));
    await assertFails(addDoc(collection(aliceNoOtp(), "likes"), { viewer: "alice", videoid: "v1" }));
    await assertFails(addDoc(collection(alice(), "likes"), { viewer: "bob", videoid: "v1" }));
  });
});

describe("calls", () => {
  it("can only ring an accepted friend", async () => {
    const call = (callee: string) => ({ callerUid: "alice", calleeUid: callee, status: "ringing" });
    await assertSucceeds(setDoc(doc(alice(), "calls/k1"), call("bob")));
    await assertFails(setDoc(doc(alice(), "calls/k2"), call("carol")));
    await assertFails(setDoc(doc(alice(), "calls/k3"), call("mallory")));
  });

  it("outsiders cannot read a call or its candidates", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "calls/k1"), { callerUid: "alice", calleeUid: "bob" });
    });
    await assertSucceeds(getDoc(doc(alice(), "calls/k1")));
    await assertFails(getDoc(doc(mallory(), "calls/k1")));
    await assertFails(addDoc(collection(mallory(), "calls/k1/callerCandidates"), { c: 1 }));
    await assertSucceeds(addDoc(collection(alice(), "calls/k1/callerCandidates"), { c: 1 }));
  });
});
