import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_COMPLETE_ARTIFACT,
  DEFAULT_PARTIAL_ARTIFACT,
  PACK_COMPLETE_EXTRACT,
  REAL_MIXED_EXTRACT,
  REAL_INCOMPLETE_PAGE_CHANGE,
  REAL_PARTIAL_RECORD,
  SEEDED,
} from "./lib/catalog.mjs";
import { classifyFulfillment } from "./lib/classify.mjs";
import { inspectFulfillment } from "./lib/settle.mjs";
import { REPO_ROOT } from "./lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function loadRepoJson(rel) {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8"));
}

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    const line = (result.stdout || "").trim().split("\n").find((row) => row.startsWith("{"));
    json = line ? JSON.parse(line) : null;
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("real incomplete-failed-extract is partial and refuse-settle", () => {
  const input = loadRepoJson(DEFAULT_PARTIAL_ARTIFACT);
  const { classification, settle } = inspectFulfillment(input);
  assert.equal(classification.kind, "extract_batch");
  assert.equal(classification.partial, true);
  assert.equal(classification.complete, false);
  assert.equal(classification.failedSources, 3);
  assert.equal(classification.flagPartial, true);
  assert.equal(settle.decision, "refuse");
  assert.equal(settle.code, "PARTIAL_FULFILL");
  assert.equal(settle.settled, false);
  assert.equal(settle.paymentSent, false);
});

test("real mixed accepted-extract-batch is partial (1 failed source) even if charged", () => {
  const input = loadRepoJson(REAL_MIXED_EXTRACT);
  const { classification, settle } = inspectFulfillment(input);
  assert.equal(classification.partial, true);
  assert.equal(classification.charged, true);
  assert.ok(classification.reasons.includes("charged_is_not_settled"));
  assert.ok(classification.reasons.includes("flag_partial_true"));
  assert.equal(settle.decision, "refuse");
  assert.equal(settle.settled, false);
});

test("real incomplete page-change (claims.complete false) refuses settle", () => {
  const input = loadRepoJson(REAL_INCOMPLETE_PAGE_CHANGE);
  const { classification, settle } = inspectFulfillment(input);
  assert.equal(classification.kind, "page_change_brief");
  assert.equal(classification.partial, true);
  assert.equal(classification.claimsComplete, false);
  assert.equal(settle.decision, "refuse");
});

test("real partial record report refuses settle", () => {
  const input = loadRepoJson(REAL_PARTIAL_RECORD);
  const { classification, settle } = inspectFulfillment(input);
  assert.equal(classification.kind, "explicit_record");
  assert.equal(classification.partial, true);
  assert.equal(settle.decision, "refuse");
});

test("real complete page-change is eligible-unpaid, never settled", () => {
  const input = loadRepoJson(DEFAULT_COMPLETE_ARTIFACT);
  const { classification, settle } = inspectFulfillment(input);
  assert.equal(classification.kind, "page_change_brief");
  assert.equal(classification.complete, true);
  assert.equal(classification.partial, false);
  assert.equal(settle.decision, "eligible-unpaid");
  assert.equal(settle.code, "UNPAID_BOUNDARY");
  assert.equal(settle.settled, false);
});

test("pack-local complete extract-batch is eligible-unpaid", () => {
  const input = loadRepoJson(PACK_COMPLETE_EXTRACT);
  const classification = classifyFulfillment(input);
  assert.equal(classification.kind, "extract_batch");
  assert.equal(classification.complete, true);
  assert.equal(classification.partial, false);
  assert.equal(classification.failedSources, 0);
});

test("CLI cold refuse-settle against real incomplete extract-batch exits 0", () => {
  const result = run(["refuse-settle", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "refuse-settle");
  assert.equal(result.json.feature, "partial-fulfill");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.settled, false);
  assert.equal(result.json.boundary.liveFetch, false);
  assert.equal(result.json.result.partial, true);
  assert.equal(result.json.result.settleDecision, "refuse");
  assert.equal(result.json.result.settleCode, "PARTIAL_FULFILL");
  assert.equal(result.json.result.refusedSettle, true);
  assert.equal(result.json.result.settled, false);
  assert.match(result.json.result.fixture, /incomplete-failed-extract\.json$/);
});

test("bare CLI invocation is the same cold refuse-settle", () => {
  const result = run(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.command, "refuse-settle");
  assert.equal(result.json.result.refusedSettle, true);
});

