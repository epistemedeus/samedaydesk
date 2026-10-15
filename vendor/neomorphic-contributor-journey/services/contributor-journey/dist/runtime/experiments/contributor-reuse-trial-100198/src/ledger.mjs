import {
  ALLOCATION,
  ALLOCATION_ATOMIC,
  ASSET,
  EXIT,
  EXPIRES_AT,
  MAX_ACCEPTED,
  NETWORK,
  OFFER_ID,
  REWARD,
  REWARD_ATOMIC,
  PROOF_USE,
  SCHEMA_CLAIM,
  SCHEMA_LEDGER,
  SCHEMA_READ_REQUEST,
  SCHEMA_REVOCATION,
  SCHEMA_SUBMISSION,
  TASK_SCOPE,
} from "./constants.mjs";
import { validPublicKey, verifyPurposeProof, verifySubmissionProof } from "./control.mjs";
import { contributorIdAccepted, reservationIdFor, sha256Text } from "./ids.mjs";
import { reviewSuppliedEvidence } from "./review.mjs";
import {
  buildOwedRecord,
  classifyReceipt,
  compareReader,
  emptyIsNotOwed,
  loadKernelPure,
  verdictIdFor,
} from "./kernel-compare.mjs";
import { containsPrivate } from "./privacy.mjs";
import { formatUsdc } from "./current-availability.mjs";
import { observeBaseTransfer, normalizeAddress } from "./chain-observation.mjs";
import { isObservedPaid, observedSpentAtomic } from "./settlement-state.mjs";

export { isObservedPaid, observedSpentAtomic };

export { sha256Text };

const HEX64 = /^[0-9a-f]{64}$/;
const KEY = /^sha256:[0-9a-f]{64}$/;

export function canonical(value) {
  return JSON.stringify(value);
}

function fail(ledger, exit, code, message) {
  return { ok: false, exit, code, message, ledger };
}

function ok(ledger, result, extra = {}) {
  assertAllocation(ledger);
  return { ok: true, exit: EXIT.ok, code: "ok", result, ledger, ...extra };
}

export function assertAllocation(ledger) {
  const accepted = Object.values(ledger.obligations);
  const committed = accepted.reduce((sum, row) => sum + BigInt(row.rewardAtomic), 0n);
  if (committed !== BigInt(ledger.allocation.committedAtomic)) {
    throw new Error("committed atomic drifted from obligations");
  }
  if (committed > ALLOCATION_ATOMIC) throw new Error("allocation exceeded");
  if (accepted.length > MAX_ACCEPTED) throw new Error("accepted count exceeded");
  if (accepted.length !== ledger.allocation.acceptedCount) throw new Error("accepted count drifted");
  const observed = observedSpentAtomic(ledger.obligations);
  if (!observed.ok) throw new Error("duplicate receipt");
  if (BigInt(ledger.allocation.spentAtomic) !== observed.spent) {
    if (observed.spent === 0n && ledger.allocation.spentAtomic !== "0") {
      throw new Error("spent must stay 0 in this adapter");
    }
    throw new Error("spent drifted from observed obligations");
  }
  if (observed.spent > committed) throw new Error("spent exceeds committed");
  if (ledger.allocation.escrowed !== false) throw new Error("escrowed must stay false");
  if (ledger.allocation.allocatedAtomic !== ALLOCATION_ATOMIC.toString()) throw new Error("allocated amount changed");
  if (ledger.allocation.amount !== ALLOCATION) throw new Error("allocated display changed");
  const ids = new Set(accepted.map((row) => row.obligationId));
  if (ids.size !== accepted.length) throw new Error("duplicate obligation id");
}

function digest(value) {
  return sha256Text(canonical(value));
}

export function freshLedger(terms, now) {
  return {
    schema: SCHEMA_LEDGER,
    offerId: OFFER_ID,
    termsVersion: terms.termsVersion,
    evidenceClass: "sponsored_evaluation",
    organicCustomer: false,
    customerRevenue: false,
    availability: {
      state: "prepared",
      openedAt: null,
      expiresAt: EXPIRES_AT,
      openedBy: null,
      expiryCancelsAccepted: false,
    },
    allocation: {
      amount: ALLOCATION,
      amountAtomic: ALLOCATION_ATOMIC.toString(),
      allocatedAtomic: ALLOCATION_ATOMIC.toString(),
      unit: REWARD,
      unitAtomic: REWARD_ATOMIC.toString(),
      committedAtomic: "0",
      spentAtomic: "0",
      escrowed: false,
      maxAccepted: MAX_ACCEPTED,
      acceptedCount: 0,
      asset: ASSET,
      network: NETWORK,
    },
    claims: {},
    submissions: {},
    obligations: {},
    createdAt: now,
  };
}

function reconcile(ledger, now) {
  const next = structuredClone(ledger);
  if (Date.parse(now) > Date.parse(next.availability.expiresAt)) {
    next.availability.state = "expired";
  }
  return next;
}

