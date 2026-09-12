import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { impactPointers, KIT_SHA256, runJob, sha256File } from "../adapter.mjs";
import { getAtPointer, witness } from "../witness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FX = path.join(ROOT, "fixtures");

const PAIR_A_BEFORE = path.join(FX, "official/bom-1.6.80db0257f118.json");
const PAIR_A_AFTER = path.join(FX, "official/bom-1.6.0bd48c88d1b1.json");
const PAIR_B_BEFORE = path.join(FX, "official/bom-1.5.c320fc0f0b46.json");
const PAIR_B_AFTER = path.join(FX, "official/bom-1.6.55343ba19dee.json");
const USED_TYPO = path.join(FX, "used/used-typo.json");
const USED_VERSION = path.join(FX, "used/used-version-pair.json");
const USED_VERSION_CONTROL = path.join(FX, "used/used-version-control.json");
const OPENAPI = path.join(FX, "negative/openapi.json");
const REMOTE = path.join(FX, "negative/remote-ref.json");
const USED_REMOTE = path.join(FX, "negative/used-remote.json");
const YARN = path.join(FX, "negative/yarn.lock");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function load(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function tmpOut(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `s03-${label}-`));
}

function pointersOf(rows) {
  return rows.map((row) => row.pointer);
}

test("fixture provenance matches acquisition.json", () => {
  const acq = load(path.join(ROOT, "acquisition.json"));
  assert.equal(acq.license, "Apache-2.0");
  assert.equal(acq.beforeShaFull, "80db0257f1182a2d4220b3a2ab6970f4bab824df");
  assert.equal(acq.afterShaFull, "0bd48c88d1b1877c7a3536252e06893850763190");
  assert.equal(acq.pairs.officialTagsDifferentFilenames.before.sha, "c320fc0f0b46873864927d9d5684eea7ba439728");
  assert.equal(acq.pairs.officialTagsDifferentFilenames.after.sha, "55343ba19dee1785acf1ce9191540d5fd7b590db");
  for (const row of acq.fixtures) {
    const abs = path.join(ROOT, row.path);
    const buf = fs.readFileSync(abs);
    assert.equal(buf.length, row.bytes, row.path);
    assert.equal(sha256(buf), row.sha256, row.path);
  }
  const license = fs.readFileSync(path.join(FX, "official/LICENSE"), "utf8");
  assert.match(license, /Apache License/);
  assert.doesNotMatch(license, /CDDL/);
});

test("positive pair A: typo/content-type is structural-unchanged (valid informational)", () => {
  const before = load(PAIR_A_BEFORE);
  const after = load(PAIR_A_AFTER);
  const used = load(USED_TYPO);
  const w = witness(before, after, used);

  assert.equal(
    getAtPointer(before, "/definitions/attachment/properties/contentType/description").value.includes("plan text"),
    true,
  );
  assert.equal(
    getAtPointer(after, "/definitions/attachment/properties/contentType/description").value.includes("plain text"),
    true,
  );
  assert.equal(
    getAtPointer(before, "/definitions/refType/$comment").value.includes("staring"),
    true,
  );
  assert.equal(
    getAtPointer(after, "/definitions/refType/$comment").value.includes("starting"),
    true,
  );
  assert.deepEqual(getAtPointer(before, "/required").value, ["bomFormat", "specVersion"]);
  assert.deepEqual(getAtPointer(after, "/required").value, ["bomFormat", "specVersion"]);

  assert.deepEqual(pointersOf(w.changed).sort(), [
    "/definitions/attachment/properties/contentType",
    "/definitions/attachment/properties/contentType/description",
    "/definitions/refType/$comment",
  ]);
  assert.deepEqual(pointersOf(w.unchanged).sort(), [
    "/definitions/refType/minLength",
    "/definitions/refType/type",
    "/required",
  ]);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);

  const outDir = tmpOut("typo");
  const run = runJob({ before: PAIR_A_BEFORE, after: PAIR_A_AFTER, used: USED_TYPO, outDir });
  assert.equal(run.exitCode, 0, run.stderr || run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson.status, "informational");
  assert.equal(run.brief.status, "informational");
  assert.equal(run.brief.kind, "json-schema");
  assert.equal(run.brief.impact.unchangedCount, 6);
  assert.equal(run.brief.impact.breaking.length, 0);
  assert.equal(run.brief.impact.compatible.length, 0);
  assert.equal(run.brief.impact.added.length, 0);
  assert.equal(run.brief.impact.deleted.length, 0);
  assert.equal(run.brief.purchaseAuthority, false);
  assert.equal(run.brief.customerBrief, false);
  assert.ok(run.outputs["drift-brief.json"]);
  assert.ok(run.outputs["drift-brief.md"]);
  assert.match(run.brief.summary, /No structural used-path drift/);
});

