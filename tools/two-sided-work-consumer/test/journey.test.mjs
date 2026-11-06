import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  acceptDecision,
  citation,
  CLOCK,
  env,
  fittingPost,
  MEETS_ARTIFACT,
  postClaimDeliver,
  project,
  prove,
  REFUSED_ARTIFACT,
  selectAgent,
  tempJourney,
} from "./helpers.mjs";
import {
  claimWork,
  deliverWork,
  postWork,
  proveWork,
  releaseWork,
  selectWork,
  showWork,
} from "../src/commands.mjs";

test("post accepts a fitting request and refuses a non-fitting one", () => {
  const journeyPath = tempJourney();
  const posted = postWork(fittingPost(), env(journeyPath));
  assert.equal(posted.ok, true, JSON.stringify(posted));
  assert.equal(posted.ledger, false);
  assert.equal(posted.signer, false);
  assert.equal(posted.paymentCommand, false);
  assert.equal(posted.marketLiquidity, false);

  const missing = postWork(fittingPost({ title: "  ", taskId: "other-task" }), env(tempJourney()));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "title_required");

  const rewardField = postWork(fittingPost({ reward: "2000000", taskId: "reward-task" }), env(tempJourney()));
  assert.equal(rewardField.ok, false);
  assert.equal(rewardField.reason, "public_reward_disclosure_refused");

  const rewardInTitle = postWork(
    fittingPost({ title: "Pay 2000000 for the heading", taskId: "title-task" }),
    env(tempJourney()),
  );
  assert.equal(rewardInTitle.ok, false);
  assert.equal(rewardInTitle.reason, "public_reward_disclosure_refused");

  const again = postWork(fittingPost(), env(journeyPath));
  assert.equal(again.reason, "journey_exists");
});

test("claim fits once and a second holder is a double-claim", () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  const selfClaim = claimWork({ taskId: "heading-extract", holderId: "requester-1" }, env(journeyPath));
  assert.equal(selfClaim.reason, "self_claim_refused");
  const claimed = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath));
  assert.equal(claimed.ok, true, JSON.stringify(claimed));
  assert.equal(claimed.mode, "claim");
  const replay = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath));
  assert.equal(replay.replay, true);
  const second = claimWork({ taskId: "heading-extract", holderId: "agent-b" }, env(journeyPath));
  assert.equal(second.ok, false);
  assert.equal(second.reason, "double_claim");
  const missing = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(tempJourney()));
  assert.equal(missing.reason, "journey_missing");
});

test("selection conflict refuses a second agent and a claim by someone else", () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  const selected = selectAgent(journeyPath, "agent-a");
  assert.equal(selected.ok, true, JSON.stringify(selected));
  const other = selectAgent(journeyPath, "agent-b");
  assert.equal(other.reason, "selection_conflict");
  const outsider = claimWork({ taskId: "heading-extract", holderId: "agent-b" }, env(journeyPath));
  assert.equal(outsider.reason, "selection_conflict");
  const confirmed = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath));
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.mode, "claim");
  const reselect = selectAgent(journeyPath, "agent-a");
  assert.equal(reselect.reason, "selection_conflict");

  const stranger = tempJourney();
  assert.equal(postWork(fittingPost(), env(stranger)).ok, true);
  const mismatched = claimWork({ taskId: "missing", holderId: "agent-a" }, env(stranger));
  assert.equal(mismatched.reason, "task_mismatch");
});

test("selection by a non-requester is refused", () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  const bad = selectWork({
    taskId: "heading-extract",
    requesterId: "someone-else",
    holderId: "agent-b",
  }, env(journeyPath));
  assert.equal(bad.reason, "requester_required");
  assert.equal(selectAgent(journeyPath, "agent-a").ok, true);
});

test("delivery accepts the occupant and refuses the wrong holder, path, and verifier", () => {
  const journeyPath = tempJourney();
  const first = postClaimDeliver(journeyPath, MEETS_ARTIFACT, "heading-accepted");
  assert.equal(first.posted.ok, true, JSON.stringify(first.posted));
  assert.equal(first.claimed.ok, true, JSON.stringify(first.claimed));
  assert.equal(first.delivered.ok, true, JSON.stringify(first.delivered));
  assert.equal(first.delivered.revision, 1);

  const early = tempJourney();
  assert.equal(postWork(fittingPost(), env(early)).ok, true);
  const beforeClaim = deliverWork({
    taskId: "heading-extract",
    holderId: "agent-a",
    expectedRevision: 0,
    artifact: MEETS_ARTIFACT,
  }, env(early));
  assert.equal(beforeClaim.reason, "occupancy_required");

  const wrong = tempJourney();
  assert.equal(postWork(fittingPost(), env(wrong)).ok, true);
  assert.equal(claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(wrong)).ok, true);
  const otherHolder = deliverWork({
    taskId: "heading-extract",
    holderId: "agent-b",
    expectedRevision: 0,
    artifact: MEETS_ARTIFACT,
  }, env(wrong));
  assert.equal(otherHolder.reason, "holder_mismatch");
  const path = deliverWork({
    taskId: "heading-extract",
    holderId: "agent-a",
    expectedRevision: 0,
    artifact: MEETS_ARTIFACT,
    artifactPath: "artifacts/heading.json",
  }, env(wrong));
  assert.equal(path.reason, "artifact_path_refused");
  const verifier = deliverWork({
    taskId: "heading-extract",
    holderId: "agent-a",
    expectedRevision: 0,
    artifact: MEETS_ARTIFACT,
    verifierPayload: "run",
  }, env(wrong));
  assert.equal(verifier.reason, "verifier_refused");
});

