import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  PROPOSAL_STATUS,
  RESULT_DISPOSITION,
  TASK_STATUS,
  reduceLifecycle,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (n) => JSON.parse(readFileSync(join(root, "fixtures", n), "utf8"));

test("positive: happy path completes without payment actions", () => {
  const state = reduceLifecycle(load("happy.json"));
  assert.equal(state.status, TASK_STATUS.COMPLETED);
  assert.equal(state.results[0].disposition, RESULT_DISPOSITION.ACCEPTED);
  assert.equal(state.results[0].applied, true);
  assert.deepEqual(state.paymentActions, []);
});

test("requester cancel then late result is late_after_cancel", () => {
  const state = reduceLifecycle(load("cancel-then-late.json"));
  assert.equal(state.status, TASK_STATUS.CANCELLED);
  assert.equal(state.proposals["prop-b"].status, PROPOSAL_STATUS.STALE);
  assert.equal(state.results[0].disposition, RESULT_DISPOSITION.LATE_AFTER_CANCEL);
  assert.equal(state.results[0].applied, false);
  assert.deepEqual(state.paymentActions, []);
});

test("withdrawn proposal then late result is late_after_withdraw", () => {
  const state = reduceLifecycle(load("withdraw-then-late.json"));
  assert.equal(state.proposals["prop-c"].status, PROPOSAL_STATUS.WITHDRAWN);
  assert.equal(state.results[0].disposition, RESULT_DISPOSITION.LATE_AFTER_WITHDRAW);
  assert.equal(state.results[0].applied, false);
});

test("negative: payment/refund fields forbidden on events", () => {
  assert.throws(
    () => reduceLifecycle(load("payment-forbidden.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("partial: proposal after cancel becomes stale immediately", () => {
  const state = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "requester_cancelled", at: "2026-09-10T16:01:00.000Z" },
    { type: "proposal_submitted", at: "2026-09-10T16:02:00.000Z", proposalId: "late-prop" },
  ]);
  assert.equal(state.status, TASK_STATUS.CANCELLED);
  assert.equal(state.proposals["late-prop"].status, PROPOSAL_STATUS.STALE);
  assert.equal(state.proposals["late-prop"].staleReason, "submitted_after_cancel");
});

test("F3: unknown/foreign result cannot complete; cancel not revived by task_opened", () => {
  const cancelled = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "requester_cancelled", at: "2026-09-10T16:02:00.000Z" },
    { type: "task_opened", at: "2026-09-10T16:03:00.000Z", taskId: "t" },
  ]);
  assert.equal(cancelled.status, TASK_STATUS.CANCELLED);

  const foreign = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:30.000Z", proposalId: "p2" },
    { type: "agreement_bound", at: "2026-09-10T16:02:00.000Z", proposalId: "p1" },
    { type: "result_submitted", at: "2026-09-10T16:03:00.000Z", proposalId: "p2", resultId: "r-foreign" },
  ]);
  assert.equal(foreign.status, TASK_STATUS.AGREED);
  assert.equal(foreign.results[0].disposition, RESULT_DISPOSITION.REJECTED_UNBOUND);
  assert.equal(foreign.results[0].applied, false);

  const unknown = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "agreement_bound", at: "2026-09-10T16:02:00.000Z", proposalId: "p1" },
    { type: "result_submitted", at: "2026-09-10T16:03:00.000Z", proposalId: "nope", resultId: "r-u" },
  ]);
  assert.equal(unknown.status, TASK_STATUS.AGREED);
  assert.equal(unknown.results[0].disposition, RESULT_DISPOSITION.REJECTED_UNBOUND);

  const dup = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "agreement_bound", at: "2026-09-10T16:02:00.000Z", proposalId: "p1" },
    { type: "result_submitted", at: "2026-09-10T16:03:00.000Z", proposalId: "p1", resultId: "r1" },
    { type: "result_submitted", at: "2026-09-10T16:04:00.000Z", proposalId: "p1", resultId: "r1" },
  ]);
  assert.equal(dup.results.length, 1);
  assert.equal(dup.status, TASK_STATUS.COMPLETED);
});

test("S171 R5: withdrawn proposal stays terminal; foreign resultId does not poison bound dedup", () => {
  const revived = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "proposal_withdrawn", at: "2026-09-10T16:02:00.000Z", proposalId: "p1" },
    { type: "proposal_submitted", at: "2026-09-10T16:03:00.000Z", proposalId: "p1" },
    { type: "proposal_submitted", at: "2026-09-10T16:04:00.000Z", proposalId: "p1" },
  ]);
  assert.equal(revived.proposals.p1.status, PROPOSAL_STATUS.STALE);
  assert.equal(revived.proposals.p1.terminalWithdraw, true);

  const poison = reduceLifecycle([
    { type: "task_opened", at: "2026-09-10T16:00:00.000Z", taskId: "t" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:00.000Z", proposalId: "p1" },
    { type: "proposal_submitted", at: "2026-09-10T16:01:30.000Z", proposalId: "p2" },
    { type: "agreement_bound", at: "2026-09-10T16:02:00.000Z", proposalId: "p1" },
    { type: "result_submitted", at: "2026-09-10T16:03:00.000Z", proposalId: "p2", resultId: "shared" },
    { type: "result_submitted", at: "2026-09-10T16:04:00.000Z", proposalId: "p1", resultId: "shared" },
  ]);
  assert.equal(poison.status, TASK_STATUS.COMPLETED);
  assert.equal(poison.results.length, 2);
  assert.equal(poison.results[0].disposition, RESULT_DISPOSITION.REJECTED_UNBOUND);
  assert.equal(poison.results[1].applied, true);
});
