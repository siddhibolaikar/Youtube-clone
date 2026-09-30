import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";

const SECRET = "test_secret_123";
const sign = (data: string, secret = SECRET) => crypto.createHmac("sha256", secret).update(data).digest("hex");

describe("verifyPaymentSignature", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const good = sign(`${orderId}|${paymentId}`);

  it("accepts a correct signature", () => {
    expect(verifyPaymentSignature(orderId, paymentId, good, SECRET)).toBe(true);
  });

  it("matches Razorpay's documented example", () => {
    // order_id|payment_id signed with the key secret, hex encoded
    const sig = sign("order_IluGWxBm9U8zJ8|pay_IH4NVgf4Dreq1l", "EnLs21M47BllR3X8PSFtjtbd");
    expect(verifyPaymentSignature("order_IluGWxBm9U8zJ8", "pay_IH4NVgf4Dreq1l", sig, "EnLs21M47BllR3X8PSFtjtbd")).toBe(true);
  });

  it.each([
    ["wrong secret", orderId, paymentId, sign(`${orderId}|${paymentId}`, "other")],
    ["swapped ids", paymentId, orderId, good],
    ["other payment", orderId, "pay_OTHER", good],
    ["truncated", orderId, paymentId, good.slice(0, 10)],
    ["empty", orderId, paymentId, ""],
  ])("rejects %s", (_name, o, p, s) => {
    expect(verifyPaymentSignature(o, p, s, SECRET)).toBe(false);
  });

  it("rejects when the secret is missing", () => {
    expect(verifyPaymentSignature(orderId, paymentId, good, "")).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });

  it("accepts the HMAC of the exact raw body", () => {
    expect(verifyWebhookSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it("rejects a re-serialised (whitespace-changed) body", () => {
    const reformatted = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWebhookSignature(reformatted, sign(body), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhookSignature(body.replace("pay_1", "pay_2"), sign(body), SECRET)).toBe(false);
  });
});
