import { join } from "node:path";
import { quoteEconomics } from "../../../vendor/hosted-wallet-market/src/fee.mjs";
import {
  acceptWork,
  claimWork,
  deliverWork,
  postWork,
  projectFeeWork,
  proveWork,
  showWork,
} from "../../two-sided-work-consumer/src/commands.mjs";
import { findDisallowedRewardKey } from "../../two-sided-work-consumer/src/public.mjs";
import { readJson } from "./json.mjs";
import { EXISTING_FEE_BASIS, EXISTING_FEE_BPS } from "./pins.mjs";

export function termsProblem(request) {
  const original = request?.originalTerms;
  const work = request?.work;
  if (!original || typeof original !== "object") return "original_terms_required";
  if (original.rewriteTerms === true || original.replacementTermsDigest != null || original.replacementEarnedDebtAtomic != null) {
    return "terms_unchanged_required";
  }
  if (typeof original.termsDigest !== "string" || original.termsDigest.length < 1) return "original_terms_required";
  if (typeof original.rightsDigest !== "string" || original.rightsDigest.length < 1) return "rights_required";
  if (original.feeBps !== EXISTING_FEE_BPS || original.feeBasis !== EXISTING_FEE_BASIS) return "existing_fee_terms_required";
  if (!work) return null;
  if (work.termsDigest != null && work.termsDigest !== original.termsDigest) return "terms_unchanged_required";
  if (work.rightsDigest != null && work.rightsDigest !== original.rightsDigest) return "rights_unchanged_required";
  if (work.terms && (work.terms.feeBps !== original.feeBps || work.terms.feeBasis !== original.feeBasis)) {
    return "terms_unchanged_required";
  }
  if (work.rewriteTerms === true) return "terms_unchanged_required";
  return null;
}

function usefulChange(decisions) {
  return Array.isArray(decisions?.decisions)
    && decisions.decisions.some((item) => item?.result?.outcome === "useful_change" && item.result.useful === true);
}

export function workGate(request, decisions) {
  if (request.cancel === true || request.schedule?.status === "cancelled" || decisions?.outcome === "cancelled") {
    return { appropriate: false, reason: "schedule_cancelled" };
  }
  if (!usefulChange(decisions)) return { appropriate: false, reason: "no_useful_change" };
  if (!request.work) return { appropriate: false, reason: "caller_did_not_ask" };
  const problem = termsProblem(request);
  if (problem) return { appropriate: false, reason: problem };
  return { appropriate: true };
}

function fail(reason, message) {
  return { ok: false, appropriate: true, reason, message: message || null, rewardsHidden: true };
}

