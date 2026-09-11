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
 * D01 inspectSample on this tree also inspects inline JSON strings; this
 * adapter still refuses disguised SAMPLE before bind.
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
 * Optional consume of D01 inspectSample from a paid-useful-jobs dir or repo root.
 */
export async function consumeD01InspectSample(request, d01Root) {
  if (!d01Root) return null;
  const { pathToFileURL } = await import("node:url");
  const { resolveSampleGuardPath } = await import("./d01-bind.mjs");
  const abs = resolveSampleGuardPath(d01Root);
  if (!abs) {
    throw new Error("d01-root does not contain lib/sample-guard.mjs");
  }
  const mod = await import(pathToFileURL(abs).href);
  if (typeof mod.inspectSample !== "function") {
    throw new Error("d01-root sample-guard.mjs does not export inspectSample");
  }
  return mod.inspectSample(request);
}
