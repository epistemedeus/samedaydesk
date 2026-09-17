import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  classifyScript,
  extractFenced,
  followQuickstart,
  loadPolicy,
  refuseSeed,
  REPO_ROOT,
} from "../follow.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, "..");
const followBin = join(docsRoot, "follow.mjs");

function runFollow(args = []) {
  return spawnSync(process.execPath, [followBin, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

test("path policy allowlist and refusals are present", () => {
  const policy = loadPolicy();
  assert.equal(policy.schema, "samedaydesk.agent-sds.path-policy.v1");
  assert.ok(policy.allowedPathPrefixes.includes("tools/presence/"));
  assert.ok(policy.allowedPathPrefixes.includes("docs/agent-sds/"));
  const reasons = new Set(policy.refuse.map((r) => r.reason));
  assert.ok(reasons.has("paid_extract_not_cold_follow"));
  assert.ok(reasons.has("neomorphic_out_of_scope"));
  assert.ok(reasons.has("checkout_mutation_refused"));
});

test("already-held extract-batch fixture path is allowed", () => {
  const classified = classifyScript(
    "node tools/result-reuse/cli.mjs preview --input tools/result-reuse/fixtures/accepted-extract-batch.json --task-id t --subject s --sequence 1 --clock 2026-09-17T00:00:00.000Z",
  );
  assert.equal(classified.allowed, true, JSON.stringify(classified.refusals));
});

test("paid extract, neomorphic vendor, and checkout are refused", () => {
  const paid = classifyScript("curl -X POST https://agents.samedaydesk.com/extract/batch");
  assert.equal(paid.allowed, false);
  assert.ok(paid.refusals.some((r) => r.reason === "paid_extract_not_cold_follow"));

  const neo = classifyScript("node vendor/neomorphic-correspondence/dist/migrate.js");
  assert.equal(neo.allowed, false);
  assert.ok(neo.refusals.some((r) => r.reason === "neomorphic_out_of_scope"));

  const checkout = classifyScript("curl -X POST https://samedaydesk.com/api/checkout/create-payment-intent");
  assert.equal(checkout.allowed, false);
  assert.ok(checkout.refusals.some((r) => r.reason === "checkout_mutation_refused"));
});

test("quickstart bash blocks are allowed SDS paths", () => {
  const md = readFileSync(join(docsRoot, "quickstart.md"), "utf8");
  const blocks = extractFenced(md, "bash");
  assert.ok(blocks.length >= 4, "quickstart must contain the unpaid loop");
  for (const block of blocks) {
    const classified = classifyScript(block.script);
    assert.equal(classified.allowed, true, classified.script + JSON.stringify(classified.refusals));
  }
});

test("cold follow-the-doc run exits 0", () => {
  const r = runFollow();
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "follow");
  assert.equal(report.executed, true);
  assert.equal(report.doc, "docs/agent-sds/quickstart.md");
  assert.ok(report.steps.length >= 4);
  assert.ok(report.steps.every((step) => step.failures.length === 0));
});

test("seeded wrong-path markdown is refused and not executed", () => {
  const r = runFollow(["--seed", "docs/agent-sds/fixtures/seeded-wrong-path.md"]);
  assert.equal(r.status, 2, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.mode, "seed");
  assert.equal(report.executed, false);
  assert.equal(report.error, "wrong_path_refused");
  const reasons = report.refusals.map((item) => item.reason);
  assert.ok(reasons.includes("paid_extract_not_cold_follow"), JSON.stringify(report.refusals, null, 2));
  assert.ok(reasons.includes("neomorphic_out_of_scope"));
  assert.ok(reasons.includes("checkout_mutation_refused"));
  assert.ok(reasons.includes("neomorphic_io_out_of_scope"));
});

test("seeded wrong-path JSON is refused", () => {
  const report = refuseSeed("docs/agent-sds/fixtures/seeded-wrong-path.json");
  assert.equal(report.executed, false);
  assert.equal(report.error, "wrong_path_refused");
  assert.ok(report.refusals.some((item) => item.reason === "paid_extract_not_cold_follow"));
});

test("scan of the Diataxis set finds no wrong-path bash", () => {
  const r = runFollow(["--scan"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.executed, false);
  assert.equal(report.refusals.length, 0);
});

test("library followQuickstart matches the CLI", () => {
  const report = followQuickstart();
  assert.equal(report.ok, true);
  assert.equal(report.executed, true);
});
