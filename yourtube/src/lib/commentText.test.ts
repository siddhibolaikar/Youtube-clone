import { describe, expect, it } from "vitest";
import { MAX_COMMENT_LENGTH, validateCommentText } from "./commentText";

describe("validateCommentText: allowed", () => {
  it.each([
    ["English", "Great video! Loved it, thanks (really)."],
    ["Hindi", "बहुत अच्छा वीडियो है! धन्यवाद।"],
    ["Marathi", "खूप छान व्हिडिओ आहे, धन्यवाद!"],
    ["Tamil", "மிகவும் அருமையான வீடியோ!"],
    ["Telugu", "చాలా బాగుంది, ధన్యవాదాలు."],
    ["Kannada", "ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ!"],
    ["Malayalam (with ZWJ chillu)", "വളരെ നല്ല വീഡിയോ! നന്ദി‍"],
    ["Bengali", "খুব সুন্দর ভিডিও!"],
    ["Japanese", "素晴らしい動画です"],
    ["Spanish accents", "Qué bien, está genial! Año"],
  ])("%s", (_lang, text) => {
    expect(validateCommentText(text)).toMatchObject({ ok: true });
  });

  it("allows digits, quotes, hyphen, colon, parentheses", () => {
    expect(validateCommentText(`Part 2: "the best" - it's (still) 100 percent good`).ok).toBe(true);
  });

  it("normalises typographic quotes and dashes from phone keyboards", () => {
    const r = validateCommentText("It’s “great” — really");
    expect(r).toEqual({ ok: true, text: `It's "great" - really` });
  });

  it("trims surrounding whitespace", () => {
    expect(validateCommentText("  hello  ")).toEqual({ ok: true, text: "hello" });
  });
});

describe("validateCommentText: blocked", () => {
  const blocked = ["@", "#", "$", "%", "^", "&", "*", "<", ">", "{", "}", "[", "]", "/", "\\", "|", "~", "`", "=", "+", "_", ";"];

  it.each(blocked)("rejects %s", (ch) => {
    const r = validateCommentText(`nice ${ch} video`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("SPECIAL_CHARS");
      expect(r.invalid).toEqual([ch]);
    }
  });

  it.each(["😀", "👍🏽", "❤️", "👨‍👩‍👧"])("rejects emoji %s", (emoji) => {
    const r = validateCommentText(`great ${emoji}`);
    expect(r.ok).toBe(false);
  });

  it("rejects special characters mixed into Indic text", () => {
    expect(validateCommentText("बहुत अच्छा #video").ok).toBe(false);
  });

  it("rejects a script tag", () => {
    expect(validateCommentText("<script>alert(1)</script>").ok).toBe(false);
  });

  it("reports each offending character once", () => {
    const r = validateCommentText("a@b@c#");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid).toEqual(["@", "#"]);
  });

  it("rejects empty and whitespace-only", () => {
    expect(validateCommentText("   ")).toMatchObject({ ok: false, reason: "EMPTY" });
  });

  it("rejects over-long comments", () => {
    expect(validateCommentText("a".repeat(MAX_COMMENT_LENGTH + 1))).toMatchObject({ ok: false, reason: "TOO_LONG" });
  });
});
