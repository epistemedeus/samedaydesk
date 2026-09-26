import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AGREEMENT_STATUS, ERROR_CODES, REVISION_SCHEMA, SCHEMA } from "./constants.mjs";
import { diffBriefScope } from "./diff.mjs";
import { briefRevisionFingerprint, revisionsEqual } from "./fingerprint.mjs";
import {
  agreementError,
  assertNoForbidden,
  isPlainObject,
  requireBrief,
  requireNonEmptyString,
} from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exchange01 = await import(pathToFileURL(join(__dirname, "../../01/src/index.mjs")).href);

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertBoundIntegrity(agreement) {
  const fp = briefRevisionFingerprint(agreement.boundBrief);
  if (fp.sha256 !== agreement.boundRevision.sha256) {
    throw agreementError(
      ERROR_CODES.REVISION_MISMATCH,
      "boundBrief fingerprint does not match boundRevision",
      { expected: agreement.boundRevision.sha256, actual: fp.sha256 },
    );
  }
}

function makeRevision(brief, { clock }) {
  const fp = briefRevisionFingerprint(brief);
  return {
    schema: REVISION_SCHEMA,
    taskId: brief.taskId ?? null,
    sha256: fp.sha256,
    capturedAt: new Date(clock()).toISOString(),
  };
}

/**
 * Bind a proposal to the exact brief revision in force at agreement time.
 * Later brief edits do not silently rewrite the agreement.
 */
export function createWorkAgreement(
  { brief, proposal, agreementId },
  { clock = () => Date.now() } = {},
) {
  const acceptedBrief = requireBrief(brief);
  assertNoForbidden(proposal, "proposal");
  if (!isPlainObject(proposal)) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, "proposal must be an object");
  }
  const proposalId = requireNonEmptyString(proposal.id, "proposal.id", { max: 128 });
  const id =
    agreementId == null
      ? `agr_${proposalId}_${briefRevisionFingerprint(acceptedBrief).sha256.slice(0, 12)}`
      : requireNonEmptyString(agreementId, "agreementId", { max: 160 });

  const revision = makeRevision(acceptedBrief, { clock });

  return {
    schema: SCHEMA,
    id,
    status: AGREEMENT_STATUS.BOUND,
    createdAt: revision.capturedAt,
    updatedAt: revision.capturedAt,
    boundRevision: revision,
    // Snapshot of acceptance scope — authoritative for this agreement.
    boundBrief: snapshotBrief(acceptedBrief),
    proposal: deepClone({
      id: proposalId,
      proposerLabel: proposal.proposerLabel ?? null,
      terms: proposal.terms ?? {},
      claimedRequirements: proposal.claimedRequirements ?? [],
    }),
    deliverable: null,
    scopeChange: null,
    note: "Agreement is bound to boundRevision. New brief terms require explicit acceptRevision — never silent.",
    consumerInstructions: [
      "1. createWorkAgreement({ brief, proposal }) binds the current brief revision.",
      "2. attachDeliverable(agreement, artifact, { brief }) verifies the artifact against the BOUND revision.",
      "3. inspectAgainstBrief(agreement, latestBrief) surfaces scope drift without changing terms.",
      "4. acceptRevision(agreement, latestBrief, { explicit: true }) is required to rebind — silent accept is rejected.",
      "5. Do not invent revenue, ranking, or claim authority.",
    ].join("\n"),
  };
}

function snapshotBrief(brief) {
  return deepClone({
    taskId: brief.taskId,
    title: brief.title,
    summary: brief.summary,
    deliverableContract: brief.deliverableContract ?? null,
    objectiveChecks: brief.objectiveChecks || [],
    subjectiveCriteria: brief.subjectiveCriteria || [],
    unresolvedSubjective: brief.unresolvedSubjective || [],
    bounds: brief.bounds || {},
  });
}

/**
 * Attach a deliverable and run objective checks against the BOUND brief, not a drifted latest brief.
 */
export function attachDeliverable(agreement, artifact, { clock = () => Date.now() } = {}) {
  assertAgreement(agreement);
  assertBoundIntegrity(agreement);
  if (agreement.status === AGREEMENT_STATUS.SCOPE_CHANGED) {
    throw agreementError(
      ERROR_CODES.REVISION_MISMATCH,
      "cannot attach deliverable while agreement status is scope_changed; acceptRevision or keep bound revision explicitly",
      { agreementId: agreement.id, boundRevision: agreement.boundRevision.sha256 },
    );
  }
  const check = exchange01.runAcceptanceChecks(agreement.boundBrief, artifact, { clock });
  const updatedAt = new Date(clock()).toISOString();
  const objectiveLayer =
    check.objective.layer ?? (check.objective.complete === true ? "complete" : "incomplete");
  const failed = (check.objective.results || [])
    .filter((result) => result.passed !== true)
    .map((result) => {
      const criterion = (agreement.boundBrief.objectiveChecks || []).find((c) => c.id === result.id);
      return {
        id: result.id,
        detail: result.detail ?? null,
        targetPath: criterion?.check?.path ?? null,
      };
    });
  return {
    ...agreement,
    status: AGREEMENT_STATUS.DELIVERABLE_ATTACHED,
    updatedAt,
    deliverable: {
      attachedAt: updatedAt,
      againstRevision: agreement.boundRevision.sha256,
      artifact: deepClone(artifact),
      objectiveComplete: check.objective.complete === true,
      objectiveLayer,
      checkSummary: {
        objectivePassed: check.objective.passed,
        objectiveFailed: check.objective.failed,
        objectiveLayer,
        subjectiveUnresolved: check.subjective.unresolved,
        overallAccepted: check.overall.accepted,
        failed,
      },
    },
  };
}

