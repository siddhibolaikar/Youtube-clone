import { HttpError, requireString, withApi } from "@/lib/server/http";
import { getTranslator } from "@/lib/server/translate";
import { isTranslateLanguage } from "@/lib/languages";
import { MAX_COMMENT_LENGTH } from "@/lib/commentText";

// Public (logged-out viewers can translate too). Input is capped at the
// comment length so it can't be used as a general-purpose proxy.
export default withApi(["POST"], async (req, res) => {
  const text = requireString(req.body?.text, "text", MAX_COMMENT_LENGTH);
  const target = req.body?.target;
  if (!isTranslateLanguage(target)) {
    throw new HttpError(400, { error: "Unsupported target language" });
  }
  try {
    const result = await getTranslator().translate(text, target);
    res.status(200).json({ translatedText: result.text, detectedSource: result.detectedSource ?? null });
  } catch (err) {
    console.error("[translate] provider failed:", err);
    throw new HttpError(502, { error: "Translation service is unavailable right now. Try again later." });
  }
});