test("substantive acceptance follows diagnose outcomes", () => {
  const meetsPath = tempJourney();
  assert.equal(postClaimDeliver(meetsPath, MEETS_ARTIFACT, "heading-accepted").delivered.ok, true);
  const meets = acceptDecision(meetsPath, "accept");
  assert.equal(meets.ok, true, JSON.stringify(meets));
  assert.equal(meets.evidenceOutcome, "meets_criteria");
  assert.equal(meets.accepted, true);
  assert.equal(meets.autoAccept, false);
  assert.equal(meets.toolAcceptance, "not_decided_by_tool");
  assert.equal(meets.paymentCommand, false);
  assert.ok(meets.unknownCosts.some((line) => line.kind === "review" && line.status === "unknown" && line.atomic === undefined));

  const refusedPath = tempJourney();
  assert.equal(postClaimDeliver(refusedPath, REFUSED_ARTIFACT, "heading-tampered").delivered.ok, true);
  const refused = acceptDecision(refusedPath, "refuse");
  assert.equal(refused.ok, true, JSON.stringify(refused));
  assert.equal(refused.evidenceOutcome, "refused");
  assert.equal(refused.accepted, false);

  const reviewPath = tempJourney();
  assert.equal(postClaimDeliver(reviewPath, MEETS_ARTIFACT, "not-the-heading").delivered.ok, true);
  const review = acceptDecision(reviewPath, "review");
  assert.equal(review.ok, true, JSON.stringify(review));
  assert.equal(review.evidenceOutcome, "needs_review");
  assert.equal(review.accepted, false);

  const badAccept = acceptDecision(tempJourney(), "accept");
  assert.equal(badAccept.reason, "journey_missing");
  const notSubstantiated = acceptDecision(refusedPath, "accept");
  assert.equal(notSubstantiated.reason, "decision_conflict");
  const freshRefused = tempJourney();
  assert.equal(postClaimDeliver(freshRefused, REFUSED_ARTIFACT, "heading-tampered").delivered.ok, true);
  const cannotAccept = acceptDecision(freshRefused, "accept");
  assert.equal(cannotAccept.reason, "acceptance_not_substantiated");
  assert.equal(cannotAccept.evidenceOutcome, "refused");
  const shown = showWork({ public: true }, env(freshRefused));
  assert.equal(shown.acceptance, null);
});

test("reusable proof omits the reward and refuses work that is not accepted or not consented", () => {
  const journeyPath = tempJourney();
  assert.equal(postClaimDeliver(journeyPath, MEETS_ARTIFACT, "heading-accepted").delivered.ok, true);
  const tooSoon = prove(journeyPath);
  assert.equal(tooSoon.reason, "acceptance_required");
  assert.equal(acceptDecision(journeyPath, "accept").ok, true);
  const proved = prove(journeyPath);
  assert.equal(proved.ok, true, JSON.stringify(proved));
  assert.equal(proved.rewardDisclosed, false);
  const text = JSON.stringify(proved.proof);
  assert.equal(text.includes("2000000"), false);
  assert.equal(text.includes("platformFeeAtomic"), false);
  assert.equal(text.includes("\"reward\""), false);
  assert.equal(proved.proof.rewardDisclosed, false);
  assert.equal(proved.proof.publicShowcase, true);
  assert.equal(proved.proof.marketLiquidity, false);

  const privateJourney = JSON.parse(readFileSync(journeyPath, "utf8"));
  assert.equal(privateJourney.task.grossAtomic, "2000000");
  assert.equal(privateJourney.ledger, false);

  const quiet = tempJourney();
  assert.equal(postClaimDeliver(quiet, MEETS_ARTIFACT, "heading-accepted", { publicationConsent: false }).delivered.ok, true);
  assert.equal(acceptDecision(quiet, "accept").accepted, true);
  const hidden = prove(quiet);
  assert.equal(hidden.reason, "publication_consent_required");

  const publicShown = showWork({ public: true }, env(journeyPath));
  assert.equal(publicShown.ok, true, JSON.stringify(publicShown));
  assert.equal(JSON.stringify(publicShown).includes("2000000"), false);
  assert.equal(publicShown.rewardDisclosed, false);
});