export function openLedger(existing, terms, now) {
  if (terms.offerId !== OFFER_ID) return fail(existing, EXIT.wrong_subject, "wrong_offer", "offer");
  if (!existing) {
    if (Date.parse(now) > Date.parse(EXPIRES_AT)) {
      return fail(null, EXIT.unavailable, "expired", "availability has expired");
    }
    const ledger = freshLedger(terms, now);
    ledger.availability = {
      state: "open",
      openedAt: now,
      expiresAt: EXPIRES_AT,
      openedBy: "root",
      expiryCancelsAccepted: false,
    };
    return ok(ledger, { opened: true, idempotentReplay: false });
  }
  if (existing.termsVersion !== terms.termsVersion) {
    return fail(existing, EXIT.stale_terms, "stale_terms", "ledger termsVersion is not current");
  }
  const ledger = reconcile(existing, now);
  if (ledger.availability.state === "expired") {
    return fail(ledger, EXIT.unavailable, "expired", "expired availability does not erase obligations and does not reopen");
  }
  if (ledger.availability.state === "open") {
    return ok(ledger, { opened: true, idempotentReplay: true });
  }
  ledger.availability.state = "open";
  ledger.availability.openedAt = now;
  ledger.availability.openedBy = "root";
  return ok(ledger, { opened: true, idempotentReplay: false });
}

export function importClaim(ledger, envelope, now) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "Root has not opened a ledger");
  const current = reconcile(ledger, now);
  if (containsPrivate(envelope)) {
    return fail(ledger, EXIT.private_input, "private_input", "claim contains private input and was not stored");
  }
  if (!envelope || envelope.schema !== SCHEMA_CLAIM) {
    return fail(current.availability.state === "expired" ? current : ledger, EXIT.wrong_subject, "wrong_offer", "claim schema");
  }
  if (envelope.offerId !== OFFER_ID || envelope.taskScope !== TASK_SCOPE) {
    return fail(ledger, EXIT.wrong_subject, "wrong_offer", "offer or task scope");
  }
  if (envelope.termsVersion !== ledger.termsVersion || !KEY.test(envelope.termsVersion)) {
    return fail(ledger, EXIT.stale_terms, "stale_terms", "claim termsVersion");
  }
  if (!KEY.test(envelope.idempotencyKey) || !HEX64.test(envelope.grantSha256)) {
    return fail(ledger, EXIT.usage, "bad_claim", "idempotency key or grant hash");
  }
  if (!contributorIdAccepted(envelope.contributorPublicId)) {
    return fail(ledger, EXIT.usage, "bad_claim", "contributor id");
  }
  const control = readControl(envelope);
  if (!control.ok) return fail(ledger, control.exit, control.code, control.message);
  if (envelope.walletRequired === true) {
    return fail(ledger, EXIT.wrong_subject, "wallet_required", "walletless submit is the route");
  }
  if (current.availability.state !== "open") {
    return fail(current, EXIT.unavailable, current.availability.state === "expired" ? "expired" : "not_open", "availability");
  }
  const body = claimBody(envelope);
  const bodySha = digest(body);
  const prior = current.claims[envelope.idempotencyKey];
  if (prior) {
    if (prior.bodySha256 !== bodySha) {
      return fail(current, EXIT.conflict, "idempotency_conflict", "same claim key with a different body");
    }
    const rewardCount = current.obligations[prior.reservationId] ? 1 : 0;
    return ok(current, { reservationId: prior.reservationId, idempotentReplay: true, lostReply: true, rewardCount });
  }
  const reservationId = reservationIdFor(current.termsVersion, envelope.idempotencyKey);
  current.claims[envelope.idempotencyKey] = {
    reservationId,
    idempotencyKey: envelope.idempotencyKey,
    bodySha256: bodySha,
    grantSha256: envelope.grantSha256,
    contributorPublicId: envelope.contributorPublicId,
    control: control.value,
    payoutDestinationSha256: null,
    taskScope: TASK_SCOPE,
    offerId: OFFER_ID,
    termsVersion: current.termsVersion,
    status: "active",
    createdAt: now,
  };
  return ok(current, { reservationId, idempotentReplay: false, lostReply: false, rewardCount: 0 });
}

function claimBody(envelope) {
  const body = {
    schema: envelope.schema,
    offerId: envelope.offerId,
    termsVersion: envelope.termsVersion,
    idempotencyKey: envelope.idempotencyKey,
    grantSha256: envelope.grantSha256,
    contributorPublicId: envelope.contributorPublicId,
    taskScope: envelope.taskScope,
  };
  if (envelope.control) body.control = readControl(envelope).value;
  return body;
}

function readControl(envelope) {
  if (!envelope?.control) return { ok: true, value: null, exit: EXIT.ok };
  const control = envelope.control;
  if (control.payoutSigner !== false || control.identityService !== false || control.hostedAuthenticator === true) {
    return { ok: false, exit: EXIT.wrong_subject, code: "proof_rejected", message: "control key is not a payout signer or an identity service" };
  }
  if (control.algorithm !== "Ed25519" || control.use !== PROOF_USE || !validPublicKey(control.publicKey)) {
    return { ok: false, exit: EXIT.usage, code: "bad_claim", message: "control public key" };
  }
  return {
    ok: true,
    exit: EXIT.ok,
    value: {
      algorithm: "Ed25519",
      publicKey: control.publicKey,
      use: PROOF_USE,
      payoutSigner: false,
      identityService: false,
      hostedAuthenticator: false,
    },
  };
}

function packetRedirect(submission) {
  if (submission?.payoutDestination || submission?.evidenceExport?.payoutDestination) {
    return "a later packet cannot set the payout destination";
  }
  if ((submission?.rewardAmount && submission.rewardAmount !== REWARD) || (submission?.evidenceExport?.reward && submission.evidenceExport.reward !== REWARD)) {
    return "a later packet cannot change the reward";
  }
  return null;
}

function proofFail(current, verdict) {
  const exit = verdict.code === "evidence_mismatch" ? EXIT.wrong_subject : EXIT.unauthenticated;
  return fail(current, exit, verdict.code, verdict.message);
}

