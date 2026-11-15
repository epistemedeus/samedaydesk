import { randomBytes } from "node:crypto";
import {
  ACCEPTANCE_SCHEMA,
  CLAIM_SCHEMA,
  CLOCK_PATTERN,
  DELIVERY_SCHEMA,
  ID_PATTERN,
  JOURNEY_SCHEMA,
  LOCK_SCHEMA,
  POST_SCHEMA,
  PUBLIC_VIEW_SCHEMA,
  SELECTION_SCHEMA,
  capabilityStamp,
} from "./constants.mjs";
import { sha256Json } from "./json.mjs";
import {
  acquireRetainedLock,
  lockHoldMs,
  lockPathFor,
  lockView,
  readRetainedLock,
  releaseRetainedLock,
} from "./lock.mjs";
import { containsPrivateAtom, findDisallowedRewardKey, privateAtoms, publicArtifact, publicTask } from "./public.mjs";
import { proveReuse } from "./reuse-bridge.mjs";
import { readJourney, writeJourney } from "./store.mjs";
import { diagnoseJourney, projectFee } from "./te-bridge.mjs";

const VERIFIER_KEYS = new Set(["verifier", "verifierPayload", "execute", "code", "autoAcceptToLowerCost"]);

function fail(reason, extra = {}) {
  return { ok: false, reason, ...capabilityStamp(), ...extra, automaticUnlock: false };
}

function requireClock(clock) {
  if (typeof clock !== "string" || !CLOCK_PATTERN.test(clock)) return fail("clock_required");
  return null;
}

function requireId(value, reason) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) return fail(reason);
  return null;
}

function requirePath(journeyPath) {
  if (typeof journeyPath !== "string" || journeyPath.length < 1 || journeyPath.includes("\0")) {
    return fail("journey_path_required");
  }
  return null;
}

function idempotencyDigest(input) {
  if (!input || typeof input !== "object") return null;
  const copy = { ...input };
  delete copy.idempotencyKey;
  return sha256Json(copy);
}

function rememberIdempotency(journey, step, input) {
  if (!input?.idempotencyKey) return null;
  const idError = requireId(input.idempotencyKey, "idempotency_key_refused");
  if (idError) return idError;
  const digest = idempotencyDigest(input);
  const prior = journey.idempotency?.[step];
  if (prior && (prior.key !== input.idempotencyKey || prior.digest !== digest)) {
    return fail("idempotency_conflict");
  }
  journey.idempotency = { ...journey.idempotency, [step]: { key: input.idempotencyKey, digest } };
  return null;
}

function sameIdempotency(journey, step, input) {
  if (!input?.idempotencyKey) return false;
  const prior = journey.idempotency?.[step];
  if (!prior) return false;
  return prior.key === input.idempotencyKey && prior.digest === idempotencyDigest(input);
}

function mutate(env, actorId, purpose, fn) {
  const pathError = requirePath(env?.journeyPath);
  if (pathError) return pathError;
  const clockError = requireClock(env.clock);
  if (clockError) return clockError;
  const actorError = requireId(actorId, "actor_required");
  if (actorError) return actorError;
  const fencing = randomBytes(16).toString("hex");
  const lockPath = lockPathFor(env.journeyPath);
  const acquired = acquireRetainedLock(lockPath, {
    schema: LOCK_SCHEMA,
    holderId: actorId,
    fencing,
    purpose,
    acquiredAt: env.clock,
    pid: process.pid,
    automaticUnlock: false,
  });
  if (!acquired.ok) {
    return fail("retained_lock_refused", { retainedLock: lockView(acquired.lock) });
  }
  const hold = lockHoldMs();
  if (hold > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold);
  try {
    let current = null;
    const read = readJourney(env.journeyPath);
    if (!read.ok && read.reason !== "journey_missing") return fail(read.reason, { message: read.message });
    if (read.ok) current = read.journey;
    return fn(current);
  } finally {
    releaseRetainedLock(lockPath, fencing);
  }
}

