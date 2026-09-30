import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { apiFetch } from "./apiClient";
import { toDate, type CommentDTO, type FirestoreDate } from "./types";
import type { ReactionType } from "./commentReactions";
import type { TranslateLanguage } from "./languages";

// Reads go straight to Firestore (comments are public). Every write goes
// through /api/comments so the server can validate text, stamp the city and
// run reactions in a transaction.

export const getComments = async (videoid: string): Promise<CommentDTO[]> => {
  const q = query(collection(db, "comments"), where("videoid", "==", videoid), orderBy("commentedon", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      videoid: data.videoid,
      userid: data.userid,
      commentbody: data.commentbody,
      usercommented: data.usercommented,
      userimage: data.userimage ?? null,
      city: data.city ?? null,
      likes: data.likes ?? [],
      dislikes: data.dislikes ?? [],
      edited: data.edited ?? false,
      commentedon: toDate(data.commentedon as FirestoreDate).toISOString(),
    };
  });
};

export const postComment = async (videoId: string, text: string) =>
  (await apiFetch<{ comment: CommentDTO }>("/api/comments", { method: "POST", body: { videoId, text } })).comment;

export const editComment = async (commentId: string, text: string) =>
  (await apiFetch<{ comment: CommentDTO }>(`/api/comments/${commentId}`, { method: "PATCH", body: { text } })).comment;

export const deleteComment = async (commentId: string) => {
  await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" });
};

export type ReactResult = { removed: true } | { removed: false; likes: string[]; dislikes: string[] };

export const reactToComment = (commentId: string, type: ReactionType) =>
  apiFetch<ReactResult>(`/api/comments/${commentId}/react`, { method: "POST", body: { type } });

// Translations are cached per comment text + language for the page lifetime.
const translationCache = new Map<string, string>();

export const translateText = async (text: string, target: TranslateLanguage): Promise<string> => {
  const key = `${target}\u0000${text}`;
  const hit = translationCache.get(key);
  if (hit) return hit;
  const { translatedText } = await apiFetch<{ translatedText: string }>("/api/translate", {
    method: "POST",
    body: { text, target },
    withToken: false,
  });
  translationCache.set(key, translatedText);
  return translatedText;
};
