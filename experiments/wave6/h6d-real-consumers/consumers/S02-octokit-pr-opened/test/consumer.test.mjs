import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runJsonSchemaWebhookDrift, KIT_BIN, JOB_ID } from "../adapter.mjs";
import { ADDED_POINTER, CONTROL_POINTER, witness } from "../witness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BEFORE = join(ROOT, "fixtures/official/opened.before.json");
const AFTER = join(ROOT, "fixtures/official/opened.after.json");
const PARENT = join(ROOT, "fixtures/official/opened.parent.json");
const USED = join(ROOT, "fixtures/used/used.json");
const USED_CONTROL = join(ROOT, "fixtures/used/used-control.json");
const OPENAPI = join(ROOT, "fixtures/negative/openapi.json");

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function withOutDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "s02-octokit-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("kit 1.4.0 is extracted and job id is json-schema-webhook-drift", () => {
  const pkg = load(join(ROOT, "vendor/useful-jobs-1.4.0/package.json"));
  assert.equal(pkg.name, "useful-jobs");
  assert.equal(pkg.version, "1.4.0");
  assert.equal(JOB_ID, "json-schema-webhook-drift");
  assert.match(KIT_BIN, /useful-jobs-1\.4\.0\/bin\/useful-jobs\.mjs$/);
});

test("witness is independent of kit engine compare/oracle", () => {
  const src = readFileSync(join(ROOT, "witness.mjs"), "utf8");
  assert.equal(/from\s+["'][^"']*(compare|contract|cli)\.mjs["']/.test(src), false);
  assert.equal(src.includes("engines/json-schema-webhook-drift"), false);
  assert.equal(src.includes("classifyPair"), false);
  assert.equal(src.includes("fingerprintUsedNode"), false);
  assert.equal(/^import .*(vendor|engines)/m.test(src), false);
  const adapterSrc = readFileSync(join(ROOT, "adapter.mjs"), "utf8");
  assert.equal(adapterSrc.includes("compare.mjs"), false);
  assert.equal(adapterSrc.includes("classifyPair"), false);
});

test("official pair is pull_request opened webhook example, not forbidden events", () => {
  const before = load(BEFORE);
  const after = load(AFTER);
  const parent = load(PARENT);
  const acq = load(join(ROOT, "acquisition.json"));
  assert.equal(before.action, "opened");
  assert.equal(after.action, "opened");
  assert.equal(parent.action, "opened");
  assert.equal(Object.prototype.hasOwnProperty.call(before.pull_request, "auto_merge"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parent.pull_request, "auto_merge"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(after.pull_request, "auto_merge"), true);
  assert.equal(after.pull_request.auto_merge, null);
  assert.equal(acq.path, "payload-examples/api.github.com/pull_request/opened.payload.json");
  assert.equal(acq.beforeSha, "e3e60cb5336a261199d30f33f080017160df5d4d");
  assert.equal(acq.afterSha, "0f5bd1859ef98b4b7513f415d3ec739f0819850c");
  assert.equal(acq.license, "MIT");
  assert.equal(acq.path.includes("organization.renamed"), false);
  assert.equal(acq.path.includes("create/payload.json"), false);
});

test("positive: witness sees auto_merge added and /action unchanged", () => {
  const result = witness(load(BEFORE), load(AFTER), load(USED));
  assert.equal(result.added.includes(ADDED_POINTER), true);
  assert.equal(result.unchanged.includes(CONTROL_POINTER), true);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.unknown, []);
  assert.match(result.fact, /auto_merge added/);
});