/**
 * Compare agreement to a (possibly newer) brief. Does not mutate terms.
 */
export function inspectAgainstBrief(agreement, currentBrief, { clock = () => Date.now() } = {}) {
  assertAgreement(agreement);
  assertBoundIntegrity(agreement);
  const latest = requireBrief(currentBrief);
  const latestRevision = makeRevision(latest, { clock });
  const same = revisionsEqual(agreement.boundRevision, latestRevision);
  const scopeDiff = same ? { changed: false } : diffBriefScope(agreement.boundBrief, latest);

  // Detach/freeze nested snapshots so derived views cannot mutate prior deliverable.
  const frozen = {
    ...agreement,
    boundBrief: deepClone(agreement.boundBrief),
    boundRevision: deepClone(agreement.boundRevision),
    proposal: deepClone(agreement.proposal),
    deliverable: agreement.deliverable ? deepClone(agreement.deliverable) : null,
    priorDeliverables: deepClone(agreement.priorDeliverables || []),
  };

  if (same) {
    return {
      ...frozen,
      inspection: {
        inspectedAt: latestRevision.capturedAt,
        latestRevision,
        matchesBound: true,
        scopeDiff,
      },
    };
  }

  return {
    ...frozen,
    status: AGREEMENT_STATUS.SCOPE_CHANGED,
    updatedAt: latestRevision.capturedAt,
    scopeChange: {
      detectedAt: latestRevision.capturedAt,
      latestRevision,
      boundRevision: deepClone(agreement.boundRevision),
      scopeDiff,
      silentAccept: false,
      message: "Brief scope changed since agreement. New terms are NOT in force until acceptRevision({ explicit: true }).",
    },
    inspection: {
      inspectedAt: latestRevision.capturedAt,
      latestRevision,
      matchesBound: false,
      scopeDiff,
    },
  };
}

/**
 * Explicitly rebind agreement to a new brief revision. Silent/implicit accept is rejected.
 */
export function acceptRevision(
  agreement,
  currentBrief,
  { explicit = false, clock = () => Date.now() } = {},
) {
  assertAgreement(agreement);
  assertBoundIntegrity(agreement);
  if (explicit !== true) {
    throw agreementError(
      ERROR_CODES.SILENT_ACCEPT_FORBIDDEN,
      "acceptRevision requires { explicit: true }; refusing silent acceptance of new terms",
      { agreementId: agreement.id },
    );
  }
  const latest = requireBrief(currentBrief);
  const boundTask = agreement.boundBrief?.taskId ?? null;
  const nextTask = latest.taskId ?? null;
  if (boundTask != null && nextTask != null && boundTask !== nextTask) {
    throw agreementError(
      ERROR_CODES.REVISION_MISMATCH,
      "acceptRevision refuses cross-task rebind",
      { boundTask, nextTask },
    );
  }
  const revision = makeRevision(latest, { clock });
  const scopeDiff = diffBriefScope(agreement.boundBrief, latest);
  const updatedAt = revision.capturedAt;
  const priorDeliverable = agreement.deliverable
    ? deepClone({
        ...agreement.deliverable,
        supersededByRevision: revision.sha256,
        historical: true,
        note: "Prior deliverable was attached to an older revision; re-attach under the new bound revision.",
      })
    : null;

  return {
    ...agreement,
    status: AGREEMENT_STATUS.BOUND,
    updatedAt,
    boundRevision: revision,
    boundBrief: snapshotBrief(latest),
    deliverable: null,
    priorDeliverables: [
      ...(agreement.priorDeliverables || []),
      ...(priorDeliverable ? [priorDeliverable] : []),
    ],
    scopeChange: {
      acceptedAt: updatedAt,
      previousRevision: agreement.boundRevision,
      scopeDiff,
      explicit: true,
    },
    note: "Agreement rebound to new brief revision via explicit acceptRevision.",
  };
}

function assertAgreement(agreement) {
  if (!isPlainObject(agreement) || agreement.schema !== SCHEMA) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, `agreement.schema must be ${SCHEMA}`);
  }
  if (!agreement.boundRevision?.sha256 || !agreement.boundBrief) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, "agreement missing boundRevision/boundBrief");
  }
}

/** Convenience: build brief from requirements then create agreement. */
export function createAgreementFromRequirements(requirements, proposal, options) {
  const brief = exchange01.buildAcceptanceBrief(requirements);
  return { brief, agreement: createWorkAgreement({ brief, proposal }, options) };
}

export { exchange01 };