function assertPrivateText(task) {
  const atoms = [task.grossAtomic, task.railCostAtomic].filter((value) => typeof value === "string" && value !== "0");
  const publicBits = [task.title, task.summary, ...(task.criteria || [])];
  for (const bit of publicBits) {
    if (typeof bit !== "string") continue;
    if (atoms.some((atom) => bit.includes(atom))) return fail("public_reward_disclosure_refused");
  }
  return null;
}

function validatePost(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("post_invalid");
  const rewardKey = findDisallowedRewardKey(input);
  if (rewardKey) return fail("public_reward_disclosure_refused", { field: rewardKey });
  for (const [field, reason] of [
    ["taskId", "task_id_required"],
    ["requesterId", "requester_required"],
  ]) {
    const error = requireId(input[field], reason);
    if (error) return error;
  }
  if (typeof input.title !== "string" || input.title.trim() === "") return fail("title_required");
  if (typeof input.summary !== "string" || input.summary.trim() === "") return fail("summary_required");
  if (typeof input.publicationConsent !== "boolean") return fail("publication_consent_required");
  if (input.provenance !== "public" && input.provenance !== "synthetic") return fail("provenance_required");
  if (input.criteria !== undefined && !Array.isArray(input.criteria)) return fail("criteria_refused");
  if (input.idempotencyKey !== undefined) {
    const error = requireId(input.idempotencyKey, "idempotency_key_refused");
    if (error) return error;
  }
  const privateText = assertPrivateText(input);
  if (privateText) return privateText;
  return null;
}

function taskFromPost(input) {
  return {
    taskId: input.taskId,
    title: input.title,
    summary: input.summary,
    requesterId: input.requesterId,
    requesterNote: input.requesterNote,
    criteria: input.criteria || [],
    objectiveCriteria: input.objectiveCriteria,
    payableKinds: input.payableKinds,
    publicationConsent: input.publicationConsent,
    provenance: input.provenance,
    terms: input.terms,
    grossAtomic: input.grossAtomic,
    railCostAtomic: input.railCostAtomic,
    termsDigest: input.termsDigest,
    rightsDigest: input.rightsDigest,
    effort: input.effort,
    costLines: input.costLines,
  };
}

function occupancyView(occupancy) {
  if (!occupancy) return null;
  return { mode: occupancy.mode, holderId: occupancy.holderId, acquiredAt: occupancy.acquiredAt };
}

export function publicView(journey) {
  const proof = journey.proof
    ? {
        schema: journey.proof.schema,
        rewardDisclosed: false,
        publicShowcase: journey.proof.publicShowcase === true,
        evidenceOutcome: journey.proof.evidenceOutcome,
        reuseMode: journey.proof.reuseMode,
        observation: journey.proof.observation,
      }
    : null;
  const body = {
    ok: true,
    schema: PUBLIC_VIEW_SCHEMA,
    publicShowcase: journey.task.publicationConsent === true && journey.acceptance?.accepted === true,
    rewardDisclosed: false,
    task: publicTask(journey.task),
    occupancy: occupancyView(journey.occupancy),
    delivery: journey.delivery
      ? { artifact: publicArtifact(journey.delivery.artifact), revision: journey.delivery.revision }
      : null,
    acceptance: journey.acceptance
      ? {
          evidenceOutcome: journey.acceptance.evidenceOutcome,
          accepted: journey.acceptance.accepted === true,
          autoAccept: false,
          toolAcceptance: "not_decided_by_tool",
        }
      : null,
    proof,
    ...capabilityStamp(),
  };
  if (containsPrivateAtom(body, privateAtoms(journey))) {
    return fail("public_reward_disclosure_refused");
  }
  return body;
}

export function postWork(input, env) {
  const invalid = validatePost(input);
  if (invalid) return invalid;
  return mutate(env, input.requesterId, "post", (current) => {
    if (current) {
      if (sameIdempotency(current, "post", input) && current.task.taskId === input.taskId) {
        return { ok: true, schema: POST_SCHEMA, replay: true, taskId: current.task.taskId, ...capabilityStamp() };
      }
      return fail("journey_exists");
    }
    const journey = {
      schema: JOURNEY_SCHEMA,
      ...capabilityStamp(),
      task: taskFromPost(input),
      revision: 0,
      occupancy: null,
      delivery: null,
      acceptance: null,
      proof: null,
      feeProjection: null,
      idempotency: {},
      createdAt: env.clock,
      updatedAt: env.clock,
    };
    const idempotent = rememberIdempotency(journey, "post", input);
    if (idempotent) return idempotent;
    const fee = projectFee(journey);
    if (!fee.ok && fee.reason === "bundle_refused") return fee;
    writeJourney(env.journeyPath, journey);
    return {
      ok: true,
      schema: POST_SCHEMA,
      replay: false,
      taskId: journey.task.taskId,
      revision: 0,
      publicationConsent: journey.task.publicationConsent,
      ...capabilityStamp(),
    };
  });
}

