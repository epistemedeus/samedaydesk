import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "./digest.mjs";
import { NON_IDENTITY_JSON_KEYS } from "./pins.mjs";

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

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

function compareOne(name, pathA, pathB) {
  const existsA = existsSync(pathA);
  const existsB = existsSync(pathB);
  if (!existsA || !existsB) {
    return {
      name,
      existsA,
      existsB,
      bytesEqual: false,
      jsonIdentical: false,
      timestampChatterOnly: false,
      missing: true,
      sha256a: null,
      sha256b: null,
    };
  }
  const bufA = readFileSync(pathA);
  const bufB = readFileSync(pathB);
  const bytesEqual = bufA.equals(bufB);
  const row = {
    name,
    existsA,
    existsB,
    bytesEqual,
    jsonIdentical: bytesEqual,
    timestampChatterOnly: false,
    missing: false,
    sha256a: sha256Bytes(bufA),
    sha256b: sha256Bytes(bufB),
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
  if (bytesEqual) {
    row.jsonIdentical = true;
    return row;
  }
  const chatterEqual = stripTimestampChatter(bufA.toString("utf8")) === stripTimestampChatter(bufB.toString("utf8"));
  row.timestampChatterOnly = chatterEqual;
  row.jsonIdentical = chatterEqual;
  return row;
}

/**
 * Compare catalog output filenames only.
 *
 * Pinned useful-jobs 1.0.0 writes generatedAt into JSON envelopes. Markdown
 * for api-upgrade-brief is byte-stable. Identity JSON ignores generatedAt.
 * Markdown ISO timestamp chatter is not identity-break when identity JSON
 * matches.
 */
export function compareCatalogOutputs({ outA, outB, outputNames }) {
  const files = outputNames.map((name) => compareOne(name, join(outA, name), join(outB, name)));
  const jsonFiles = files.filter((f) => f.name.endsWith(".json"));
  const jsonIdentical = jsonFiles.length > 0 && jsonFiles.every((f) => f.jsonIdentical && !f.missing);
  const allBytesEqual = files.length > 0 && files.every((f) => f.bytesEqual && !f.missing);
  const anyMissing = files.some((f) => f.missing);
  const anyJsonBreak = jsonFiles.some((f) => f.missing || !f.jsonIdentical);

  let classification;
  if (anyMissing || anyJsonBreak) classification = "identity-break";
  else if (allBytesEqual) classification = "identical";
  else classification = "labelled-drift";

  return {
    classification,
    jsonIdentical,
    allBytesEqual,
    files,
    outputNames,
    identityRule:
      "Catalog filenames only. JSON identity drops generatedAt. Markdown timestamp chatter is not identity-break when identity JSON matches.",
  };
}
