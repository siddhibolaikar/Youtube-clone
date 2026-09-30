import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";
import { normalizeIndianMobile } from "@/lib/otpRules";

// POST { phone } → one-time "Add your mobile number" during the OTP step.
// Changing an existing number isn't allowed here (that would let someone who
// only has the Google password redirect the SMS second factor).
export default withAuth(
  ["POST"],
  async (req, res) => {
    const phone = normalizeIndianMobile(requireString(req.body?.phone, "phone", 20));
    if (!phone) {
      throw new HttpError(400, { error: "Enter a valid 10-digit Indian mobile number", reason: "BAD_PHONE" });
    }
    const ref = adminDb().collection("users").doc(req.user.uid);
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.get("phone");
      if (existing && existing !== phone) {
        throw new HttpError(409, { error: "A mobile number is already registered on this account", reason: "PHONE_EXISTS" });
      }
      tx.set(ref, { phone }, { merge: true });
    });
    res.status(200).json({ phone });
  },
  { requireOtp: false }
);