function submissionBody(submission) {
  const copy = structuredClone(submission);
  delete copy.grantPreimage;
  return copy;
}

export async function importSubmission(ledger, submission, now, options = {}) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  const preimage = submission?.grantPreimage;
  if (containsPrivate(submission, typeof preimage === "string" ? preimage : null)) {
    return fail(ledger, EXIT.private_input, "private_input", "submission contains private input and was not stored");
  }
  const current = reconcile(ledger, now);
  if (!submission || submission.schema !== SCHEMA_SUBMISSION) {
    return fail(ledger, EXIT.wrong_subject, "wrong_offer", "submission schema");
  }
  if (submission.offerId !== OFFER_ID) return fail(ledger, EXIT.wrong_subject, "wrong_offer", "offerId");
  if (submission.taskScope !== TASK_SCOPE) return fail(ledger, EXIT.wrong_subject, "wrong_task", "task scope");
  if (submission.termsVersion !== ledger.termsVersion) {
    return fail(ledger, EXIT.stale_terms, "stale_terms", "submission termsVersion");
  }
  if (submission.endorsementRequired !== false || submission.referralRequired !== false || submission.preferredCommercialConclusion !== false) {
    return fail(ledger, EXIT.conditioned, "conditioned_reward", "reward is not conditioned on endorsement, referral, or a commercial conclusion");
  }
  if (submission.organicCustomer !== false || submission.customerRevenue !== false) {
    return fail(ledger, EXIT.wrong_subject, "relabel", "owner QA and this sponsored trial are not an organic customer");
  }
  const token = normalizeTokens(submission.tokenReceipts);
  if (!token.ok) return fail(ledger, EXIT.token_receipt, "token_receipt_unknown", token.message);
  const outcome = submission.outcome;
  if (outcome !== "useful_positive" && outcome !== "useful_negative") {
    return fail(ledger, EXIT.wrong_subject, "wrong_task", "outcome");
  }
  if (submission.releaseAcceptance === true || submission.readyForRelease === true
    || submission.original?.readyForRelease === true || submission.changed?.readyForRelease === true
    || submission.original?.accepted === true || submission.changed?.accepted === true) {
    return fail(current, EXIT.wrong_subject, "wrong_task", "utility check is not release acceptance");
  }
  const reservation = Object.values(current.claims).find((row) => row.reservationId === submission.reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "unknown reservation");
  const prior = current.submissions[reservation.reservationId];
  if (current.availability.state === "expired" && !prior) {
    return fail(current, EXIT.unavailable, "expired", "expired availability does not accept a new submission and does not erase an obligation");
  }
  if (reservation.status === "revoked" && !prior) {
    return fail(current, EXIT.unauthenticated, "proof_revoked", "revoked proof writes no accepted obligation");
  }
  const redirect = packetRedirect(submission);
  if (redirect) return fail(current, EXIT.redirect, "redirected_reward", redirect);
  if (submission.contributorPublicId && submission.contributorPublicId !== reservation.contributorPublicId) {
    return fail(current, EXIT.unauthenticated, "wrong_contributor", "submission contributor does not match the original claim");
  }
  const legacy = typeof preimage === "string" && preimage.length > 0 && sha256Text(preimage) === reservation.grantSha256;
  if (typeof preimage === "string" && preimage.length > 0 && !legacy) {
    return fail(current, EXIT.unauthenticated, "grant_mismatch", "original claim grant is required");
  }
  let authentication = "local_grant";
  let suppliedEvidenceSha256 = null;
  if (!legacy) {
    const verdict = verifySubmissionProof(reservation, submission);
    if (!verdict.ok) return proofFail(current, verdict);
    authentication = "message_proof";
    suppliedEvidenceSha256 = verdict.evidenceSha256;
    if (submission.evidenceClass !== "sponsored_evaluation") {
      return fail(current, EXIT.wrong_subject, "wrong_task", "mailbox receiving does not accept a fixture in place of Root review");
    }
  } else if (submission.controlProof) {
    const verdict = verifySubmissionProof(reservation, submission);
    if (!verdict.ok) return proofFail(current, verdict);
  }
  if (legacy && submission.evidenceClass === "sponsored_evaluation") {
    if (!options.evidence || !measurementMatches(submission, options.evidence)) {
      return fail(current, EXIT.wrong_subject, "wrong_task", "submission does not match the measured replay");
    }
  } else if (legacy && submission.evidenceClass !== "fixture") {
    return fail(current, EXIT.wrong_subject, "wrong_task", "evidence class");
  }
  if (!shapeOk(submission)) return fail(current, EXIT.wrong_subject, "wrong_task", "replay shape");
  const body = submissionBody(submission);
  body.tokenReceipts = token.value;
  const bodySha = digest(body);
  if (prior) {
    if (prior.idempotencyKey === submission.idempotencyKey && prior.bodySha256 === bodySha) {
      return ok(current, { submissionId: prior.submissionId, idempotentReplay: true, duplicateRefused: false, rewardCount: prior.rewardCount });
    }
    if (prior.idempotencyKey === submission.idempotencyKey) {
      return fail(current, EXIT.conflict, "idempotency_conflict", "same submission key with a different body");
    }
    return fail(current, EXIT.duplicate, "duplicate_submission", "one submission per reservation");
  }
  let rootReview = null;
  if (authentication === "message_proof") {
    const reviewed = reviewSuppliedEvidence(submission.evidenceExport, submission, options.repoRoot);
    if (!reviewed.ok) return fail(current, EXIT.wrong_subject, "evidence_mismatch", reviewed.message);
    rootReview = reviewed.rootReview;
    suppliedEvidenceSha256 = rootReview.suppliedEvidenceSha256;
  }
  const submissionId = `sub_${sha256Text(submission.idempotencyKey).slice(0, 24)}`;
  current.submissions[reservation.reservationId] = {
    submissionId,
    reservationId: reservation.reservationId,
    idempotencyKey: submission.idempotencyKey,
    bodySha256: bodySha,
    outcome,
    evidenceClass: submission.evidenceClass,
    organicCustomer: false,
    customerRevenue: false,
    tokenReceipts: token.value,
    effort: submission.effort,
    original: submission.original,
    changed: submission.changed,
    compatibility: submission.compatibility,
    authentication,
    suppliedEvidenceSha256,
    rootReview,
    claimedMeasurementIsWorkProof: false,
    signatureIsWorkProof: false,
    status: "submitted",
    createdAt: now,
    rewardCount: 0,
  };
  reservation.status = "submitted";
  return ok(current, {
    submissionId,
    idempotentReplay: false,
    duplicateRefused: false,
    rewardCount: 0,
    authentication,
    review: rootReview ? {
      independent: true,
      matchesSupplied: true,
      archiveSha256: rootReview.archiveSha256,
      acceptedClaimedMeasurementAsProof: false,
      signatureAcceptedAsWorkProof: false,
    } : null,
  });
}

