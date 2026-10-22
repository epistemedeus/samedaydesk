import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { toWrapperRequest } from "../lib/contract.mjs";
import {
  EXECUTION_CONTRACT_VERSION,
  EXECUTION_MAX_INPUT_BYTES,
  TESTED_D01,
} from "../lib/constants.mjs";
import { bindExecutionV1, ensureD01Checkout, importD01Execution } from "../lib/d01-bind.mjs";
import { runCli, runD01Cli, writePaddedPricingJson } from "./helpers.mjs";

const INLINE_BEFORE = JSON.stringify({
  label: "caller",
  rows: [{ field: "wave5-d02-inline-input", value: 3, unit: "USD/1M-tokens" }],
});
const INLINE_AFTER = JSON.stringify({
  label: "caller",
  rows: [{ field: "wave5-d02-inline-input", value: 4, unit: "USD/1M-tokens" }],
});
const INLINE_SAMPLE = JSON.stringify({
  label: "SAMPLE",
  rows: [{ field: "wave5-d02-inline-input", value: 3, unit: "USD/1M-tokens" }],
});

let checkout;
let bind;
let paymentFixture;

before(async () => {
  checkout = ensureD01Checkout();
  const imported = await importD01Execution(checkout.repoRoot);
  bind = await bindExecutionV1(imported.module);
  assert.equal(imported.module.EXECUTION_CONTRACT_VERSION, EXECUTION_CONTRACT_VERSION);
  assert.equal(typeof imported.module.createExecutor, "function");
  assert.equal(typeof imported.module.runPaidOffer, "function");
  paymentFixture = JSON.parse(
    readFileSync(path.join(checkout.paidRoot, "fixtures/payment/reserved-fixture.json"), "utf8"),
  );
});

function requestFromResult(json, extras = {}) {
  const inputs = {};
  for (const [key, rec] of Object.entries(json.inputs || {})) {
    if (!rec) continue;
    if (rec.kind === "directory") {
      inputs[key] = rec.path;
      continue;
    }
    inputs[key] = rec.stagedPath;
  }
  return {
    jobId: json.job || "vendor-budget-impact",
    inputs,
    example: false,
    ...extras,
  };
}

function assertNotEngineCrash(result, stdout) {
  assert.equal(result.contract, EXECUTION_CONTRACT_VERSION, stdout || "");
  assert.notEqual(result.transport, "engine-crash", result.error || stdout || "");
  assert.notEqual(result.code, "engine-crash", result.error || stdout || "");
}

function receiptSha(result, name) {
  return (result.receipt?.inputs || []).find((row) => row.name === name)?.sha256 || null;
}

test("bindExecutionV1 refuses a mismatched contract version", async () => {
  await assert.rejects(
    () => bindExecutionV1({ EXECUTION_CONTRACT_VERSION: "not-execution.v1", createExecutor() {}, runPaidOffer() {} }),
    /contract mismatch/,
  );
});

test("positive: staged caller files feed execution.v1 CLI and library", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-files-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    "caller/vendor-budget-impact/before.json",
    "--after",
    "caller/vendor-budget-impact/after.json",
    "--input-root",
    "tools/job-input-preflight/fixtures",
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 0, pre.stderr || pre.stdout);
  assert.equal(pre.json.ok, true);
  const req = toWrapperRequest(pre.json);
  assert.equal(req.inputs.before, pre.json.inputs.before.stagedPath);
  assert.equal(req.inputs.after, pre.json.inputs.after.stagedPath);

  const libOut = mkdtempSync(path.join(tmpdir(), "jip-d01-lib-"));
  const libResult = await bind.runPaidOffer({ ...req, outDir: libOut });
  assertNotEngineCrash(libResult);
  assert.equal(libResult.ok, true, libResult.error);
  assert.equal(libResult.delivery.complete, true);
  assert.equal(libResult.sold, false);
  assert.equal(receiptSha(libResult, "before"), pre.json.inputs.before.sha256);
  assert.equal(receiptSha(libResult, "after"), pre.json.inputs.after.sha256);

  const cliOut = mkdtempSync(path.join(tmpdir(), "jip-d01-cli-"));
  const cli = runD01Cli(checkout.repoRoot, [
    "run",
    "vendor-budget-impact",
    "--before",
    req.inputs.before,
    "--after",
    req.inputs.after,
    "--out-dir",
    cliOut,
  ]);
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assertNotEngineCrash(cli.json);
  assert.equal(cli.json.ok, true, cli.json?.error);
  assert.equal(cli.json.delivery.complete, true);
  assert.equal(receiptSha(cli.json, "before"), pre.json.inputs.before.sha256);
});

