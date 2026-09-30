import { adminDb } from "@/lib/server/firebaseAdmin";
import { isOtpVerified, withAuth } from "@/lib/server/withAuth";
import { resolveChannel } from "@/lib/server/otp";
import { maskEmail, maskPhone } from "@/lib/otpRules";

// GET → which channel this sign-in must use, and where the code will go.
export default withAuth(
  ["GET"],
  async (req, res) => {
    const [{ channel, geo }, profile, verified] = await Promise.all([
      resolveChannel(req),
      adminDb().collection("users").doc(req.user.uid).get(),
      isOtpVerified(req.user),
    ]);
    const phone: string | undefined = profile.get("phone");
    const email: string = profile.get("email") || req.user.email || "";
    res.status(200).json({
      verified,
      channel,
      region: geo.regionName ?? geo.regionCode,
      city: geo.city,
      emailMasked: email ? maskEmail(email) : null,
      phone: phone ?? null,
      phoneMasked: phone ? maskPhone(phone) : null,
    });
  },
  { requireOtp: false }
);
