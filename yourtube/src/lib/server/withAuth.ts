import type { NextApiRequest } from "next";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { HttpError, withApi, type ApiHandler } from "./http";

export interface AuthedRequest extends NextApiRequest {
  user: DecodedIdToken;
}

interface AuthOptions {
  /**
   * Require the second-factor OTP for this sign-in session. Defaults to true;
   * only the OTP endpoints themselves (and profile phone setup) opt out.
   */
  requireOtp?: boolean;
}

export async function verifyRequest(req: NextApiRequest): Promise<DecodedIdToken> {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new HttpError(401, { error: "Sign in required", reason: "UNAUTHENTICATED" });
  try {
    return await adminAuth().verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, { error: "Session expired. Please sign in again.", reason: "UNAUTHENTICATED" });
  }
}

/**
 * The OTP step is tied to a specific Google sign-in via the ID token's
 * auth_time claim. A fresh sign-in gets a new auth_time, so it needs a new OTP.
 */
export async function isOtpVerified(user: DecodedIdToken): Promise<boolean> {
  const snap = await adminDb().collection("sessions").doc(user.uid).get();
  return snap.exists && snap.get("authTime") === user.auth_time;
}

export function withAuth(
  methods: string[],
  handler: ApiHandler<AuthedRequest>,
  { requireOtp = true }: AuthOptions = {}
) {
  return withApi<NextApiRequest>(methods, async (req, res) => {
    const user = await verifyRequest(req);
    if (requireOtp && !(await isOtpVerified(user))) {
      throw new HttpError(403, { error: "Verify the OTP to continue.", reason: "OTP_REQUIRED" });
    }
    (req as AuthedRequest).user = user;
    return handler(req as AuthedRequest, res);
  });
}
