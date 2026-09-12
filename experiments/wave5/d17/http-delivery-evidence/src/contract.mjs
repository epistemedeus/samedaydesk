export const RESOURCES = Object.freeze({
  EXTRACT: "/extract",
  READ: "/read",
  EXTRACT_BATCH: "/extract/batch",
});

export const EXTRACT_CONTRACT = "samedaydesk.extract.http-json.v1";
export const READ_CONTRACT = "samedaydesk.read.http-json.v1";
export const EXTRACT_BATCH_CONTRACT = "samedaydesk.extract-batch.v0";

const CHARSET_SOURCES = new Set([
  "content-type",
  "html-meta",
  "default-utf-8",
  "invalid-charset-fallback",
]);

const BATCH_JOB_STATUS = new Set([
  "running",
  "completed",
  "completed_with_unknown",
  "stopped",
  "interrupted",
]);

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const JOB_ID_RE = /^[a-f0-9]{64}$/;

const EXTRACT_KEYS = Object.freeze([
  "ok",
  "requestedUrl",
  "finalUrl",
  "url",
  "status",
  "sourceOk",
  "error",
  "contentType",
  "title",
  "description",
  "canonical",
  "lang",
  "openGraph",
  "twitter",
  "jsonLd",
  "headings",
  "links",
  "text",
  "aiReadiness",
  "capture",
  "fetchedAt",
]);

const READ_KEYS = Object.freeze([
  "ok",
  "requestedUrl",
  "finalUrl",
  "url",
  "status",
  "sourceOk",
  "error",
  "title",
  "markdown",
  "wordCount",
  "truncated",
  "capture",
  "fetchedAt",
]);

const BATCH_REQUIRED = Object.freeze([
  "ok",
  "product",
  "schemaVersion",
  "quote",
  "jobId",
  "jobStatus",
  "stopReason",
  "partial",
  "sources",
  "accounting",
  "costInputs",
  "charged",
  "boundary",
]);

export function contractNameForResource(resource) {
  if (resource === RESOURCES.EXTRACT) return EXTRACT_CONTRACT;
  if (resource === RESOURCES.READ) return READ_CONTRACT;
  if (resource === RESOURCES.EXTRACT_BATCH) return EXTRACT_BATCH_CONTRACT;
  return null;
}

export function parseJsonBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return { ok: false, reason: "missing_body", value: null };
  }
  let text;
  try {
    text = Buffer.from(bytes).toString("utf8");
  } catch {
    return { ok: false, reason: "malformed_body", value: null };
  }
  if (!text.trim()) {
    return { ok: false, reason: "missing_body", value: null };
  }
  try {
    return { ok: true, reason: null, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "malformed_body", value: null };
  }
}

export function checkDeclaredContract(resource, value) {
  if (resource === RESOURCES.EXTRACT) return checkExtract(value);
  if (resource === RESOURCES.READ) return checkRead(value);
  if (resource === RESOURCES.EXTRACT_BATCH) return checkBatch(value);
  return fail(1, 0, "unsupported_resource");
}

function checkExtract(value) {
  const errors = [];
  if (!isPlainObject(value)) return fail(1, 0, "not_object");
  rejectUnknownKeys(value, EXTRACT_KEYS, errors);
  requireKeys(value, EXTRACT_KEYS, errors);
  if (value.ok !== true) errors.push("ok_not_true");
  expectString(value.requestedUrl, "requestedUrl", errors);
  expectString(value.finalUrl, "finalUrl", errors);
  expectString(value.url, "url", errors);
  expectInt(value.status, "status", errors);
  if (typeof value.sourceOk !== "boolean") errors.push("sourceOk");
  checkErrorField(value.error, errors);
  if (value.contentType !== null && typeof value.contentType !== "string") errors.push("contentType");
  expectString(value.title, "title", errors);
  expectNullableString(value.description, "description", errors);
  expectNullableString(value.canonical, "canonical", errors);
  expectNullableString(value.lang, "lang", errors);
  expectStringRecord(value.openGraph, "openGraph", errors);
  expectStringRecord(value.twitter, "twitter", errors);
  if (!Array.isArray(value.jsonLd)) errors.push("jsonLd");
  checkHeadings(value.headings, errors);
  if (!isStringArray(value.links)) errors.push("links");
  expectString(value.text, "text", errors);
  checkAiReadiness(value.aiReadiness, errors);
  checkCapture(value.capture, errors);
  if (typeof value.fetchedAt !== "string" || !DATETIME_RE.test(value.fetchedAt)) {
    errors.push("fetchedAt");
  }
  return result(errors, EXTRACT_KEYS.filter((key) => Object.hasOwn(value, key)).length);
}

function checkRead(value) {
  const errors = [];
  if (!isPlainObject(value)) return fail(1, 0, "not_object");
  rejectUnknownKeys(value, READ_KEYS, errors);
  requireKeys(value, READ_KEYS, errors);
  if (value.ok !== true) errors.push("ok_not_true");
  expectString(value.requestedUrl, "requestedUrl", errors);
  expectString(value.finalUrl, "finalUrl", errors);
  expectString(value.url, "url", errors);
  expectInt(value.status, "status", errors);
  if (typeof value.sourceOk !== "boolean") errors.push("sourceOk");
  checkErrorField(value.error, errors);
  expectString(value.title, "title", errors);
  expectString(value.markdown, "markdown", errors);
  if (!Number.isInteger(value.wordCount) || value.wordCount < 0) errors.push("wordCount");
  if (typeof value.truncated !== "boolean") errors.push("truncated");
  checkCapture(value.capture, errors);
  if (typeof value.fetchedAt !== "string" || !DATETIME_RE.test(value.fetchedAt)) {
    errors.push("fetchedAt");
  }
  return result(errors, READ_KEYS.filter((key) => Object.hasOwn(value, key)).length);
}

