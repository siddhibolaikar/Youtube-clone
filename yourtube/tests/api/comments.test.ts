import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, api, createUser, startServer, stopServer, type TestUser } from "./harness";

let alice: TestUser, bob: TestUser, carol: TestUser, noOtp: TestUser;
const videoId = "video-phase1";

beforeAll(async () => {
  await startServer();
  [alice, bob, carol, noOtp] = await Promise.all([
    createUser("alice"),
    createUser("bob"),
    createUser("carol"),
    createUser("dave", { otp: false }),
  ]);
  await adminDb().doc(`videos/${videoId}`).set({ videotitle: "Test", uploader: alice.uid, likes: 0, views: 0 });
});

afterAll(stopServer);

const post = (user: TestUser, text: string, region = "KL") =>
  api("/api/comments", { method: "POST", user, body: { videoId, text }, headers: { "x-test-region": region } });

describe("GET /api/geo", () => {
  it("honours the test override", async () => {
    const r = await api("/api/geo", { headers: { "x-test-region": "kl" } });
    expect(r.body).toMatchObject({ regionCode: "KL", regionName: "Kerala", country: "IN", city: "Kochi", source: "override" });
  });
});

describe("POST /api/comments", () => {
  it("rejects anonymous callers", async () => {
    const r = await api("/api/comments", { method: "POST", body: { videoId, text: "hi" } });
    expect(r.status).toBe(401);
  });

  it("rejects users who have not completed OTP for this sign-in", async () => {
    const r = await post(noOtp, "hello");
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("OTP_REQUIRED");
  });

  it("stores a Hindi comment with the server-resolved city", async () => {
    const r = await post(alice, "बहुत अच्छा वीडियो है।");
    expect(r.status).toBe(201);
    const c = r.body.comment as Record<string, unknown>;
    expect(c).toMatchObject({ commentbody: "बहुत अच्छा वीडियो है।", city: "Kochi", userid: alice.uid, likes: [], dislikes: [] });
    // The client can't choose the city: extra body fields are ignored.
    const spoof = await api("/api/comments", {
      method: "POST",
      user: alice,
      body: { videoId, text: "Nice", city: "Atlantis" },
      headers: { "x-test-region": "MH" },
    });
    expect((spoof.body.comment as Record<string, unknown>).city).toBe("Pune");
  });

  it.each(["hello @bob", "nice #video", "great 😀", "<b>x</b>"])("rejects %s with 400", async (text) => {
    const r = await post(alice, text);
    expect(r.status).toBe(400);
    expect(r.body.reason).toBe("SPECIAL_CHARS");
  });

  it("404s for an unknown video", async () => {
    const r = await api("/api/comments", { method: "POST", user: alice, body: { videoId: "nope", text: "hi" } });
    expect(r.status).toBe(404);
  });
});

describe("edit / delete", () => {
  it("applies the same character rule to edits, owner only", async () => {
    const { body } = await post(alice, "original");
    const id = (body.comment as { id: string }).id;
    expect((await api(`/api/comments/${id}`, { method: "PATCH", user: alice, body: { text: "bad $" } })).status).toBe(400);
    expect((await api(`/api/comments/${id}`, { method: "PATCH", user: bob, body: { text: "hijack" } })).status).toBe(403);
    const ok = await api(`/api/comments/${id}`, { method: "PATCH", user: alice, body: { text: "edited" } });
    expect(ok.body.comment).toMatchObject({ commentbody: "edited", edited: true });
    expect((await api(`/api/comments/${id}`, { method: "DELETE", user: bob })).status).toBe(403);
    expect((await api(`/api/comments/${id}`, { method: "DELETE", user: alice })).status).toBe(200);
  });
});

describe("POST /api/comments/[id]/react", () => {
  it("like/dislike toggle, own comment blocked, removed at 2 dislikes", async () => {
    const { body } = await post(alice, "react to me");
    const id = (body.comment as { id: string }).id;
    const react = (user: TestUser, type: string) =>
      api(`/api/comments/${id}/react`, { method: "POST", user, body: { type } });

    expect((await react(alice, "like")).status).toBe(400);
    expect((await react(bob, "like")).body).toMatchObject({ removed: false, likes: [bob.uid], dislikes: [] });
    // switching to dislike removes the like
    expect((await react(bob, "dislike")).body).toMatchObject({ removed: false, likes: [], dislikes: [bob.uid] });
    // clicking dislike again toggles it off
    expect((await react(bob, "dislike")).body).toMatchObject({ removed: false, dislikes: [] });
    await react(bob, "dislike");
    expect((await react(carol, "dislike")).body).toEqual({ removed: true });
    expect((await adminDb().doc(`comments/${id}`).get()).exists).toBe(false);
    expect((await react(bob, "like")).status).toBe(404);
  });

  it("concurrent dislikes still remove exactly once", async () => {
    const { body } = await post(alice, "race me");
    const id = (body.comment as { id: string }).id;
    const results = await Promise.all(
      [bob, carol].map((u) => api(`/api/comments/${id}/react`, { method: "POST", user: u, body: { type: "dislike" } }))
    );
    expect(results.filter((r) => r.body.removed === true)).toHaveLength(1);
    expect((await adminDb().doc(`comments/${id}`).get()).exists).toBe(false);
  });
});

describe("POST /api/translate", () => {
  it("rejects unsupported languages", async () => {
    const r = await api("/api/translate", { method: "POST", body: { text: "hi", target: "xx" } });
    expect(r.status).toBe(400);
  });
});
