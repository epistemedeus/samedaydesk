import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { OWNED_DIR } from "./pins.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkSampleHits(value, into) {
  if (typeof value === "string") {
    if (/^SAMPLE\b/i.test(value) || value === "SAMPLE") into.push("string-SAMPLE");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkSampleHits(item, into);
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  for (const child of Object.values(value)) walkSampleHits(child, into);
}

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  return readdirSync(dir).find((name) => /^SAMPLE(\.|$)/i.test(name) || /\.SAMPLE\./i.test(name)) || null;
}

/**
 * SAMPLE / --example cannot become customer_owned: true.
 */
export function inspectSample(request, { caseObject = null, casePath = null, kitRoot = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") reasons.push("example-flag");

  const files = [];
  if (casePath) files.push(casePath);
  if (caseObject?.jobs) {
    for (const job of caseObject.jobs) {
      if (job?.in) files.push(resolve(dirname(casePath || OWNED_DIR), job.in));
    }
  }

  for (const filePath of files) {
    const abs = resolve(filePath);
    if (!existsSync(abs)) continue;
    if (siblingSampleMarker(abs)) reasons.push("sibling-marker");
    if (kitRoot) {
      const rel = relative(resolve(kitRoot), abs);
      if (rel && !rel.startsWith("..") && (rel === "samples" || rel.startsWith("samples/"))) {
        reasons.push("kit-samples-path");
      }
    }
    try {
      const text = readFileSync(abs, "utf8");
      if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
        reasons.push("labelled-sample-text");
      }
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const hits = [];
        walkSampleHits(JSON.parse(text), hits);
        if (hits.length) reasons.push("json-sample-label");
      }
    } catch {
      /* unreadable or non-json */
    }
  }

  if (caseObject) {
    const hits = [];
    walkSampleHits(caseObject, hits);
    if (hits.length) reasons.push("json-sample-label");
    if (caseObject.label === "SAMPLE" || caseObject.evidenceClass === "sample") {
      reasons.push("case-label-SAMPLE");
    }
  }

  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

export function sampleCustomerOwnedRejected(sample, customerOwned) {
  return Boolean(sample && customerOwned);
}

export const EXAMPLE_FIXTURE = join(OWNED_DIR, "fixtures/example-sample.json");
