import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import { getPlan, getProduct, PLANS, type ProductId } from "../plans";
import { istDateStamp } from "../ist";

export interface OrderDoc {
  uid: string;
  product: ProductId;
  amount: number;
  currency: "INR";
  status: "created" | "paid";
  createdAt: Timestamp;
}

export interface PaymentDoc {
  uid: string;
  orderId: string;
  paymentId: string;
  product: ProductId;
  productName: string;
  amount: number;
  currency: "INR";
  invoiceNumber: string;
  /** Which path fulfilled it first. */
  source: "verify" | "webhook";
  emailStatus: "pending" | "sent" | "failed";
  testMode: boolean;
  createdAt: Timestamp;
}

export const invoiceNumberFor = (paymentId: string, at: Date) =>
  `INV-${istDateStamp(at)}-${paymentId.replace(/^pay_/, "").slice(-6).toUpperCase()}`;

export const isTestMode = () => (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");

export class FulfilmentError extends Error {}

/**
 * Apply a successful payment exactly once. Called by /api/payments/verify and
 * by the webhook; whichever arrives first creates payments/{paymentId} and
 * grants the entitlement, the other sees the doc and does nothing.
 */
export async function fulfilPayment(args: {
  orderId: string;
  paymentId: string;
  source: PaymentDoc["source"];
  /** If known (webhook), the captured amount must match the order. */
  amountPaid?: number;
}): Promise<{ created: boolean; payment: PaymentDoc }> {
  const db = adminDb();
  const orderRef = db.collection("orders").doc(args.orderId);
  const paymentRef = db.collection("payments").doc(args.paymentId);

  return db.runTransaction(async (tx) => {
    const [orderSnap, paymentSnap] = await Promise.all([tx.get(orderRef), tx.get(paymentRef)]);
    if (paymentSnap.exists) return { created: false, payment: paymentSnap.data() as PaymentDoc };
    if (!orderSnap.exists) throw new FulfilmentError(`Unknown order ${args.orderId}`);

    const order = orderSnap.data() as OrderDoc;
    if (args.amountPaid !== undefined && args.amountPaid !== order.amount) {
      throw new FulfilmentError(`Amount mismatch for ${args.orderId}: paid ${args.amountPaid}, expected ${order.amount}`);
    }
    const product = getProduct(order.product);
    if (!product) throw new FulfilmentError(`Unknown product ${order.product}`);

    const userRef = db.collection("users").doc(order.uid);
    const userSnap = await tx.get(userRef);
    if (order.product === "premium") {
      tx.set(userRef, { isPremium: true, premiumSince: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      // Never downgrade (e.g. a late webhook for an older, cheaper order).
      const current = getPlan(userSnap.get("plan"));
      if (PLANS[order.product].rank > current.rank) {
        tx.set(userRef, { plan: order.product, planUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }

    const now = new Date();
    const payment: PaymentDoc = {
      uid: order.uid,
      orderId: args.orderId,
      paymentId: args.paymentId,
      product: order.product,
      productName: product.name,
      amount: order.amount,
      currency: "INR",
      invoiceNumber: invoiceNumberFor(args.paymentId, now),
      source: args.source,
      emailStatus: "pending",
      testMode: isTestMode(),
      createdAt: Timestamp.fromDate(now),
    };
    tx.create(paymentRef, payment);
    tx.update(orderRef, { status: "paid", paymentId: args.paymentId });
    return { created: true, payment };
  });
}
