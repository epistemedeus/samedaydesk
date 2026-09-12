import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { discoverThenInvoke } from "../src/index.mjs";
import { findRepoRoot } from "../src/paths.mjs";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(KIT, "bin/discover-invoke.mjs");

function callerBudget(root) {
  const dir = join(root, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact");
  return {
    before: join(dir, "before.json"),
    after: join(dir, "after.json"),
  };
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

test("discover CLI prints current MCP remote and job id, not Railway first hit", () => {
  const root = findRepoRoot();
  const r = runCli(["discover"], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.mcp.current.remote, "https://agents.samedaydesk.com/mcp");
  assert.equal(body.mcp.naiveFirstHitIsCurrent, false);
  assert.equal(body.jobs.selected.id, "vendor-budget-impact");
  assert.equal(body.invoke.jobId, "vendor-budget-impact");
  assert.equal(body.invoke.kind, "paid-useful-jobs-cli");
});

test("journey discovers vendor-budget-impact by id then invokes the current wrapper CLI", async () => {
  const root = findRepoRoot();
  const outDir = mkdtempSync(join(tmpdir(), "w5-m13-journey-"));
  const inputs = callerBudget(root);
  const result = await discoverThenInvoke({
    jobId: "vendor-budget-impact",
    inputs,
    outDir,
  });
  assert.equal(result.ok, true, JSON.stringify(result.invoke, null, 2));
  assert.equal(result.failureClass, "analysis");
  assert.equal(result.outcome, "success");
  assert.equal(result.discovery.jobs.selected.id, "vendor-budget-impact");
  assert.equal(result.runtimeList.includes("vendor-budget-impact"), true);
  assert.equal(result.sold, false);
  assert.equal(result.invoke.body.fundingState, "unfunded");
  assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
  assert.equal(existsSync(join(outDir, "budget-impact.md")), true);
  const report = JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"));
  assert.equal(report.schema, "s233.useful-application.artifact.v1");
  assert.equal(report.appId, "vendor-budget-impact");
  assert.equal(report.status, "actionable");
  assert.equal(report.underlying.ok, true);
  assert.equal(report.underlying.counts.fieldChanges, 2);
  assert.equal(report.underlying.counts.added, 1);
  assert.equal(report.noPurchaseAuthority, true);
});

test("journey CLI process discovers then writes usable outputs", () => {
  const root = findRepoRoot();
  const outDir = mkdtempSync(join(tmpdir(), "w5-m13-cli-"));
  const inputs = callerBudget(root);
  const r = runCli(
    [
      "journey",
      "--job-id",
      "vendor-budget-impact",
      "--before",
      inputs.before,
      "--after",
      inputs.after,
      "--out-dir",
      outDir,
    ],
    root,
  );
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.failureClass, "analysis");
  assert.equal(body.discovery.mcp.current.version, "1.23.45");
  assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
});

test("identical before/after is still analysis, not transport failure", async () => {
  const root = findRepoRoot();
  const outDir = mkdtempSync(join(tmpdir(), "w5-m13-nochange-"));
  const before = callerBudget(root).before;
  const result = await discoverThenInvoke({
    jobId: "vendor-budget-impact",
    inputs: { before, after: before },
    outDir,
  });
  assert.equal(result.ok, true);
  assert.equal(result.failureClass, "analysis");
  assert.equal(result.outcome, "success");
  assert.equal(result.sold, false);
  const report = JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"));
  assert.equal(report.status, "informational");
  assert.equal(report.underlying.counts.fieldChanges, 0);
  assert.equal(report.underlying.counts.unchanged, 2);
  assert.notEqual(report.status, "actionable");
});
