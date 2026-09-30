import { adminDb } from "@/lib/server/firebaseAdmin";
import { friendRef } from "@/lib/server/friends";
import { requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";

// DELETE → unfriend, or cancel a request you sent. Removes both sides.
export default withAuth(["DELETE"], async (req, res) => {
  const them = requireString(req.query.uid, "uid", 128);
  const db = adminDb();
  const batch = db.batch();
  batch.delete(friendRef(db, req.user.uid, them));
  batch.delete(friendRef(db, them, req.user.uid));
  await batch.commit();
  res.status(200).json({ removed: true });
});
