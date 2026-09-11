import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ENGINE_OUTPUT_NAMES, PREFLIGHT_RESULT_NAME } from "../lib/constants.mjs";
import { formatDigest } from "../lib/digest.mjs";
import { createNullEngineAdapter } from "../lib/engine-adapter.mjs";
import { findJob, loadCatalog } from "../lib/catalog.mjs";
import { preflight } from "../lib/preflight.mjs";
import { DEFAULT_CATALOG, FIXTURES } from "../lib/roots.mjs";
import { JOURNEY_ARGS, runCli } from "./helpers.mjs";

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

test("local-runtime: catalog.json requiredInputs for vendor-budget-impact", async () => {
  const catalog = await loadCatalog(DEFAULT_CATALOG);
  const job = findJob(catalog, "vendor-budget-impact");
  assert.equal(catalog.schema, "useful-jobs.catalog.v1");
  assert.deepEqual(job.requiredInputs, ["--before", "--after"]);
  assert.deepEqual(job.outputs, ["budget-impact.json", "budget-impact.md"]);
  assert.equal(catalog.runtime?.purchaseAuthority, false);
});

test("journey: preflight vendor-budget-impact with two valid JSON files", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-journey-"));
  const r = runCli([...JOURNEY_ARGS, "--out-dir", outDir]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.engineInvoked, false);
  assert.equal(r.json.purchaseAuthority, false);
  assert.equal(r.json.spendClaim, false);
  assert.equal(r.json.toolCostClaim, false);
  assert.equal(r.json.preSpendSavingsClaim, false);
  assert.equal(r.json.job, "vendor-budget-impact");
  assert.ok(r.json.inputs.before);
  assert.ok(r.json.inputs.after);
  assert.match(r.json.inputs.before.digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(r.json.inputs.after.digest, /^sha256:[0-9a-f]{64}$/);

  const names = readdirSync(outDir).sort();
  assert.ok(names.includes(PREFLIGHT_RESULT_NAME));
  for (const name of ENGINE_OUTPUT_NAMES) {
    assert.equal(existsSync(path.join(outDir, name)), false, `engine artifact ${name} must not be written`);
  }

  const beforeAbs = path.join(FIXTURES, "caller/vendor-budget-impact/before.json");
  const afterAbs = path.join(FIXTURES, "caller/vendor-budget-impact/after.json");
  assert.equal(r.json.inputs.before.sha256, sha256File(beforeAbs));
  assert.equal(r.json.inputs.after.sha256, sha256File(afterAbs));
  assert.equal(r.json.inputs.before.digest, formatDigest(sha256File(beforeAbs)));
});

test("in-process: null engine adapter is never invoked", async () => {
  const catalog = await loadCatalog(DEFAULT_CATALOG);
  const job = findJob(catalog, "vendor-budget-impact");
  const engine = createNullEngineAdapter();
  const result = preflight({
    catalog,
    job,
    flags: {
      before: path.join(FIXTURES, "caller/vendor-budget-impact/before.json"),
      after: path.join(FIXTURES, "caller/vendor-budget-impact/after.json"),
    },
    inputRoot: FIXTURES,
    engineAdapter: engine,
  });
  assert.equal(result.ok, true);
  assert.equal(result.sample, false);
  assert.equal(engine.calls.length, 0);
});

test("journey: matching I01 digest field is accepted", () => {
  const beforeAbs = path.join(FIXTURES, "caller/vendor-budget-impact/before.json");
  const digest = formatDigest(sha256File(beforeAbs));
  const r = runCli([
    ...JOURNEY_ARGS,
    "--before-digest",
    digest,
    "--before-bytes",
    String(readFileSync(beforeAbs).length),
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.inputs.before.digest, digest);
});
