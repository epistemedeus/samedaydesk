/**
 * Path safety for deliverable file sets.
 * Rejects absolute paths, traversal, null bytes, backslashes-as-root, and empty segments.
 */

export function analyzePath(rawPath) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return { ok: false, reason: "empty_path", normalized: null };
  }
  if (rawPath.includes("\0")) {
    return { ok: false, reason: "null_byte", normalized: null };
  }
  const trimmed = rawPath.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    return { ok: false, reason: "absolute_path", normalized: null };
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return { ok: false, reason: "windows_absolute", normalized: null };
  }
  // Normalize separators for inspection only; stored path stays POSIX-relative.
  const posix = trimmed.replace(/\\/g, "/");
  if (posix.includes("//")) {
    return { ok: false, reason: "duplicate_slash", normalized: null };
  }
  const parts = posix.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    return { ok: false, reason: "traversal_or_empty_segment", normalized: null };
  }
  if (parts.some((p) => p === "~" || p.startsWith("~"))) {
    return { ok: false, reason: "home_expansion", normalized: null };
  }
  return { ok: true, reason: null, normalized: parts.join("/") };
}

export function extensionOf(path) {
  const base = path.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return null;
  return base.slice(idx + 1).toLowerCase();
}