function shapeOk(submission) {
  const original = submission.original;
  const changed = submission.changed;
  if (!original || !changed) return false;
  if (original.status !== "utility_ok_not_release" || original.exitCode !== 0) return false;
  if (submission.outcome === "useful_positive") {
    return changed.status === "utility_ok_not_release" && changed.exitCode === 0 && submission.compatibility?.appliesToChangedTask === true;
  }
  return changed.status === "integrated_partial"
    && Array.isArray(changed.failures)
    && changed.failures.includes("not_string:title")
    && submission.compatibility?.agreedNegative === "not_string:title";
}

function measurementMatches(submission, evidence) {
  if (submission.outcome === "useful_positive") {
    return submission.original?.stableSha256 === evidence.original.stableSha256
      && submission.changed?.stableSha256 === evidence.positive.stableSha256
      && submission.changed?.taskId === evidence.positive.taskId;
  }
  return submission.original?.stableSha256 === evidence.original.stableSha256
    && submission.changed?.stableSha256 === evidence.negative.stableSha256
    && submission.changed?.taskId === evidence.negative.taskId;
}

function normalizeTokens(value) {
  if (value == null) return { ok: true, value: { kind: "unknown" } };
  if (value.kind === "unknown" && value.tokens == null && value.amount == null) return { ok: true, value: { kind: "unknown" } };
  return { ok: false, message: "token amounts are unknown unless a real receipt is present; zero is not a measurement" };
}

