/**
 * Real (non-demo) adapter: caller-supplied Exchange journey input.
 *
 * Does not load exchange/01 or exchange/02 fixtures.
 * Does not drop subjective criteria.
 * Does not synthesize requester acceptance.
 * TownSquare linking is the honest synthetic-kit adapter only.
 */
import { createHash } from "node:crypto";

import { runConversationToTask } from "../townsquare/kit/src/pipeline.mjs";
import {
  PROVENANCE,
  SOURCE_KIND,
  SUPPLIED_INPUT_SCHEMA,
  SUPPLIED_REASON,
  S166_INTAKE_CONTRACT_REF,
  TOWNSQUARE_SYNTHETIC_LIMIT,
} from "../src/labels.mjs";

export {
  PROVENANCE,
  SOURCE_KIND,
  SUPPLIED_INPUT_SCHEMA,
  SUPPLIED_REASON,
  S166_INTAKE_CONTRACT_REF,
  TOWNSQUARE_SYNTHETIC_LIMIT,
};

export function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export function fileSubmissionFor(artifact) {
  return {
    files: [
      {
        path: "artifact.json",
        byteLength: Buffer.byteLength(JSON.stringify(artifact ?? {}), "utf8"),
        format: "json",
      },
    ],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function criteriaCount(requirements) {
  const objective = Array.isArray(requirements?.objectiveCriteria) ? requirements.objectiveCriteria.length : 0;
  const subjective = Array.isArray(requirements?.subjectiveCriteria) ? requirements.subjectiveCriteria.length : 0;
  const mixed = Array.isArray(requirements?.criteria) ? requirements.criteria.length : 0;
  return objective + subjective + mixed;
}

function fail(reason, extra = {}) {
  return {
    ok: false,
    reason,
    exchangeInput: null,
    ...extra,
  };
}

/**
 * Link a TownSquare synthetic conversation for identity only.
 * Kit still requires conversation.demo:true — not a general conversation parser.
 */
export function linkTownsquareSyntheticSource(conversation, { clock = () => Date.now() } = {}) {
  if (!isPlainObject(conversation) || conversation.demo !== true) {
    return {
      ok: false,
      reason: SUPPLIED_REASON.TOWNSQUARE_KIT_SYNTHETIC_ONLY,
      adapter: SOURCE_KIND.TOWNSQUARE_SYNTHETIC_CONVERSATION,
      honestLimit: TOWNSQUARE_SYNTHETIC_LIMIT,
    };
  }
  const now = new Date(clock()).toISOString();
  const townsquare = runConversationToTask(conversation, { now });
  return {
    ok: true,
    adapter: SOURCE_KIND.TOWNSQUARE_SYNTHETIC_CONVERSATION,
    honestLimit: TOWNSQUARE_SYNTHETIC_LIMIT,
    townsquare,
    now,
  };
}

function linkSource(raw, { clock }) {
  const source = isPlainObject(raw.source) ? raw.source : { kind: SOURCE_KIND.STRUCTURED_TASK };
  const kind = source.kind || SOURCE_KIND.STRUCTURED_TASK;

  if (kind === SOURCE_KIND.STRUCTURED_TASK) {
    return {
      ok: true,
      adapter: SOURCE_KIND.STRUCTURED_TASK,
      honestLimit: "Explicit structured task path. No conversation extraction.",
      townsquare: null,
      identity: isPlainObject(source.identity) ? source.identity : null,
    };
  }

  if (kind === SOURCE_KIND.TOWNSQUARE_SYNTHETIC_CONVERSATION) {
    const linked = linkTownsquareSyntheticSource(source.conversation, { clock });
    if (!linked.ok) return linked;
    return {
      ...linked,
      identity: {
        ...(isPlainObject(source.identity) ? source.identity : {}),
        scopedTaskId: linked.townsquare?.task?.id || source.conversation?.taskId || null,
      },
    };
  }

  return fail(SUPPLIED_REASON.UNKNOWN_SOURCE_KIND, {
    adapter: kind,
    honestLimit: TOWNSQUARE_SYNTHETIC_LIMIT,
  });
}

function mergeIdentity(requirements, linked) {
  const next = { ...requirements };
  const tsTask = linked.townsquare?.task;
  const declaredTaskId = linked.identity?.taskId ?? null;

  if (tsTask?.id) {
    if (!next.taskId) next.taskId = tsTask.id;
    else if (next.taskId !== tsTask.id) {
      return { error: SUPPLIED_REASON.SOURCE_TASK_MISMATCH, expected: tsTask.id, provided: next.taskId };
    }
  }

  if (declaredTaskId) {
    if (next.taskId && next.taskId !== declaredTaskId) {
      return { error: SUPPLIED_REASON.SOURCE_TASK_MISMATCH, expected: next.taskId, provided: declaredTaskId };
    }
    if (tsTask?.id && tsTask.id !== declaredTaskId) {
      return { error: SUPPLIED_REASON.SOURCE_TASK_MISMATCH, expected: tsTask.id, provided: declaredTaskId };
    }
    if (!next.taskId) next.taskId = declaredTaskId;
  }

  if (!next.title && tsTask?.title) next.title = tsTask.title;
  if (!next.summary && tsTask?.summary) next.summary = tsTask.summary;
  return { requirements: next };
}

function declaredSourceIdentity(linked) {
  return {
    kind: linked.adapter ?? null,
    taskId: linked.identity?.taskId ?? null,
    operatorLabel: linked.identity?.operatorLabel ?? null,
    authenticated: false,
  };
}

function validateRequesterDecision(raw) {
  if (!Object.prototype.hasOwnProperty.call(raw, "requesterDecision")) {
    return { ok: true };
  }
  const decision = raw.requesterDecision;
  if (decision == null || !isPlainObject(decision) || Array.isArray(decision)) {
    return {
      ok: false,
      reason: SUPPLIED_REASON.MALFORMED_REQUESTER_DECISION,
      detail: "requesterDecision must be an object with decision accept|reject",
      provided: decision === undefined ? null : typeof decision,
    };
  }
  if (decision.decision !== "accept" && decision.decision !== "reject") {
    return {
      ok: false,
      reason: SUPPLIED_REASON.MALFORMED_REQUESTER_DECISION,
      detail: "requesterDecision.decision must be accept or reject",
      provided: decision.decision ?? null,
    };
  }
  return { ok: true };
}

/**
 * Validate and normalize caller JSON into Exchange 08 journey input.
 * Never loads demo fixtures. Never synthesizes requesterDecision.
 */
export function adaptSuppliedInput(raw, { clock = () => Date.now() } = {}) {
  if (!isPlainObject(raw)) {
    return fail(SUPPLIED_REASON.INVALID_INPUT, { detail: "supplied input must be an object" });
  }

  if (raw.schema != null && raw.schema !== SUPPLIED_INPUT_SCHEMA) {
    return fail(SUPPLIED_REASON.INVALID_INPUT, {
      detail: `schema must be ${SUPPLIED_INPUT_SCHEMA} when present`,
    });
  }

  if (raw.provenance === PROVENANCE.FIXTURE_DEMO) {
    return fail(SUPPLIED_REASON.FIXTURE_DEMO_NOT_ALLOWED_ON_RUN, {
      detail: "fixture_demo is the demo command only. run/import requires supplied_local.",
    });
  }
  if (raw.provenance === PROVENANCE.EXTERNAL_DISCOVERY) {
    return fail(SUPPLIED_REASON.EXTERNAL_DISCOVERY_RESERVED, {
      detail: "external_discovery is reserved and is not invented by this pack.",
    });
  }
  if (raw.provenance != null && raw.provenance !== PROVENANCE.SUPPLIED_LOCAL) {
    return fail(SUPPLIED_REASON.INVALID_PROVENANCE, { detail: raw.provenance });
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "requirements") || raw.requirements == null) {
    return fail(SUPPLIED_REASON.REQUIREMENTS_MISSING, {
      detail: "requirements must be supplied. This adapter does not copy exchange/01 fixtures.",
    });
  }
  if (!isPlainObject(raw.requirements)) {
    return fail(SUPPLIED_REASON.INVALID_INPUT, { detail: "requirements must be an object" });
  }
  if (criteriaCount(raw.requirements) === 0) {
    return fail(SUPPLIED_REASON.CRITERIA_UNRESOLVED, {
      detail: "objectiveCriteria, subjectiveCriteria, and/or criteria[] must be supplied. Unresolved — not replaced with fixture criteria.",
    });
  }

  if (!Array.isArray(raw.proposals) || raw.proposals.length < 1) {
    return fail(SUPPLIED_REASON.PROPOSALS_MISSING, {
      detail: "proposals must be a non-empty caller-supplied array. This adapter does not copy exchange/02 fixtures.",
    });
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "artifact") || raw.artifact === undefined) {
    return fail(SUPPLIED_REASON.ARTIFACT_MISSING, {
      detail: "artifact must be supplied. This adapter does not copy exchange/01 fixture artifacts.",
    });
  }

  const decisionCheck = validateRequesterDecision(raw);
  if (!decisionCheck.ok) {
    return fail(decisionCheck.reason, {
      detail: decisionCheck.detail,
      provided: decisionCheck.provided,
    });
  }

  const linked = linkSource(raw, { clock });
  if (!linked.ok) return linked;

  const merged = mergeIdentity(raw.requirements, linked);
  if (merged.error) {
    return fail(merged.error, {
      expected: merged.expected,
      provided: merged.provided,
      declaredSourceIdentity: declaredSourceIdentity(linked),
    });
  }

  const operatorLabel = linked.identity?.operatorLabel || null;
  const sourceIdentity = declaredSourceIdentity(linked);
  const requirements = {
    ...merged.requirements,
    schema: merged.requirements.schema || "neomorphic.r2.exchange.task_requirements.v1",
    demo: false,
    sourceLabel:
      merged.requirements.sourceLabel ||
      (operatorLabel ? `supplied_local:${operatorLabel}` : "supplied_local"),
    provenance: PROVENANCE.SUPPLIED_LOCAL,
    bounds: {
      ...(isPlainObject(merged.requirements.bounds) ? merged.requirements.bounds : {}),
      notes:
        merged.requirements.bounds?.notes ||
        "Caller-supplied local task. No custody, escrow, payment, or invented demand.",
      s166IntakeContractRef: S166_INTAKE_CONTRACT_REF,
      sourceKind: linked.adapter,
      ...(linked.adapter === SOURCE_KIND.TOWNSQUARE_SYNTHETIC_CONVERSATION
        ? { townsquareSyntheticLimit: TOWNSQUARE_SYNTHETIC_LIMIT }
        : {}),
    },
  };

  const input = {
    requirements,
    proposals: raw.proposals,
    chosenProposalId: raw.chosenProposalId,
    artifact: raw.artifact,
    allowWeakProposal: raw.allowWeakProposal === true,
    allowPartialAdmission: raw.allowPartialAdmission === true,
    provenance: PROVENANCE.SUPPLIED_LOCAL,
    declaredSourceIdentity: sourceIdentity,
    townsquare: linked.townsquare
      ? {
          scopedTaskId: linked.townsquare.task?.id || linked.townsquare.scopedTaskId || null,
          packageId: linked.townsquare.packageId || linked.townsquare.schema || null,
          demo: linked.townsquare.demo === true,
          adapter: linked.adapter,
          honestLimit: linked.honestLimit,
          contradictionPreserved:
            linked.townsquare.task?.contradictionPreserved ??
            linked.townsquare.correctedAnswer?.contradictionPreserved ??
            null,
        }
      : {
          scopedTaskId: requirements.taskId,
          packageId: null,
          demo: false,
          adapter: linked.adapter,
          honestLimit: linked.honestLimit,
          contradictionPreserved: null,
        },
    fileSubmission: raw.fileSubmission || fileSubmissionFor(raw.artifact),
  };

  if (raw.correctedArtifact !== undefined) {
    input.correctedArtifact = raw.correctedArtifact;
    input.correctedFileSubmission = raw.correctedFileSubmission || fileSubmissionFor(raw.correctedArtifact);
  }
  if (raw.fileSetContract !== undefined) input.fileSetContract = raw.fileSetContract;
  if (raw.lifecycleEvents !== undefined) input.lifecycleEvents = raw.lifecycleEvents;
  if (raw.requesterDecision !== undefined) input.requesterDecision = raw.requesterDecision;
  if (raw.includeDispute === true) input.includeDispute = true;
  if (raw.requesterStatement !== undefined) input.requesterStatement = raw.requesterStatement;
  if (raw.workerStatement !== undefined) input.workerStatement = raw.workerStatement;
  if (raw.sources !== undefined) input.sources = raw.sources;

  return {
    ok: true,
    reason: null,
    adapter: linked.adapter,
    honestLimit: linked.honestLimit,
    townsquare: linked.townsquare,
    exchangeInput: input,
  };
}

/**
 * Test/CLI helper: attach an explicit accept bound to the current artifact and probe revision.
 * Not applied by run/import unless the caller already included requesterDecision.
 */
export function attachExplicitRequesterAccept(rawInput, probeResult) {
  const artifact = rawInput.correctedArtifact ?? rawInput.artifact;
  return {
    ...rawInput,
    requesterDecision: {
      decision: "accept",
      artifactSha256: sha256Json(artifact),
      revisionSha256: probeResult.boundRevisionSha256,
    },
  };
}
