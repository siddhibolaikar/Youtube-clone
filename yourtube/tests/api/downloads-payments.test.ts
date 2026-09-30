import crypto from "crypto";
import { mkdtempSync, readdirSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, api, createUser, startServer, stopServer, type TestUser } from "./harness";
import { downloadDayKey } from "../../src/lib/downloadQuota";

// Real Razorpay *test* keys from .env.local; the webhook secret is test-only.
process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const WEBHOOK_SECRET = "whsec_api_tests";
const hasRazorpay = !!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && !!KEY_SECRET;

const hmac = (data: string, secret: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const fakePaymentId = () => `pay_T${crypto.randomBytes(7).toString("hex").toUpperCase()}`;

// Invoice emails are written here instead of being sent.
const MAIL_DIR = mkdtempSync(path.join(os.tmpdir(), "yourtube-mail-"));
interface CapturedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: string[];
}
const mailsTo = (email: string): CapturedMail[] =>
  readdirSync(MAIL_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(MAIL_DIR, f), "utf8")) as CapturedMail)
    .filter((m) => m.to === email);

/** Invoice email runs in the background after verify replies. */
async function waitForEmailStatus(paymentId: string, want: string) {
  for (let i = 0; i < 60; i++) {
    const status = (await adminDb().doc(`payments/${paymentId}`).get()).get("emailStatus");
    if (status === want) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`emailStatus never became ${want}`);
}

const CLOUD_URL = (n: number) => `https://res.cloudinary.com/demo/video/upload/v1/yourtube/clip${n}.mp4`;

beforeAll(async () => {
  await startServer({ RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, MAIL_CAPTURE_DIR: MAIL_DIR });
  const db = adminDb();
  await Promise.all(
    [1, 2, 3, 4].map((n) =>
      db.doc(`videos/dl${n}`).set({ videotitle: `Clip ${n}`, videoUrl: CLOUD_URL(n), uploader: "x", likes: 0, views: 0 })
    )
  );
});

afterAll(stopServer);

const download = (user: TestUser, videoId: string) => api("/api/downloads", { method: "POST", user, body: { videoId } });

describe("downloads", () => {
  it("free user: 1 per IST day, re-downloading the same video is free", async () => {
    const u = await createUser("free");
    const first = await download(u, "dl1");
    expect(first.status).toBe(200);
    expect(first.body.url).toBe(
      "https://res.cloudinary.com/demo/video/upload/fl_attachment:Clip_1/v1/yourtube/clip1.mp4"
    );
    expect(first.body.quota).toMatchObject({ usedToday: 1, remaining: 0, limit: 1 });

    expect((await download(u, "dl1")).status).toBe(200);

    const blocked = await download(u, "dl2");
    expect(blocked.status).toBe(402);
    expect(blocked.body.reason).toBe("DAILY_LIMIT");

    const list = await api("/api/downloads", { user: u });
    expect(list.body.downloads).toHaveLength(1);
    expect((list.body.downloads as Array<Record<string, unknown>>)[0]).toMatchObject({
      videoId: "dl1",
      videotitle: "Clip 1",
      thumbnail: "https://res.cloudinary.com/demo/video/upload/so_1,w_480,c_limit/v1/yourtube/clip1.jpg",
    });
  });

  it("yesterday's download does not count against today", async () => {
    const u = await createUser("yesterday");
    const yesterday = downloadDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await adminDb().doc(`users/${u.uid}/downloadDays/${yesterday}`).set({ count: 1 });
    expect((await download(u, "dl3")).status).toBe(200);
  });

  it("parallel clicks can't both use the free download", async () => {
    const u = await createUser("racer");
    const results = await Promise.all(["dl1", "dl2", "dl3", "dl4"].map((v) => download(u, v)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 402)).toHaveLength(3);
  });

  it("premium is unlimited", async () => {
    const u = await createUser("prem");
    await adminDb().doc(`users/${u.uid}`).update({ isPremium: true });
    for (const v of ["dl1", "dl2", "dl3", "dl4"]) expect((await download(u, v)).status).toBe(200);
    expect((await api("/api/downloads", { user: u })).body.quota).toMatchObject({ isPremium: true, limit: null });
  });

  it("requires sign-in", async () => {
    expect((await api("/api/downloads", { method: "POST", body: { videoId: "dl1" } })).status).toBe(401);
  });
});