function occupy(journey, input, env, mode) {
  const fencing = randomBytes(16).toString("hex");
  journey.occupancy = {
    mode,
    holderId: input.holderId,
    fencing,
    acquiredAt: env.clock,
    by: mode === "selection" ? input.requesterId : input.holderId,
  };
  journey.updatedAt = env.clock;
  return {
    ok: true,
    schema: mode === "selection" ? SELECTION_SCHEMA : CLAIM_SCHEMA,
    replay: false,
    taskId: journey.task.taskId,
    mode,
    holderId: input.holderId,
    fencing,
    ...capabilityStamp(),
  };
}

export function claimWork(input, env) {
  if (!input || typeof input !== "object") return fail("claim_invalid");
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  const holderError = requireId(input.holderId, "holder_required");
  if (holderError) return holderError;
  return mutate(env, input.holderId, "claim", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (input.holderId === current.task.requesterId) return fail("self_claim_refused");
    const occupancy = current.occupancy;
    if (occupancy?.mode === "claim" && occupancy.holderId === input.holderId) {
      const conflict = rememberIdempotency(current, "claim", input);
      if (conflict && conflict.reason === "idempotency_conflict" && !sameIdempotency(current, "claim", input)) {
        return conflict;
      }
      return {
        ok: true,
        schema: CLAIM_SCHEMA,
        replay: true,
        taskId: current.task.taskId,
        mode: "claim",
        holderId: input.holderId,
        fencing: occupancy.fencing,
        ...capabilityStamp(),
      };
    }
    if (occupancy?.mode === "claim") return fail("double_claim", { holderId: occupancy.holderId });
    if (occupancy?.mode === "selection" && occupancy.holderId !== input.holderId) {
      return fail("selection_conflict", { holderId: occupancy.holderId });
    }
    const conflict = rememberIdempotency(current, "claim", input);
    if (conflict) return conflict;
    const result = occupy(current, input, env, "claim");
    writeJourney(env.journeyPath, current);
    return result;
  });
}

export function selectWork(input, env) {
  if (!input || typeof input !== "object") return fail("selection_invalid");
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  const requesterError = requireId(input.requesterId, "requester_required");
  if (requesterError) return requesterError;
  const holderError = requireId(input.holderId, "holder_required");
  if (holderError) return holderError;
  return mutate(env, input.requesterId, "select", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (input.requesterId !== current.task.requesterId) return fail("requester_required");
    if (input.holderId === current.task.requesterId) return fail("self_selection_refused");
    const occupancy = current.occupancy;
    if (occupancy?.mode === "selection" && occupancy.holderId === input.holderId) {
      if (input.idempotencyKey && !sameIdempotency(current, "select", input)) {
        const conflict = rememberIdempotency(current, "select", input);
        if (conflict) return conflict;
      }
      return {
        ok: true,
        schema: SELECTION_SCHEMA,
        replay: true,
        taskId: current.task.taskId,
        mode: "selection",
        holderId: input.holderId,
        fencing: occupancy.fencing,
        ...capabilityStamp(),
      };
    }
    if (occupancy) return fail("selection_conflict", { holderId: occupancy.holderId, mode: occupancy.mode });
    const conflict = rememberIdempotency(current, "select", input);
    if (conflict) return conflict;
    const result = occupy(current, input, env, "selection");
    writeJourney(env.journeyPath, current);
    return result;
  });
}

function validateArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return fail("artifact_required");
  if (artifact.schema !== "pilot.task-bundle-economics.structured-extract.v1") return fail("artifact_schema_unsupported");
  if (artifact.artifactClass !== "bounded_structured_extract") return fail("artifact_class_unsupported");
  for (const key of ["heading", "headingDigest", "sourceLabel"]) {
    if (typeof artifact[key] !== "string" || artifact[key].length < 1) return fail("artifact_field_required", { field: key });
  }
  return null;
}

export function deliverWork(input, env) {
  if (!input || typeof input !== "object") return fail("delivery_invalid");
  const holderError = requireId(input.holderId, "holder_required");
  if (holderError) return holderError;
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  if (!Number.isInteger(input.expectedRevision)) return fail("revision_required");
  if (input.artifactPath !== undefined) return fail("artifact_path_refused");
  if (input.artifact && typeof input.artifact === "object") {
    for (const key of VERIFIER_KEYS) {
      if (input.artifact[key] !== undefined || input[key] !== undefined) return fail("verifier_refused");
    }
  }
  for (const key of VERIFIER_KEYS) {
    if (input[key] !== undefined) return fail(key === "autoAcceptToLowerCost" ? "auto_accept_refused" : "verifier_refused");
  }
  if (input.citedEvidence !== undefined && !Array.isArray(input.citedEvidence)) return fail("cited_evidence_refused");
  const artifactError = validateArtifact(input.artifact);
  if (artifactError) return artifactError;
  return mutate(env, input.holderId, "deliver", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (!current.occupancy) return fail("occupancy_required");
    if (current.occupancy.holderId !== input.holderId) return fail("holder_mismatch");
    const artifactDigest = sha256Json(input.artifact);
    if (current.delivery) {
      if (current.delivery.artifactDigest === artifactDigest && current.delivery.holderId === input.holderId) {
        return {
          ok: true,
          schema: DELIVERY_SCHEMA,
          replay: true,
          taskId: current.task.taskId,
          revision: current.revision,
          artifactDigest,
          ...capabilityStamp(),
        };
      }
      return fail("revision_conflict");
    }
    if (input.expectedRevision !== current.revision) return fail("revision_conflict");
    const conflict = rememberIdempotency(current, "deliver", input);
    if (conflict) return conflict;
    current.delivery = {
      schema: DELIVERY_SCHEMA,
      holderId: input.holderId,
      artifact: {
        schema: input.artifact.schema,
        artifactClass: input.artifact.artifactClass,
        heading: input.artifact.heading,
        headingDigest: input.artifact.headingDigest,
        sourceLabel: input.artifact.sourceLabel,
      },
      citedEvidence: input.citedEvidence,
      artifactDigest,
      revision: current.revision + 1,
      deliveredAt: env.clock,
    };
    current.revision += 1;
    current.acceptance = null;
    current.proof = null;
    current.updatedAt = env.clock;
    writeJourney(env.journeyPath, current);
    return {
      ok: true,
      schema: DELIVERY_SCHEMA,
      replay: false,
      taskId: current.task.taskId,
      revision: current.revision,
      artifactDigest,
      ...capabilityStamp(),
    };
  });
}