export function continueWork({ request, capture, store, effectId } = {}) {
  const gate = workGate(request, request._decisions);
  if (!gate.appropriate) {
    return { ok: true, appropriate: false, reason: gate.reason, shared: false, rewardsHidden: true, pricingInvented: false };
  }
  const work = request.work;
  const heading = capture.payload?.title;
  if (typeof heading !== "string" || work.artifact?.heading !== heading) {
    return fail("capture_not_transferred", "the delivery heading must be the retained capture title");
  }
  const journeyPath = join(store, "journey.json");
  const existing = readJson(journeyPath);
  if (existing.ok && existing.value?.task?.taskId && existing.value.task.taskId !== work.taskId) {
    return fail("journey_kept", "this store already holds a different task");
  }
  const env = { journeyPath, clock: request.clock };
  const original = request.originalTerms;
  const posted = postWork({
    taskId: work.taskId,
    title: work.title,
    summary: work.summary,
    requesterId: work.requesterId,
    requesterNote: work.requesterNote,
    criteria: work.criteria,
    objectiveCriteria: work.objectiveCriteria,
    payableKinds: work.payableKinds,
    publicationConsent: work.publicationConsent,
    provenance: work.provenance,
    terms: { feeBps: original.feeBps, feeBasis: original.feeBasis },
    grossAtomic: work.grossAtomic,
    railCostAtomic: work.railCostAtomic,
    termsDigest: original.termsDigest,
    rightsDigest: original.rightsDigest,
    costLines: work.costLines,
    idempotencyKey: effectId.slice(0, 80),
  }, env);
  if (!posted.ok) return fail(posted.reason, posted.message);
  const claimed = claimWork({
    taskId: work.taskId,
    holderId: work.holderId,
    idempotencyKey: effectId.slice(0, 80),
  }, env);
  if (!claimed.ok) return fail(claimed.reason, claimed.message);
  const delivered = deliverWork({
    taskId: work.taskId,
    holderId: work.holderId,
    expectedRevision: 0,
    artifact: work.artifact,
    citedEvidence: work.citedEvidence,
    idempotencyKey: effectId.slice(0, 80),
  }, env);
  if (!delivered.ok) return fail(delivered.reason, delivered.message);
  const accepted = acceptWork({
    taskId: work.taskId,
    requesterId: work.requesterId,
    decision: work.decision,
  }, env);
  if (!accepted.ok) return fail(accepted.reason, accepted.message);
  const projected = projectFeeWork({ taskId: work.taskId, requesterId: work.requesterId }, env);
  if (!projected.ok) return fail(projected.reason, projected.message);
  let quote;
  try {
    quote = quoteEconomics({
      gross: work.grossAtomic,
      railCost: work.railCostAtomic,
      captures: [work.grossAtomic],
    });
  } catch (error) {
    return fail(error.codeName || "fee_quote_refused", error.message);
  }
  if (projected.projection.platformFeeAtomic !== quote.platformFeeAtomic
    || projected.projection.contributorNetAtomic !== quote.contributorNetAtomic
    || projected.projection.feeBps !== quote.feeBps) {
    return fail("fee_projection_diverged", "the journey fee does not match the existing fee module");
  }
  let proof = null;
  const share = work.share === true;
  if (share) {
    const proved = proveWork({
      taskId: work.taskId,
      requesterId: work.requesterId,
      subject: work.proofSubject || capture.subject,
      sequence: work.proofSequence || 1,
      optIn: true,
    }, env);
    if (!proved.ok) return fail(proved.reason, proved.message);
    proof = proved.proof;
    if (findDisallowedRewardKey(proof)) return fail("public_reward_disclosure_refused");
  }
  const shown = showWork({ taskId: work.taskId, public: true }, env);
  if (!shown.ok) return fail(shown.reason, shown.message);
  if (findDisallowedRewardKey(shown)) return fail("public_reward_disclosure_refused");
  const journey = readJson(journeyPath);
  return {
    ok: true,
    appropriate: true,
    reason: "useful_change",
    taskId: work.taskId,
    replay: posted.replay === true && claimed.replay === true && delivered.replay === true && accepted.replay === true,
    accepted: accepted.accepted === true,
    evidenceOutcome: accepted.evidenceOutcome,
    readback: {
      taskId: shown.task?.taskId || null,
      evidenceOutcome: shown.acceptance?.evidenceOutcome || null,
      accepted: shown.acceptance?.accepted === true,
      rewardDisclosed: shown.rewardDisclosed === true,
    },
    shared: share,
    rewardsHidden: true,
    pricingInvented: false,
    termsDigest: original.termsDigest,
    rightsDigest: original.rightsDigest,
    fencing: claimed.fencing,
    private: {
      feeProjection: projected.projection,
      quote: {
        feeBps: quote.feeBps,
        feeBasis: quote.feeBasis,
        grossAtomic: quote.grossAtomic,
        platformFeeAtomic: quote.platformFeeAtomic,
        contributorNetAtomic: quote.contributorNetAtomic,
        thisQuoteFeeIsExactFivePercent: quote.thisQuoteFeeIsExactFivePercent,
      },
      termsPreserved: journey.ok && journey.value?.task?.termsDigest === original.termsDigest && journey.value?.task?.rightsDigest === original.rightsDigest,
    },
    proofPublic: proof
      ? {
          rewardDisclosed: proof.rewardDisclosed === true,
          evidenceOutcome: proof.evidenceOutcome,
          reuseMode: proof.reuseMode,
        }
      : null,
  };
}
