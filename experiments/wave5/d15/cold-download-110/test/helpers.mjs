import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyCold } from "../lib/classify.mjs";
import { ADVERTISED_OUTPUTS } from "../lib/pins.mjs";
import { COLD_RUNS } from "../lib/cold-root.mjs";

export function outDir(name) {
  const dir = join(COLD_RUNS, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function assertNoPayment(run, classified) {
  const body = run.json || {};
  assert.notEqual(body.purchaseAuthority, true, `purchaseAuthority true: ${run.stdout}`);
  if (classified) assert.equal(classified.purchaseAuthority, false);
  assert.notEqual(body.sold, true, "sold must not be true for offline kit");
}

export function expectProcessOk(run, { jobId, out, analysis } = {}) {
  const classified = classifyCold(run, {
    advertisedOutputs: jobId ? ADVERTISED_OUTPUTS[jobId] : [],
    outDir: out,
  });
  assert.equal(
    run.status,
    0,
    `expected exit 0; got ${run.status} stdout=${run.stdout} stderr=${run.stderr}`,
  );
  assert.equal(classified.kind, "process-success", JSON.stringify({ classified, stdout: run.stdout, stderr: run.stderr }));
  assertNoPayment(run, classified);
  if (out && jobId) {
    for (const name of ADVERTISED_OUTPUTS[jobId]) {
      assert.ok(existsSync(join(out, name)), `missing advertised output ${out}/${name}`);
    }
    assert.equal(classified.missingOutputs.length, 0);
  }
  if (analysis) {
    const status = String(classified.analysisStatus || "");
    assert.match(status, analysis, `analysis ${status} did not match ${analysis}`);
  }
  return classified;
}

export function expectRefusal(run, codeRe) {
  const classified = classifyCold(run);
  assert.equal(
    run.status,
    2,
    `expected supported refusal exit 2; got ${run.status} kind=${classified.kind} stdout=${run.stdout} stderr=${run.stderr}`,
  );
  assert.equal(classified.kind, "supported-refusal", JSON.stringify({ classified, stdout: run.stdout }));
  assertNoPayment(run, classified);
  if (codeRe) {
    const blob = `${classified.code || ""} ${run.stdout} ${run.stderr}`;
    assert.match(blob, codeRe, `refusal code missing ${codeRe}: ${blob}`);
  }
  return classified;
}

export function expectAnalysisNotPayment(classified) {
  assert.equal(classified.purchaseAuthority, false);
  assert.equal(classified.fixtureFunding, false);
}
