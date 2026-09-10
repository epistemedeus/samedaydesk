import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptFirstUseResponse, OUTCOME, NEXT_ACTION } from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fix = (n) => JSON.parse(readFileSync(join(root, "fixtures", n), "utf8"));

test("success discovery → artifact + confirm_budget nextAction", () => {
  const r = adaptFirstUseResponse(fix("attempt.success-discovery.json"));
  assert.equal(r.outcome, OUTCOME.SUCCESS);
  assert.equal(r.noKey, true);
  assert.equal(r.artifact.type, "listing_discovery");
  assert.equal(r.nextAction, NEXT_ACTION.CONFIRM_BUDGET);
  assert.equal(r.paidInvokeExecuted, false);
  assert.equal(r.artifact.listPriceUsd, 0.02);
  assert.equal(r.artifact.estimateReserveIsCharge, false);
});

test("failure discovery unavailable ≠ no_users", () => {
  const u = adaptFirstUseResponse(fix("attempt.failure-discovery.json"));
  const n = adaptFirstUseResponse(fix("attempt.failure-no-users.json"));
  assert.equal(u.outcome, OUTCOME.FAILURE);
  assert.equal(u.artifact.captureStatus, "unavailable");
  assert.equal(n.artifact.captureStatus, "no_users");
  assert.notEqual(u.artifact.captureStatus, n.artifact.captureStatus);
});

test("local offline success", () => {
  const r = adaptFirstUseResponse(fix("attempt.success-local.json"));
  assert.equal(r.outcome, OUTCOME.SUCCESS);
  assert.equal(r.nextAction, NEXT_ACTION.USE_LOCAL_OFFLINE);
});

test("reject paid invoke flag", () => {
  const r = adaptFirstUseResponse(fix("attempt.poison-paid.json"));
  assert.equal(r.outcome, OUTCOME.FAILURE);
  assert.equal(r.nextAction, NEXT_ACTION.STOP_PAID_RISK);
});

test("reject invented traffic", () => {
  const r = adaptFirstUseResponse(fix("attempt.poison-traffic.json"));
  assert.equal(r.outcome, OUTCOME.FAILURE);
  assert.match(r.error.code, /invented/);
});

test("agensi hold", () => {
  const r = adaptFirstUseResponse({ kind: "agensi" });
  assert.equal(r.nextAction, NEXT_ACTION.HOLD_AGENSI);
  assert.equal(r.artifact.installs, 0);
});
