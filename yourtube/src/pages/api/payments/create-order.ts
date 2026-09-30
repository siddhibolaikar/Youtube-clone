import { Timestamp } from "firebase-admin/firestore";
import { canUpgrade, getPlan, getProduct } from "@/lib/plans";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError } from "@/lib/server/http";
import type { OrderDoc } from "@/lib/server/payments";
import { getRazorpay } from "@/lib/server/razorpay";
import { withAuth } from "@/lib/server/withAuth";

// POST { product } → a Razorpay order. The amount always comes from lib/plans.
export default withAuth(["POST"], async (req, res) => {
  const product = getProduct(req.body?.product);
  if (!product) throw new HttpError(400, { error: "Unknown product" });

  const db = adminDb();
  const uid = req.user.uid;
  const user = await db.collection("users").doc(uid).get();

  if (product.id === "premium") {
    if (user.get("isPremium") === true) throw new HttpError(409, { error: "You already have Premium" });
  } else if (!canUpgrade(user.get("plan"), product.id)) {
    throw new HttpError(409, {
      error: `You're on the ${getPlan(user.get("plan")).name} plan. Plans can only be upgraded.`,
      reason: "NOT_AN_UPGRADE",
    });
  }

  const order = await getRazorpay().orders.create({
    amount: product.amountPaise,
    currency: "INR",
    receipt: `${product.id}_${Date.now()}`,
    notes: { uid, product: product.id },
  });

  const doc: OrderDoc = {
    uid,
    product: product.id,
    amount: product.amountPaise,
    currency: "INR",
    status: "created",
    createdAt: Timestamp.now(),
  };
  await db.collection("orders").doc(order.id).set(doc);

  res.status(200).json({
    orderId: order.id,
    amount: product.amountPaise,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID,
    productName: product.name,
    prefill: { name: user.get("name") || req.user.name || "", email: user.get("email") || req.user.email || "" },
  });
});