export async function decide(ledger, decision, now, repoRoot) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  const current = reconcile(ledger, now);
  const reservation = Object.values(current.claims).find((row) => row.reservationId === decision?.reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "reservation");
  if (decision.termsVersion && decision.termsVersion !== current.termsVersion) {
    return fail(current, EXIT.stale_terms, "stale_terms", "decision terms");
  }
  if (decision.offerId && decision.offerId !== OFFER_ID) {
    return fail(current, EXIT.wrong_subject, "wrong_offer", "decision offer");
  }
  if (decision.amount && decision.amount !== REWARD) {
    return fail(current, EXIT.redirect, "redirected_reward", "amount retarget refused");
  }
  if (decision.contributorPublicId && decision.contributorPublicId !== reservation.contributorPublicId) {
    return fail(current, EXIT.redirect, "redirected_reward", "contributor retarget refused");
  }
  if (decision.payoutDestination) {
    return fail(current, EXIT.redirect, "redirected_reward", "a destination on accept is not settlement");
  }
  const existing = current.obligations[reservation.reservationId];
  if (existing) {
    if (decision.outcome === "accept") {
      const observedPaid = isObservedPaid(existing);
      return ok(current, {
        obligationId: existing.obligationId,
        idempotentReplay: true,
        rewardCount: 1,
        state: observedPaid ? "paid" : "owed",
        paid: observedPaid,
      });
    }
    return fail(current, EXIT.redirect, "redirected_reward", "an accepted obligation cannot be retargeted");
  }
  if (reservation.status === "rejected") {
    return fail(current, EXIT.conflict, "idempotency_conflict", "reservation already rejected");
  }
  const submission = current.submissions[reservation.reservationId];
  if (!submission) return fail(current, EXIT.wrong_subject, "wrong_task", "no submission");
  if (reservation.status === "revoked") {
    return fail(current, EXIT.unauthenticated, "proof_revoked", "revoked proof writes no accepted obligation");
  }
  if (current.availability.state === "expired") {
    return fail(current, EXIT.unavailable, "expired", "expired availability does not create an obligation");
  }
  if (submission.authentication === "message_proof") {
    const review = submission.rootReview;
    if (!review || review.independent !== true || review.matchesSupplied !== true
      || review.signatureAcceptedAsWorkProof !== false || review.acceptedClaimedMeasurementAsProof !== false
      || review.reuseGain !== null || review.releaseAcceptance !== false) {
      return fail(current, EXIT.wrong_subject, "wrong_task", "acceptance requires independent Root review");
    }
  }
  if (decision.outcome === "reject") {
    reservation.status = "rejected";
    submission.status = "rejected";
    return ok(current, { state: "reject", rewardCount: 0, obligationId: null });
  }
  if (decision.outcome !== "accept") return fail(current, EXIT.usage, "bad_decision", "outcome");
  if (current.allocation.acceptedCount >= MAX_ACCEPTED) {
    return fail(current, EXIT.oversubscribed, "oversubscribed", "five accepted obligations is the allocation");
  }
  const pure = await loadKernelPure(repoRoot);
  const empty = emptyIsNotOwed(pure.reconcilePayout);
  if (empty.owed !== false || empty.paid !== false || empty.adapter !== "null_nonpaying_v0") {
    return fail(current, EXIT.wrong_subject, "kernel_drift", "empty kernel projection is not owed");
  }
  const obligationId = `obl_${sha256Text(`${reservation.reservationId}\n${submission.submissionId}`).slice(0, 24)}`;
  const kernelRecord = buildOwedRecord(pure, {
    obligationId,
    reservationId: reservation.reservationId,
    submissionId: submission.submissionId,
    contributorPublicId: reservation.contributorPublicId,
    termsVersion: current.termsVersion,
    idempotencyKey: submission.idempotencyKey,
    createdAt: now,
    verdictId: verdictIdFor(submission.changed.stableSha256),
  });
  const payout = pure.reconcilePayout({ payoutState: "owed", obligation: kernelRecord });
  if (payout.paid !== false || payout.settled !== false || payout.transfer !== null || payout.owed !== true) {
    return fail(current, EXIT.wrong_subject, "kernel_drift", "kernel owed record is not an IOU");
  }
  const readerFields = {
    reservationId: reservation.reservationId,
    grantSha256: reservation.grantSha256,
    termsVersion: current.termsVersion,
    submittedAt: submission.createdAt,
    acceptedAt: now,
    expiresAt: current.availability.expiresAt,
    outcome: submission.outcome,
    accepted: true,
  };
  const authed = compareReader(repoRoot, readerFields, { kind: "authorized_original_claim", grantSha256: reservation.grantSha256 }, now);
  const stranger = compareReader(repoRoot, readerFields, { kind: "public" }, now);
  if (authed.conformance.readback !== "owed" || stranger.conformance.readback !== "none") {
    return fail(current, EXIT.wrong_subject, "kernel_drift", "public acceptance is not a claim");
  }
  if (stranger.projection.nextAction !== "do_not_claim") {
    return fail(current, EXIT.wrong_subject, "kernel_drift", "stranger next action");
  }
  current.obligations[reservation.reservationId] = {
    obligationId,
    reservationId: reservation.reservationId,
    submissionId: submission.submissionId,
    contributorPublicId: reservation.contributorPublicId,
    reward: REWARD,
    rewardAtomic: REWARD_ATOMIC.toString(),
    asset: ASSET,
    network: NETWORK,
    payoutState: "owed",
    paid: false,
    settled: false,
    transfer: null,
    state: "owed",
    accepted_by_root: true,
    outcome: submission.outcome,
    evidenceClass: submission.evidenceClass,
    organicCustomer: false,
    customerRevenue: false,
    termsVersion: current.termsVersion,
    createdAt: now,
    kernel: {
      adapter: payout.adapter,
      owed: payout.owed,
      paid: payout.paid,
      settled: payout.settled,
      transfer: payout.transfer,
      sale: payout.sale,
      record: kernelRecord,
    },
    settlement: { kind: "unknown", verified: false, chainObserved: false, paid: false },
    projection: {
      machineStatus: authed.projection.machineStatus,
      usefulNegativeEarns: authed.projection.usefulNegativeEarns,
      publicNextAction: stranger.projection.nextAction,
      publicReadback: stranger.conformance.readback,
    },
  };
  current.allocation.acceptedCount += 1;
  current.allocation.committedAtomic = (BigInt(current.allocation.committedAtomic) + REWARD_ATOMIC).toString();
  reservation.status = "accepted";
  submission.status = "accepted";
  submission.rewardCount = 1;
  return ok(current, { obligationId, state: "owed", idempotentReplay: false, rewardCount: 1, paid: false });
}

function claimFor(ledger, reservationId) {
  return Object.values(ledger.claims ?? {}).find((row) => row.reservationId === reservationId) ?? null;
}

function bindAuthorizedDestination(current, row, destination) {
  if (!destination) return { ok: true, bound: false };
  const normalized = normalizeAddress(destination);
  const hash = sha256Text(normalized ?? destination);
  const originalHash = sha256Text(destination);
  const claim = claimFor(current, row.reservationId);
  const bindings = [claim?.payoutDestinationSha256, row.payoutDestinationSha256].filter(Boolean);
  if (bindings.some((bound) => bound !== hash && bound !== originalHash)) {
    return { ok: false, exit: EXIT.redirect, code: "redirected_reward", message: "payout destination redirect refused" };
  }
  // Old settle hashed the original casing. Accept that exact original input,
  // retain its binding, and normalize only the same EVM address.
  if (claim) {
    if (claim.payoutDestinationSha256 && claim.payoutDestinationSha256 !== hash) {
      claim.payoutDestinationLegacySha256 = claim.payoutDestinationSha256;
    }
    claim.payoutDestinationSha256 = hash;
    if (normalized) claim.payoutDestination = normalized;
  }
  if (row.payoutDestinationSha256 && row.payoutDestinationSha256 !== hash) {
    row.payoutDestinationLegacySha256 = row.payoutDestinationSha256;
  }
  row.payoutDestinationSha256 = hash;
  return { ok: true, bound: true };
}

