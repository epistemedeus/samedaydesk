import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalize, fingerprint } from "./canonical.mjs";
import { sha256Bytes } from "./hash.mjs";

const SAMPLE_SIDECARS = ["SAMPLE.txt", "SAMPLE.md", "SAMPLE"];

const KNOWN_SAMPLE_RELS = [
  "tools/lockfile-pin-delta/fixtures/journey/before.json",
  "tools/lockfile-pin-delta/fixtures/journey/after.json",
  "tools/lockfile-pin-delta/fixtures/sample-as-customer/before.json",
  "tools/lockfile-pin-delta/fixtures/sample-as-customer/after.json",
  "server/paid-useful-jobs/release/public-samples/lockfile/h04-pub-lock-01/before.json",
  "server/paid-useful-jobs/release/public-samples/lockfile/h04-pub-lock-01/after.json",
];

function tryParseJson(buf) {
  try {
    return JSON.parse(Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf));
  } catch {
    return undefined;
  }
}

function canonicalFingerprint(value) {
  try {
    return fingerprint(value);
  } catch {
    return null;
  }
}

function walkSampleLabels(value, into) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkSampleLabels(item, into);
    return;
  }
  if (value.name === "SAMPLE") into.push("root-or-nested-name-SAMPLE");
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  for (const child of Object.values(value)) walkSampleLabels(child, into);
}

function sidecarHit(filePath) {
  if (!filePath) return null;
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  return names.find((n) => SAMPLE_SIDECARS.includes(n) || /^SAMPLE(\.|$)/i.test(n)) || null;
}

function extractChallengeExamples(repoRoot, ownedRemote) {
  const out = [];
  const challengePath = join(ownedRemote, "lockfile-challenge.json");
  if (!existsSync(challengePath)) return out;
  try {
    const challenge = JSON.parse(readFileSync(challengePath, "utf8"));
    const body = challenge?.accepts?.[0]?.outputSchema?.input?.body;
    if (body?.before) out.push({ source: "merchant-openapi-example-before", value: body.before });
    if (body?.after) out.push({ source: "merchant-openapi-example-after", value: body.after });
    const example = challenge?.accepts?.[0]?.outputSchema?.output?.example;
    if (example?.charged === true) {
      out.push({ source: "merchant-illustrative-charged-output", value: example, notCallerInput: true });
    }
  } catch {
    /* capture remains hosted evidence even if example extraction fails */
  }
  void repoRoot;
  return out;
}

/**
 * Bounded detector: known imported sample objects (canonical JSON), SAMPLE
 * metadata/sidecars, and explicit --example. Not a general plagiarism scan.
 * Owner-authored CW69 fixtures are not in the known-sample set.
 */
export function loadKnownSampleIndex(repoRoot, ownedRemote) {
  const byCanonical = new Map();
  for (const rel of KNOWN_SAMPLE_RELS) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    const parsed = tryParseJson(buf);
    if (parsed === undefined) continue;
    const fp = canonicalFingerprint(parsed);
    if (!fp) continue;
    const list = byCanonical.get(fp) || [];
    list.push({ rel, sha256: sha256Bytes(buf), bytes: buf.length });
    byCanonical.set(fp, list);
  }
  for (const extra of extractChallengeExamples(repoRoot, ownedRemote)) {
    if (extra.notCallerInput) continue;
    const fp = canonicalFingerprint(extra.value);
    if (!fp) continue;
    const list = byCanonical.get(fp) || [];
    list.push({ rel: extra.source, sha256: fingerprint(extra.value), bytes: null });
    byCanonical.set(fp, list);
  }
  return { byCanonical, algorithm: "canonical-json-sha256" };
}

export function inspectCallerSample({
  beforePath,
  afterPath,
  beforeBytes,
  afterBytes,
  example = false,
  known,
}) {
  const reasons = [];
  if (example === true || example === "true") reasons.push("example-flag");

  const files = [
    { key: "before", path: beforePath, bytes: beforeBytes },
    { key: "after", path: afterPath, bytes: afterBytes },
  ];

  for (const file of files) {
    const buf = file.bytes || (file.path && existsSync(file.path) ? readFileSync(file.path) : null);
    if (!buf) continue;
    const parsed = tryParseJson(buf);
    if (parsed && typeof parsed === "object") {
      const labels = [];
      walkSampleLabels(parsed, labels);
      if (labels.length) reasons.push(`${file.key}:${[...new Set(labels)].join(",")}`);
      const fp = canonicalFingerprint(parsed);
      const hits = fp && known?.byCanonical.get(fp);
      if (hits?.length) {
        reasons.push(`${file.key}:known-sample:${hits[0].rel}`);
      }
    }
    const text = buf.toString("utf8");
    if (/<!--\s*SAMPLE fixture/i.test(text) || /^SAMPLE - not a customer/m.test(text)) {
      reasons.push(`${file.key}:labelled-sample-text`);
    }
    const side = sidecarHit(file.path);
    if (side) reasons.push(`${file.key}:sidecar:${side}`);
    if (file.path && /sample/i.test(String(file.path).split(/[/\\]/).pop())) {
      reasons.push(`${file.key}:filename-sample`);
    }
  }

  const unique = [...new Set(reasons)];
  return {
    sample: unique.length > 0,
    reasons: unique,
    detector: {
      bounded: true,
      algorithm: "canonical-json-sha256+metadata+sidecar+example-flag",
      knownSampleCount: known?.byCanonical.size ?? 0,
      note: "Renamed or reformatted copies of known samples match. Unrelated caller lockfiles are not samples.",
    },
  };
}

export function merchantExampleIsNotExecution(challenge) {
  const example = challenge?.accepts?.[0]?.outputSchema?.output?.example;
  return {
    present: Boolean(example),
    chargedField: example?.charged === true,
    authority: false,
    note: "OpenAPI/x402 example output with charged:true is advertised illustration, not execution, payment, or settlement.",
  };
}
