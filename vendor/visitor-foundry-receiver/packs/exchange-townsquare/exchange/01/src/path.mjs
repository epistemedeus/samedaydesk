/** Tiny JSON-path reader: dotted paths and [n] indexes only. No recursion into prototypes. */

export function readPath(root, path) {
  if (typeof path !== "string" || !path.trim()) {
    return { ok: false, reason: "empty_path" };
  }
  const parts = [];
  const re = /([^[.\]]+)|\[(\d+)\]/g;
  let match;
  let consumed = 0;
  const normalized = path.replace(/^\$\.?/, "");
  while ((match = re.exec(normalized)) !== null) {
    if (match.index !== consumed) {
      return { ok: false, reason: "bad_path_syntax" };
    }
    if (match[1] != null) parts.push(match[1]);
    else parts.push(Number(match[2]));
    consumed = re.lastIndex;
    if (normalized[consumed] === ".") consumed += 1;
  }
  if (consumed !== normalized.length) {
    return { ok: false, reason: "bad_path_syntax" };
  }

  let cur = root;
  for (const part of parts) {
    if (cur == null) return { ok: false, reason: "missing", path };
    if (typeof part === "number") {
      if (!Array.isArray(cur) || part < 0 || part >= cur.length) {
        return { ok: false, reason: "missing", path };
      }
      cur = cur[part];
    } else {
      if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
        return { ok: false, reason: "missing", path };
      }
      if (!Object.prototype.hasOwnProperty.call(cur, part)) {
        return { ok: false, reason: "missing", path };
      }
      cur = cur[part];
    }
  }
  return { ok: true, value: cur };
}