function unknownSettlement(classified) {
  return {
    kind: classified.assessment.kind,
    reason: classified.reason,
    verified: false,
    chainObserved: false,
    paid: false,
  };
}

export function settle(ledger, request) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  const current = structuredClone(ledger);
  const row = current.obligations[request?.reservationId];
  if (!row) return fail(ledger, EXIT.wrong_subject, "wrong_task", "no accepted obligation");
  const bound = bindAuthorizedDestination(current, row, request?.payoutDestination);
  if (!bound.ok) return fail(ledger, bound.exit, bound.code, bound.message);
  const classified = classifyReceipt(
    { reservationId: row.reservationId },
    request?.receipt ?? null,
  );
  if (isObservedPaid(row)) {
    assertAllocation(current);
    return {
      ok: false,
      exit: EXIT.settlement_unknown,
      code: "already_paid",
      message: "observed payment stays paid; a supplied receipt does not pay or clear it",
      result: { state: "paid", paid: true, unchanged: true, code: "already_paid", settlement: row.settlement },
      ledger: current,
    };
  }
  row.settlement = unknownSettlement(classified);
  row.paid = false;
  row.settled = false;
  row.kernel.paid = false;
  row.state = "owed";
  row.payoutState = "owed";
  assertAllocation(current);
  return {
    ok: false,
    exit: EXIT.settlement_unknown,
    code: classified.assessment.reason === "task_mismatch" ? "task_mismatch" : "settlement_unknown",
    message: "settlement is unknown until Root observes a chain receipt; this command does not pay",
    result: { state: "owed", paid: false, settlement: row.settlement },
    ledger: current,
  };
}

function observationFailure(current, row, code, message) {
  const paid = isObservedPaid(row);
  return {
    ok: false,
    exit: code === "redirected_reward" ? EXIT.redirect : code === "unavailable" || code === "rpc_unconfigured" ? EXIT.unavailable : EXIT.settlement_unknown,
    code,
    message,
    result: {
      state: paid ? "paid" : "owed",
      paid,
      unchanged: paid,
      code,
      settlement: row.settlement,
    },
    ledger: current,
  };
}

function applyObservedSpend(ledger) {
  const observed = observedSpentAtomic(ledger.obligations);
  if (!observed.ok) return observed;
  ledger.allocation.spentAtomic = observed.spent.toString();
  return observed;
}

export async function observeSettlement(ledger, request, options = {}) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  if (request?.broadcast === true || request?.sign === true || request?.send === true) {
    return fail(ledger, EXIT.wrong_subject, "not_a_payment", "observe does not sign, broadcast, or send");
  }
  const current = structuredClone(ledger);
  const row = current.obligations[request?.reservationId];
  if (!row) return fail(ledger, EXIT.wrong_subject, "wrong_task", "no accepted obligation");
  const claim = claimFor(current, row.reservationId);
  if (!claim) return fail(current, EXIT.wrong_subject, "wrong_task", "original claim is missing");
  const authorized = normalizeAddress(request?.destination) ?? (normalizeAddress(claim.payoutDestination) && !request?.destination ? claim.payoutDestination : null);
  if (request?.destination && !normalizeAddress(request.destination)) {
    return observationFailure(current, row, "malformed", "destination is not a Base address");
  }
  if (!authorized) return observationFailure(current, row, "destination_missing", "destination comes from the accepted claim or authorized Root input");
  const bound = bindAuthorizedDestination(current, row, request?.destination ?? claim.payoutDestination);
  if (!bound.ok) return fail(ledger, bound.exit, bound.code, bound.message);
  const source = normalizeAddress(request?.source);
  if (!source) return observationFailure(current, row, "malformed", "source is not a Base address");
  const observedTx = typeof request?.txHash === "string" ? request.txHash.toLowerCase() : "";
  if (isObservedPaid(row) && observedTx && row.settlement.transactionHash === observedTx) {
    assertAllocation(current);
    return {
      ok: true,
      exit: EXIT.ok,
      code: "ok",
      result: {
        state: "paid",
        paid: true,
        idempotentReplay: true,
        obligationId: row.obligationId,
        spentAtomic: current.allocation.spentAtomic,
        settlement: row.settlement,
      },
      ledger: current,
    };
  }
  if (isObservedPaid(row)) {
    return observationFailure(current, row, "already_paid", "observed payment stays paid; a second receipt does not spend again");
  }
  const fetched = await observeBaseTransfer(request?.txHash, {
    reservationId: row.reservationId,
    rpcUrl: options.rpcUrl,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
  });
  if (!fetched.ok) return observationFailure(current, row, fetched.code, fetched.message);
  const seen = fetched.observation;
  if (seen.assessment?.reason === "task_mismatch") {
    return observationFailure(current, row, "task_mismatch", "receipt is bound to a different task");
  }
  if (seen.source !== source) return observationFailure(current, row, "wrong_source", "transfer source does not match the authorized source");
  if (seen.destination !== authorized) return observationFailure(current, row, "wrong_destination", "transfer destination does not match the accepted claim");
  if (seen.amountAtomic !== row.rewardAtomic || seen.assessment?.verified !== true) {
    const reason = seen.assessment?.reason ?? "amount_mismatch";
    const code = reason === "partial_amount" ? "partial" : reason === "task_mismatch" ? "task_mismatch" : reason === "network_mismatch" ? "network_mismatch" : reason === "asset_mismatch" ? "wrong_token" : "wrong_amount";
    return observationFailure(current, row, code, "chain observation did not match the accepted obligation");
  }
  const duplicate = Object.values(current.obligations).find((other) => other.reservationId !== row.reservationId
    && isObservedPaid(other)
    && other.settlement.transactionHash === seen.canonicalReceipt.transactionHash);
  if (duplicate) return observationFailure(current, row, "duplicate_receipt", "receipt is already bound to another accepted obligation");
  const receipt = seen.canonicalReceipt;
  row.paid = true;
  row.settled = true;
  row.state = "paid";
  row.payoutState = "paid";
  row.kernel.paid = false;
  row.kernel.settled = false;
  row.kernel.transfer = null;
  row.settlement = {
    kind: "verified",
    reason: seen.assessment.reason,
    verified: true,
    chainObserved: true,
    paid: true,
    partial: false,
    addressesIncluded: false,
    taskId: OFFER_ID,
    reservationId: row.reservationId,
    obligationId: row.obligationId,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    logIndex: receipt.logIndex,
    timestamp: receipt.timestamp,
    amount: REWARD,
    amountAtomic: row.rewardAtomic,
    asset: "USDC",
    network: "base",
    tokenContract: receipt.tokenContract,
    sourceSha256: sha256Text(source),
    destinationSha256: sha256Text(authorized),
  };
  claim.payoutSourceSha256 = sha256Text(source);
  const spent = applyObservedSpend(current);
  if (!spent.ok || !isObservedPaid(row)) {
    const prior = ledger.obligations[row.reservationId];
    return observationFailure(structuredClone(ledger), prior, spent.ok ? "partial" : spent.reason, "chain observation did not bind a canonical receipt");
  }
  assertAllocation(current);
  return ok(current, {
    state: "paid",
    paid: true,
    idempotentReplay: false,
    obligationId: row.obligationId,
    spentAtomic: current.allocation.spentAtomic,
    settlement: row.settlement,
  });
}

