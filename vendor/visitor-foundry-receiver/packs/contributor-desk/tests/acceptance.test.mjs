import test from "node:test";
import assert from "node:assert/strict";
import { CODE, EXIT, SETTLEMENT_RECEIPT_VIEW } from "../src/constants.mjs";
import { createDesk } from "../src/desk.mjs";
import { hashTerms } from "../src/hash-terms.mjs";
import { isI01TermsVersion } from "../src/terms-version.mjs";
import { runDesk } from "./helpers.mjs";

test("Node engine is 22+", () => {
  const major = Number(process.versions.node.split(".")[0]);
  assert.ok(major >= 22, `expected Node >=22, got ${process.versions.node}`);
});

test("CLI browse is walletless and redacts owner internals", () => {
  const run = runDesk(["browse"]);
  assert.equal(run.status, EXIT.OK, run.stderr + run.stdout);
  assert.equal(run.json.ok, true);
  assert.equal(run.json.walletless, true);
  assert.equal(run.json.actualCompletion, false);
  const tasks = run.json.result.tasks;
  assert.ok(tasks.length >= 5);
  const open = tasks.find((task) => task.id === "tsk_open_alpha");
  assert.equal(open.claimable, true);
  assert.equal(open.fundingState, "reserved");
  assert.equal(isI01TermsVersion(open.termsVersion), true);
  assert.equal(Object.hasOwn(open, "budget"), false);
  const serialized = JSON.stringify(run.json);
  assert.doesNotMatch(serialized, /EARNED_WORK_OWNER_TOKEN/);
  assert.doesNotMatch(serialized, /dev-owner-token/);
});

test("CLI claim then status without a wallet", async () => {
  const desk = createDesk();
  const claim = await desk.claim({
    taskId: "tsk_open_alpha",
    contributorPublicId: "ctr_walrus",
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.result.walletless, true);
  assert.equal(claim.result.reservation.contributorPublicId, "ctr_walrus");
  assert.equal(claim.result.contributorSession.holdsPayoutKey, false);
  assert.equal(claim.result.contributorSession.notOwner, true);

  const status = await desk.status({ taskId: "tsk_open_alpha" });
  assert.equal(status.result.lifecycle, "claimed");
  assert.equal(status.result.paid, false);
  assert.equal(status.result.settled, false);
  assert.equal(status.result.transfer, null);
});

test("CLI journey covers browse, claim, status, appeal, owed-versus-paid", () => {
  const run = runDesk(["journey"]);
  assert.equal(run.status, EXIT.OK, run.stderr + run.stdout);
  assert.equal(run.json.walletlessBrowseClaimStatus, true);
  assert.equal(run.json.steps.browse.tasks.some((task) => task.id === "tsk_open_alpha"), true);
  assert.equal(run.json.steps.claim.reservation.contributorPublicId, "ctr_walrus");
  assert.equal(run.json.steps.status.lifecycle, "claimed");
  assert.equal(run.json.steps.appeal.notAnAccept, true);
  assert.equal(run.json.steps.appeal.appeal.status, "filed");
  const owed = run.json.steps.owedVersusPaid;
  assert.equal(owed.owed, true);
  assert.equal(owed.paid, false);
  assert.equal(owed.settled, false);
  assert.equal(owed.transfer, null);
  assert.equal(owed.unlike, true);
  assert.equal(owed.settlementReceiptView.owner, SETTLEMENT_RECEIPT_VIEW.owner);
  assert.equal(owed.settlementReceiptView.rendersSettlementReceipt, false);
});

test("unfunded listing is visible and not claimable", async () => {
  const desk = createDesk();
  const browse = await desk.browse();
  const unfunded = browse.result.tasks.find((task) => task.id === "tsk_unfunded_epsilon");
  assert.equal(unfunded.fundingState, "unfunded");
  assert.equal(unfunded.claimable, false);
  await assert.rejects(
    () => desk.claim({ taskId: "tsk_unfunded_epsilon", contributorPublicId: "ctr_walrus" }),
    (error) => error.code === CODE.UNFUNDED,
  );
});

test("exclusive reservation rejects a second contributor", async () => {
  const desk = createDesk();
  await assert.rejects(
    () => desk.claim({ taskId: "tsk_claimed_beta", contributorPublicId: "ctr_walrus" }),
    (error) => error.code === CODE.RESERVED_ELSEWHERE,
  );
});

test("integer termsVersion is rejected as a start-work key", async () => {
  const desk = createDesk();
  await assert.rejects(
    () =>
      desk.claim({
        taskId: "tsk_open_alpha",
        contributorPublicId: "ctr_walrus",
        termsVersion: 1,
      }),
    (error) => error.code === CODE.INTEGER_TERMS_VERSION_REJECTED,
  );
});

test("wallet fields are refused", async () => {
  const desk = createDesk();
  await assert.rejects(
    () =>
      desk.claim({
        taskId: "tsk_open_alpha",
        contributorPublicId: "ctr_walrus",
        wallet: "0xabc",
      }),
    (error) => error.code === CODE.NOT_WALLETLESS,
  );
});

test("I01 hash of canonical terms is stable", () => {
  const version = hashTerms({
    summary: "Label a public digest on a bounded fixture note.",
    reward: { amount: "0.10", asset: "USDC", network: "base" },
    claimTtlSeconds: 86400,
    maxArtifactBytes: 65536,
    allowedMediaTypes: ["text/plain", "application/json"],
    slotLimit: 1,
  });
  assert.equal(isI01TermsVersion(version), true);
});

test("late allowlisted address is not a payout key", async () => {
  const desk = createDesk();
  const claim = await desk.claim({
    taskId: "tsk_open_alpha",
    contributorPublicId: "ctr_late",
    payoutDestination: "usdc:base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  });
  assert.equal(claim.result.contributorSession.payoutDestination.startsWith("usdc:base:0x"), true);
  assert.equal(claim.result.contributorSession.holdsPayoutKey, false);
});