describe.skipIf(!hasRazorpay)("payments (Razorpay test mode)", () => {
  const createOrder = (user: TestUser, body: Record<string, unknown>) =>
    api("/api/payments/create-order", { method: "POST", user, body });

  const verify = (user: TestUser, orderId: string, paymentId: string, signature?: string) =>
    api("/api/payments/verify", {
      method: "POST",
      user,
      body: {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature ?? hmac(`${orderId}|${paymentId}`, KEY_SECRET),
      },
    });

  const webhook = (orderId: string, paymentId: string, amount: number, secret = WEBHOOK_SECRET) => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: "captured" } } },
    });
    return fetch("http://127.0.0.1:3100/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Razorpay-Signature": hmac(raw, secret) },
      body: raw,
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));
  };

  it("amount comes from server config, not the client", async () => {
    const u = await createUser("buyer");
    const r = await createOrder(u, { product: "premium", amount: 1 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ amount: 9900, currency: "INR" });
    expect(String(r.body.orderId)).toMatch(/^order_/);
    expect((await createOrder(u, { product: "diamond" })).status).toBe(400);
  });

  it("verify: bad signature rejected, good one grants Premium once", async () => {
    const u = await createUser("verifier");
    const { body } = await createOrder(u, { product: "premium" });
    const orderId = String(body.orderId);
    const paymentId = fakePaymentId();

    expect((await verify(u, orderId, paymentId, "0".repeat(64))).status).toBe(400);
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("isPremium")).toBeUndefined();

    const ok = await verify(u, orderId, paymentId);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, alreadyProcessed: false, product: "premium" });
    expect(String(ok.body.invoiceNumber)).toMatch(/^INV-\d{8}-[A-Z0-9]{6}$/);
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("isPremium")).toBe(true);

    // Replays and the webhook are no-ops
    expect((await verify(u, orderId, paymentId)).body.alreadyProcessed).toBe(true);
    expect((await webhook(orderId, paymentId, 9900)).body).toMatchObject({ ok: true, alreadyProcessed: true });
    const payment = await adminDb().doc(`payments/${paymentId}`).get();
    expect(payment.data()).toMatchObject({ uid: u.uid, amount: 9900, source: "verify", testMode: true });

    // Can't buy it twice
    expect((await createOrder(u, { product: "premium" })).status).toBe(409);
  });

  it("someone else can't claim your order", async () => {
    const owner = await createUser("owner");
    const thief = await createUser("thief");
    const { body } = await createOrder(owner, { product: "premium" });
    expect((await verify(thief, String(body.orderId), fakePaymentId())).status).toBe(403);
  });

  it("webhook fulfils when the browser never calls verify; verify afterwards is a no-op", async () => {
    const u = await createUser("closedtab");
    const { body } = await createOrder(u, { product: "bronze" });
    const orderId = String(body.orderId);
    const paymentId = fakePaymentId();

    expect((await webhook(orderId, paymentId, 1000, "wrong-secret")).status).toBe(400);
    expect((await webhook(orderId, paymentId, 1000)).body).toMatchObject({ ok: true, alreadyProcessed: false });
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("plan")).toBe("bronze");
    expect((await verify(u, orderId, paymentId)).body.alreadyProcessed).toBe(true);
  });

  it("webhook with the wrong amount grants nothing", async () => {
    const u = await createUser("underpay");
    const { body } = await createOrder(u, { product: "gold" });
    const r = await webhook(String(body.orderId), fakePaymentId(), 100);
    expect(r.status).toBe(200);
    expect(String(r.body.ignored)).toMatch(/Amount mismatch/);
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("plan")).toBeUndefined();
  });

  it("plans are upgrade-only", async () => {
    const u = await createUser("upgrader");
    await adminDb().doc(`users/${u.uid}`).update({ plan: "silver" });
    expect((await createOrder(u, { product: "bronze" })).body.reason).toBe("NOT_AN_UPGRADE");
    expect((await createOrder(u, { product: "silver" })).status).toBe(409);
    expect((await createOrder(u, { product: "gold" })).status).toBe(200);
  });

  it("a late webhook for a cheaper plan never downgrades", async () => {
    const u = await createUser("late");
    const bronze = await createOrder(u, { product: "bronze" });
    const gold = await createOrder(u, { product: "gold" });
    await verify(u, String(gold.body.orderId), fakePaymentId());
    await webhook(String(bronze.body.orderId), fakePaymentId(), 1000);
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("plan")).toBe("gold");
  });

  it("emails one invoice with a PDF, whichever path fulfils first", async () => {
    const u = await createUser("invoiced");
    const { body } = await createOrder(u, { product: "silver" });
    const orderId = String(body.orderId);
    const paymentId = fakePaymentId();

    const ok = await verify(u, orderId, paymentId);
    expect(ok.body.emailStatus).toBe("pending");
    await waitForEmailStatus(paymentId, "sent");
    await webhook(orderId, paymentId, 5000);
    await verify(u, orderId, paymentId);

    const mails = mailsTo(u.email);
    expect(mails).toHaveLength(1);
    const [mail] = mails;
    expect(mail.subject).toBe(`[TEST] Your YourTube invoice ${ok.body.invoiceNumber}`);
    for (const s of [String(ok.body.invoiceNumber), "Silver plan", "₹50", orderId, paymentId, "TEST MODE", "10 minutes per video", "IST"]) {
      expect(mail.html).toContain(s);
    }
    expect(mail.attachments).toHaveLength(1);
    const pdf = readFileSync(path.join(MAIL_DIR, mail.attachments[0]));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await adminDb().doc(`payments/${paymentId}`).get()).get("emailStatus")).toBe("sent");
  });

  it("a failed email doesn't fail the payment; Resend works for the owner only", async () => {
    const u = await createUser("noemail");
    const other = await createUser("snoop");
    // No email on the profile makes the send fail.
    await adminDb().doc(`users/${u.uid}`).update({ email: "" });
    const { body } = await createOrder(u, { product: "bronze" });
    const paymentId = fakePaymentId();
    const ok = await verify(u, String(body.orderId), paymentId);
    expect(ok.status).toBe(200);
    await waitForEmailStatus(paymentId, "failed");
    expect((await adminDb().doc(`users/${u.uid}`).get()).get("plan")).toBe("bronze");

    const resend = (who: TestUser) =>
      api("/api/payments/resend-invoice", { method: "POST", user: who, body: { paymentId } });
    expect((await resend(u)).status).toBe(502);
    expect((await resend(other)).status).toBe(404);

    await adminDb().doc(`users/${u.uid}`).update({ email: u.email });
    const r = await resend(u);
    expect(r.status).toBe(200);
    expect(r.body.emailStatus).toBe("sent");
    expect(mailsTo(u.email)).toHaveLength(1);
    expect((await resend(u)).body.reason).toBe("ALREADY_SENT");
  });
});
