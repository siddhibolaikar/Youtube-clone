import type { NextApiRequest } from "next";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "./firebaseAdmin";
import { HttpError, withApi, type ApiHandler } from "./http";

export interface AuthedRequest extends NextApiRequest {
  user: DecodedIdToken;
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

export function withAuth(methods: string[], handler: ApiHandler<AuthedRequest>) {
  return withApi<NextApiRequest>(methods, async (req, res) => {
    (req as AuthedRequest).user = await verifyRequest(req);
    return handler(req as AuthedRequest, res);
  });
}
