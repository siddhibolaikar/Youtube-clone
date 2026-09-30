import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { markOtpVerified, resolveChannel } from "@/lib/server/otp";
import { withAuth } from "@/lib/server/withAuth";

const MAX_PHONE_TOKEN_AGE_S = 10 * 60;

// POST { phoneIdToken } → the ID token from a Firebase Phone Auth sign-in done
// on a separate, in-memory auth instance. Proves the user just received the
// SMS on their registered number.
export default withAuth(
  ["POST"],
  async (req, res) => {
    const phoneIdToken = requireString(req.body?.phoneIdToken, "phoneIdToken", 4096);
    const { channel } = await resolveChannel(req);
    if (channel !== "sms") throw new HttpError(400, { error: "Your OTP is sent by email for your location.", reason: "WRONG_CHANNEL" });

    let phoneToken;
    try {
      phoneToken = await adminAuth().verifyIdToken(phoneIdToken);
    } catch {
      throw new HttpError(401, { error: "Phone verification expired. Try again.", reason: "BAD_PHONE_TOKEN" });
    }
    const registered = (await adminDb().collection("users").doc(req.user.uid).get()).get("phone");
    if (phoneToken.firebase.sign_in_provider !== "phone" || !phoneToken.phone_number) {
      throw new HttpError(400, { error: "Not a phone verification", reason: "BAD_PHONE_TOKEN" });
    }
    if (phoneToken.phone_number !== registered) {
      throw new HttpError(400, { error: "That number doesn't match your registered mobile.", reason: "PHONE_MISMATCH" });
    }
    if (Date.now() / 1000 - phoneToken.auth_time > MAX_PHONE_TOKEN_AGE_S) {
      throw new HttpError(400, { error: "Phone verification expired. Try again.", reason: "STALE_PHONE_TOKEN" });
    }

    await markOtpVerified(req.user, "sms");
    // The phone sign-in created a throwaway phone-only account; remove it.
    if (phoneToken.uid !== req.user.uid) {
      await adminAuth()
        .deleteUser(phoneToken.uid)
        .catch((e) => console.warn("[otp] could not delete phone-only user:", e));
    }
    res.status(200).json({ verified: true });
  },
  { requireOtp: false }
);