export function readStatus(ledger, reservationId, preimage, now, repoRoot, options = {}) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  const current = reconcile(ledger, now);
  const reservation = Object.values(current.claims).find((row) => row.reservationId === reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "reservation");
  const obligation = current.obligations[reservationId] ?? null;
  const byPreimage = typeof preimage === "string" && preimage.length > 0 && sha256Text(preimage) === reservation.grantSha256;
  if (typeof preimage === "string" && preimage.length > 0 && !byPreimage) {
    return fail(current, EXIT.unauthenticated, "grant_mismatch", "original claim grant does not match");
  }
  const authenticated = options.authenticated === true || byPreimage;
  if (obligation) {
    const observed = isObservedPaid(obligation);
    const fields = {
      reservationId,
      grantSha256: reservation.grantSha256,
      termsVersion: current.termsVersion,
      submittedAt: current.submissions[reservationId]?.createdAt ?? obligation.createdAt,
      acceptedAt: obligation.createdAt,
      expiresAt: current.availability.expiresAt,
      outcome: obligation.outcome,
      accepted: true,
      receipt: observed ? {
        network: obligation.settlement.network,
        asset: obligation.settlement.asset,
        tokenContract: obligation.settlement.tokenContract,
        transactionHash: obligation.settlement.transactionHash,
        blockNumber: obligation.settlement.blockNumber,
        timestamp: obligation.settlement.timestamp,
        status: "success",
        transferCount: 1,
        amount: obligation.settlement.amount,
        amountBaseUnits: obligation.settlement.amountAtomic,
        addressesIncluded: false,
      } : null,
      expected: observed ? {
        transactionHash: obligation.settlement.transactionHash,
        blockNumber: obligation.settlement.blockNumber,
        timestamp: obligation.settlement.timestamp,
      } : undefined,
    };
    const reader = authenticated
      ? { kind: "authorized_original_claim", grantSha256: reservation.grantSha256 }
      : { kind: "public" };
    const compared = compareReader(repoRoot, fields, reader, now);
    const view = {
      schema: SCHEMA_LEDGER,
      offerId: OFFER_ID,
      reservationId,
      accepted_by_root: true,
      state: observed ? "paid" : "owed",
      states: { accept: true, reject: false, owed: !observed, paid: observed },
      rewardClaimable: authenticated && !observed,
      reward: obligation.reward,
      paid: observed,
      payoutState: observed ? "paid" : "owed",
      kernelPaid: false,
      machineStatus: compared.projection.machineStatus,
      nextAction: compared.projection.nextAction,
      readback: compared.conformance.readback,
      usefulNegativeEarns: compared.projection.usefulNegativeEarns === true,
      outcome: authenticated ? obligation.outcome : null,
      evidenceClass: obligation.evidenceClass,
      organicCustomer: false,
      customerRevenue: false,
      settlement: obligation.settlement,
      availability: current.availability.state,
      obligationRemains: true,
      allocation: publicAllocation(current),
    };
    if (!authenticated) {
      return { ok: true, exit: EXIT.ok, code: "public", result: view, ledger: current };
    }
    return ok(current, view);
  }
  if (!authenticated) {
    return fail(current, EXIT.unauthenticated, "public_acceptance_is_not_a_claim", "no public reward");
  }
  const submission = current.submissions[reservationId];
  const state = reservation.status === "rejected" ? "reject" : submission ? "submitted" : "reserved";
  return ok(current, {
    reservationId,
    state,
    states: { accept: false, reject: state === "reject", owed: false, paid: false },
    paid: false,
    availability: current.availability.state,
  });
}

