// Translation behind a small interface so MyMemory can be swapped for Google
// Cloud Translate (or anything else) by changing getTranslator().

export interface TranslationResult {
  text: string;
  detectedSource?: string;
}

export interface Translator {
  translate(text: string, target: string): Promise<TranslationResult>;
}

// MyMemory rejects queries over 500 bytes, and Indic scripts are 3 bytes/char
// in UTF-8, so long comments are split on sentence/word boundaries.
const MAX_CHUNK_BYTES = 480;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

export function chunkForTranslation(text: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const pieces = text.match(/[^.!?।॥\n]+[.!?।॥\n]*\s*/gu) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const piece of pieces) {
    if (byteLength(current + piece) <= maxBytes) {
      current += piece;
      continue;
    }
    push();
    if (byteLength(piece) <= maxBytes) {
      current = piece;
      continue;
    }
    // A single sentence that is still too long: split on words.
    for (const word of piece.split(/(\s+)/)) {
      if (byteLength(current + word) > maxBytes) push();
      current += word;
    }
  }
  push();
  return chunks;
}

interface MyMemoryResponse {
  responseStatus: number | string;
  responseDetails?: string;
  responseData?: { translatedText?: string; detectedLanguage?: string };
}

export class MyMemoryTranslator implements Translator {
  constructor(private email?: string) {}

  private async translateChunk(text: string, target: string): Promise<TranslationResult> {
    const params = new URLSearchParams({ q: text, langpair: `autodetect|${target}` });
    if (this.email) params.set("de", this.email);
    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`MyMemory responded ${res.status}`);
    const data = (await res.json()) as MyMemoryResponse;
    const status = Number(data.responseStatus);
    const translated = data.responseData?.translatedText;
    // MyMemory refuses same-language pairs; the text is already in the target.
    if (/two distinct languages/i.test(data.responseDetails ?? "")) {
      return { text, detectedSource: target };
    }
    if (status !== 200 || !translated) {
      throw new Error(`MyMemory error ${status}: ${data.responseDetails ?? "no translation"}`);
    }
    return { text: translated, detectedSource: data.responseData?.detectedLanguage };
  }

  async translate(text: string, target: string): Promise<TranslationResult> {
    const results = [];
    // Sequential to stay friendly with the free rate limit.
    for (const chunk of chunkForTranslation(text)) {
      results.push(await this.translateChunk(chunk, target));
    }
    return {
      text: results.map((r) => r.text).join(" "),
      detectedSource: results[0]?.detectedSource,
    };
  }
}

export function getTranslator(): Translator {
  return new MyMemoryTranslator(process.env.MYMEMORY_EMAIL || undefined);
}
