import assert from "node:assert/strict";
import test from "node:test";
import { runMaintenanceOccurrence } from "../src/occurrence.mjs";
import { changedPath, missingSkuPath, request, unchangedPath } from "./support.mjs";

test("one changed contract is a repair, accepted locally, and not a repurchase", async () => {
  const result = await runMaintenanceOccurrence(request());
  assert.equal(result.ok, true);
  assert.equal(result.detected, "changed");
  assert.equal(result.disposition, "repair");
  assert.equal(result.usefulness, "useful_positive");
  assert.equal(result.useful, true);
  assert.equal(result.acceptance, "accepted");
  assert.equal(result.acceptanceWinner, true);
  assert.equal(result.expiryWinner, false);
  assert.equal(result.localAcceptanceOnly, true);
  assert.equal(result.captured, false);
  assert.equal(result.settled, false);
  assert.equal(result.paid, false);
  assert.equal(result.canonicalSettlement, "not_joined");
  assert.equal(result.captureJoined, false);
  assert.equal(result.paidTaskIncrement, 0);
  assert.equal(result.repurchaseForced, false);
  assert.equal(result.reuseGranted, false);
  assert.equal(result.retainedSkuReused, true);
  assert.equal(result.procurement.repeatPurchase, null);
  assert.equal(result.procurement.mandateInherited, false);
  assert.equal(result.procurement.priorSpend, "outcome_unknown");
  assert.equal(result.funding.signature, "absent");
  assert.equal(result.funding.submitted, false);
  assert.equal(result.funding.confirmedUsableFunding, false);
  assert.equal(result.funding.paymentSent, false);
  assert.equal(result.funding.priorSpend, "outcome_unknown");
  assert.equal(result.economics.feeAtoms, "1");
  assert.deepEqual(result.economics.perCaptureNetAtoms, ["19"]);
  assert.equal(result.economics.capture, "not_captured");
  assert.equal(result.economics.authorization, "not_a_reservation");
  assert.equal(result.economics.submission, "not_submitted");
  assert.equal(result.economics.purchaseOffered, true);
  assert.equal(result.quoteWrites, 1);
  assert.equal(result.railPosts, 0);
  assert.equal(result.networkPosts, 0);
  assert.equal(result.posts, 1);
  assert.equal(result.secondPost, false);
  assert.equal(result.wrotePrior, false);
  assert.equal(result.wroteQueue, false);
  assert.equal(result.timerStarted, false);
  assert.equal(result.hJoin, "pending-join");
  assert.equal(result.chainQualified, false);
  assert.equal(result.lowestReliableReward, "unknown");
  assert.equal(result.tokenPriceRecommendation, null);
  assert.equal(result.economics.observedCompleteEffort, "unknown");
  assert.equal(result.economics.reviewBurden, "unknown");
  assert.equal(result.economics.reviewBurdenIsMoney, false);
  assert.equal(result.reuse.previewOk, true);
  assert.equal(result.reuse.granted, false);
  assert.equal(result.reuse.permission, "unavailable");
  assert.equal(result.reuse.observation, null);
  assert.equal(result.slots["repair-or-useful-no-fit"], "filled");
  assert.equal(result.slots["h-join"], "pending-join");
  assert.equal(result.supplier228200.rerun, false);
  assert.equal(result.finiteQueue228300.copied, false);
  assert.equal(JSON.stringify(result).includes("/home/"), false);
  assert.equal(JSON.stringify(result).includes("/tmp/"), false);
});

