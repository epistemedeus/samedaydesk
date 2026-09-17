import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { USEFUL_JOBS } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pack = join(here, "..");
const root = join(pack, "../..");
const cli = join(pack, "cli.mjs");

function run(args, opts = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: opts.timeout ?? 120_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("run useful-jobs hashes 1.4.7, extracts, and lists ten jobs", () => {
  const extractDir = mkdtempSync(join(tmpdir(), "sds-lab-verify-test-uj-"));
  const result = run(["run", "useful-jobs", "--json", "--extract-dir", extractDir, "--keep"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.job, "useful-jobs");
  assert.equal(result.json.result.version, "1.4.7");
  assert.equal(result.json.result.sha256, USEFUL_JOBS.sha256);
  assert.deepEqual(result.json.result.jobIds, [...USEFUL_JOBS.jobIds]);
  assert.equal(result.json.receipt.schema, "samedaydesk.lab-verify.receipt.v1");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("run packs verifies three kit pins and distribution-repair sample", () => {
  const result = run(["run", "packs", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.job, "packs");
  assert.equal(result.json.result.distributionRepair.sampleOk, true);
  assert.equal(result.json.result.recordRepeat.sha256, "9814feabcda58c1f4a494a8919d9c6c2ac7d35b094ce5218261f976196c045ea");
  assert.equal(result.json.result.consumerRepeat.bytes, 718948);
  assert.equal(result.json.result.paymentSent, false);
});

test("run mcp lists five shipped tools and does not call them", () => {
  const result = run(["run", "mcp", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.job, "mcp");
  assert.deepEqual(result.json.result.tools, JSON.parse(readFileSync(join(pack, "fixtures/expected/mcp-tools.json"), "utf8")).tools);
  assert.equal(result.json.result.toolsCalled, false);
  assert.equal(result.json.boundary.toolsCalled, false);
});

test("run --all runs the three jobs", () => {
  const result = run(["run", "--all", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.job, "all");
  assert.deepEqual(result.json.jobs, ["useful-jobs", "packs", "mcp"]);
  assert.equal(result.json.result["useful-jobs"].ok, true);
  assert.equal(result.json.result.packs.ok, true);
  assert.equal(result.json.result.mcp.ok, true);
  assert.equal(result.json.receipt.jobId, "all");
});
