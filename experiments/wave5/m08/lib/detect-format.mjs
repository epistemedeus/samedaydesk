const HTML_RE = /^\s*(<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i;
const YAML_EXT = /\.(ya?ml)$/i;
const CSV_EXT = /\.csv$/i;
const JS_EXT = /\.(m?js|cjs)$/i;
const TS_EXT = /\.(tsx?|jsx)$/i;
const PY_EXT = /\.py$/i;
const NEXT_SEGMENT = /\[[^\]]+\]/;
const EXPRESS_PARAM = /(^|\/):[A-Za-z_][A-Za-z0-9_]*/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function extensionOf(locator = "") {
  const path = String(locator).split("?")[0];
  const base = path.split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

export function looksLikeHtml(text) {
  return HTML_RE.test(String(text || ""));
}

export function isHttpLocator(locator) {
  return typeof locator === "string" && /^https?:\/\//i.test(locator);
}

export function classifyHttpLocator(locator) {
  let parsed;
  try {
    parsed = new URL(locator);
  } catch {
    return { format: "invalid-url", supported: false };
  }
  if (parsed.protocol === "https:") {
    return { format: "https-url", supported: false, url: parsed.href };
  }
  if (parsed.protocol !== "http:") {
    return { format: "external-url", supported: false, url: parsed.href };
  }
  if (!LOOPBACK.has(parsed.hostname)) {
    return { format: "external-http", supported: false, url: parsed.href };
  }
  return { format: "loopback-http", supported: true, url: parsed.href };
}

function classifyRecords(records) {
  if (!Array.isArray(records)) return "unknown-json";
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const path = typeof record.path === "string" ? record.path : "";
    if (NEXT_SEGMENT.test(path)) return "nextjs";
    if (EXPRESS_PARAM.test(path)) return "express-path-params";
    if (record.operationId && record.method && !record.canonical) return "openapi-operation";
  }
  return null;
}

function fromJsonDocument(json) {
  if (json && typeof json === "object" && !Array.isArray(json) && (json.openapi || json.swagger)) {
    return { format: "openapi", supported: false };
  }
  if (Array.isArray(json)) {
    const framework = classifyRecords(json);
    if (framework) return { format: framework, supported: false };
    return { format: "raw-array", supported: true };
  }
  if (json && typeof json === "object" && Array.isArray(json.routes)) {
    const framework = classifyRecords(json.routes);
    if (framework) return { format: framework, supported: false };
    return { format: "routes-wrapper", supported: true };
  }
  if (json && typeof json === "object" && Array.isArray(json.catalog)) {
    const framework = classifyRecords(json.catalog);
    if (framework) return { format: framework, supported: false };
    return { format: "catalog-wrapper", supported: true };
  }
  return { format: "unknown-json", supported: false };
}

export function detectFormat({ text, locator = "" }) {
  const loc = String(locator || "");
  if (isHttpLocator(loc)) {
    const http = classifyHttpLocator(loc);
    if (!http.supported) return http;
  }

  const ext = extensionOf(loc);
  const raw = String(text ?? "").replace(/^\uFEFF/, "");

  if (looksLikeHtml(raw)) return { format: "html", supported: false };
  if (YAML_EXT.test(ext)) return { format: "yaml", supported: false };
  if (CSV_EXT.test(ext)) return { format: "csv", supported: false };
  if (JS_EXT.test(ext)) return { format: "javascript", supported: false };
  if (TS_EXT.test(ext)) return { format: "typescript", supported: false };
  if (PY_EXT.test(ext)) return { format: "python", supported: false };

  if (/^\s*(import\s+express\s+from|const\s+\w+\s*=\s*require\(\s*["']express["'])/m.test(raw)) {
    return { format: "javascript", supported: false };
  }
  if (/^\s*from\s+fastapi\s+import|^\s*import\s+fastapi\b/m.test(raw)) {
    return { format: "python", supported: false };
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { format: "non-json", supported: false };
  }

  const detected = fromJsonDocument(json);
  if (isHttpLocator(loc) && detected.supported) {
    return { ...detected, transport: "loopback-http-json" };
  }
  return detected;
}
