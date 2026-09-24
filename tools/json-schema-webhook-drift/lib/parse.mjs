import fs from "node:fs";
import { createHash } from "node:crypto";
import { cliRefuse } from "./args.mjs";
import { detectKind, looksLikeHtmlOrMarkup, looksLikeYamlDocument } from "./kind.mjs";
import { rejectIntegerTermsVersion } from "./hash-adapter.mjs";
import { isTermsVersionHash } from "../vendor/i01-hash-terms/hash.mjs";

export function sha256Prefixed(buffer) {
  const digest = createHash("sha256").update(buffer).digest("hex");
  return `sha256:${digest}`;
}

export function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (err) {
    throw cliRefuse("unreadable-input", `Cannot read ${filePath}`, { filePath, error: String(err.message || err) });
  }
}

export function parseJsonDocument(text, label) {
  const raw = String(text ?? "");
  if (looksLikeHtmlOrMarkup(raw)) {
    throw cliRefuse("html-or-markup", `${label} is HTML/markup, not JSON`, { label });
  }
  if (looksLikeYamlDocument(raw)) {
    throw cliRefuse("not-json", `${label} is not JSON (YAML/plain text refused; no YAML parser in this job)`, { label });
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    throw cliRefuse("parse-error", `${label} is not valid JSON`, { label, error: String(err.message || err) });
  }
  if (doc === null || (typeof doc !== "object" && typeof doc !== "boolean" && typeof doc !== "number" && typeof doc !== "string")) {
    throw cliRefuse("not-object-or-value", `${label} JSON is empty/unsupported`, { label });
  }
  return doc;
}

export function parseUsedSpec(doc, label = "used") {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw cliRefuse("missing-used-list", `${label} must be { "pointers": ["/json/pointer"] }`, { label });
  }
  if (Object.prototype.hasOwnProperty.call(doc, "termsVersion")) {
    if (rejectIntegerTermsVersion(doc.termsVersion)) {
      throw cliRefuse("invalid_input", "integer termsVersion is rejected; I01 uses sha256: + 64 hex", {
        termsVersion: doc.termsVersion,
      });
    }
    if (typeof doc.termsVersion === "string" && !isTermsVersionHash(doc.termsVersion)) {
      throw cliRefuse("invalid_input", "termsVersion must be sha256: + 64 lowercase hex or omitted", {
        termsVersion: doc.termsVersion,
      });
    }
  }
  if (!Array.isArray(doc.pointers)) {
    throw cliRefuse("missing-used-list", `${label} must include pointers: string[]`, { label });
  }
  const pointers = [];
  const uncertainties = [];
  for (const entry of doc.pointers) {
    if (typeof entry !== "string") {
      uncertainties.push({ code: "malformed-used-entry", detail: "pointer is not a string" });
      continue;
    }
    pointers.push(entry);
  }
  return { pointers, uncertainties, callerTermsVersion: isTermsVersionHash(doc.termsVersion) ? doc.termsVersion : null };
}

export function assertComparableKind(beforeKind, afterKind) {
  if (beforeKind === "openapi" || afterKind === "openapi") {
    throw cliRefuse("not-this-job-openapi", "OpenAPI documents belong to api-upgrade-brief / s134 openapi-impact, not this job", {
      beforeKind,
      afterKind,
    });
  }
  if (beforeKind === "invalid" || afterKind === "invalid") {
    throw cliRefuse("invalid-document", "before/after is not a JSON object or array", { beforeKind, afterKind });
  }
  if (beforeKind !== afterKind) {
    throw cliRefuse("kind-mismatch", "before and after must both be JSON Schema or both webhook examples", {
      beforeKind,
      afterKind,
    });
  }
  return beforeKind;
}

export function detectDocumentKind(doc) {
  return detectKind(doc);
}
