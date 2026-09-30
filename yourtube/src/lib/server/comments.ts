import type { DocumentSnapshot } from "firebase-admin/firestore";
import type { CommentDTO } from "../types";

export function toCommentDTO(snap: DocumentSnapshot): CommentDTO {
  const d = snap.data() ?? {};
  const at = d.commentedon?.toDate?.() as Date | undefined;
  return {
    id: snap.id,
    videoid: d.videoid,
    userid: d.userid,
    commentbody: d.commentbody,
    usercommented: d.usercommented,
    userimage: d.userimage ?? null,
    city: d.city ?? null,
    likes: d.likes ?? [],
    dislikes: d.dislikes ?? [],
    edited: d.edited ?? false,
    commentedon: (at ?? new Date()).toISOString(),
  };
}
