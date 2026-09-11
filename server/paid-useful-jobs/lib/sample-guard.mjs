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

function collectTextSampleHits(text, key, reasons) {
  if (typeof text !== "string") return;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const hits = [];
      walkJsonSampleHits(JSON.parse(trimmed), hits);
      if (hits.length) reasons.push(`json-sample-label:${key}`);
    } catch {
      /* not json */
    }
  }
  if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
    reasons.push(`labelled-sample-text:${key}`);
  }
}

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
}

/**
 * Detect SAMPLE / --example inputs. Caller-supplied copies without markers
 * are not treated as samples even if they happen to share bytes with a kit fixture.
 */
function noteKitAndSibling(key, sourcePath, kitRoot, reasons) {
  if (!sourcePath) return;
  const abs = resolve(sourcePath);
  if (existsSync(abs) && siblingSampleMarker(abs)) reasons.push(`sibling-marker:${key}`);
  if (kitRoot) {
    const rel = relative(resolve(kitRoot), abs);
    if (rel && !rel.startsWith("..") && (rel === "samples" || rel.startsWith(`samples/`))) {
      reasons.push(`kit-samples-path:${key}`);
    }
  }
}

/**
 * Detect SAMPLE / --example inputs. When `entries` from materialize are
 * provided, file *content* is read from staged copies (inspected === executed).
 * Kit/sibling provenance still uses the original sourcePath.
 */
export function inspectSample(request, { kitRoot = null, entries = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") {
    reasons.push("example-flag");
  }
  const inputs = request?.inputs && typeof request.inputs === "object" ? request.inputs : {};
  const entryByName = new Map((entries || []).map((e) => [e.name, e]));
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false || value === "") continue;
    const entry = entryByName.get(key);
    if (entry?.kind === "directory") {
      noteKitAndSibling(key, entry.sourcePath || value, kitRoot, reasons);
      continue;
    }
    if (entry?.stagedPath && existsSync(entry.stagedPath)) {
      noteKitAndSibling(key, entry.sourcePath || (typeof value === "string" ? value : null), kitRoot, reasons);
      try {
        collectTextSampleHits(readFileSync(entry.stagedPath, "utf8"), key, reasons);
      } catch {
        /* unreadable */
      }
      continue;
    }
    if (typeof value === "string") {
      const abs = resolve(value);
      if (existsSync(abs)) {
        noteKitAndSibling(key, abs, kitRoot, reasons);
        try {
          collectTextSampleHits(readFileSync(abs, "utf8"), key, reasons);
        } catch {
          /* unreadable */
        }
      } else {
        collectTextSampleHits(value, key, reasons);
      }
    } else if (isPlainObject(value) || Array.isArray(value)) {
      const hits = [];
      walkJsonSampleHits(value, hits);
      if (hits.length) reasons.push(`json-sample-label:${key}`);
    }
  }
  const unique = [...new Set(reasons)];
  return {
    sample: unique.length > 0,
    reasons: unique,
  };
}

export function wantsLiveSale(request) {
  const intent = request?.fundingIntent || request?.funding;
  return (
    intent === "live-sale" ||
    intent === "sale" ||
    request?.settle === true ||
    request?.sold === true ||
    request?.liveSettle === true
  );
}
