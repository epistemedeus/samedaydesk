import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
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

test("cold unpaid tools/list exit 0 against loopback fixture", () => {
  const result = run(["tools/list", "--json"]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.command, "tools/list");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.deepEqual(result.json.result.tools, [
    "check_ai_readiness",
    "generate_complete_fix_pack",
    "plan_taskmarket_delegation",
    "browse_taskmarket_tasks",
    "track_taskmarket_task",
  ]);
  assert.equal(result.json.result.listedBeforeCall, true);
  assert.equal(result.json.result.paidToolListedNotCalled, "generate_complete_fix_pack");
  assert.equal(result.json.result.protocol, "2024-11-05");
});

test("tools/call refuse is non-zero; toolsCalled false; never pays", () => {
  const result = run(["tools/call", "generate_complete_fix_pack", "--json"]);
  assert.notEqual(result.status, 0, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.ok(
    result.json.error.code === "PAID_REFUSE" || result.json.error.code === "USAGE",
  );
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
});

test("seeded paid-tool-call exit ≠ 0 with PAID_REFUSE", () => {
  const result = run(["--seeded-failure", "paid-tool-call", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAID_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.neverPostedCall, true);
});

test("seeded payment-signature exit ≠ 0; header never sent", () => {
  const result = run(["--seeded-failure", "payment-signature", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "PAYMENT_HEADER_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.result.headerNeverSent, true);
});

test("seeded stripe-path exit ≠ 0 with STRIPE_PATH_REFUSE", () => {
  const result = run(["--seeded-failure", "stripe-path", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "STRIPE_PATH_REFUSE");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.result.neverOpenedCheckout, true);
});

test("fixture pointer yields paid-tool refuse", () => {
  const result = run([
    "--fixture",
    "tools/verify-sds/mcp-unpaid/fixtures/seeded/paid-tool-call.json",
    "--json",
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.json.error.code, "PAID_REFUSE");
});

test("cold run-harness exit 0 (list ok + seeds refuse)", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(result.stdout.trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.listOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
  assert.equal(json.boundary.toolsCalled, false);
});

test("apex-tools fixture matches catalog five", () => {
  const apex = JSON.parse(
    readFileSync(join(here, "fixtures/apex-tools.json"), "utf8"),
  );
  assert.equal(apex.tools.length, 5);
  assert.equal(apex.paidTool, "generate_complete_fix_pack");
  assert.ok(apex.tools.includes("check_ai_readiness"));
});

test("cite-apex documents live URL without calling tools", () => {
  const result = run(["cite-apex", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.boundary.toolsCalled, false);
  assert.equal(result.json.boundary.paymentSent, false);
  assert.match(result.json.result.url, /samedaydesk\.com\/mcp/);
});
