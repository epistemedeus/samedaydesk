import { existsSync, readdirSync } from "node:fs";
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

function inspectText(text, key, reasons) {
  if (typeof text !== "string" || !text) return;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const hits = [];
      walkJsonSampleHits(JSON.parse(trimmed), hits);
      for (const hit of hits) reasons.push(`${hit}:${key}`);
    } catch {
      /* not json */
    }
  }
  if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
    reasons.push(`labelled-sample-text:${key}`);
  }
}

/**
 * Inspect SAMPLE provenance on staged bytes (and original file paths).
 * Inline JSON strings are inspected from their staged text, which is the
 * D01 inspectSample gap at aeef964f (string JSON is treated as a missing path).
 */
export function inspectStagedSample({ example = false, staged = [] } = {}, { kitRoot = null } = {}) {
  const reasons = [];
  if (example === true || example === "true") reasons.push("example-flag");

  for (const item of staged) {
    const key = item.key;
    if (item.path && existsSync(item.path)) {
      if (siblingSampleMarker(item.path)) reasons.push(`sibling-marker:${key}`);
      if (kitRoot) {
        const rel = relative(resolve(kitRoot), resolve(item.path));
        if (rel && !rel.startsWith("..") && (rel === "samples" || rel.startsWith(`samples/`))) {
          reasons.push(`kit-samples-path:${key}`);
        }
      }
    }
    const text = item.text != null ? String(item.text) : item.buffer ? item.buffer.toString("utf8") : "";
    inspectText(text, key, reasons);
  }

  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}

/**
 * Optional consume of D01 inspectSample. File-path request shape only.
 * Inline JSON strings at the tested pin are known not to be detected there.
 */
export async function consumeD01InspectSample(request, d01Root) {
  if (!d01Root) return null;
  const { pathToFileURL } = await import("node:url");
  const abs = resolve(String(d01Root), "lib/sample-guard.mjs");
  const mod = await import(pathToFileURL(abs).href);
  if (typeof mod.inspectSample !== "function") {
    throw new Error("d01-root sample-guard.mjs does not export inspectSample");
  }
  return mod.inspectSample(request);
}