test("withdrawn access is a useful no-fit and does not grant reuse", async () => {
  const result = await runMaintenanceOccurrence(request({
    applicability: { accessWithdrawn: true },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.disposition, "useful_no_fit");
  assert.equal(result.usefulness, "useful_negative");
  assert.equal(result.usefulnessClass, "useful_negative");
  assert.equal(result.acceptance, "accepted");
  assert.equal(result.reuseGranted, false);
  assert.equal(result.paidTaskIncrement, 0);
  assert.equal(result.economics.purchaseOffered, false);
  assert.deepEqual(result.blockingReasons, ["access_withdrawn"]);
});

test("a missing sku is a useful no-fit", async () => {
  const result = await runMaintenanceOccurrence(request({ currentFixturePath: missingSkuPath }));
  assert.equal(result.disposition, "useful_no_fit");
  assert.equal(result.blockingReasons.includes("missing_sku"), true);
  assert.equal(result.retainedSkuReused, false);
  assert.equal(result.useful, true);
});

test("a non-MIT license plane and inherit-full are no-fits", async () => {
  const license = await runMaintenanceOccurrence(request({ applicability: { licensePlane: "proprietary" } }));
  const inherited = await runMaintenanceOccurrence(request({ applicability: { inheritFull: true } }));
  const rights = await runMaintenanceOccurrence(request({ applicability: { rightsCleared: false } }));
  assert.deepEqual(license.blockingReasons, ["license_plane"]);
  assert.deepEqual(inherited.blockingReasons, ["inherit_full"]);
  assert.deepEqual(rights.blockingReasons, ["rights_not_cleared"]);
  assert.equal(license.disposition, "useful_no_fit");
  assert.equal(inherited.disposition, "useful_no_fit");
  assert.equal(rights.disposition, "useful_no_fit");
});

test("an authorized reviewer can reject the repair", async () => {
  const result = await runMaintenanceOccurrence(request({ review: { decision: "reject" } }));
  assert.equal(result.ok, true);
  assert.equal(result.acceptance, "rejected");
  assert.equal(result.acceptanceWinner, false);
  assert.equal(result.useful, true);
  assert.equal(result.paid, false);
});

test("an unchanged contract is not yet due and HTTP 200 is not useful work", async () => {
  const quiet = await runMaintenanceOccurrence(request({ currentFixturePath: unchangedPath }));
  const claimed = await runMaintenanceOccurrence(request({
    currentFixturePath: unchangedPath,
    claimHttp200Useful: true,
  }));
  assert.equal(quiet.detected, "unchanged");
  assert.equal(quiet.disposition, "not_yet_due");
  assert.equal(quiet.acceptance, "not_applicable");
  assert.equal(quiet.paidTaskIncrement, 0);
  assert.equal(quiet.quoteWrites, 0);
  assert.equal(quiet.useful, true);
  assert.equal(claimed.defects.includes("http_200_is_not_useful_work"), true);
  assert.notEqual(claimed.acceptance, "accepted");
});

test("operator capture without a reviewer is not acceptance", async () => {
  const result = await runMaintenanceOccurrence(request({
    review: {
      reviewer: null,
      expectedReviewer: null,
      decision: null,
      operatorCapture: true,
      presentedReceipt: true,
    },
  }));
  assert.equal(result.acceptance, "approval_pending");
  assert.equal(result.incident, "receipt_without_authorized_review");
  assert.equal(result.defects.includes("operator_capture_not_acceptance"), true);
  assert.equal(result.paid, false);
  assert.equal(result.captured, false);
});

test("expiry wins over a late accept and keeps the artifact unsettled", async () => {
  const result = await runMaintenanceOccurrence(request({
    clock: "2026-10-14T19:00:00.000Z",
    expiry: "2026-10-14T18:00:00.000Z",
  }));
  assert.equal(result.ok, true);
  assert.equal(result.acceptance, "expiry_winner");
  assert.equal(result.expiryWinner, true);
  assert.equal(result.acceptanceWinner, false);
  assert.equal(result.artifactRetained, true);
  assert.equal(result.settled, false);
});

test("a receipt for another task is refused", async () => {
  const result = await runMaintenanceOccurrence(request({
    review: { presentedReceiptTaskId: "desk-batch-retain" },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "receipt_reuse");
  assert.equal(result.acceptance, "refused");
  assert.equal(result.useful, true);
  assert.equal(result.railPosts, 0);
  assert.equal(result.paidTaskIncrement, 0);
});

test("readback of the same digest does not post a second effect", async () => {
  const { runSourceChangeAlert } = await import("../../recurring-job-recipes/recipes/source-change-alert.mjs");
  const first = await runMaintenanceOccurrence(request());
  let reads = 0;
  const second = await runMaintenanceOccurrence(request({
    priorAttempt: { occurrenceId: first.occurrenceId, digest: first.digest },
  }), {
    detect: async (input) => {
      reads += 1;
      return runSourceChangeAlert(input);
    },
  });
  assert.equal(reads, 1);
  assert.equal(second.readback, true);
  assert.equal(second.executed, false);
  assert.equal(second.secondPost, false);
  assert.equal(second.posts, 1);
  assert.equal(second.acceptance, first.acceptance);
  assert.equal(second.disposition, first.disposition);
  assert.equal(second.digest, first.digest);
  assert.equal(second.railPosts, 0);
});
