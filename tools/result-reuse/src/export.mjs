import { findPrivateField, projectResult } from "./project.mjs";
import { assertObservationShape, n45RecordToObservation } from "./map.mjs";
import { costForRecipe } from "../../recurring-job-recipes/lib/cost.mjs";
import { classifyStaleBaseline } from "../../recurring-job-recipes/lib/recovery.mjs";
import {
  COST_BASELINE_RECIPE,
  DECIDE_OR_REUSE_MODE,
  DECISION_REASONS,
  OBSERVATION_SCHEMA,
  OWNER_SCOPE_DEFAULT,
  RECOMPUTE_VERDICT,
  RECIPE_URI,
  REJECTED_VERDICT,
  REUSE_VERDICT,
} from "./pins.mjs";
import {
  containsHostileMarkup,
  credentialHits,
  exportContainsCredentialShape,
  isPublicHttpUrl,
  looksLikeFilesystemPath,
} from "./omit.mjs";
import { checkInputBounds, checkPayloadBytes } from "./limits.mjs";

export function previewReuse(input, options = {}) {
  const optionCheck = validateOptions(options);
  if (!optionCheck.ok) return optionCheck;
  const projected = projectResult(input, { select: options.select || [] });
  if (!projected.ok) {
    return { ok: false, message: projected.message };
  }
  let record;
  let observation;
  try {
    record = toN45Record(projected, options);
    observation = n45RecordToObservation(record, {
      projectId: options.taskId,
      sequence: options.sequence,
      ownerScope: options.ownerScope || OWNER_SCOPE_DEFAULT,
      recordedAt: options.clock,
    });
  } catch {
    return { ok: false, message: "options cannot produce a contract-valid observation" };
  }
  const shape = assertObservationShape(observation);
  if (!shape.ok) {
    return { ok: false, message: shape.message };
  }
  const preview = {
    ok: true,
    mode: "preview",
    kind: projected.kind,
    incomplete: projected.incomplete,
    publicSafeCertified: false,
    evidenceKind: "user_selected_unverified",
    purchaseRequiresPublish: false,
    optInRequiredToWrite: true,
    included: projected.included,
    omitted: projected.omitted,
    sourceDisclosure: record.data.reuseProvenance,
    n45: {
      class: record.class,
      subject: record.subject,
      correctsSequence: record.correctsSequence,
    },
    observation,
    pins: {
      mapping: "n45 n49-adapter field map",
      observationSchema: "neomorphic.task-memory.observation.v1",
    },
  };
  const leaked = exportContainsCredentialShape({
    observation: preview.observation,
    omitted: preview.omitted,
    included: preview.included,
    sourceDisclosure: preview.sourceDisclosure,
  });
  if (leaked.length) {
    return { ok: false, message: "refusing to emit credential-shaped text" };
  }
  return preview;
}

export function exportReuse(input, options = {}) {
  if (!options.optIn) {
    return {
      ok: false,
      message: "refusing to write without --opt-in; preview first and inspect included/omitted",
    };
  }
  const preview = previewReuse(input, options);
  if (!preview.ok) return preview;
  return {
    ...preview,
    mode: "export",
    optIn: true,
  };
}

function toN45Record(projected, options) {
  const recordClass = options.recordClass || "observation";
  const subject = options.subject;
  const firstUrl =
    (isPublicHttpUrl(projected.payload.url) ? projected.payload.url : null) ||
    projected.payload.sources?.find((row) => isPublicHttpUrl(row?.source))?.source ||
    projected.payload.rows?.matched?.find((row) => isPublicHttpUrl(row?.sourceKey))?.sourceKey ||
    null;
  const originalEvidenceUrlAvailable = Boolean(firstUrl);
  const sourceRole = originalEvidenceUrlAvailable ? "original_evidence_url" : "recipe_locator_not_evidence";
  const note = options.note || defaultNote(projected, sourceRole);
  const data = {
    ...projected.payload,
    url: firstUrl || RECIPE_URI,
    contentHash: projected.payload.contentHash,
    reuseProvenance: {
      originalEvidenceUrlAvailable,
      sourceRole,
    },
  };
  if (!checkPayloadBytes(data).ok) throw new Error("payload exceeds limit after provenance");
  return {
    class: recordClass,
    subject,
    data,
    note,
    correctsSequence: recordClass === "correction" ? options.correctsSequence ?? null : null,
  };
}

function defaultNote(projected, sourceRole) {
  const bits = [`reuse ${projected.kind}`];
  if (projected.incomplete) bits.push("incomplete_or_failed_rows_kept");
  if (projected.payload.verdict) bits.push(`verdict ${projected.payload.verdict}`);
  if (sourceRole === "recipe_locator_not_evidence") {
    bits.push("original evidence URL unavailable; source URI is the reuse recipe locator");
  }
  return bits.join("; ");
}

function validateOptions(options) {
  if (!cleanRequired(options.taskId) || !cleanRequired(options.subject)) {
    return { ok: false, message: "--task-id and --subject are required" };
  }
  if (!Number.isInteger(options.sequence) || options.sequence < 1) {
    return { ok: false, message: "--sequence must be a positive integer" };
  }
  if (!cleanRequired(options.clock)) {
    return { ok: false, message: "--clock is required" };
  }
  if (options.recordClass && !["observation", "hypothesis", "correction"].includes(options.recordClass)) {
    return { ok: false, message: "--class must be observation, hypothesis, or correction" };
  }
  if (options.recordClass === "correction") {
    if (!Number.isInteger(options.correctsSequence) || options.correctsSequence < 1 || options.correctsSequence >= options.sequence) {
      return { ok: false, message: "a correction must name an earlier positive --corrects-sequence" };
    }
  } else if (options.correctsSequence != null) {
    return { ok: false, message: "--corrects-sequence requires --class correction" };
  }
  for (const value of [options.taskId, options.subject, options.ownerScope, options.note]) {
    if (value == null) continue;
    if (credentialHits(String(value)).length || containsHostileMarkup(String(value)) || looksLikeFilesystemPath(String(value))) {
      return { ok: false, message: "an option contains disallowed sensitive or executable-shaped text" };
    }
  }
  return { ok: true };
}

