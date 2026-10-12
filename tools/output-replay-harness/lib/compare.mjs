import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "./digest.mjs";
import { NON_IDENTITY_JSON_KEYS } from "./pins.mjs";

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const TIMESTAMP_CHATTER_NAME = /\.(md|markdown|txt)$/i;

export function stripIdentityJson(value) {
  if (Array.isArray(value)) return value.map(stripIdentityJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (NON_IDENTITY_JSON_KEYS.includes(key)) continue;
      out[key] = stripIdentityJson(child);
    }
    return out;
  }
  return value;
}

export function stripTimestampChatter(text) {
  return String(text).replace(ISO_RE, "<timestamp>");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Copy catalog output bytes immediately. Later mutation of the live
 * directory cannot change this capture.
 */
export function captureCatalogOutputs(outDir, outputNames) {
  return outputNames.map((name) => {
    const filePath = join(outDir, name);
    if (!existsSync(filePath)) {
      return { name, exists: false, bytes: null, sha256: null, dir: outDir };
    }
    const bytes = Buffer.from(readFileSync(filePath));
    return {
      name,
      exists: true,
      bytes,
      sha256: sha256Bytes(bytes),
      dir: outDir,
    };
  });
}

function compareCaptured(name, recA, recB) {
  const existsA = Boolean(recA?.exists);
  const existsB = Boolean(recB?.exists);
  if (!existsA || !existsB) {
    return {
      name,
      existsA,
      existsB,
      bytesEqual: false,
      jsonIdentical: false,
      timestampChatterOnly: false,
      missing: true,
      sha256a: recA?.sha256 || null,
      sha256b: recB?.sha256 || null,
    };
  }
  const bufA = recA.bytes;
  const bufB = recB.bytes;
  const bytesEqual = bufA.equals(bufB);
  const row = {
    name,
    existsA,
    existsB,
    bytesEqual,
    jsonIdentical: false,
    timestampChatterOnly: false,
    missing: false,
    sha256a: recA.sha256 || sha256Bytes(bufA),
    sha256b: recB.sha256 || sha256Bytes(bufB),
  };
  if (name.endsWith(".json")) {
    try {
      const ja = stripIdentityJson(JSON.parse(bufA.toString("utf8")));
      const jb = stripIdentityJson(JSON.parse(bufB.toString("utf8")));
      row.jsonIdentical = deepEqual(ja, jb);
      row.timestampChatterOnly = row.jsonIdentical && !bytesEqual;
    } catch {
      row.jsonIdentical = bytesEqual;
    }
    return row;
  }
  if (bytesEqual) return row;
  if (TIMESTAMP_CHATTER_NAME.test(name)) {
    const chatterEqual =
      stripTimestampChatter(bufA.toString("utf8")) === stripTimestampChatter(bufB.toString("utf8"));
    row.timestampChatterOnly = chatterEqual;
  }
  return row;
}

/**
 * Compare catalog output filenames only, from captures or live dirs.
 *
 * JSON identity drops generatedAt. Markdown ISO timestamp chatter is
 * labelled-drift, not proof of equivalent results: other markdown body
 * differences are identity-break.
 */
export function compareCatalogOutputs({ outA, outB, captureA, captureB, outputNames }) {
  const a = captureA || captureCatalogOutputs(outA, outputNames);
  const b = captureB || captureCatalogOutputs(outB, outputNames);
  const files = outputNames.map((name) =>
    compareCaptured(
      name,
      a.find((row) => row.name === name),
      b.find((row) => row.name === name),
    ),
  );
  const jsonFiles = files.filter((f) => f.name.endsWith(".json"));
  const jsonIdentical = jsonFiles.length > 0 && jsonFiles.every((f) => f.jsonIdentical && !f.missing);
  const allBytesEqual = files.length > 0 && files.every((f) => f.bytesEqual && !f.missing);
  const anyMissing = files.some((f) => f.missing);
  const anyJsonBreak = jsonFiles.some((f) => f.missing || !f.jsonIdentical);
  const anyBodyBreak = files.some((f) => {
    if (f.missing || f.name.endsWith(".json") || f.bytesEqual) return false;
    return !f.timestampChatterOnly;
  });

  let classification;
  if (anyMissing || anyJsonBreak || anyBodyBreak) classification = "identity-break";
  else if (allBytesEqual) classification = "identical";
  else classification = "labelled-drift";

  return {
    classification,
    jsonIdentical,
    allBytesEqual,
    files,
    outputNames,
    captured: Boolean(captureA && captureB),
    identityRule:
      "Catalog filenames only. JSON identity drops generatedAt. Markdown timestamp chatter is labelled-drift, not equivalence. Other markdown body differences are identity-break.",
  };
}