test("CLI inspect mixed extract-batch refuses settle", () => {
  const result = run(["inspect", "--json", "--fixture", REAL_MIXED_EXTRACT]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.result.partial, true);
  assert.equal(result.json.result.settleDecision, "refuse");
  assert.equal(result.json.result.failedSources, 1);
});

test("CLI inspect complete page-change is eligible-unpaid", () => {
  const result = run(["inspect", "--json", "--fixture", DEFAULT_COMPLETE_ARTIFACT]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.result.complete, true);
  assert.equal(result.json.result.settleDecision, "eligible-unpaid");
  assert.equal(result.json.result.settled, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("CLI settle on partial exits 1 with PARTIAL_FULFILL", () => {
  const result = run(["settle", "--json", "--fixture", DEFAULT_PARTIAL_ARTIFACT]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PARTIAL_FULFILL");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.settled, false);
});

test("CLI settle on complete still refuses (UNPAID_BOUNDARY)", () => {
  const result = run(["settle", "--json", "--fixture", DEFAULT_COMPLETE_ARTIFACT]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.error.code, "UNPAID_BOUNDARY");
  assert.equal(result.json.result.settled, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded settle-partial exit 1 with SETTLE_PARTIAL", () => {
  const result = run(["--seeded-failure", "settle-partial", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SETTLE_PARTIAL");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.settled, false);
});

test("seeded forged-complete exit 1 with FORGED_COMPLETE", () => {
  const result = run(["--seeded-failure", "forged-complete", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "FORGED_COMPLETE");
  assert.equal(result.json.result.refused, true);
});

test("seeded silent-ok-partial exit 1 with SILENT_OK_PARTIAL", () => {
  const result = run(["--seeded-failure", "silent-ok-partial", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "SILENT_OK_PARTIAL");
});

test("seeded receipt-on-partial exit 1 with RECEIPT_ON_PARTIAL", () => {
  const result = run(["--seeded-failure", "receipt-on-partial", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "RECEIPT_ON_PARTIAL");
});

test("seeded payment-signature exit 1; header never sent", () => {
  const result = run(["--seeded-failure", "payment-signature", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "PAYMENT_HEADER_REFUSE");
  assert.equal(result.json.result.headerNeverSent, true);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded stripe-path exit 1; never opened checkout", () => {
  const result = run(["--seeded-failure", "stripe-path", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("seeded --live is refused with exit 2", () => {
  const liveFlag = run(["--live", "--json"]);
  assert.equal(liveFlag.status, 2, liveFlag.stderr);
  assert.equal(liveFlag.json.error.code, "LIVE_REFUSE");
  assert.equal(liveFlag.json.boundary.liveFetch, false);

  const liveSeed = run(["--seeded-failure", "live", "--json"]);
  assert.equal(liveSeed.status, 2, liveSeed.stderr);
  assert.equal(liveSeed.json.error.code, "LIVE_REFUSE");
});

test("fixture pointer yields settle-partial refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/partial-fulfill/fixtures/seeded/settle-partial.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "SETTLE_PARTIAL");
});

test("unknown seed is usage exit 2", () => {
  const result = run(["--seeded-failure", "not-a-real-seed", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "USAGE");
});

test("cold run-harness exit 0 (refuse ok + complete unpaid + seeds refuse)", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  let json = null;
  try {
    const line = (result.stdout || "").trim().split("\n").find((row) => row.startsWith("{"));
    json = line ? JSON.parse(line) : null;
  } catch {
    json = null;
  }
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.refuseOk, true);
  assert.equal(json.result.completeOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.settled, false);
  const seedSteps = json.result.steps.filter((s) => s.step.startsWith("seeded:"));
  assert.equal(seedSteps.length, Object.keys(SEEDED).length);
});

test("cite-apex documents settlement-proof without fetching", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.settled, false);
  assert.match(result.json.result.url, /settlement-proof/);
});

test("seeded-failures catalog lists every seed with expected exit", () => {
  const catalog = loadRepoJson("tools/verify-sds/partial-fulfill/fixtures/seeded-failures.json");
  assert.deepEqual(
    catalog.seeds.map((s) => s.id).sort(),
    Object.keys(SEEDED).sort(),
  );
  for (const seed of catalog.seeds) {
    assert.equal(seed.errorCode, SEEDED[seed.id].errorCode);
    assert.equal(seed.expectExit, SEEDED[seed.id].expectExit);
    assert.equal(seed.boundary.paymentSent, false);
    assert.equal(seed.boundary.settled, false);
  }
});
