import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { friendDoc, friendRef, publicCard } from "@/lib/server/friends";
import { HttpError, requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";

// POST { email } → sends a friend request, or accepts theirs if they already asked you.
export default withAuth(["POST"], async (req, res) => {
  const email = requireString(req.body?.email, "email", 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, { error: "Enter a valid email address" });

  const me = req.user.uid;
  let them: string;
  try {
    them = (await adminAuth().getUserByEmail(email)).uid;
  } catch {
    throw new HttpError(404, { error: "No YourTube account uses that email", reason: "NOT_FOUND" });
  }
  if (them === me) throw new HttpError(400, { error: "You can't add yourself", reason: "SELF" });

  const db = adminDb();
  const [myCard, theirCard] = await Promise.all([publicCard(db, me), publicCard(db, them)]);
  const status = await db.runTransaction(async (tx) => {
    const mine = await tx.get(friendRef(db, me, them));
    const current = mine.get("status");
    if (current === "accepted") throw new HttpError(409, { error: "You're already friends", reason: "ALREADY_FRIENDS" });
    if (current === "outgoing") throw new HttpError(409, { error: "Request already sent", reason: "ALREADY_SENT" });
    if (current === "incoming") {
      // They asked first: adding them back accepts.
      tx.set(friendRef(db, me, them), friendDoc("accepted", theirCard));
      tx.set(friendRef(db, them, me), friendDoc("accepted", myCard));
      return "accepted";
    }
    tx.set(friendRef(db, me, them), friendDoc("outgoing", theirCard));
    tx.set(friendRef(db, them, me), friendDoc("incoming", myCard));
    return "outgoing";
  });
  res.status(200).json({ uid: them, status });
});
