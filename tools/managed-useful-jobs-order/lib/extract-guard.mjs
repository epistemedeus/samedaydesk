const EXTRACT_PATTERNS = [
  /agents\.samedaydesk\.com\/extract(?:\?|$|\/)/i,
  /samedaydesk\.com\/extract(?:\?|$|\/)/i,
  /\/extract\?url=/i,
  /\bGET\s+\/extract\b/i,
  /^\/extract(?:\?|$)/i,
];

const SKIP_KEYS = new Set(["schema", "notes", "comment"]);

function walk(value, path, hits) {
  if (typeof value === "string") {
    const text = value.trim();
    for (const re of EXTRACT_PATTERNS) {
      if (re.test(text)) {
        hits.push({ path: path.join("."), value: text.slice(0, 200) });
        return;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, [...path, String(i)], hits));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SKIP_KEYS.has(key)) continue;
      walk(child, [...path, key], hits);
    }
  }
}

/**
 * F-EXTRACT: this offer is not GET /extract and must not be sold under that resource.
 */
export function findExtractHits(request) {
  const hits = [];
  walk(request, [], hits);
  const engineId = request?.engineId;
  if (engineId === "extract" || engineId === "/extract") {
    hits.push({ path: "engineId", value: String(engineId) });
  }
  return hits;
}

export function findExtractUrl(request) {
  return findExtractHits(request)[0] || null;
}