export function readByProof(ledger, request, now, repoRoot) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  if (request?.grantPreimage || request?.controlPrivateKey || containsPrivate(request)) {
    return fail(ledger, EXIT.private_input, "private_input", "read request contains private input and was not stored");
  }
  const current = reconcile(ledger, now);
  if (!request || request.schema !== SCHEMA_READ_REQUEST) {
    return fail(current, EXIT.wrong_subject, "wrong_offer", "read request schema");
  }
  if (request.payoutDestination) {
    return fail(current, EXIT.redirect, "redirected_reward", "a read request cannot set the payout destination");
  }
  if (request.offerId !== OFFER_ID) return fail(current, EXIT.wrong_subject, "wrong_offer", "read offer");
  if (request.termsVersion !== current.termsVersion) return fail(current, EXIT.stale_terms, "stale_terms", "read terms");
  const reservation = Object.values(current.claims).find((row) => row.reservationId === request.reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "reservation");
  if (request.contributorPublicId && request.contributorPublicId !== reservation.contributorPublicId) {
    return fail(current, EXIT.unauthenticated, "wrong_contributor", "read contributor does not match the original claim");
  }
  if (request.claimIdempotencyKey && request.claimIdempotencyKey !== reservation.idempotencyKey) {
    return fail(current, EXIT.unauthenticated, "proof_failed", "read request names a different claim");
  }
  const verdict = verifyPurposeProof(reservation, request.controlProof, "read");
  if (!verdict.ok) return proofFail(current, verdict);
  const view = readStatus(current, reservation.reservationId, null, now, repoRoot, { authenticated: true });
  if (view.result) {
    view.result.requestStatementSha256 = verdict.statementSha256;
    view.result.offerId = view.result.offerId ?? OFFER_ID;
    view.result.termsVersion = view.result.termsVersion ?? current.termsVersion;
  }
  return view;
}

export function revokeClaim(ledger, envelope, now) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  if (envelope?.grantPreimage || envelope?.controlPrivateKey || containsPrivate(envelope)) {
    return fail(ledger, EXIT.private_input, "private_input", "revocation contains private input and was not stored");
  }
  const current = reconcile(ledger, now);
  if (!envelope || envelope.schema !== SCHEMA_REVOCATION) {
    return fail(current, EXIT.wrong_subject, "wrong_offer", "revocation schema");
  }
  if (envelope.offerId !== OFFER_ID) return fail(current, EXIT.wrong_subject, "wrong_offer", "revocation offer");
  if (envelope.termsVersion !== current.termsVersion) return fail(current, EXIT.stale_terms, "stale_terms", "revocation terms");
  if (envelope.payoutDestination) return fail(current, EXIT.redirect, "redirected_reward", "a revocation cannot set the payout destination");
  const reservation = Object.values(current.claims).find((row) => row.reservationId === envelope.reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "reservation");
  if (envelope.contributorPublicId && envelope.contributorPublicId !== reservation.contributorPublicId) {
    return fail(current, EXIT.unauthenticated, "wrong_contributor", "revocation contributor does not match the original claim");
  }
  const verdict = verifyPurposeProof(reservation, envelope.controlProof, "revoke");
  if (!verdict.ok) return proofFail(current, verdict);
  const obligation = current.obligations[reservation.reservationId] ?? null;
  const already = reservation.status === "revoked";
  reservation.status = "revoked";
  return ok(current, {
    revoked: true,
    idempotentReplay: already,
    reservationId: reservation.reservationId,
    obligationRemains: Boolean(obligation),
    rewardCount: obligation ? 1 : 0,
    paid: obligation ? isObservedPaid(obligation) : false,
  });
}

export function inspectSubmission(ledger, reservationId, now) {
  if (!ledger) return fail(ledger, EXIT.unavailable, "not_open", "ledger");
  const current = reconcile(ledger, now);
  const reservation = Object.values(current.claims).find((row) => row.reservationId === reservationId);
  if (!reservation) return fail(current, EXIT.wrong_subject, "wrong_task", "reservation");
  const submission = current.submissions[reservationId] ?? null;
  if (!submission) return fail(current, EXIT.wrong_subject, "wrong_task", "no submission");
  const obligation = current.obligations[reservationId] ?? null;
  return ok(current, {
    reservationId,
    contributorPublicId: reservation.contributorPublicId,
    authentication: submission.authentication ?? null,
    suppliedEvidenceSha256: submission.suppliedEvidenceSha256 ?? null,
    rootReview: submission.rootReview ?? null,
    claimedMeasurementIsWorkProof: false,
    signatureIsWorkProof: false,
    accepted: Boolean(obligation),
    state: obligation ? (isObservedPaid(obligation) ? "paid" : "owed") : submission.status,
    paid: obligation ? isObservedPaid(obligation) : false,
    reward: obligation ? obligation.reward : null,
    availability: current.availability.state,
  });
}

function publicAllocation(ledger) {
  const observed = observedSpentAtomic(ledger.obligations);
  const spent = observed.ok ? observed.spent : 0n;
  return {
    allocated: ledger.allocation.amount,
    committedAtomic: ledger.allocation.committedAtomic,
    spent: spent === 0n ? "0" : formatUsdc(spent),
    spentAtomic: spent.toString(),
    escrowed: false,
    maxAccepted: MAX_ACCEPTED,
    acceptedCount: ledger.allocation.acceptedCount,
  };
}

export function allocationSnapshot(ledger) {
  assertAllocation(ledger);
  return publicAllocation(ledger);
}
