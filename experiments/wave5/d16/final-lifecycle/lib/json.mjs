/** Whole-document parse. A sliced object inside noise is not treated as engine JSON. */
export function parseStdoutJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return { json: null, whole: false, sliced: false, empty: true };
  try {
    return { json: JSON.parse(trimmed), whole: true, sliced: false, empty: false };
  } catch {
    return { json: null, whole: false, sliced: false, empty: false };
  }
}
