// Shared by the comment form (early feedback) and /api/comments (enforcement).

export const MAX_COMMENT_LENGTH = 1000;

// Letters and combining marks in any script, digits, whitespace, and a small
// set of basic punctuation. ZWNJ/ZWJ (U+200C/U+200D) are allowed because
// Indic scripts use them to control conjuncts. The Devanagari danda and double
// danda (। ॥) are allowed because they are the sentence terminators in Hindi
// and Marathi.
const ALLOWED = /^[\p{L}\p{M}\p{N}\s.,!?'"\-():‌‍।॥]*$/u;
const ALLOWED_CHAR = /[\p{L}\p{M}\p{N}\s.,!?'"\-():‌‍।॥]/u;

/** Map typographic quotes/dashes that phone keyboards insert to their ASCII forms. */
export function normalizeCommentText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .trim();
}

export type CommentTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "EMPTY" | "TOO_LONG" | "SPECIAL_CHARS"; message: string; invalid?: string[] };

export function validateCommentText(raw: string): CommentTextResult {
  const text = normalizeCommentText(raw ?? "");
  if (!text) return { ok: false, reason: "EMPTY", message: "Comment cannot be empty." };
  if (text.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      reason: "TOO_LONG",
      message: `Comments can be at most ${MAX_COMMENT_LENGTH} characters.`,
    };
  }
  if (!ALLOWED.test(text)) {
    // Iterate by code point so emoji are reported whole.
    const invalid = [...new Set(Array.from(text).filter((ch) => !ALLOWED_CHAR.test(ch)))];
    return {
      ok: false,
      reason: "SPECIAL_CHARS",
      message: `Special characters are not allowed: ${invalid.join(" ")}`,
      invalid,
    };
  }
  return { ok: true, text };
}