export function acceptWork(input, env) {
  if (!input || typeof input !== "object") return fail("acceptance_invalid");
  const requesterError = requireId(input.requesterId, "requester_required");
  if (requesterError) return requesterError;
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  if (!["accept", "refuse", "review"].includes(input.decision)) return fail("decision_required");
  if (input.autoAccept === true || input.autoAcceptToLowerCost === true) return fail("auto_accept_refused");
  return mutate(env, input.requesterId, "accept", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (input.requesterId !== current.task.requesterId) return fail("requester_required");
    if (!current.delivery) return fail("delivery_required");
    const diagnosis = diagnoseJourney(current);
    if (!diagnosis.ok) return fail("diagnosis_refused", { message: diagnosis.message });
    const task = diagnosis.tasks?.[0];
    const evidenceOutcome = task?.evidenceOutcome;
    if (!["meets_criteria", "refused", "needs_review"].includes(evidenceOutcome)) {
      return fail("diagnosis_refused");
    }
    if (current.acceptance && current.acceptance.evidenceOutcome === evidenceOutcome && current.acceptance.requesterDecision === input.decision) {
      return {
        ok: true,
        schema: ACCEPTANCE_SCHEMA,
        replay: true,
        taskId: current.task.taskId,
        evidenceOutcome,
        requesterDecision: input.decision,
        accepted: current.acceptance.accepted === true,
        autoAccept: false,
        toolAcceptance: "not_decided_by_tool",
        ...capabilityStamp(),
      };
    }
    if (current.acceptance) return fail("decision_conflict");
    const aligned = (input.decision === "accept" && evidenceOutcome === "meets_criteria")
      || (input.decision === "refuse" && evidenceOutcome === "refused")
      || (input.decision === "review" && evidenceOutcome === "needs_review")
      || (input.decision === "refuse" && evidenceOutcome !== "meets_criteria");
    if (input.decision === "accept" && evidenceOutcome !== "meets_criteria") {
      return fail("acceptance_not_substantiated", { evidenceOutcome, autoAccept: false });
    }
    if (input.decision === "review" && evidenceOutcome !== "needs_review") {
      return fail("decision_not_aligned", { evidenceOutcome });
    }
    if (!aligned) return fail("decision_not_aligned", { evidenceOutcome });
    const conflict = rememberIdempotency(current, "accept", input);
    if (conflict) return conflict;
    const unknownCosts = (diagnosis.inputClosure?.unknownCosts || []).map((line) => ({
      kind: line.kind,
      status: "unknown",
      taskId: line.taskId,
    }));
    current.acceptance = {
      schema: ACCEPTANCE_SCHEMA,
      evidenceOutcome,
      acceptanceOutcome: task.acceptanceOutcome,
      toolAcceptance: diagnosis.acceptance,
      evidenceOnly: diagnosis.evidenceOnly === true,
      autoAccept: false,
      requesterDecision: input.decision,
      accepted: input.decision === "accept" && evidenceOutcome === "meets_criteria",
      gateReasons: task.gateReasons || [],
      unknownCosts,
      decidedAt: env.clock,
    };
    current.proof = null;
    current.updatedAt = env.clock;
    writeJourney(env.journeyPath, current);
    return {
      ok: true,
      schema: ACCEPTANCE_SCHEMA,
      replay: false,
      taskId: current.task.taskId,
      evidenceOutcome,
      requesterDecision: input.decision,
      accepted: current.acceptance.accepted,
      autoAccept: false,
      toolAcceptance: "not_decided_by_tool",
      unknownCosts,
      ...capabilityStamp(),
    };
  });
}

export function proveWork(input, env) {
  if (!input || typeof input !== "object") return fail("proof_invalid");
  if (input.optIn !== true) return fail("opt_in_required");
  const requesterError = requireId(input.requesterId, "requester_required");
  if (requesterError) return requesterError;
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  const subjectError = requireId(input.subject, "subject_required");
  if (subjectError) return subjectError;
  if (!Number.isInteger(input.sequence) || input.sequence < 1) return fail("sequence_required");
  return mutate(env, input.requesterId, "proof", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (input.requesterId !== current.task.requesterId) return fail("requester_required");
    if (current.task.publicationConsent !== true) return fail("publication_consent_required");
    if (current.acceptance?.accepted !== true || current.acceptance.evidenceOutcome !== "meets_criteria") {
      return fail("acceptance_required");
    }
    if (current.proof) {
      if (current.proof.subject !== input.subject || current.proof.sequence !== input.sequence) {
        return fail("proof_identity_conflict", {
          subject: current.proof.subject ?? null,
          sequence: current.proof.sequence ?? null,
        });
      }
      return {
        ok: true,
        schema: current.proof.schema,
        replay: true,
        rewardDisclosed: false,
        proof: current.proof,
        ...capabilityStamp(),
      };
    }
    const proved = proveReuse(current, { subject: input.subject, sequence: input.sequence, clock: env.clock });
    if (!proved.ok) return proved;
    const conflict = rememberIdempotency(current, "proof", input);
    if (conflict) return conflict;
    current.proof = proved.proof;
    current.updatedAt = env.clock;
    writeJourney(env.journeyPath, current);
    return {
      ok: true,
      replay: false,
      rewardDisclosed: false,
      proof: proved.proof,
      ...capabilityStamp(),
    };
  });
}

