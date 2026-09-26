/**
 * URL safety for capability completion links.
 * Stored URLs are references, not permission to fetch arbitrary content.
 * Only https without credentials; relative same-origin paths are allowed for lab routes.
 */

const HTML_ESCAPE = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

/**
 * Allow https absolute URLs (no credentials) or rooted relative paths under this site.
 * Rejects javascript:, data:, http:, and protocol-relative URLs.
 */
export function safeCapabilityHref(raw, { allowRelative = true } = {}) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (allowRelative && value.startsWith("/") && !value.startsWith("//")) {
    if (/[\s<>"']/.test(value)) return null;
    return value;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.href;
}

export function setText(node, value) {
  if (!node) return;
  node.textContent = value == null ? "" : String(value);
}
