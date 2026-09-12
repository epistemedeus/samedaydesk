import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DEFAULT_INPUTS, JOB_ID, runJob } from "../adapter.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures");

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function loadOfficialPair() {
  return {
    before: loadJson("fixtures/official/schema.before.json"),
    after: loadJson("fixtures/official/schema.after.json"),
  };
}

function tmpOut(name) {
  return mkdtempSync(join(tmpdir(), `s01-${name}-`));
}

test("positive: official $recursiveAnchor type pointer is added and actionable", () => {
  const used = loadJson("fixtures/used/used-positive.json");
  const { before, after } = loadOfficialPair();
  const w = witness(before, after, used);
  assert.equal(w.fact, "changed");
  assert.deepEqual(w.added, ["/properties/$recursiveAnchor/type"]);
  assert.deepEqual(w.unchanged, ["/properties/$recursiveRef/type", "/title"]);
  assert.deepEqual(w.changed, []);
  assert.deepEqual(w.removed, []);
  assert.equal(
    used.pointers.some((p) => p.includes("$recursiveAnchor")),
    true,
  );
  assert.equal(
    used.pointers.some((p) => p.includes("exclusiveMinimum")),
    false,
  );

  const outDir = tmpOut("positive");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.before,
      after: DEFAULT_INPUTS.after,
      used: join(fixtures, "used", "used-positive.json"),
      outDir,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.appId, JOB_ID);
    assert.equal(run.stdoutJson?.status, "actionable");
    assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
    assert.notEqual(run.stdoutJson?.sold, true);
    assert.match(`${run.stdoutJson.status} ${JSON.stringify(run.stdoutJson)}`, /actionable/i);

    const brief = run.outputs.json;
    assert.ok(brief);
    assert.equal(brief.kind, "json-schema");
    assert.equal(brief.notOpenApi, true);
    const added = (brief.impact?.added || []).map((row) => row.pointer);
    assert.deepEqual(added, ["/properties/$recursiveAnchor/type"]);
    assert.equal(brief.impact.unchangedCount, 2);
    assert.equal((brief.impact.breaking || []).length, 0);
    const afterNode = after.properties.$recursiveAnchor;
    assert.equal(afterNode.type, "boolean");
    assert.equal(before.properties.$recursiveAnchor.type, undefined);
    assert.equal(before.properties.$recursiveAnchor.$ref, "meta/core#/$defs/anchorString");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: identical after/after documents are unchanged", () => {
  const used = loadJson("fixtures/used/used-positive.json");
  const after = loadJson("fixtures/official/schema.after.json");
  const w = witness(after, after, used);
  assert.equal(w.fact, "unchanged");
  assert.deepEqual(w.added, []);
  assert.deepEqual(w.changed, []);
  assert.deepEqual(w.removed, []);
  assert.deepEqual(w.unchanged, used.pointers);

  const outDir = tmpOut("identical");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.after,
      after: DEFAULT_INPUTS.after,
      used: join(fixtures, "used", "used-positive.json"),
      outDir,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.status, "informational");
    assert.equal((run.outputs.json?.impact?.added || []).length, 0);
    assert.equal(run.outputs.json?.impact?.unchangedCount, 3);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: unchanged used pointers on the official pair", () => {
  const used = loadJson("fixtures/used/used-control.json");
  const { before, after } = loadOfficialPair();
  const w = witness(before, after, used);
  assert.equal(w.fact, "unchanged");
  assert.deepEqual(w.unchanged, used.pointers);

  const outDir = tmpOut("control-ptr");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.before,
      after: DEFAULT_INPUTS.after,
      used: join(fixtures, "used", "used-control.json"),
      outDir,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.status, "informational");
    assert.equal(run.outputs.json?.impact?.unchangedCount, 3);
    assert.equal((run.outputs.json?.impact?.added || []).length, 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: OpenAPI document refuses not-this-job-openapi", () => {
  const outDir = tmpOut("openapi");
  try {
    const run = runJob({
      before: join(fixtures, "negative", "openapi.json"),
      after: join(fixtures, "negative", "openapi.json"),
      used: join(fixtures, "used", "used-positive.json"),
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.refused, true);
    assert.equal(run.stdoutJson?.code, "not-this-job-openapi");
    assert.match(`${run.stdout}${run.stderr}`, /not-this-job-openapi/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: remote $ref is refused", () => {
  const outDir = tmpOut("remote");
  try {
    const run = runJob({
      before: join(fixtures, "negative", "remote-ref.json"),
      after: join(fixtures, "negative", "remote-ref.json"),
      used: join(fixtures, "negative", "used-remote.json"),
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.code, "remote-ref-refused");
    assert.match(`${run.stdout}${run.stderr}`, /remote-ref-refused|Remote \$ref/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("keyword object pointer: witness sees type change; engine refuses remote $ref", () => {
  const used = loadJson("fixtures/used/used-keyword.json");
  const { before, after } = loadOfficialPair();
  const w = witness(before, after, used);
  assert.equal(used.pointers[0], "/properties/$recursiveAnchor");
  assert.equal(w.fact, "changed");
  assert.deepEqual(w.changed, ["/properties/$recursiveAnchor"]);
  const row = w.rows[0];
  assert.equal(row.before.type, undefined);
  assert.equal(row.after.type, "boolean");
  assert.equal(row.before.ref, "meta/core#/$defs/anchorString");
  assert.equal(row.after.ref, undefined);

  const outDir = tmpOut("keyword");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.before,
      after: DEFAULT_INPUTS.after,
      used: join(fixtures, "used", "used-keyword.json"),
      outDir,
    });
    assert.equal(run.status, 2);
    assert.equal(run.stdoutJson?.code, "remote-ref-refused");
    assert.deepEqual(run.stdoutJson?.detail?.refs?.[0]?.before, ["meta/core#/$defs/anchorString"]);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("engine summary omits added paths while status is actionable", () => {
  const outDir = tmpOut("summary");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.before,
      after: DEFAULT_INPUTS.after,
      used: join(fixtures, "used", "used-positive.json"),
      outDir,
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdoutJson?.status, "actionable");
    assert.equal(run.outputs.json?.impact?.added?.[0]?.pointer, "/properties/$recursiveAnchor/type");
    assert.match(run.outputs.json.summary, /No structural used-path drift/);
    const artifact = loadJson("regression-artifact.json");
    const summaryCase = artifact.cases.find((c) => c.id === "added-path-summary-omitted");
    assert.ok(summaryCase);
    assert.equal(summaryCase.engineStatus, "actionable");
    assert.equal(summaryCase.engineSummary, run.outputs.json.summary);
    const keywordCase = artifact.cases.find((c) => c.id === "keyword-object-remote-ref-refuse");
    assert.ok(keywordCase);
    assert.equal(keywordCase.engine.code, "remote-ref-refused");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("official pair is not the H04 exclusiveMinimum sample", () => {
  const before = readFileSync(join(root, "fixtures/official/schema.before.json"), "utf8");
  const after = readFileSync(join(root, "fixtures/official/schema.after.json"), "utf8");
  assert.equal(before.includes("exclusiveMinimum"), false);
  assert.equal(after.includes("exclusiveMinimum"), false);
  assert.equal(before.includes("$recursiveAnchor"), true);
  assert.equal(after.includes("$recursiveAnchor"), true);
  const acq = loadJson("acquisition.json");
  assert.equal(acq.beforeSha, "63fbd7bf561a6ef04a38fd63589a3d93d1c149ff");
  assert.equal(acq.afterSha, "c028e943ab213531f55e60ff6a2b1202f5d443c6");
  assert.notEqual(acq.beforeSha.startsWith("d4c5b3a2"), true);
  assert.notEqual(acq.afterSha.startsWith("4b495a29"), true);
});

test("missing required used input is refused", () => {
  const outDir = tmpOut("missing");
  try {
    const run = runJob({
      before: DEFAULT_INPUTS.before,
      after: DEFAULT_INPUTS.after,
      used: "",
      outDir,
    });
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}${JSON.stringify(run.stdoutJson)}`, /missing-required-inputs|used/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