test("positive: cold json-schema-webhook-drift agrees with witness (added + control)", () => {
  withOutDir((outDir) => {
    const run = runJsonSchemaWebhookDrift({
      before: BEFORE,
      after: AFTER,
      used: USED,
      outDir,
    });
    assert.equal(run.ok, true, `${run.stderr}\n${run.stdout}`);
    assert.equal(run.exitCode, 0);
    assert.equal(run.kind, "webhook-example");
    assert.equal(run.status, "actionable");
    assert.equal(run.purchaseAuthority, false);
    assert.equal(run.sold, false);
    assert.equal(run.sample, false);
    assert.equal(run.exampleMode, false);
    assert.equal(run.stdoutJson?.customerBrief, false);
    assert.equal(run.brief?.notOpenApi, true);
    assert.equal(run.brief?.kind, "webhook-example");
    const added = (run.brief?.impact?.added || []).map((row) => row.pointer);
    assert.equal(added.includes(ADDED_POINTER), true);
    const addedRow = (run.brief?.impact?.added || []).find((row) => row.pointer === ADDED_POINTER);
    assert.equal(addedRow?.class, "added");
    assert.equal(addedRow?.reason, "present-after-only");
    assert.equal(run.brief?.impact?.unchangedCount >= 1, true);
    const w = witness(load(BEFORE), load(AFTER), load(USED));
    assert.equal(w.added.includes(ADDED_POINTER), true);
    assert.equal(w.unchanged.includes(CONTROL_POINTER), true);
    assert.match(run.markdown || "", /caller-input/);
  });
});

test("control: identical after/after leaves used pointers unchanged", () => {
  withOutDir((outDir) => {
    const w = witness(load(AFTER), load(AFTER), load(USED));
    assert.deepEqual(w.added, []);
    assert.deepEqual(w.changed, []);
    assert.deepEqual(w.removed, []);
    assert.equal(w.unchanged.includes(ADDED_POINTER), true);
    assert.equal(w.unchanged.includes(CONTROL_POINTER), true);
    const run = runJsonSchemaWebhookDrift({
      before: AFTER,
      after: AFTER,
      used: USED,
      outDir,
    });
    assert.equal(run.ok, true, `${run.stderr}\n${run.stdout}`);
    assert.equal(run.status, "informational");
    assert.equal((run.brief?.impact?.added || []).length, 0);
    assert.equal((run.brief?.impact?.deleted || []).length, 0);
    assert.equal(run.brief?.impact?.unchangedCount, 2);
  });
});

test("control: unused-change pointer /action is unchanged across the official pair", () => {
  withOutDir((outDir) => {
    const w = witness(load(BEFORE), load(AFTER), load(USED_CONTROL));
    assert.deepEqual(w.added, []);
    assert.deepEqual(w.changed, []);
    assert.deepEqual(w.removed, []);
    assert.deepEqual(w.unchanged, [CONTROL_POINTER]);
    const run = runJsonSchemaWebhookDrift({
      before: BEFORE,
      after: AFTER,
      used: USED_CONTROL,
      outDir,
    });
    assert.equal(run.ok, true, `${run.stderr}\n${run.stdout}`);
    assert.equal(run.status, "informational");
    assert.equal((run.brief?.impact?.added || []).length, 0);
    assert.equal(run.brief?.impact?.unchangedCount, 1);
  });
});

test("negative: OpenAPI document refuses not-this-job-openapi", () => {
  withOutDir((outDir) => {
    const run = runJsonSchemaWebhookDrift({
      before: OPENAPI,
      after: OPENAPI,
      used: USED,
      outDir,
    });
    assert.notEqual(run.exitCode, 0);
    assert.equal(run.ok, false);
    assert.equal(run.refused, true);
    assert.equal(run.stdoutJson?.code, "not-this-job-openapi");
    const blob = `${run.stdout}\n${run.stderr}`;
    assert.match(blob, /not-this-job-openapi/);
    assert.equal(run.stdoutJson?.purchaseAuthority, false);
    assert.equal(run.stdoutJson?.sold, false);
  });
});

test("negative: missing --used refuses closed", () => {
  withOutDir((outDir) => {
    const run = runJsonSchemaWebhookDrift({
      before: BEFORE,
      after: AFTER,
      outDir,
    });
    assert.notEqual(run.exitCode, 0);
    assert.equal(run.ok, false);
    const blob = `${run.stdout}\n${run.stderr}`;
    assert.match(blob, /missing-required-inputs/);
  });
});

test("path-walk parent also lacks auto_merge; witness still reports added vs after", () => {
  const w = witness(load(PARENT), load(AFTER), load(USED));
  assert.deepEqual(w.added, [ADDED_POINTER]);
  assert.deepEqual(w.unchanged, [CONTROL_POINTER]);
});