function cleanRequired(value) {
  return typeof value === "string" && value.trim() !== "";
}

const CANNOT_ESTABLISH = Object.freeze([
  "live page bytes beyond the supplied public input",
  "a distinct later accepted task took this reuse",
  "recompute cost avoided net of upkeep",
  "public-safe certification",
  "merchant acceptance or a payment outcome",
]);

export function decideOrReuse(saved, input, options = {}) {
  const inputBounds = checkInputBounds(input);
  if (!inputBounds.ok) return inputBounds;
  const savedBounds = checkInputBounds(saved);
  if (!savedBounds.ok) return savedBounds;

  const privateField = findPrivateField(input) || findPrivateField(saved);
  if (privateField) {
    return {
      ok: false,
      mode: DECIDE_OR_REUSE_MODE,
      verdict: REJECTED_VERDICT,
      reason: DECISION_REASONS.privateField,
      message: "refusing a public decision because a private field is present",
    };
  }

  const current = previewReuse(input, options);
  if (!current.ok) return current;
  const savedObservation = resolveSavedObservation(saved);
  if (!savedObservation.ok) return savedObservation;

  if (options.optIn === true && options.optInWithdrawn === true) {
    return { ok: false, message: "opt-in and withdrawal conflict" };
  }
  if (options.optInWithdrawn === true || options.optIn === false) {
    return recompute(DECISION_REASONS.optInWithdrawn, "opt-in was withdrawn", current);
  }
  if (options.optIn !== true) {
    return { ok: false, message: "decide-or-reuse requires opt-in unless the opt-in is withdrawn" };
  }

  const prior = savedObservation.observation;
  if (prior.observationId !== current.observation.observationId) {
    return recompute(
      DECISION_REASONS.subjectMismatch,
      "task and subject identity does not match the saved decision",
      current,
    );
  }
  if (prior.revisionId !== current.observation.revisionId) {
    return recompute(
      DECISION_REASONS.revisionChanged,
      "revision sequence does not match the saved decision",
      current,
    );
  }

  const horizon = readHorizon(options.horizonHours);
  if (!horizon.ok) return horizon;
  const window = classifyStaleBaseline(prior.recordedAt.instant, options.clock, horizon.horizonHours);
  if (window.reason === "unparseable_clock" || window.reason === "horizon_not_supplied") {
    return { ok: false, message: "recipe window cannot be compared to the saved decision clock" };
  }
  if (window.stale) {
    return recompute(
      DECISION_REASONS.staleClock,
      "saved decision clock is outside the recipe window",
      current,
      { recipeWindow: window },
    );
  }

  if (prior.source.version !== current.observation.source.version) {
    return recompute(
      DECISION_REASONS.digestMismatch,
      "public input digest does not match the saved decision",
      current,
      { recipeWindow: window, savedInputDigest: prior.source.version },
    );
  }

  return {
    ok: true,
    mode: DECIDE_OR_REUSE_MODE,
    verdict: REUSE_VERDICT,
    decision: decisionRecord(prior),
    inputDigest: prior.source.version,
    sourceUri: prior.source.uri,
    revision: prior.revisionId,
    clock: prior.recordedAt.instant,
    recipeWindow: window,
    ...verdictLimits(current),
  };
}

function recompute(reason, message, current, extra = {}) {
  return {
    ok: true,
    mode: DECIDE_OR_REUSE_MODE,
    verdict: RECOMPUTE_VERDICT,
    reason,
    message,
    inputDigest: current.observation?.source?.version ?? null,
    ...extra,
    ...verdictLimits(current),
  };
}

function verdictLimits(current) {
  return {
    costBaseline: costForRecipe(COST_BASELINE_RECIPE),
    liveMetric: {
      distinctLaterAcceptedTasksTakingReuse: null,
      recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
      observedAcceptedTaskLedger: false,
    },
    cannotEstablish: [...CANNOT_ESTABLISH],
    publicSafeCertified: false,
    evidenceKind: "user_selected_unverified",
    kind: current?.kind,
  };
}

function decisionRecord(observation) {
  return {
    schema: observation.schema,
    observationId: observation.observationId,
    revisionId: observation.revisionId,
    inputDigest: observation.source.version,
    sourceUri: observation.source.uri,
    clock: observation.recordedAt.instant,
  };
}

function resolveSavedObservation(saved) {
  const candidate = saved?.schema === OBSERVATION_SCHEMA
    ? saved
    : saved?.observation?.schema === OBSERVATION_SCHEMA
      ? saved.observation
      : null;
  if (!candidate) {
    return { ok: false, message: "saved decision must be a neomorphic.task-memory.observation.v1 record" };
  }
  const shape = assertObservationShape(candidate);
  if (!shape.ok) return shape;
  if (!candidate.observationId || !candidate.revisionId) {
    return { ok: false, message: "saved decision is missing identity or revision" };
  }
  if (!candidate.recordedAt?.instant) {
    return { ok: false, message: "saved decision is missing its clock" };
  }
  return { ok: true, observation: candidate };
}

function readHorizon(value) {
  if (value == null) {
    return { ok: false, message: "decide-or-reuse requires a recipe window in hours" };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { ok: false, message: "recipe window must be a non-negative number of hours" };
  }
  return { ok: true, horizonHours: value };
}