test("positive: staged inline JSON files feed execution.v1 (not re-stringified text)", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-inline-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    INLINE_BEFORE,
    "--after",
    INLINE_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 0, pre.stderr || pre.stdout);
  assert.equal(pre.json.ok, true);
  assert.equal(pre.json.inputs.before.inline, true);
  const req = toWrapperRequest(pre.json);
  assert.equal(req.inputs.before, pre.json.inputs.before.stagedPath);
  assert.notEqual(req.inputs.before, INLINE_BEFORE);
  assert.equal(readFileSync(req.inputs.before, "utf8"), INLINE_BEFORE);

  const libOut = mkdtempSync(path.join(tmpdir(), "jip-d01-inline-lib-"));
  const libResult = await bind.runPaidOffer({ ...req, outDir: libOut });
  assertNotEngineCrash(libResult);
  assert.equal(libResult.ok, true, libResult.error);
  assert.equal(libResult.delivery.complete, true);
  assert.equal(receiptSha(libResult, "before"), pre.json.inputs.before.sha256);

  const cliOut = mkdtempSync(path.join(tmpdir(), "jip-d01-inline-cli-"));
  const cli = runD01Cli(checkout.repoRoot, [
    "run",
    "vendor-budget-impact",
    "--before",
    req.inputs.before,
    "--after",
    req.inputs.after,
    "--out-dir",
    cliOut,
  ]);
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(cli.json.ok, true, cli.json?.error);
  assert.equal(receiptSha(cli.json, "before"), pre.json.inputs.before.sha256);
});

test("negative: schema-invalid is refused here; D01 may still run the same staged bytes", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-schema-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    "invalid-schema/not-rows.json",
    "--after",
    "caller/vendor-budget-impact/after.json",
    "--input-root",
    "tools/job-input-preflight/fixtures",
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 2, pre.stdout);
  assert.equal(pre.json.code, "input-schema-mismatch");
  assert.ok(pre.json.inputs.before.stagedPath);

  const req = requestFromResult(pre.json);
  const libOut = mkdtempSync(path.join(tmpdir(), "jip-d01-schema-lib-"));
  const libResult = await bind.runPaidOffer({ ...req, outDir: libOut });
  assert.equal(libResult.contract, EXECUTION_CONTRACT_VERSION);
  assert.notEqual(libResult.code, "input-schema-mismatch");
  assertNotEngineCrash(libResult);
  // Remaining limit: execution.v1 does not pricing-row schema-check.

  const cliOut = mkdtempSync(path.join(tmpdir(), "jip-d01-schema-cli-"));
  const cli = runD01Cli(checkout.repoRoot, [
    "run",
    "vendor-budget-impact",
    "--before",
    req.inputs.before,
    "--after",
    req.inputs.after,
    "--out-dir",
    cliOut,
  ]);
  assert.equal(cli.json.contract, EXECUTION_CONTRACT_VERSION);
  assert.notEqual(cli.json.code, "input-schema-mismatch");
});

test("negative: SAMPLE sibling is disguised-sample here; D01 labels sample / rejects reserved-fixture", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-sample-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    "vendor-budget-impact/before.json",
    "--after",
    "vendor-budget-impact/after.json",
    "--input-root",
    "tools/job-input-preflight/fixtures",
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 2, pre.stdout);
  assert.equal(pre.json.code, "disguised-sample");
  assert.ok(pre.json.inputs.before.stagedPath);

  const req = requestFromResult(pre.json);
  const unfunded = await bind.runPaidOffer({
    ...req,
    outDir: mkdtempSync(path.join(tmpdir(), "jip-d01-sample-unfunded-")),
  });
  assert.equal(unfunded.contract, EXECUTION_CONTRACT_VERSION);
  assert.equal(unfunded.sample, true);
  assertNotEngineCrash(unfunded);
  assert.notEqual(unfunded.code, "sample-not-a-sale");

  const reserved = await bind.runPaidOffer({
    ...req,
    fundingIntent: "reserved-fixture",
    payment: paymentFixture,
    outDir: mkdtempSync(path.join(tmpdir(), "jip-d01-sample-reserved-")),
  });
  assert.equal(reserved.ok, false);
  assert.equal(reserved.code, "sample-not-a-sale");
  assert.equal(reserved.contract, EXECUTION_CONTRACT_VERSION);

  const cli = runD01Cli(checkout.repoRoot, [
    "run",
    "vendor-budget-impact",
    "--before",
    req.inputs.before,
    "--after",
    req.inputs.after,
    "--funding",
    "reserved-fixture",
    "--payment",
    path.join(checkout.paidRoot, "fixtures/payment/reserved-fixture.json"),
  ]);
  assert.equal(cli.status, 2, cli.stdout);
  assert.equal(cli.json.code, "sample-not-a-sale");
});

