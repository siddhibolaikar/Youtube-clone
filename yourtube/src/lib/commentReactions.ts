export type ReactionType = "like" | "dislike";

export interface ReactionState {
  likes: string[];
  dislikes: string[];
}

/** A comment is removed once this many distinct users dislike it. */
export const DISLIKE_REMOVAL_THRESHOLD = 2;

/**
 * Like and dislike are mutually exclusive per user; choosing the reaction you
 * already have removes it.
 */
export function applyReaction(state: ReactionState, uid: string, type: ReactionType): ReactionState {
  const likes = state.likes.filter((u) => u !== uid);
  const dislikes = state.dislikes.filter((u) => u !== uid);
  const hadIt = (type === "like" ? state.likes : state.dislikes).includes(uid);
  if (!hadIt) (type === "like" ? likes : dislikes).push(uid);
  return { likes, dislikes };
}

export const shouldRemoveComment = (state: ReactionState) =>
  state.dislikes.length >= DISLIKE_REMOVAL_THRESHOLD;
