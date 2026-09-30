import { apiFetch } from "./apiClient";
import type { ProductId } from "./plans";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (resp: { error: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout. Check your connection or ad blocker."));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export class CheckoutCancelled extends Error {
  constructor() {
    super("Payment cancelled");
  }
}

export interface PurchaseResult {
  product: ProductId;
  invoiceNumber: string;
  alreadyProcessed: boolean;
  emailStatus: "pending" | "sent" | "failed";
}

/**
 * Create an order on the server, open Razorpay Checkout, then verify the
 * signature on the server. Resolves only once the entitlement is granted.
 */
export async function purchase(product: ProductId): Promise<PurchaseResult> {
  const [order] = await Promise.all([
    apiFetch<{
      orderId: string;
      amount: number;
      currency: string;
      keyId: string;
      productName: string;
      prefill: { name: string; email: string };
    }>("/api/payments/create-order", { method: "POST", body: { product } }),
    loadCheckoutScript(),
  ]);
  if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");

  const response = await new Promise<RazorpaySuccess>((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "YourTube",
      description: order.productName,
      order_id: order.orderId,
      prefill: order.prefill,
      theme: { color: "#dc2626" },
      handler: resolve,
      modal: { ondismiss: () => reject(new CheckoutCancelled()) },
    });
    rzp.on("payment.failed", (resp) => reject(new Error(resp.error.description || "Payment failed")));
    rzp.open();
  });

  return apiFetch<PurchaseResult>("/api/payments/verify", { method: "POST", body: response });
}