test("proof replay requires the same subject and sequence", () => {
  const journeyPath = tempJourney();
  assert.equal(postClaimDeliver(journeyPath, MEETS_ARTIFACT, "heading-accepted").delivered.ok, true);
  assert.equal(acceptDecision(journeyPath, "accept").ok, true);
  const proved = prove(journeyPath);
  assert.equal(proved.ok, true, JSON.stringify(proved));
  assert.equal(proved.proof.subject, "heading-extract-proof");
  assert.equal(proved.proof.sequence, 1);
  const replay = prove(journeyPath);
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(replay.replay, true);
  assert.equal(replay.proof.sequence, 1);
  const otherSequence = proveWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    subject: "heading-extract-proof",
    sequence: 2,
    optIn: true,
  }, env(journeyPath));
  assert.equal(otherSequence.ok, false);
  assert.equal(otherSequence.reason, "proof_identity_conflict");
  const otherSubject = proveWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    subject: "other-subject",
    sequence: 1,
    optIn: true,
  }, env(journeyPath));
  assert.equal(otherSubject.ok, false);
  assert.equal(otherSubject.reason, "proof_identity_conflict");
  const stored = JSON.parse(readFileSync(journeyPath, "utf8"));
  assert.equal(stored.proof.subject, "heading-extract-proof");
  assert.equal(stored.proof.sequence, 1);
  assert.equal(stored.proof.rewardDisclosed, false);
});

test("fee projection uses FEE_BPS 500 only when terms authorize it and keeps unknown costs unknown", () => {
  const authorizedPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(authorizedPath)).ok, true);
  const authorized = project(authorizedPath);
  assert.equal(authorized.ok, true, JSON.stringify(authorized));
  assert.equal(authorized.projection.authorized, true);
  assert.equal(authorized.projection.feeBps, 500);
  assert.equal(authorized.projection.feeBasis, "new_job_gross");
  assert.equal(authorized.projection.grossAtomic, "2000000");
  assert.equal(authorized.projection.platformFeeAtomic, "100000");
  assert.equal(authorized.projection.contributorNetAtomic, "1900000");
  assert.equal(authorized.projection.equalNet, true);
  assert.equal(authorized.projection.cumulativeFloorDelta, "0");
  assert.equal(authorized.projection.effortComparison, "costs_unknown");
  assert.equal(authorized.projection.directCostAtomic, "costs_unknown");
  assert.equal(authorized.projection.pricingInvented, false);
  assert.ok(authorized.projection.unknownCosts.some((line) => line.kind === "contributor" && line.status === "unknown"));
  assert.equal(JSON.stringify(authorized.projection.unknownCosts).includes("atomic"), false);

  const unauthorizedPath = tempJourney();
  assert.equal(postWork(fittingPost({
    terms: { feeBps: 100, feeBasis: "new_job_gross" },
    taskId: "heading-extract",
  }), env(unauthorizedPath)).ok, true);
  const unauthorized = project(unauthorizedPath);
  assert.equal(unauthorized.ok, true, JSON.stringify(unauthorized));
  assert.equal(unauthorized.projection.feeReadout, "terms_fee_bps_not_authorized");
  assert.equal(unauthorized.projection.authorized, false);
  assert.equal(unauthorized.projection.platformFeeAtomic, undefined);
  assert.equal(unauthorized.projection.feeBps, undefined);
  assert.equal(JSON.stringify(unauthorized.projection).includes("100000"), false);

  const unknownPath = tempJourney();
  const unknownPost = fittingPost();
  delete unknownPost.grossAtomic;
  delete unknownPost.railCostAtomic;
  assert.equal(postWork(unknownPost, env(unknownPath)).ok, true);
  const unknown = project(unknownPath);
  assert.equal(unknown.projection.feeReadout, "gross_unknown");
  assert.equal(unknown.projection.platformFeeAtomic, undefined);
  assert.equal(unknown.projection.effortComparison, "costs_unknown");
});

test("explicit occupancy release is not automatic and stops after delivery", () => {
  const journeyPath = tempJourney();
  assert.equal(postWork(fittingPost(), env(journeyPath)).ok, true);
  const claimed = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath));
  const automatic = releaseWork({
    holderId: "agent-a",
    fencing: claimed.fencing,
    automatic: true,
  }, env(journeyPath));
  assert.equal(automatic.reason, "automatic_unlock_refused");
  const wrong = releaseWork({ holderId: "agent-a", fencing: "not-the-token" }, env(journeyPath));
  assert.equal(wrong.reason, "fencing_mismatch");
  const released = releaseWork({ holderId: "agent-a", fencing: claimed.fencing }, env(journeyPath));
  assert.equal(released.ok, true, JSON.stringify(released));
  assert.equal(released.automaticUnlock, false);
  const next = claimWork({ taskId: "heading-extract", holderId: "agent-b" }, env(journeyPath));
  assert.equal(next.ok, true);

  const held = tempJourney();
  assert.equal(postClaimDeliver(held, MEETS_ARTIFACT, "heading-accepted").delivered.ok, true);
  const shown = showWork({}, env(held));
  const afterDelivery = releaseWork({
    holderId: "agent-a",
    fencing: shown.journey.occupancy.fencing,
  }, env(held));
  assert.equal(afterDelivery.reason, "delivery_holds_occupancy");
  assert.equal(CLOCK.length > 0, true);
  assert.equal(citation("heading-accepted")[0].digest, "heading-accepted");
});
