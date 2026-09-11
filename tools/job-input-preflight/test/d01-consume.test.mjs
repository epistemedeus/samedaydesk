import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PREFLIGHT_CONTRACT, toWrapperRequest } from "../lib/contract.mjs";
import { TESTED_D01 } from "../lib/constants.mjs";
import { REPO_ROOT } from "../lib/roots.mjs";
import { inspectStagedSample } from "../lib/sample.mjs";
import { runCli } from "./helpers.mjs";

const PIN = TESTED_D01.sha;

function extractD01SampleGuard() {
  const work = mkdtempSync(path.join(tmpdir(), "jip-d01-"));
  const archive = spawnSync("git", ["archive", PIN, "server/paid-useful-jobs/lib/sample-guard.mjs"], {
    cwd: REPO_ROOT,
    encoding: "buffer",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    throw new Error(
      `D01 pin ${PIN} is not available in this git object store: ${archive.stderr?.toString() || archive.status}`,
    );
  }
  const untar = spawnSync("tar", ["-x", "-C", work], { input: archive.stdout, encoding: "buffer" });
  if (untar.status !== 0) {
    throw new Error(`tar extract of D01 sample-guard failed: ${untar.stderr?.toString() || untar.status}`);
  }
  return path.join(work, "server/paid-useful-jobs");
}

test("contract export names the tested D01 pin and remaining binding", () => {
  assert.equal(PREFLIGHT_CONTRACT.schema, "samedaydesk.job-input-preflight.v1");
  assert.equal(PREFLIGHT_CONTRACT.owner, "W5-D02");
  assert.equal(PREFLIGHT_CONTRACT.testedD01.sha, PIN);
  assert.equal(PREFLIGHT_CONTRACT.testedD01.pr, 52);
  assert.match(PREFLIGHT_CONTRACT.remainingIntegrationBinding, /inspectSample misses inline JSON strings/);
});

test("D01 inspectSample at aeef964f misses inline JSON SAMPLE; D02 CLI refuses it", async () => {
  const d01Root = extractD01SampleGuard();
  const guardPath = path.join(d01Root, "lib/sample-guard.mjs");
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
  assert.equal(d01.sample, false, "current D01 pin treats inline JSON strings as missing paths");

  const staged = inspectStagedSample({
    staged: [{ key: "before", inline: true, text: inline, buffer: Buffer.from(inline, "utf8") }],
  });
  assert.equal(staged.sample, true);
  assert.ok(staged.reasons.some((r) => r.includes("json-sample-label")));

  const cli = runCli(["vendor-budget-impact", "--before", inline, "--after", after, "--d01-root", d01Root]);
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
});
