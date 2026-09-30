import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { markOtpVerified, otpMatches, type OtpDoc } from "@/lib/server/otp";
import { withAuth } from "@/lib/server/withAuth";
import { OTP_MAX_ATTEMPTS } from "@/lib/otpRules";

// POST { code } → checks the emailed code for this sign-in.
export default withAuth(
  ["POST"],
  async (req, res) => {
    const code = requireString(req.body?.code, "code", 12).trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, { error: "Enter the 6-digit code", reason: "BAD_FORMAT" });

    const db = adminDb();
    const ref = db.collection("otps").doc(req.user.uid);
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const otp = snap.data() as OtpDoc | undefined;
      if (!otp || otp.channel !== "email" || !otp.codeHash || !otp.salt || !otp.expiresAt) {
        return { ok: false as const, status: 400, body: { error: "Request a code first", reason: "NO_CODE" } };
      }
      if (otp.authTime !== req.user.auth_time) {
        return { ok: false as const, status: 400, body: { error: "This code is for another sign-in. Request a new one.", reason: "NO_CODE" } };
      }
      if (Date.now() > otp.expiresAt) {
        return { ok: false as const, status: 400, body: { error: "That code has expired. Request a new one.", reason: "EXPIRED" } };
      }
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        return { ok: false as const, status: 429, body: { error: "Too many wrong attempts. Request a new code.", reason: "TOO_MANY_ATTEMPTS" } };
      }
      if (!otpMatches(code, otp.salt, otp.codeHash)) {
        const attempts = otp.attempts + 1;
        tx.update(ref, { attempts });
        return {
          ok: false as const,
          status: 400,
          body: { error: `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempts left.`, reason: "WRONG_CODE", attemptsLeft: OTP_MAX_ATTEMPTS - attempts },
        };
      }
      return { ok: true as const };
    });
    // Wrong-attempt counts must persist, so failures are returned (committing
    // the transaction) rather than thrown.
    if (!outcome.ok) throw new HttpError(outcome.status, outcome.body);

    await markOtpVerified(req.user, "email");
    res.status(200).json({ verified: true });
  },
  { requireOtp: false }
);
