import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTrue(value) {
  return value === true || value === "true";
}

function walkJsonSampleHits(value, into) {
  if (typeof value === "string") return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonSampleHits(item, into);
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  for (const child of Object.values(value)) walkJsonSampleHits(child, into);
}

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
}

/**
 * W2-06 / F08 honesty import: SAMPLE/--example is never commissioned customer work.
 */
export function inspectSample(request, { kitRoot = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") reasons.push("example-flag");
  if (request?.demo === true || request?.demo === "true") reasons.push("demo-flag");
  if (typeof request?.completionLabel === "string" && /demo|sample|fixture/i.test(request.completionLabel)) {
    reasons.push("demo-completion-label");
  }

  const files = [];
  if (typeof request?.input === "string") files.push(["input", request.input]);
  const inputs = request?.inputs && typeof request.inputs === "object" ? request.inputs : {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === "string") files.push([key, value]);
  }

  for (const [key, value] of files) {
    const abs = resolve(value);
    if (!existsSync(abs)) continue;
    if (siblingSampleMarker(abs)) reasons.push(`sibling-marker:${key}`);
    if (kitRoot) {
      const rel = relative(resolve(kitRoot), abs);
      if (rel && !rel.startsWith("..") && (rel === "samples" || rel.startsWith("samples/"))) {
        reasons.push(`kit-samples-path:${key}`);
      }
    }
    try {
      const text = readFileSync(abs, "utf8");
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const hits = [];
          walkJsonSampleHits(JSON.parse(text), hits);
          if (hits.length) reasons.push(`json-sample-label:${key}`);
        } catch {
          /* not json */
        }
      }
      if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text) || /^SAMPLE \(not a customer\)/m.test(text)) {
        reasons.push(`labelled-sample-text:${key}`);
      }
    } catch {
      /* unreadable */
    }
  }

  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

export function wantsCommissionedCustomer(request) {
  return (
    isTrue(request?.commissionedCustomer) ||
    isTrue(request?.sold) ||
    isTrue(request?.customerCommission) ||
    request?.fundingIntent === "live-sale" ||
    request?.fundingIntent === "sale" ||
    request?.completionLabel === "commissioned-customer" ||
    request?.completionLabel === "actual_completion"
  );
}

export function payingMaintainerClaim(request) {
  const value = request?.payingMaintainer;
  if (isTrue(value)) return { claimed: true, path: "payingMaintainer" };
  if (isPlainObject(value) && (isTrue(value.pays) || isTrue(value.paid) || isTrue(value.paying))) {
    return { claimed: true, path: "payingMaintainer" };
  }
  if (isTrue(request?.inventedMaintainer) || isTrue(request?.customerPays)) {
    return { claimed: true, path: "inventedMaintainer" };
  }
  if (isPlainObject(request?.maintainer) && (isTrue(request.maintainer.paying) || isTrue(request.maintainer.pays))) {
    return { claimed: true, path: "maintainer.paying" };
  }
  return { claimed: false, path: null };
}

export function extractPriceMutation(request) {
  const candidates = [
    ["liveExtractPriceUsdc", request?.liveExtractPriceUsdc],
    ["extractPrice", request?.extractPrice],
    ["mcpPriceUsd", request?.mcpPriceUsd],
    ["extract.price", request?.extract?.price],
  ];
  for (const [path, value] of candidates) {
    if (value == null || value === false || value === "") continue;
    const normalized = String(value).replace(/^\$/, "");
    if (normalized !== "0.005" && normalized !== "5000") {
      return { mutated: true, path, value };
    }
  }
  return { mutated: false, path: null, value: null };
}

export function wantsF08Wrappers(request) {
  return (
    isTrue(request?.useF08Wrappers) ||
    isTrue(request?.viaF08) ||
    isTrue(request?.rewriteF08) ||
    isTrue(request?.touchF08) ||
    request?.engine === "paid-useful-jobs" ||
    typeof request?.f08Wrapper === "string"
  );
}
