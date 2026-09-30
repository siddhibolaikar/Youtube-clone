import { validateCommentText } from "@/lib/commentText";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { HttpError, requireString } from "@/lib/server/http";
import { toCommentDTO } from "@/lib/server/comments";
import { withAuth } from "@/lib/server/withAuth";

// PATCH { text } edits (same character rules as posting); DELETE removes.
// Both are owner-only.
export default withAuth(["PATCH", "DELETE"], async (req, res) => {
  const id = requireString(req.query.id, "id", 128);
  const ref = adminDb().collection("comments").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, { error: "Comment not found" });
  if (snap.get("userid") !== req.user.uid) {
    throw new HttpError(403, { error: "You can only change your own comments" });
  }

  if (req.method === "DELETE") {
    await ref.delete();
    return res.status(200).json({ deleted: true });
  }

  const check = validateCommentText(req.body?.text);
  if (!check.ok) {
    throw new HttpError(400, { error: check.message, reason: check.reason, invalid: check.invalid ?? [] });
  }
  await ref.update({ commentbody: check.text, edited: true });
  res.status(200).json({ comment: toCommentDTO(await ref.get()) });
});