test("positive pair B: official 1.5 vs 1.6 tags differ on used pointers", () => {
  const before = load(PAIR_B_BEFORE);
  const after = load(PAIR_B_AFTER);
  const used = load(USED_VERSION);
  const w = witness(before, after, used);

  const beforeEnum = getAtPointer(before, "/definitions/component/properties/type/enum").value;
  const afterEnum = getAtPointer(after, "/definitions/component/properties/type/enum").value;
  assert.equal(beforeEnum.includes("cryptographic-asset"), false);
  assert.equal(afterEnum.includes("cryptographic-asset"), true);
  assert.equal(getAtPointer(before, "/properties/declarations").present, false);
  assert.equal(getAtPointer(after, "/properties/declarations").present, true);
  assert.equal(getAtPointer(before, "/definitions/component/properties/cryptoProperties").present, false);
  assert.equal(getAtPointer(after, "/definitions/component/properties/cryptoProperties").present, true);
  assert.deepEqual(getAtPointer(before, "/definitions/component/required").value, ["type", "name"]);
  assert.deepEqual(getAtPointer(after, "/definitions/component/required").value, ["type", "name"]);
  assert.equal(before.$id, "http://cyclonedx.org/schema/bom-1.5.schema.json");
  assert.equal(after.$id, "http://cyclonedx.org/schema/bom-1.6.schema.json");

  assert.ok(pointersOf(w.changed).includes("/definitions/component/properties/type"));
  assert.deepEqual(pointersOf(w.added).sort(), [
    "/definitions/component/properties/cryptoProperties",
    "/properties/declarations",
  ]);
  assert.deepEqual(pointersOf(w.unchanged).sort(), [
    "/definitions/attachment/properties/contentType",
    "/definitions/component/required",
    "/definitions/refType/type",
  ]);
  assert.equal(w.removed.length, 0);

  const rootRequired = witness(before, after, { pointers: ["/required"] });
  assert.deepEqual(pointersOf(rootRequired.changed), ["/required"]);
  assert.deepEqual(getAtPointer(before, "/required").value, ["bomFormat", "specVersion", "version"]);
  assert.deepEqual(getAtPointer(after, "/required").value, ["bomFormat", "specVersion"]);

  const outDir = tmpOut("version");
  const run = runJob({ before: PAIR_B_BEFORE, after: PAIR_B_AFTER, used: USED_VERSION, outDir });
  assert.equal(run.exitCode, 0, run.stderr || run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson.status, "actionable");
  assert.equal(run.brief.status, "actionable");
  assert.equal(run.brief.kind, "json-schema");
  assert.deepEqual(impactPointers(run.brief, "compatible"), ["/definitions/component/properties/type"]);
  assert.equal(run.brief.impact.compatible[0].reason, "enum-weakened");
  assert.deepEqual(impactPointers(run.brief, "added").sort(), [
    "/definitions/component/properties/cryptoProperties",
    "/properties/declarations",
  ]);
  assert.equal(run.brief.impact.breaking.length, 0);
  assert.equal(run.brief.impact.unchangedCount, 3);
  assert.equal(run.brief.purchaseAuthority, false);
  assert.equal(run.brief.sold, false);
});

