import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FIXTURES, runJob, runMode } from "../adapter.mjs";
import { witness } from "../witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
const KIT_BYTES = 2575215;
const COMMIT = "61a7a341f2533d6e084c48c88463da63f05e1af0";
const BEFORE_SHA256 = "ca7fd7cc2c8107c3b6b5976058bb72363e8c072f0e446609d4fe7234860c2894";
const AFTER_SHA256 = "19d65705ee474fb99467b5e006e05cab61b561974da34ff0e4a188bcf039387c";

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `s04-${label}-`));
}

function engineSets(brief, usedPointers) {
  const buckets = {
    breaking: [],
    compatible: [],
    added: [],
    deleted: [],
    unknown: [],
  };
  const impact = brief?.impact || {};
  for (const key of Object.keys(buckets)) {
    for (const row of impact[key] || []) {
      if (row?.pointer) buckets[key].push(row.pointer);
    }
  }
  const classified = new Set(Object.values(buckets).flat());
  const unchanged = usedPointers.filter((p) => !classified.has(p));
  return { ...buckets, unchanged, removed: buckets.deleted };
}

function usedList(path) {
  return loadJson(path).pointers;
}

test("published kit pin is useful-jobs 1.4.0", () => {
  const archive = "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz";
  assert.equal(existsSync(archive), true);
  const buf = readFileSync(archive);
  assert.equal(buf.length, KIT_BYTES);
  assert.equal(createHash("sha256").update(buf).digest("hex"), KIT_SHA256);
  assert.equal(existsSync(join(ROOT, "vendor/useful-jobs-1.4.0/bin/useful-jobs.mjs")), true);
});

test("official SPDX fixtures match recorded sha256 and same restore commit", () => {
  assert.equal(sha256File(FIXTURES.before), BEFORE_SHA256);
  assert.equal(sha256File(FIXTURES.after), AFTER_SHA256);
  const commit = loadJson(join(ROOT, "fixtures/official/commit.json"));
  assert.equal(commit.sha, COMMIT);
  const before = loadJson(FIXTURES.before);
  const after = loadJson(FIXTURES.after);
  assert.equal(before.title, "SPDX 2.3");
  assert.equal(before.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(after.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(before.properties.name);
  assert.ok(before.properties.spdxVersion);
  assert.equal(after.properties["@context"].const, "https://spdx.org/rdf/3.0.1/spdx-context.jsonld");
  assert.ok(after.$defs);
  assert.ok(Array.isArray(after.oneOf));
  const license = readFileSync(join(ROOT, "fixtures/official/LICENSE"), "utf8");
  assert.match(license, /Community Specification License 1\.0/);
  assert.match(license, /Creative Commons Attribution 3\.0 Unported/);
});

test("witness does not import kit engine compare modules", () => {
  const src = readFileSync(join(ROOT, "witness.mjs"), "utf8");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/json-schema-webhook-drift\/lib\/compare/.test(src), false);
  assert.equal(/from ["'].*compare\.mjs["']/.test(src), false);
});

test("positive: SPDX 2.3 vs 3.0.1 used-pointer drift is actionable", () => {
  const used = usedList(FIXTURES.usedPositive);
  const before = loadJson(FIXTURES.before);
  const after = loadJson(FIXTURES.after);
  const w = witness(before, after, { pointers: used });
  assert.match(w.fact, /used-pointer-drift/);
  assert.deepEqual(w.unchanged, ["/type"]);
  assert.deepEqual(w.removed, ["/properties/name", "/properties/spdxVersion"]);
  assert.deepEqual(w.added, ["/properties/@context", "/$defs", "/oneOf"]);
  assert.ok(w.changed.includes("/$schema"));
  assert.ok(w.changed.includes("/properties"));

  const run = runMode("positive", { outDir: tmpOut("positive") });
  assert.equal(run.status, 0);
  assert.equal(run.stdoutJson?.ok, true);
  assert.equal(run.stdoutJson?.status, "actionable");
  assert.equal(run.stdoutJson?.kind, "json-schema");
  assert.equal(run.stdoutJson?.sample, false);
  assert.equal(run.stdoutJson?.purchaseAuthority, false);
  assert.equal(run.brief?.ok, true);
  assert.equal(run.brief?.status, "actionable");
  assert.equal(run.brief?.sample, false);
  assert.equal(run.brief?.notOpenApi, true);
  assert.ok(run.outputs.json && existsSync(run.outputs.json));
  assert.ok(run.outputs.md && existsSync(run.outputs.md));

  const engine = engineSets(run.brief, used);
  assert.deepEqual(engine.added, w.added);
  assert.deepEqual(engine.deleted, w.removed);
  assert.ok(engine.unchanged.includes("/type"));
  assert.equal(engine.unknown.length, 0);
  // Engine fingerprints string/$schema and the properties map as unchanged;
  // independent witness treats value inequality as changed. See regression-artifact.json.
  assert.ok(engine.unchanged.includes("/$schema"));
  assert.ok(engine.unchanged.includes("/properties"));
  assert.equal(run.brief.inputs.before, `sha256:${BEFORE_SHA256}`);
  assert.equal(run.brief.inputs.after, `sha256:${AFTER_SHA256}`);
});

test("control: identical SPDX 2.3 before/after has no added/removed/changed present pointers", () => {
  const used = usedList(FIXTURES.usedControlIdentical);
  const doc = loadJson(FIXTURES.before);
  const w = witness(doc, doc, { pointers: used });
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.changed, []);
  assert.ok(w.unchanged.includes("/type"));
  assert.ok(w.unchanged.includes("/properties/name"));
  assert.ok(w.unchanged.includes("/properties/spdxVersion"));
  assert.ok(w.unknown.includes("/properties/@context"));
  assert.ok(w.unknown.includes("/$defs"));

  const run = runMode("control", { outDir: tmpOut("control") });
  assert.equal(run.status, 0);
  assert.equal(run.stdoutJson?.ok, true);
  assert.equal(run.stdoutJson?.purchaseAuthority, false);
  assert.equal(run.brief?.status, "partial");
  const engine = engineSets(run.brief, used);
  assert.deepEqual(engine.added, []);
  assert.deepEqual(engine.deleted, []);
  assert.deepEqual(engine.unknown, w.unknown);
  assert.ok(engine.unchanged.includes("/type"));
});

test("control: unused-elsewhere /type pointer is unchanged across 2.3 vs 3.0.1", () => {
  const used = usedList(FIXTURES.usedControlType);
  const w = witness(loadJson(FIXTURES.before), loadJson(FIXTURES.after), { pointers: used });
  assert.deepEqual(w.unchanged, ["/type"]);
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.changed, []);

  const run = runMode("control-type", { outDir: tmpOut("control-type") });
  assert.equal(run.status, 0);
  assert.equal(run.stdoutJson?.status, "informational");
  assert.equal(run.brief?.status, "informational");
  const engine = engineSets(run.brief, used);
  assert.deepEqual(engine.unchanged, ["/type"]);
  assert.match(run.brief.summary, /Not a runtime compatibility proof/);
});

test("negative: YAML OpenAPI is refused (not JSON Schema)", () => {
  const run = runMode("negative-yaml", { outDir: tmpOut("neg-yaml") });
  assert.equal(run.status, 2);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "not-json");
  assert.match(String(run.stdoutJson?.error || ""), /YAML/i);
  assert.equal(run.stdoutJson?.purchaseAuthority, false);
  assert.equal(run.stdoutJson?.notOpenApi, true);
  assert.equal(run.brief, null);
});