export function projectFeeWork(input, env) {
  const actor = input?.requesterId;
  const actorError = requireId(actor, "requester_required");
  if (actorError) return actorError;
  const taskError = requireId(input.taskId, "task_id_required");
  if (taskError) return taskError;
  return mutate(env, actor, "project-fee", (current) => {
    if (!current) return fail("journey_missing");
    if (current.task.taskId !== input.taskId) return fail("task_mismatch");
    if (input.requesterId !== current.task.requesterId) return fail("requester_required");
    const projected = projectFee(current);
    if (!projected.ok) return projected;
    current.feeProjection = projected.projection;
    current.updatedAt = env.clock;
    writeJourney(env.journeyPath, current);
    return { ok: true, replay: false, projection: projected.projection, ...capabilityStamp() };
  });
}

export function releaseWork(input, env) {
  if (!input || typeof input !== "object") return fail("release_invalid");
  if (input.automatic === true) return fail("automatic_unlock_refused");
  const holderError = requireId(input.holderId, "holder_required");
  if (holderError) return holderError;
  if (typeof input.fencing !== "string" || input.fencing.length < 8) return fail("fencing_required");
  return mutate(env, input.holderId, "release", (current) => {
    if (!current) return fail("journey_missing");
    if (!current.occupancy) return fail("occupancy_missing");
    if (current.delivery) return fail("delivery_holds_occupancy");
    if (current.occupancy.holderId !== input.holderId) return fail("holder_mismatch");
    if (current.occupancy.fencing !== input.fencing) return fail("fencing_mismatch");
    current.occupancy = null;
    current.updatedAt = env.clock;
    writeJourney(env.journeyPath, current);
    return { ok: true, released: true, automaticUnlock: false, occupancy: null, ...capabilityStamp() };
  });
}

export function recoverWork(input, env) {
  const pathError = requirePath(env?.journeyPath);
  if (pathError) return pathError;
  const clockError = requireClock(env.clock);
  if (clockError) return clockError;
  const lockPath = lockPathFor(env.journeyPath);
  const current = readRetainedLock(lockPath);
  if (!current.ok) return fail(current.reason);
  if (input?.automatic === true) {
    return fail("automatic_unlock_refused", {
      retainedLock: current.present ? lockView(current.lock) : null,
      unlocked: false,
    });
  }
  if (input?.explicitRelease === true) {
    const holderError = requireId(input.holderId, "holder_required");
    if (holderError) return holderError;
    if (typeof input.fencing !== "string" || input.fencing.length < 8) return fail("fencing_required");
    if (!current.present) return { ok: true, recovery: "no_retained_lock", unlocked: false, automaticUnlock: false, ...capabilityStamp() };
    if (current.lock.holderId !== input.holderId) return fail("holder_mismatch", { unlocked: false });
    if (current.lock.fencing !== input.fencing) return fail("fencing_mismatch", { unlocked: false });
    const released = releaseRetainedLock(lockPath, input.fencing);
    if (!released.ok) return fail(released.reason, { unlocked: false });
    return {
      ok: true,
      recovery: "explicit_release",
      unlocked: true,
      automaticUnlock: false,
      occupancyChanged: false,
      ...capabilityStamp(),
    };
  }
  if (!current.present) {
    return { ok: true, recovery: "no_retained_lock", unlocked: false, automaticUnlock: false, ...capabilityStamp() };
  }
  return {
    ok: true,
    recovery: "retained_lock_kept",
    unlocked: false,
    automaticUnlock: false,
    retainedLock: lockView(current.lock),
    ...capabilityStamp(),
  };
}

export function showWork(input, env) {
  const pathError = requirePath(env?.journeyPath);
  if (pathError) return pathError;
  const read = readJourney(env.journeyPath);
  if (!read.ok) return fail(read.reason, { message: read.message });
  const lock = readRetainedLock(lockPathFor(env.journeyPath));
  if (input?.public === true) {
    const view = publicView(read.journey);
    if (!view.ok) return view;
    return { ...view, retainedLock: lock.present === true, automaticUnlock: false };
  }
  return {
    ok: true,
    journey: read.journey,
    retainedLock: lock.present === true ? lockView(lock.lock) : null,
    automaticUnlock: false,
    ...capabilityStamp(),
  };
}