function checkBatch(value) {
  const errors = [];
  if (!isPlainObject(value)) return fail(1, 0, "not_object");
  requireKeys(value, BATCH_REQUIRED, errors);
  if (typeof value.ok !== "boolean") errors.push("ok");
  if (value.product !== "samedaydesk-extract-batch") errors.push("product");
  if (value.schemaVersion !== EXTRACT_BATCH_CONTRACT) errors.push("schemaVersion");
  if (!isPlainObject(value.quote) || value.quote.amountAtomic !== "10000" || value.quote.displayUsdc !== "0.01") {
    errors.push("quote");
  }
  if (typeof value.jobId !== "string" || !JOB_ID_RE.test(value.jobId)) errors.push("jobId");
  if (!BATCH_JOB_STATUS.has(value.jobStatus)) errors.push("jobStatus");
  if (value.stopReason !== null && typeof value.stopReason !== "string") errors.push("stopReason");
  if (typeof value.partial !== "boolean") errors.push("partial");
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 5) {
    errors.push("sources");
  }
  if (!isPlainObject(value.accounting)) errors.push("accounting");
  if (!isPlainObject(value.costInputs)) errors.push("costInputs");
  if (typeof value.charged !== "boolean") errors.push("charged");
  if (!isPlainObject(value.boundary)) errors.push("boundary");
  return result(errors, BATCH_REQUIRED.filter((key) => Object.hasOwn(value, key)).length);
}

function checkCapture(capture, errors) {
  if (!isPlainObject(capture)) {
    errors.push("capture");
    return;
  }
  if (capture.method !== "http-get-no-javascript") errors.push("capture.method");
  if (capture.javascriptExecuted !== false) errors.push("capture.javascriptExecuted");
  if (!Number.isInteger(capture.maxBodyBytes)) errors.push("capture.maxBodyBytes");
  if (capture.textExcerptLimitChars !== null && !Number.isInteger(capture.textExcerptLimitChars)) {
    errors.push("capture.textExcerptLimitChars");
  }
  if (capture.markdownLimitChars !== null && !Number.isInteger(capture.markdownLimitChars)) {
    errors.push("capture.markdownLimitChars");
  }
  if (!Number.isInteger(capture.bodyBytes) || capture.bodyBytes < 0) errors.push("capture.bodyBytes");
  if (typeof capture.bodyTruncated !== "boolean") errors.push("capture.bodyTruncated");
  if (typeof capture.textTruncated !== "boolean") errors.push("capture.textTruncated");
  if (capture.charset !== null && typeof capture.charset !== "string") errors.push("capture.charset");
  if (!CHARSET_SOURCES.has(capture.charsetSource)) errors.push("capture.charsetSource");
}

function checkErrorField(error, errors) {
  if (error === null) return;
  if (!isPlainObject(error) || typeof error.code !== "string" || typeof error.message !== "string") {
    errors.push("error");
  }
}

function checkHeadings(headings, errors) {
  if (!isPlainObject(headings) || !isStringArray(headings.h1) || !isStringArray(headings.h2)) {
    errors.push("headings");
  }
}

function checkAiReadiness(ai, errors) {
  if (!isPlainObject(ai)) {
    errors.push("aiReadiness");
    return;
  }
  for (const key of ["hasJsonLd", "hasOpenGraph", "hasTitle", "hasDescription", "hasCanonical"]) {
    if (typeof ai[key] !== "boolean") errors.push(`aiReadiness.${key}`);
  }
  if (!Array.isArray(ai.schemaTypes)) errors.push("aiReadiness.schemaTypes");
}

function rejectUnknownKeys(value, allowed, errors) {
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) errors.push(`extra:${key}`);
  }
}

function requireKeys(value, keys, errors) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(`missing:${key}`);
  }
}

function expectString(value, name, errors) {
  if (typeof value !== "string") errors.push(name);
}

function expectNullableString(value, name, errors) {
  if (value !== null && typeof value !== "string") errors.push(name);
}

function expectInt(value, name, errors) {
  if (!Number.isInteger(value)) errors.push(name);
}

function expectStringRecord(value, name, errors) {
  if (!isPlainObject(value)) {
    errors.push(name);
    return;
  }
  for (const item of Object.values(value)) {
    if (typeof item !== "string") errors.push(name);
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(schemaErrors, requiredPresent, code) {
  return {
    ok: false,
    schemaErrors: bound(schemaErrors),
    requiredPresent: bound(requiredPresent),
    codes: [code],
  };
}

function result(errors, requiredPresent) {
  return {
    ok: errors.length === 0,
    schemaErrors: bound(errors.length),
    requiredPresent: bound(requiredPresent),
    codes: errors.slice(0, 16),
  };
}

export function boundCounter(value) {
  return bound(value);
}

function bound(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, Math.trunc(n));
}