test("negative: JSON OpenAPI is refused as not-this-job-openapi", () => {
  const run = runMode("negative-openapi", { outDir: tmpOut("neg-json") });
  assert.equal(run.status, 2);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "not-this-job-openapi");
  assert.equal(run.stdoutJson?.purchaseAuthority, false);
});

test("negative: missing --used refuses closed", () => {
  const run = runMode("missing-used", { outDir: tmpOut("missing") });
  assert.equal(run.status, 2);
  assert.equal(run.stdoutJson?.code, "missing-required-inputs");
  assert.deepEqual(run.stdoutJson?.detail?.missing, ["used"]);
});

test("engine vs witness disagreement on /$schema and /properties is recorded, engine unmodified", () => {
  const artifact = loadJson(join(ROOT, "regression-artifact.json"));
  assert.equal(artifact.jobId, "json-schema-webhook-drift");
  assert.equal(artifact.engineModified, false);
  const pointers = artifact.disagreements.map((d) => d.pointer).sort();
  assert.deepEqual(pointers, ["/$schema", "/properties"]);
  const before = loadJson(FIXTURES.before);
  const after = loadJson(FIXTURES.after);
  const w = witness(before, after, { pointers: ["/$schema", "/properties", "/type"] });
  assert.deepEqual(w.changed.sort(), ["/$schema", "/properties"]);
  assert.deepEqual(w.unchanged, ["/type"]);
  assert.equal(before.$schema, artifact.disagreements.find((d) => d.pointer === "/$schema").beforeValue);
  assert.equal(after.$schema, artifact.disagreements.find((d) => d.pointer === "/$schema").afterValue);
});

test("direct caller flags still spawn the isolated kit job", () => {
  const run = runJob({
    before: FIXTURES.before,
    after: FIXTURES.after,
    used: FIXTURES.usedControlType,
    outDir: tmpOut("direct"),
  });
  assert.equal(run.status, 0);
  assert.equal(run.stdoutJson?.appId, "json-schema-webhook-drift");
  assert.equal(run.exampleMode, false);
});
