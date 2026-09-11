import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { sha256Bytes } from "./digest.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function siblingSampleMarker(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n)) || null;
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

/**
 * Labeled SAMPLE trees are directories that contain SAMPLE.txt (or SAMPLE.*).
 * samples/openapi/a is the F13 journey caller set and is NOT a labeled SAMPLE
 * tree (no SAMPLE marker). Do not treat its hashes as customer-SAMPLE.
 */
export function collectLabeledSampleDigests(root) {
  const digests = new Map();
  if (!root || !existsSync(root)) return digests;

  function visit(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = entries.map((e) => e.name);
    const labeled = names.some((n) => /^SAMPLE(\.|$)/i.test(n) || /\.SAMPLE\./i.test(n));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!labeled) continue;
      if (/^SAMPLE(\.|$)/i.test(entry.name)) continue;
      try {
        const buf = readFileSync(full);
        digests.set(sha256Bytes(buf), relative(root, full));
      } catch {
        /* unreadable */
      }
    }
  }

  visit(root);
  return digests;
}

export function inspectSample(request, { kitRoot = null, extraLabeledDigests = null } = {}) {
  const reasons = [];
  if (request?.example === true || request?.example === "true") {
    reasons.push("example-flag");
  }

  const labeled = extraLabeledDigests || new Map();

  for (const input of request?.inputs || []) {
    const flag = input.flag || input.key || "input";
    const filePath = input.resolvedPath || input.path;
    if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
      const abs = resolve(filePath);
      if (siblingSampleMarker(abs)) reasons.push(`sibling-marker:${flag}`);
      try {
        const text = readFileSync(abs, "utf8");
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const hits = [];
            walkJsonSampleHits(JSON.parse(text), hits);
            if (hits.length) reasons.push(`json-sample-label:${flag}`);
          } catch {
            /* not json */
          }
        }
        if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
          reasons.push(`labelled-sample-text:${flag}`);
        }
      } catch {
        /* unreadable */
      }
    }
    const sha = String(input.sha256 || "").toLowerCase();
    if (sha && labeled.has(sha)) {
      reasons.push(`sample-hash-claimed-as-customer:${flag}:${labeled.get(sha)}`);
    }
  }

  if (kitRoot) {
    const kitLabeled = collectLabeledSampleDigests(join(kitRoot, "samples"));
    for (const input of request?.inputs || []) {
      const sha = String(input.sha256 || "").toLowerCase();
      const flag = input.flag || "input";
      if (sha && kitLabeled.has(sha)) {
        reasons.push(`sample-hash-claimed-as-customer:${flag}:${kitLabeled.get(sha)}`);
      }
    }
  }

  const unique = [...new Set(reasons)];
  return { sample: unique.length > 0, reasons: unique };
}
