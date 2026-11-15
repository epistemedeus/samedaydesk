import { createHash } from "node:crypto";

const GRAPHQL_PATH = /^data(?:\.[A-Za-z0-9_-]+){1,8}$/;

function fail(message) {
  throw new Error(message);
}

function canonicalValue(value, depth = 0) {
  if (depth > 20) fail("request JSON exceeds maximum depth");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("request JSON contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, depth + 1));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("request JSON must contain only plain JSON values");
  }
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (!key || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) fail("request JSON key is invalid");
    result[key] = canonicalValue(value[key], depth + 1);
  }
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function jsonBodySha256(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function normalizeRequestContract(value, { maximumBytes = 100_000 } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("request contract is required");
  const method = String(value.method || "").trim().toUpperCase();
  if (!new Set(["GET", "POST"]).has(method)) fail("request method is unsupported");
  if (method === "GET") {
    if (value.body !== undefined && value.body !== null) fail("GET request contract cannot contain a body");
    if (value.graphql !== undefined && value.graphql !== null) fail("GET request contract cannot contain a GraphQL contract");
    if (value.openapi !== undefined && value.openapi !== null) fail("GET request contract cannot contain an OpenAPI request contract");
    return { method: "GET", mediaType: null, body: null, bodyBytes: 0, bodySha256: null };
  }
  const mediaType = String(value.mediaType || "application/json").trim().toLowerCase();
  if (mediaType !== "application/json") fail("POST request contract requires application/json");
  if (!value.body || typeof value.body !== "object" || Array.isArray(value.body)) {
    fail("POST request contract requires one JSON object body");
  }
  const effect = String(value.effect || "").trim().toLowerCase();
  if (effect !== "read_only") {
    fail("POST request contract requires an explicit read_only effect; state-changing POST needs a separate idempotent-write workflow");
  }
  const body = canonicalValue(value.body);
  const canonical = JSON.stringify(body);
  const bodyBytes = Buffer.byteLength(canonical);
  const maximum = Number(maximumBytes);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1_000_000) fail("request byte ceiling is invalid");
  if (bodyBytes < 2 || bodyBytes > maximum) fail("request JSON exceeds the byte ceiling");
  let graphql = null;
  if (value.graphql !== undefined && value.graphql !== null) {
    if (!value.graphql || typeof value.graphql !== "object" || Array.isArray(value.graphql)) {
      fail("GraphQL request contract must be an object");
    }
    let schemaUrl;
    try {
      schemaUrl = new URL(value.graphql.schemaUrl);
    } catch {
      fail("GraphQL schema URL must be valid");
    }
    if (schemaUrl.protocol !== "https:" || schemaUrl.username || schemaUrl.password || schemaUrl.hash) {
      fail("GraphQL schema URL must be credential-free HTTPS without a fragment");
    }
    const selectedPaths = [...new Set((Array.isArray(value.graphql.selectedPaths) ? value.graphql.selectedPaths : [])
      .map((path) => String(path).trim()))].sort();
    if (!selectedPaths.length || selectedPaths.length > 16 || selectedPaths.some((path) => !GRAPHQL_PATH.test(path))) {
      fail("GraphQL selectedPaths must contain 1 to 16 safe data-prefixed dotted paths");
    }
    graphql = { schemaUrl: schemaUrl.toString(), selectedPaths };
  }
  let openapi = null;
  if (value.openapi !== undefined && value.openapi !== null) {
    if (graphql) fail("POST request contract must choose GraphQL or OpenAPI request validation");
    if (!value.openapi || typeof value.openapi !== "object" || Array.isArray(value.openapi)) {
      fail("OpenAPI request contract must be an object");
    }
    let documentUrl;
    try {
      documentUrl = new URL(value.openapi.documentUrl);
    } catch {
      fail("OpenAPI document URL must be valid");
    }
    if (documentUrl.protocol !== "https:" || documentUrl.username || documentUrl.password || documentUrl.hash) {
      fail("OpenAPI document URL must be credential-free HTTPS without a fragment");
    }
    openapi = { documentUrl: documentUrl.toString() };
  }
  return {
    method: "POST",
    mediaType,
    effect,
    body,
    bodyBytes,
    bodySha256: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    ...(graphql ? { graphql } : {}),
    ...(openapi ? { openapi } : {}),
  };
}

export function publicRequestBinding(contract) {
  const normalized = normalizeRequestContract(contract);
  return {
    method: normalized.method,
    mediaType: normalized.mediaType,
    ...(normalized.method === "POST" ? { effect: normalized.effect } : {}),
    bodyBytes: normalized.bodyBytes,
    bodySha256: normalized.bodySha256,
    ...(normalized.graphql ? { graphql: structuredClone(normalized.graphql) } : {}),
    ...(normalized.openapi ? { openapi: structuredClone(normalized.openapi) } : {}),
  };
}

export function assertRequestBody(contract, bodyValue) {
  const normalized = normalizeRequestContract(contract);
  if (normalized.method !== "POST") fail("request body is valid only for POST");
  const candidate = normalizeRequestContract({ method: "POST", mediaType: normalized.mediaType, effect: normalized.effect, body: bodyValue });
  if (candidate.bodySha256 !== normalized.bodySha256 || candidate.bodyBytes !== normalized.bodyBytes) {
    fail("request body does not match the authorized SHA-256 binding");
  }
  return canonicalJson(candidate.body);
}