test("negative: inline SAMPLE staged bytes are disguised-sample here and sample on D01", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-inline-sample-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    INLINE_SAMPLE,
    "--after",
    INLINE_AFTER,
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 2, pre.stdout);
  assert.equal(pre.json.code, "disguised-sample");
  const req = requestFromResult(pre.json);
  assert.equal(readFileSync(req.inputs.before, "utf8"), INLINE_SAMPLE);

  const unfunded = await bind.runPaidOffer({
    ...req,
    outDir: mkdtempSync(path.join(tmpdir(), "jip-d01-inline-sample-lib-")),
  });
  assert.equal(unfunded.sample, true);
  assert.equal(unfunded.contract, EXECUTION_CONTRACT_VERSION);
  assertNotEngineCrash(unfunded);

  const reserved = await bind.runPaidOffer({
    ...req,
    fundingIntent: "reserved-fixture",
    payment: paymentFixture,
  });
  assert.equal(reserved.code, "sample-not-a-sale");
});

test("negative: 1MiB+1 is input-oversize on preflight and execution.v1 (not a green preflight)", async () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-d01-oversize-"));
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  writePaddedPricingJson(before, 256);
  writePaddedPricingJson(after, EXECUTION_MAX_INPUT_BYTES + 1, { value: 3 });
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-oversize-pre-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    before,
    "--after",
    after,
    "--input-root",
    work,
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 2, pre.stdout);
  assert.equal(pre.json.ok, false);
  assert.equal(pre.json.code, "input-oversize");
  assert.equal(pre.json.detail.max, EXECUTION_MAX_INPUT_BYTES);
  assert.equal(pre.json.detail.kitLimitBytes, 8 * 1024 * 1024);
  assert.equal(pre.json.detail.contract, EXECUTION_CONTRACT_VERSION);
  assert.ok(pre.json.inputs.after.stagedPath);
  assert.equal(pre.json.inputs.after.bytes, EXECUTION_MAX_INPUT_BYTES + 1);

  const req = requestFromResult(pre.json);
  const libResult = await bind.runPaidOffer({
    ...req,
    outDir: mkdtempSync(path.join(tmpdir(), "jip-d01-oversize-lib-")),
  });
  assert.equal(libResult.ok, false);
  assert.equal(libResult.code, "input-oversize");
  assert.equal(libResult.contract, EXECUTION_CONTRACT_VERSION);
  assert.equal(libResult.detail.max, EXECUTION_MAX_INPUT_BYTES);

  const cli = runD01Cli(checkout.repoRoot, [
    "run",
    "vendor-budget-impact",
    "--before",
    req.inputs.before,
    "--after",
    req.inputs.after,
  ]);
  assert.equal(cli.status, 2, cli.stdout);
  assert.equal(cli.json.code, "input-oversize");
  assert.equal(cli.json.contract, EXECUTION_CONTRACT_VERSION);
});

test("positive: exact 1MiB execution bound is accepted by preflight and D01", async () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-d01-1mib-"));
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  writePaddedPricingJson(before, 256, { value: 1 });
  writePaddedPricingJson(after, EXECUTION_MAX_INPUT_BYTES, { value: 2 });
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-d01-1mib-pre-"));
  const pre = runCli([
    "vendor-budget-impact",
    "--before",
    before,
    "--after",
    after,
    "--input-root",
    work,
    "--out-dir",
    outDir,
  ]);
  assert.equal(pre.status, 0, pre.stderr || pre.stdout);
  assert.equal(pre.json.ok, true);
  assert.equal(pre.json.inputs.after.bytes, EXECUTION_MAX_INPUT_BYTES);
  const req = toWrapperRequest(pre.json);
  const libResult = await bind.runPaidOffer({
    ...req,
    outDir: mkdtempSync(path.join(tmpdir(), "jip-d01-1mib-lib-")),
  });
  assertNotEngineCrash(libResult);
  assert.equal(libResult.ok, true, libResult.error);
  assert.equal(receiptSha(libResult, "after"), pre.json.inputs.after.sha256);
});

test("tested pin metadata matches CONTRACT.md at the D01 checkout", () => {
  const contract = readFileSync(path.join(checkout.paidRoot, "CONTRACT.md"), "utf8");
  assert.match(contract, /samedaydesk\.paid-useful-jobs\.execution\.v1/);
  assert.equal(TESTED_D01.executionContractVersion, EXECUTION_CONTRACT_VERSION);
  assert.equal(TESTED_D01.sha, "6bed72dd22a396134aa5c957933b42c3a5746698");
});
