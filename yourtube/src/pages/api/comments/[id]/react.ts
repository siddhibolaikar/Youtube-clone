import { applyReaction, shouldRemoveComment, type ReactionType } from "@/lib/commentReactions";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { withAuth } from "@/lib/server/withAuth";

export default withAuth(["POST"], async (req, res) => {
  const id = requireString(req.query.id, "id", 128);
  const type = req.body?.type as ReactionType;
  if (type !== "like" && type !== "dislike") {
    throw new HttpError(400, { error: 'type must be "like" or "dislike"' });
  }
  const uid = req.user.uid;
  const db = adminDb();
  const ref = db.collection("comments").doc(id);

  // Read-modify-write in one transaction so concurrent reactions can't lose
  // updates or skip the removal threshold.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, { error: "Comment not found", reason: "GONE" });
    if (snap.get("userid") === uid) {
      throw new HttpError(400, { error: "You can't react to your own comment" });
    }
    const next = applyReaction(
      { likes: snap.get("likes") ?? [], dislikes: snap.get("dislikes") ?? [] },
      uid,
      type
    );
    if (shouldRemoveComment(next)) {
      tx.delete(ref);
      return { removed: true as const };
    }
    tx.update(ref, { likes: next.likes, dislikes: next.dislikes });
    return { removed: false as const, likes: next.likes, dislikes: next.dislikes };
  });

  res.status(200).json(result);
});
