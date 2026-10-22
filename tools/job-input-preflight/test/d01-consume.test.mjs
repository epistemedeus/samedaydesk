import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PREFLIGHT_CONTRACT, toWrapperRequest } from "../lib/contract.mjs";
import { EXECUTION_CONTRACT_VERSION, TESTED_D01 } from "../lib/constants.mjs";
import { ensureD01Checkout } from "../lib/d01-bind.mjs";
import { inspectStagedSample } from "../lib/sample.mjs";
import { runCli } from "./helpers.mjs";

const PIN = TESTED_D01.sha;

test("contract export names the tested D01 execution.v1 pin and remaining binding", () => {
  assert.equal(PREFLIGHT_CONTRACT.schema, "samedaydesk.job-input-preflight.v1");
  assert.equal(PREFLIGHT_CONTRACT.owner, "W5-D02");
  assert.equal(PREFLIGHT_CONTRACT.testedD01.sha, PIN);
  assert.equal(PREFLIGHT_CONTRACT.testedD01.pr, 74);
  assert.equal(PREFLIGHT_CONTRACT.testedD01.ref, "codex/w5-d01-20260911");
  assert.equal(PREFLIGHT_CONTRACT.executionContractVersion, EXECUTION_CONTRACT_VERSION);
  assert.match(PREFLIGHT_CONTRACT.remainingIntegrationBinding, /execution\.v1/);
  assert.match(PREFLIGHT_CONTRACT.remainingIntegrationBinding, /concurrent\/freeze/);
});

test("D01 inspectSample at 6bed72dd detects inline JSON SAMPLE; D02 CLI refuses it", async () => {
  const checkout = ensureD01Checkout();
  const guardPath = path.join(checkout.paidRoot, "lib/sample-guard.mjs");
  const mod = await import(pathToFileURL(guardPath).href);
  const inline = JSON.stringify({
    label: "SAMPLE",
    rows: [{ field: "wave5-d02-inline-input", value: 3, unit: "USD/1M-tokens" }],
  });
  const after = JSON.stringify({
    label: "caller",
    rows: [{ field: "wave5-d02-inline-input", value: 4, unit: "USD/1M-tokens" }],
  });
  const d01 = mod.inspectSample({ inputs: { before: inline, after } });
  assert.equal(d01.sample, true, "execution.v1 inspectSample reads inline JSON strings");

  const staged = inspectStagedSample({
    staged: [{ key: "before", inline: true, text: inline, buffer: Buffer.from(inline, "utf8") }],
  });
  assert.equal(staged.sample, true);
  assert.ok(staged.reasons.some((r) => r.includes("json-sample-label")));

  const cli = runCli(["vendor-budget-impact", "--before", inline, "--after", after, "--d01-root", checkout.paidRoot]);
  assert.equal(cli.status, 2, cli.stdout);
  assert.equal(cli.json.code, "disguised-sample");
  assert.equal(cli.json.sample, true);
});

test("toWrapperRequest maps staged custom files onto the D01 runPaidOffer input shape", () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "jip-wrap-"));
  const r = runCli([
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
  assert.equal(r.status, 0, r.stdout);
  const req = toWrapperRequest(r.json);
  assert.equal(req.jobId, "vendor-budget-impact");
  assert.equal(req.example, false);
  assert.equal(req.inputs.before, r.json.inputs.before.stagedPath);
  assert.equal(req.inputs.after, r.json.inputs.after.stagedPath);
  assert.equal(r.json.contract.testedD01.sha, PIN);
  assert.equal(r.json.executionContractVersion, EXECUTION_CONTRACT_VERSION);
});
