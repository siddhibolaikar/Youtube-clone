import { describe, expect, it } from "vitest";
import { chunkForTranslation } from "./translate";

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("chunkForTranslation", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkForTranslation("Hello there. How are you?")).toEqual(["Hello there. How are you?"]);
  });

  it("splits long Devanagari text under the byte limit without losing words", () => {
    const sentence = "यह एक बहुत अच्छा वीडियो है। ";
    const text = sentence.repeat(40).trim();
    const chunks = chunkForTranslation(text, 480);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(480);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("splits a single over-long sentence on word boundaries", () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkForTranslation(text, 100);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(100);
    expect(chunks.join(" ")).toBe(text);
  });
});
