import crypto from "crypto";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError } from "@/lib/server/http";
import { escapeHtml, getMailer } from "@/lib/server/mailer";
import { generateOtpCode, hashOtp, resolveChannel, type OtpDoc } from "@/lib/server/otp";
import { withAuth } from "@/lib/server/withAuth";
import { OTP_MAX_ATTEMPTS, OTP_TTL_MS, checkSendAllowed } from "@/lib/otpRules";

// POST { channel } → rate-limited. For "email" the server generates the code,
// stores only its hash and emails it. For "sms" it records the send for rate
// limiting; the browser then asks Firebase Phone Auth to text the code.
export default withAuth(
  ["POST"],
  async (req, res) => {
    const { channel } = await resolveChannel(req);
    if (req.body?.channel !== channel) {
      throw new HttpError(400, { error: `Your OTP is sent by ${channel} for your location.`, reason: "WRONG_CHANNEL", channel });
    }
    const db = adminDb();
    const uid = req.user.uid;
    const profile = await db.collection("users").doc(uid).get();
    const email: string = profile.get("email") || req.user.email || "";
    if (channel === "email" && !email) throw new HttpError(400, { error: "Your account has no email address" });
    if (channel === "sms" && !profile.get("phone")) {
      throw new HttpError(400, { error: "Add your mobile number first", reason: "PHONE_REQUIRED" });
    }

    const code = channel === "email" ? generateOtpCode() : null;
    const salt = code ? crypto.randomBytes(16).toString("hex") : null;
    const now = Date.now();
    const ref = db.collection("otps").doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const check = checkSendAllowed((snap.get("sendLog") as number[] | undefined) ?? [], now);
      if (!check.ok) {
        const wait = Math.ceil(check.retryAfterMs / 1000);
        throw new HttpError(429, {
          error:
            check.reason === "COOLDOWN"
              ? `Please wait ${wait}s before requesting another code.`
              : `Too many codes requested. Try again in ${Math.ceil(wait / 60)} min.`,
          reason: check.reason,
          retryAfterMs: check.retryAfterMs,
        });
      }
      const doc: OtpDoc = {
        channel,
        codeHash: code && salt ? hashOtp(code, salt) : null,
        salt,
        expiresAt: code ? now + OTP_TTL_MS : null,
        attempts: 0,
        authTime: req.user.auth_time,
        sendLog: check.log,
      };
      tx.set(ref, doc);
    });

    if (code) {
      try {
        await getMailer().send({
          to: email,
          subject: `${code} is your YourTube sign-in code`,
          text: `Your YourTube sign-in code is ${code}. It expires in 5 minutes. If you didn't try to sign in, ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px">
  <div style="color:#dc2626;font-size:22px;font-weight:bold">YourTube</div>
  <p>Hi ${escapeHtml(profile.get("name") || "there")}, use this code to finish signing in:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
  <p style="color:#6b7280;font-size:13px">It expires in 5 minutes and can be tried ${OTP_MAX_ATTEMPTS} times. If you didn't try to sign in, you can ignore this email.</p>
</div>`,
        });
      } catch (err) {
        console.error("[otp] email send failed:", err);
        throw new HttpError(502, { error: "We couldn't send the email. Try again in a moment.", reason: "SEND_FAILED" });
      }
    }
    res.status(200).json({ sent: true, channel, expiresInMs: code ? OTP_TTL_MS : null });
  },
  { requireOtp: false }
);
