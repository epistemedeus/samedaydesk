/**
 * A desk failure is parseable when it is JSON with ok:false and a string
 * error, code, or failure.class. Empty success is not a parseable error.
 */

const CODE_RE = /^[a-z0-9][a-z0-9_.-]*$/i;

export function extractJsonObjects(text) {
  const raw = String(text || "");
  const found = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = raw.slice(start, i + 1);
        try {
          const value = JSON.parse(slice);
          if (value && typeof value === "object" && !Array.isArray(value)) {
            found.push(value);
          }
        } catch {
          // skip non-objects / truncated slices
        }
        start = -1;
      }
    }
  }
  return found;
}

export function parseableErrorFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (obj.ok === true) return null;
  const code =
    typeof obj.code === "string" && obj.code.trim()
      ? obj.code.trim()
      : typeof obj.failure?.class === "string" && obj.failure.class.trim()
        ? obj.failure.class.trim()
        : null;
  const error =
    typeof obj.error === "string" && obj.error.trim()
      ? obj.error.trim()
      : typeof obj.message === "string" && obj.message.trim()
        ? obj.message.trim()
        : typeof obj.failure?.message === "string" && obj.failure.message.trim()
          ? obj.failure.message.trim()
          : null;
  if (!code && !error) return null;
  if (code && !CODE_RE.test(code)) return null;
  return {
    ok: false,
    parseable: true,
    refused: obj.refused === true || true,
    code: code || "unspecified-error",
    error: error || code,
    detail: obj.detail && typeof obj.detail === "object" ? obj.detail : obj.failure || null,
  };
}

export function findParseableError(text) {
  const objects = extractJsonObjects(text);
  for (const obj of objects) {
    const parsed = parseableErrorFields(obj);
    if (parsed) return { source: obj, parsed };
  }
  return null;
}

export function parseableErrorFromProcess({ stdout = "", stderr = "" } = {}) {
  return findParseableError(String(stderr || "")) || findParseableError(String(stdout || ""));
}
