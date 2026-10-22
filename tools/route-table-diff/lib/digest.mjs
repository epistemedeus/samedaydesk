import { createHash } from "node:crypto";
import { CONTENT_HASH_RE } from "./constants.mjs";
import { refused } from "./errors.mjs";

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/** Content-hash format aligned with I01 (Neo PR54): sha256: + 64 lowercase hex. Not a funded-task terms hasher. */
export function contentHash(value) {
  const hex = createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function assertContentHash(value, field = "termsVersion") {
  if (typeof value !== "string" || !CONTENT_HASH_RE.test(value)) {
    refused("integer_terms_version_refused", `${field} must be a content hash (sha256: + 64 hex), not an integer or other claim key`, {
      field,
      value,
    });
  }
  return value;
}

export function refuseIntegerTermsVersion(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return;
  if (!Object.prototype.hasOwnProperty.call(catalog, "termsVersion")) return;
  const value = catalog.termsVersion;
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value.trim()))) {
    refused(
      "integer_terms_version_refused",
      "Integer termsVersion is rejected. I01 content-hash terms (sha256: + 64 hex) are the claim key; this job does not treat a revision counter as published identity.",
      { termsVersion: value },
    );
  }
  if (typeof value === "string") assertContentHash(value, "termsVersion");
}

export function tableDigest(routes) {
  return contentHash({
    schema: "samedaydesk.route-table.digest.v1",
    routes: routes.map((route) => ({
      path: route.path,
      canonical: route.canonical,
      title: route.title,
      robots: route.robots ?? null,
    })),
  });
}
