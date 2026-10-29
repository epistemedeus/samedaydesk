import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
 * SAMPLE / --example inputs cannot reserve fixture funds or become a sale.
 * Caller files without markers are not samples even if they share bytes with kit fixtures.
 */
export function inspectSample(item, { kitRoot = null } = {}) {
  const reasons = [];
  if (item?.example === true || item?.example === "true") reasons.push("example-flag");
  const files = filesFromItem(item);
  for (const [key, value] of Object.entries(files)) {
    if (value == null || value === false || value === "") continue;
    if (typeof value === "string") {
      const abs = resolve(value);
      if (existsSync(abs)) {
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
          if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
            reasons.push(`labelled-sample-text:${key}`);
          }
        } catch {
          /* unreadable */
        }
      }
    } else if (isPlainObject(value)) {
      const hits = [];
      walkJsonSampleHits(value, hits);
      if (hits.length) reasons.push(`json-sample-label:${key}`);
    }
  }
  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

export function filesFromItem(item) {
  if (item?.files && typeof item.files === "object") return { ...item.files };
  if (item?.inputs && typeof item.inputs === "object") return { ...item.inputs };
  return {};
}

export function wantsLiveSale(item) {
  const intent = item?.fundingIntent || item?.funding;
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    item?.settle === true ||
    item?.sold === true ||
    item?.liveSettle === true
  );
}
