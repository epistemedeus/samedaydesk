/**
 * JSONL is one JSON value per non-empty line. That is not a JSON document.
 * Schema checks must not treat a successful JSON.parse of a single object as
 * covering JSONL, and must not label JSONL as generic malformed JSON.
 */
export function looksJsonl(text) {
  if (typeof text !== "string") return false;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return false;
  for (const line of lines) {
    try {
      JSON.parse(line);
    } catch {
      return false;
    }
  }
  return true;
}

export function parseJsonDocument(text) {
  if (typeof text !== "string") return { ok: false, jsonl: false };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, jsonl: false };
  try {
    return { ok: true, jsonl: false, value: JSON.parse(trimmed) };
  } catch (err) {
    if (looksJsonl(text)) return { ok: false, jsonl: true, error: err };
    return { ok: false, jsonl: false, error: err };
  }
}
