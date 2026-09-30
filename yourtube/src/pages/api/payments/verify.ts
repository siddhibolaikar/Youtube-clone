import { waitUntil } from "@vercel/functions";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { sendInvoiceEmail } from "@/lib/server/invoice";
import { fulfilPayment } from "@/lib/server/payments";
import { verifyPaymentSignature } from "@/lib/server/razorpay";
import { withAuth } from "@/lib/server/withAuth";

// POST { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Idempotent: calling it again (or after the webhook) returns the same payment.
export default withAuth(["POST"], async (req, res) => {
  const orderId = requireString(req.body?.razorpay_order_id, "razorpay_order_id", 64);
  const paymentId = requireString(req.body?.razorpay_payment_id, "razorpay_payment_id", 64);
  const signature = requireString(req.body?.razorpay_signature, "razorpay_signature", 256);

  if (!verifyPaymentSignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET ?? "")) {
    throw new HttpError(400, { error: "Payment signature is invalid", reason: "BAD_SIGNATURE" });
  }
  const order = await adminDb().collection("orders").doc(orderId).get();
  if (!order.exists) throw new HttpError(404, { error: "Order not found" });
  if (order.get("uid") !== req.user.uid) throw new HttpError(403, { error: "This order belongs to another account" });

  const { created, payment } = await fulfilPayment({ orderId, paymentId, source: "verify" });
  // Only the request that fulfilled the payment sends the invoice. Gmail SMTP
  // takes several seconds, so reply now and let waitUntil keep the function
  // alive until the send finishes; the outcome lands on payments/{id}.emailStatus.
  if (created) waitUntil(sendInvoiceEmail(paymentId));
  const emailStatus = payment.emailStatus;

  res.status(200).json({
    ok: true,
    alreadyProcessed: !created,
    product: payment.product,
    invoiceNumber: payment.invoiceNumber,
    emailStatus,
  });
});
