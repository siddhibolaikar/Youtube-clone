import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { sendInvoiceEmail } from "@/lib/server/invoice";
import { withAuth } from "@/lib/server/withAuth";

// POST { paymentId } → { emailStatus }. Owner only; for invoices whose email failed.
export default withAuth(["POST"], async (req, res) => {
  const paymentId = requireString(req.body?.paymentId, "paymentId", 64);
  const snap = await adminDb().collection("payments").doc(paymentId).get();
  if (!snap.exists || snap.get("uid") !== req.user.uid) throw new HttpError(404, { error: "Payment not found" });
  if (snap.get("emailStatus") === "sent") {
    throw new HttpError(409, { error: "This invoice was already emailed", reason: "ALREADY_SENT" });
  }
  const emailStatus = await sendInvoiceEmail(paymentId);
  if (emailStatus === "failed") {
    throw new HttpError(502, { error: "Couldn't send the email. Try again in a few minutes.", emailStatus });
  }
  res.status(200).json({ emailStatus });
});
