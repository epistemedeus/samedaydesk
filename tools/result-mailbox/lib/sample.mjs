import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isPlainObject } from "./errors.mjs";

function walkJsonSampleHits(value, into) {
  if (typeof value === "string") return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonSampleHits(item, into);
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  if (value.sampleLabel === "explicit-example") into.push("explicit-example");
  for (const child of Object.values(value)) walkJsonSampleHits(child, into);
}

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
}

export function inspectSample({ example = false, files = [], engineJson = null, envelope = null } = {}) {
  const reasons = [];
  if (example === true) reasons.push("example-flag");
  if (envelope?.sample === true) reasons.push("envelope-sample");
  if (engineJson?.caller?.exampleMode === true) reasons.push("engine-exampleMode");
  if (engineJson?.caller?.sampleLabel === "explicit-example") reasons.push("engine-explicit-example");
  for (const filePath of files) {
    if (!filePath || typeof filePath !== "string") continue;
    const abs = resolve(filePath);
    if (!existsSync(abs)) continue;
    if (siblingSampleMarker(abs)) reasons.push(`sibling-marker:${filePath}`);
    try {
      const text = readFileSync(abs, "utf8");
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const hits = [];
          walkJsonSampleHits(JSON.parse(text), hits);
          if (hits.length) reasons.push(`json-sample-label:${filePath}`);
        } catch {
          /* not json */
        }
      }
    } catch {
      /* unreadable */
    }
  }
  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

export function sampleBlocksBuyerDelivery(sample, deliveredToBuyer) {
  return Boolean(sample) && deliveredToBuyer === true;
}
