import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MATCH_STATUS, SCHEMA } from "./constants.mjs";
import { ERROR_CODES } from "./constants.mjs";
import { compareError, validateBrief, validateProposal } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exchange01 = await import(
  pathToFileURL(join(__dirname, "../../01/src/index.mjs")).href
);

/**
 * Compare multiple proposals against an acceptance brief.
 * Returns per-proposal evidence coverage — never a reputation ranking.
 */
export function compareProposalsToBrief(briefRaw, proposalsRaw, { clock = () => Date.now() } = {}) {
  const brief = validateBrief(briefRaw);
  if (!Array.isArray(proposalsRaw) || proposalsRaw.length < 1) {
    throw compareError(ERROR_CODES.INVALID_INPUT, "proposals must be a non-empty array");
  }

  const proposals = proposalsRaw.map((p, i) => validateProposal(p, i));
  const comparedAt = new Date(clock()).toISOString();

  const requiredObjectiveIds = brief.objectiveChecks.map((c) => c.id);
  const subjectiveIds = (brief.subjectiveCriteria || []).map((c) => c.id);

  const comparisons = proposals.map((proposal) =>
    compareOne(brief, proposal, requiredObjectiveIds, subjectiveIds),
  );

  return {
    schema: SCHEMA,
    comparedAt,
    taskId: brief.taskId ?? null,
    briefTitle: brief.title ?? null,
    proposalCount: comparisons.length,
    order: "input_order",
    ranking: null,
    note: "Comparisons are evidence coverage against the brief only. No reputation, stars, or invented ranking.",
    objectiveCriterionIds: requiredObjectiveIds,
    unresolvedSubjectiveIds: subjectiveIds,
    comparisons,
    consumerInstructions: [
      "1. Supply an R2-EXCHANGE-01 acceptance brief JSON.",
      "2. Supply two or more proposal JSON objects (terms + claimedRequirements + optional artifact).",
      "3. Run compare; read each proposal's status and missingEvidence — do not treat list order as rank.",
      "4. Subjective brief criteria stay unresolved; proposals cannot auto-clear them.",
      "5. Forbidden: reputation, rankingScore, winner, revenue fields.",
    ].join("\n"),
  };
}

function compareOne(brief, proposal, requiredObjectiveIds, subjectiveIds) {
  const claimedById = new Map(proposal.claimedRequirements.map((c) => [c.criterionId, c]));
  const missingEvidence = [];
  const conflicts = [];
  const metClaims = [];
  const unknownClaims = [];

  for (const id of requiredObjectiveIds) {
    const claim = claimedById.get(id);
    if (!claim) {
      missingEvidence.push({ criterionId: id, reason: "no_claim" });
      continue;
    }
    if (!claim.evidenceRef && proposal.artifact == null) {
      missingEvidence.push({ criterionId: id, reason: "claim_without_evidence_ref_or_artifact" });
      continue;
    }
    metClaims.push({ criterionId: id, evidenceRef: claim.evidenceRef });
  }

  for (const id of subjectiveIds) {
    const claim = claimedById.get(id);
    if (claim) {
      conflicts.push({
        criterionId: id,
        reason: "subjective_cannot_be_cleared_by_proposal",
        detail: claim.claim,
      });
    }
  }

  for (const claim of proposal.claimedRequirements) {
    if (!requiredObjectiveIds.includes(claim.criterionId) && !subjectiveIds.includes(claim.criterionId)) {
      unknownClaims.push({
        criterionId: claim.criterionId,
        reason: "criterion_not_on_brief",
      });
    }
  }

  let artifactCheck = null;
  if (proposal.artifact != null) {
    try {
      artifactCheck = exchange01.runAcceptanceChecks(brief, proposal.artifact);
    } catch (err) {
      artifactCheck = {
        error: err.message,
        objective: { complete: false, passed: 0, failed: -1 },
      };
    }
  }

  // A fully passing artifact is evidence for all objective brief checks.
  if (artifactCheck?.objective?.complete === true) {
    for (const id of requiredObjectiveIds) {
      if (!metClaims.some((m) => m.criterionId === id)) {
        metClaims.push({ criterionId: id, evidenceRef: "artifact" });
      }
    }
    for (let i = missingEvidence.length - 1; i >= 0; i -= 1) {
      if (requiredObjectiveIds.includes(missingEvidence[i].criterionId)) {
        missingEvidence.splice(i, 1);
      }
    }
  }

  const termsGaps = [];
  if (brief.bounds?.requirePrice === true) {
    if (proposal.terms.priceAmount == null || proposal.terms.currency == null) {
      termsGaps.push("missing_price_or_currency");
    }
  }

  const status = deriveStatus({
    requiredCount: requiredObjectiveIds.length,
    missingEvidence,
    conflicts,
    artifactCheck,
    termsGaps,
  });

  return {
    proposalId: proposal.id,
    proposerLabel: proposal.proposerLabel,
    status,
    metClaims,
    missingEvidence,
    conflicts,
    unknownClaims,
    termsGaps,
    terms: proposal.terms,
    artifactObjectiveComplete: artifactCheck ? artifactCheck.objective?.complete === true : null,
    artifactCheckSummary: artifactCheck
      ? {
          objectivePassed: artifactCheck.objective?.passed ?? null,
          objectiveFailed: artifactCheck.objective?.failed ?? null,
          subjectiveUnresolved: artifactCheck.subjective?.unresolved ?? null,
          overallAccepted: artifactCheck.overall?.accepted ?? false,
          error: artifactCheck.error ?? null,
        }
      : null,
  };
}

function deriveStatus({ requiredCount, missingEvidence, conflicts, artifactCheck, termsGaps }) {
  if (artifactCheck?.error) return MATCH_STATUS.MALFORMED;

  const artifactFailed =
    artifactCheck &&
    artifactCheck.objective &&
    artifactCheck.objective.complete === false &&
    (artifactCheck.objective.failed ?? 0) > 0;

  // Hard conflicts: bad artifact or attempting to clear subjective criteria.
  if (artifactFailed) return MATCH_STATUS.CONFLICTS;
  if (conflicts.length > 0) return MATCH_STATUS.CONFLICTS;

  const missing = missingEvidence.length;
  if (requiredCount > 0 && missing === requiredCount) {
    return MATCH_STATUS.MISSING_EVIDENCE;
  }
  if (missing > 0 || termsGaps.length > 0) {
    return MATCH_STATUS.PARTIAL;
  }

  if (artifactCheck) {
    return artifactCheck.objective?.complete === true ? MATCH_STATUS.MEETS : MATCH_STATUS.PARTIAL;
  }
  // Reference-only claims without an evaluated artifact are unverified, not meets.
  return MATCH_STATUS.UNVERIFIED_EVIDENCE;
}

/** Convenience: build brief from 01 requirements then compare. */
export function compareProposalsToRequirements(requirements, proposals, options) {
  const brief = exchange01.buildAcceptanceBrief(requirements);
  return compareProposalsToBrief(brief, proposals, options);
}

export { exchange01 };
