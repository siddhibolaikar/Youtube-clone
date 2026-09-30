import { FieldValue } from "firebase-admin/firestore";
import { validateCommentText } from "@/lib/commentText";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { getGeo } from "@/lib/server/geo";
import { HttpError, requireString } from "@/lib/server/http";
import { toCommentDTO } from "@/lib/server/comments";
import { withAuth } from "@/lib/server/withAuth";

export default withAuth(["POST"], async (req, res) => {
  const videoId = requireString(req.body?.videoId, "videoId", 128);
  const check = validateCommentText(req.body?.text);
  if (!check.ok) {
    throw new HttpError(400, { error: check.message, reason: check.reason, invalid: check.invalid ?? [] });
  }

  const db = adminDb();
  const [video, profile, geo] = await Promise.all([
    db.collection("videos").doc(videoId).get(),
    db.collection("users").doc(req.user.uid).get(),
    getGeo(req),
  ]);
  if (!video.exists) throw new HttpError(404, { error: "Video not found" });

  const ref = await db.collection("comments").add({
    videoid: videoId,
    userid: req.user.uid,
    commentbody: check.text,
    usercommented: profile.get("name") || req.user.name || "User",
    userimage: profile.get("image") || req.user.picture || null,
    // Resolved on the server so the client can't choose it.
    city: geo.city,
    likes: [],
    dislikes: [],
    edited: false,
    commentedon: FieldValue.serverTimestamp(),
  });
  res.status(201).json({ comment: toCommentDTO(await ref.get()) });
});