test("control: identical before/after yields unchanged used pointers", () => {
  const doc = load(PAIR_A_AFTER);
  const used = load(USED_TYPO);
  const w = witness(doc, doc, used);
  assert.equal(w.changed.length, 0);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.unchanged.length, used.pointers.length);

  const outDir = tmpOut("identical");
  const run = runJob({ before: PAIR_A_AFTER, after: PAIR_A_AFTER, used: USED_TYPO, outDir });
  assert.equal(run.exitCode, 0, run.stderr || run.stdout);
  assert.equal(run.brief.status, "informational");
  assert.equal(run.brief.impact.unchangedCount, 6);
  assert.equal(run.brief.impact.breaking.length, 0);
  assert.equal(run.brief.impact.added.length, 0);
});

test("control: used pointers that do not change across 1.5 vs 1.6", () => {
  const w = witness(load(PAIR_B_BEFORE), load(PAIR_B_AFTER), load(USED_VERSION_CONTROL));
  assert.equal(w.changed.length, 0);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.unchanged.length, 3);

  const outDir = tmpOut("unchanged-ptr");
  const run = runJob({
    before: PAIR_B_BEFORE,
    after: PAIR_B_AFTER,
    used: USED_VERSION_CONTROL,
    outDir,
  });
  assert.equal(run.exitCode, 0, run.stderr || run.stdout);
  assert.equal(run.brief.status, "informational");
  assert.equal(run.brief.impact.unchangedCount, 3);
  assert.equal(run.brief.impact.added.length, 0);
  assert.equal(run.brief.impact.compatible.length, 0);
});

test("negative: OpenAPI document is not-this-job-openapi", () => {
  const outDir = tmpOut("openapi");
  const run = runJob({ before: OPENAPI, after: OPENAPI, used: USED_TYPO, outDir });
  assert.equal(run.ok, false);
  assert.equal(run.refused, true);
  assert.equal(run.stdoutJson.code, "not-this-job-openapi");
  assert.notEqual(run.exitCode, 0);
  assert.equal(run.brief, null);
});

test("negative: remote $ref is refused", () => {
  const outDir = tmpOut("remote");
  const run = runJob({ before: REMOTE, after: REMOTE, used: USED_REMOTE, outDir });
  assert.equal(run.ok, false);
  assert.equal(run.refused, true);
  assert.equal(run.stdoutJson.code, "remote-ref-refused");
  assert.notEqual(run.exitCode, 0);
});

test("negative: yarn.lock is not JSON", () => {
  const outDir = tmpOut("yarn");
  const run = runJob({ before: YARN, after: YARN, used: USED_TYPO, outDir });
  assert.equal(run.ok, false);
  assert.equal(run.refused, true);
  assert.equal(run.stdoutJson.code, "not-json");
});

test("negative: missing --used is refused", () => {
  const outDir = tmpOut("missing");
  const run = runJob({ before: PAIR_A_AFTER, after: PAIR_A_AFTER, outDir });
  assert.equal(run.ok, false);
  assert.equal(run.refused, true);
  assert.equal(run.stdoutJson.code, "missing-required-inputs");
});

test("negative: live URL is not fetched", () => {
  const outDir = tmpOut("url");
  const run = runJob({
    before: "https://example.test/schema/bom-1.6.schema.json",
    after: PAIR_A_AFTER,
    used: USED_TYPO,
    outDir,
  });
  assert.equal(run.ok, false);
  assert.equal(run.refused, true);
  assert.equal(run.stdoutJson.code, "unreadable-input");
  assert.equal(run.network, false);
});

test("witness is independent of kit compare modules", () => {
  const src = fs.readFileSync(path.join(ROOT, "witness.mjs"), "utf8");
  assert.doesNotMatch(src, /json-schema-webhook-drift\/lib\/compare/);
  assert.doesNotMatch(src, /from ["'].*engines\//);
  assert.doesNotMatch(src, /fingerprintUsedNode|classifyPair/);
  assert.equal(KIT_SHA256, "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f");
  assert.equal(sha256File("/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz"), KIT_SHA256);
});
