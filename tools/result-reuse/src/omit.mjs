import { createHash } from "node:crypto";

// Reviewed omission classes. This is a whitelist/provenance choice, not a
// guarantee that remaining user data is harmless, and not public-safe
// certification of a schema-valid export.
export const FORBIDDEN_KEYS = Object.freeze([
  "html",
  "htm",
  "innerhtml",
  "outerhtml",
  "markdown",
  "body",
  "raw",
  "sourcetext",
  "crawlerhtml",
  "authorization",
  "authorizations",
  "privatekey",
  "private_key",
  "private-key",
  "wallet",
  "seed",
  "mnemonic",
  "receipt",
  "receipts",
  "settlementtx",
  "facilitator",
  "paymentproof",
  "email",
  "emails",
  "phone",
  "ein",
  "ssn",
  "taxid",
  "legalname",
  "customername",
  "customerid",
  "legal",
  "cookie",
  "cookies",
  "set-cookie",
  "secret",
  "password",
  "apikey",
  "api_key",
  "token",
  "charged",
]);

export const CREDENTIAL_PATTERNS = Object.freeze([
  /Bearer\s+\S+/i,
  /\bneo_own_[A-Za-z0-9_-]{16,}/,
  /\bneo_rdr_[A-Za-z0-9_-]{16,}/,
  /\bneo_wtr_[A-Za-z0-9_-]{16,}/,
  /\btok_[0-9a-f]{32,}/i,
  /CORRESPONDENCE_ADMIN_TOKEN\s*=/,
  /0x[a-fA-F0-9]{64}/,
  /CUSTOMER_X402_PRIVATE_KEY/,
]);

export const DEFAULT_INCLUDE = Object.freeze([
  "schema",
  "kind",
  "schemaVersion",
  "product",
  "jobId",
  "jobStatus",
  "partial",
  "status",
  "ok",
  "verdict",
  "fields",
  "freshness",
  "claims",
  "summary",
  "url",
  "title",
  "contentHash",
  "httpStatus",
  "networkUsed",
]);

export const SELECTABLE = Object.freeze([
  ...DEFAULT_INCLUDE,
  "description",
  "headings",
  "hours",
  "jsonLd",
  "evidence",
  "changes",
  "sources",
  "rows",
  "coverageUnknown",
  "failed",
  "missing",
  "records",
  "invalidRecords",
  "partialRecords",
  "bytes",
  "fetchedAt",
]);

export function keyName(key) {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isForbiddenKey(key) {
  return FORBIDDEN_KEYS.includes(keyName(key));
}

export function credentialHits(text) {
  if (typeof text !== "string" || text === "") return [];
  return CREDENTIAL_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function looksLikeFilesystemPath(value) {
  if (typeof value !== "string") return false;
  return (
    value.startsWith("/tmp/") ||
    value.startsWith("/home/") ||
    value.startsWith("/Users/") ||
    value.startsWith("/var/") ||
    /^[A-Za-z]:\\/.test(value)
  );
}

export function isPublicHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return false;
    return true;
  } catch {
    return false;
  }
}

export function containsHostileMarkup(value) {
  if (typeof value !== "string") return false;
  return /<\s*(script|iframe|object|embed)\b/i.test(value) || /javascript:/i.test(value);
}

export function sha256Json(value) {
  const canonical = JSON.stringify(value);
  return `sha256:${createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex")}`;
}
