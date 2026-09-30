import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { apiFetch } from "./apiClient";
import { toDate, type FirestoreDate } from "./types";

export interface PaymentSummary {
  paymentId: string;
  productName: string;
  amount: number;
  invoiceNumber: string;
  emailStatus: "pending" | "sent" | "failed";
  createdAt: Date;
}

/** The signed-in user's own payments (rules allow reading docs where uid == you). */
export async function getMyPayments(uid: string): Promise<PaymentSummary[]> {
  const q = query(collection(db, "payments"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const p = d.data();
    return {
      paymentId: d.id,
      productName: p.productName,
      amount: p.amount,
      invoiceNumber: p.invoiceNumber,
      emailStatus: p.emailStatus,
      createdAt: toDate(p.createdAt as FirestoreDate),
    };
  });
}

export const resendInvoice = (paymentId: string) =>
  apiFetch<{ emailStatus: "sent" }>("/api/payments/resend-invoice", { method: "POST", body: { paymentId } });
