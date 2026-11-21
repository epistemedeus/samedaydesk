// Read only the RFC 8288 attributes needed for this bounded projection.
const MAX_LINK_BYTES = 4096;
const MAX_REFERENCE_LENGTH = 1024;
const TEXT_TYPES = new Set(["text/plain", "text/markdown"]);
const ATTRIBUTES = new Set(["rel", "type", "anchor"]);

function alternatePath(reference, context) {
  if (!reference || reference.length > MAX_REFERENCE_LENGTH ||
      !/^[a-z0-9._~!$&'()*+,;=:@%/\[\]-]+$/i.test(reference) ||
      /%(?![a-f0-9]{2})/i.test(reference)) return null;
  // Reject browser URL repairs and empty userinfo before URL normalization.
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) && !/^https?:\/\/[^/]/i.test(reference)) return null;
  const authority = reference.match(/^(?:https?:)?\/\/([^/]*)/i);
  if (authority && (!authority[1] || /[@%]/.test(authority[1]))) return null;
  if (/[\[\]]/.test(reference.slice(authority?.[0].length ?? 0))) return null;

  try {
    const target = new URL(reference, context);
    const path = target.pathname;
    if (target.origin !== context.origin || target.username || target.password ||
        target.search || target.hash || path.length > MAX_REFERENCE_LENGTH ||
        path === context.pathname || path.startsWith("//") ||
        /%(?:[01][a-f0-9]|7f|2f|5c|3f|23)/i.test(path)) return null;
    return path;
  } catch { return null; }
}

export function declaredTextAlternate(header, context) {
  if (typeof header !== "string" || header.length > MAX_LINK_BYTES ||
      /[^\t\x20-\x7e]/.test(header)) return null;

  const target = /[\t ]*<([^<>\s]*)>[\t ]*/y;
  const param = /;[\t ]*([!#$%&'*+.^_`|~\w-]+)[\t ]*(?:=[\t ]*(?:([!#$%&'*+.^_`|~\w-]+)|"((?:[^"\\]|\\[\t -~])*)")[\t ]*)?/y;
  let candidate = null;
  let offset = 0;
  while (offset < header.length) {
    target.lastIndex = offset;
    const link = target.exec(header);
    if (!link) return null;
    offset = target.lastIndex;

    const attributes = new Map();
    while (header[offset] === ";") {
      param.lastIndex = offset;
      const attribute = param.exec(header);
      if (!attribute) return null;
      offset = param.lastIndex;
      const name = attribute[1].toLowerCase();
      if (ATTRIBUTES.has(name)) {
        if (attributes.has(name)) return null;
        const value = attribute[2] ?? attribute[3]?.replace(/\\(.)/g, "$1") ?? "";
        attributes.set(name, value.toLowerCase());
      }
    }

    const relations = attributes.get("rel")?.split(/[\t ]+/) ?? [];
    const mediaTypeHint = attributes.get("type");
    if (relations.includes("alternate") && !relations.includes("preload") &&
        !relations.includes("modulepreload") && !attributes.has("anchor") && TEXT_TYPES.has(mediaTypeHint)) {
      const path = alternatePath(link[1], context);
      if (path) {
        if (candidate) return null;
        candidate = { kind: "read-declared-alternate", path, mediaTypeHint, verified: false };
      }
    }

    if (offset === header.length) break;
    if (header[offset] !== ",") return null;
    offset += 1;
    if (offset === header.length) return null;
  }
  return candidate;
}
