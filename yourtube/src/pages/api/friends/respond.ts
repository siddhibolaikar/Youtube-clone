import { adminDb } from "@/lib/server/firebaseAdmin";
import { friendDoc, friendRef, publicCard } from "@/lib/server/friends";
import { HttpError, requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";

// POST { uid, accept } → accept or decline an incoming request.
export default withAuth(["POST"], async (req, res) => {
  const them = requireString(req.body?.uid, "uid", 128);
  const accept = req.body?.accept === true;
  const me = req.user.uid;
  const db = adminDb();
  const [myCard, theirCard] = await Promise.all([publicCard(db, me), publicCard(db, them)]);

  await db.runTransaction(async (tx) => {
    const mine = await tx.get(friendRef(db, me, them));
    if (mine.get("status") !== "incoming") throw new HttpError(404, { error: "No pending request from this user" });
    if (accept) {
      tx.set(friendRef(db, me, them), friendDoc("accepted", theirCard));
      tx.set(friendRef(db, them, me), friendDoc("accepted", myCard));
    } else {
      tx.delete(friendRef(db, me, them));
      tx.delete(friendRef(db, them, me));
    }
  });
  res.status(200).json({ status: accept ? "accepted" : "declined" });
});
