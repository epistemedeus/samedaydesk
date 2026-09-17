import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const runner = join(here, "run.mjs");

function run(args, timeout = 30_000) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  let json = null;
  try {
    json = JSON.parse(String(result.stdout || "").trim().split("\n").at(-1));
  } catch {
    json = null;
  }
  return { ...result, json };
}

test("seeded false-accept SHA mismatch remaps child exit 0 to SEED_REJECT", () => {
  const result = run(["--seeded-failure", "false-accept", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.match(result.json.error.message, /false-accept/);
  assert.equal(result.json.error.detail.id, "archive-wrong-digest");
  assert.equal(result.json.error.detail.falseAccept, true);
  assert.equal(result.json.error.detail.honestProductVerdict, "reject");
  assert.equal(result.json.error.detail.naiveProductVerdict, "accept");
  assert.equal(result.json.result.case.observed.exitCode, 0);
  assert.equal(result.json.result.case.observed.json.code, "wrong-digest");
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded false-reject mapped offer-routing refuse is still caught", () => {
  const result = run(["--seeded-failure", "false-reject", "--json"]);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "SEED_REJECT");
  assert.match(result.json.error.message, /false-reject/);
  assert.equal(result.json.error.detail.id, "offer-routing-complete-issue");
  assert.equal(result.json.error.detail.falseReject, true);
  assert.equal(result.json.error.detail.honestCasePass, true);
  assert.equal(result.json.result.case.observed.exitCode, 2);
  assert.equal(result.json.result.case.observed.json.ok, false);
  assert.equal(result.json.result.case.observed.json.selected, null);
});

test("unknown seeded-failure id is usage exit 2", () => {
  const result = run(["--seeded-failure", "not-a-seed", "--json"]);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "USAGE");
});
