import type { NextApiRequest, NextApiResponse } from "next";
import { waitUntil } from "@vercel/functions";
import { sendInvoiceEmail } from "@/lib/server/invoice";
import { FulfilmentError, fulfilPayment } from "@/lib/server/payments";
import { verifyWebhookSignature } from "@/lib/server/razorpay";

// The signature covers the exact bytes Razorpay sent, so read the raw body.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

interface PaymentCapturedEvent {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string | null; amount: number } } };
}

// Backup path for payment.captured, in case the browser closes before
// /api/payments/verify runs. Shares fulfilPayment, so it is idempotent with it.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const raw = await readRawBody(req);
  const signature = String(req.headers["x-razorpay-signature"] ?? "");
  if (!verifyWebhookSignature(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET ?? "")) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: PaymentCapturedEvent;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (event.event !== "payment.captured") return res.status(200).json({ ignored: event.event });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return res.status(200).json({ ignored: "no order" });

  try {
    const { created } = await fulfilPayment({
      orderId: payment.order_id,
      paymentId: payment.id,
      amountPaid: payment.amount,
      source: "webhook",
    });
    // Razorpay expects a reply within ~5 s; email in the background.
    if (created) waitUntil(sendInvoiceEmail(payment.id));
    return res.status(200).json({ ok: true, alreadyProcessed: !created });
  } catch (err) {
    if (err instanceof FulfilmentError) {
      // Not one of our orders (or a mismatch): acknowledge so Razorpay stops retrying.
      console.warn("[webhook] not fulfilled:", err.message);
      return res.status(200).json({ ignored: err.message });
    }
    console.error("[webhook] failed:", err);
    // 5xx makes Razorpay retry later.
    return res.status(500).json({ error: "Temporary failure" });
  }
}
