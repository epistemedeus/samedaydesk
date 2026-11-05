import { createHash } from "node:crypto";
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

// Each supported recipe reads the same saved public capture and prior. A second
// decision on that capture is a separate binding with its own digest, never a
// copy of another recipe's answer.
const SOURCE_CHANGE_RECIPE_ID = "source-change-alert";
const VERIFY_RECIPE_ID = "verification-reconcile";
export const SUPPORTED_RECIPE_IDS = Object.freeze([SOURCE_CHANGE_RECIPE_ID, VERIFY_RECIPE_ID]);
const NOT_BEFORE_WORK = `input is not a before-work public manifest for a supported recipe: ${SUPPORTED_RECIPE_IDS.join(", ")}`;
const USEFUL_OUTCOMES = new Set(["unchanged", "changed", "partial"]);

export function digestPublicInput(value) {
  const canonical = JSON.stringify(sortKeys(value));
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function bindUsefulDecision(manifest, produced, options = {}) {
  const gated = gateDecision(manifest, produced, options, { requireOptIn: true });
  if (!gated.ok) return gated;
  const supported = readManifest(manifest);
  if (!supported.ok) return supported;
  const useful = selectUseful(produced, supported.manifest);
  if (!useful.ok) return useful;
  const captured = captureManifest(supported.manifest);
  let observation;
  try {
    observation = n45RecordToObservation({
      class: options.recordClass || "observation",
      subject: options.subject,
      note: `${useful.useful.recipeId} ${useful.useful.outcome}; recovery ${useful.useful.recovery.action}`,
      correctsSequence: options.recordClass === "correction" ? options.correctsSequence ?? null : null,
      data: {
        url: supported.manifest.capture.url,
        contentHash: captured.digest,
        reuseProvenance: {
          originalEvidenceUrlAvailable: true,
          sourceRole: "original_evidence_url",
        },
        decisionBinding: {
          kind: "before_work_public_input",
          recipeId: supported.manifest.recipeId,
          recipeVersion: supported.manifest.recipeVersion,
          inputDigest: captured.digest,
          // Digest of the canonical useful body. Detects a changed stored
          // outcome or evidence. An actor who rewrites both the body and this
          // field is not detected; this is not a signature.
          usefulBodyDigest: digestPublicInput(useful.useful),
        },
        usefulDecision: useful.useful,
      },
    }, {
      projectId: options.taskId,
      sequence: options.sequence,
      ownerScope: options.ownerScope || OWNER_SCOPE_DEFAULT,
      recordedAt: options.clock,
    });
  } catch {
    return { ok: false, message: "options cannot produce a contract-valid observation" };
  }
  const shape = assertObservationShape(observation);
  if (!shape.ok) return shape;
  const leaked = exportContainsCredentialShape(observation);
  if (leaked.length) return privateRejection();
  const payloadBound = checkPayloadBytes(observation.payload);
  if (!payloadBound.ok) return payloadBound;
  return {
    ok: true,
    mode: DECIDE_OR_REUSE_MODE,
    action: "bound",
    decision: decisionView(observation),
    inputDigest: captured.digest,
    sourceUri: observation.source.uri,
    revision: observation.revisionId,
    recipeId: supported.manifest.recipeId,
    recipeVersion: supported.manifest.recipeVersion,
    clock: observation.recordedAt.instant,
    producerInvoked: false,
    mechanics: captured.mechanics,
    ...verdictLimits(supported.manifest.recipeId),
    observation,
  };
}

export function decideOrReuse(saved, input, options = {}) {
  const gated = gateDecision(input, saved, options, { requireOptIn: false });
  if (!gated.ok) return gated;
  if (options.optIn === true && options.optInWithdrawn === true) {
    return { ok: false, message: "opt-in and withdrawal conflict" };
  }
  if (options.optInWithdrawn === true || options.optIn === false) {
    return recompute(DECISION_REASONS.optInWithdrawn, "opt-in was withdrawn");
  }
  if (options.optIn !== true) {
    return { ok: false, message: "decide-or-reuse requires opt-in unless the opt-in is withdrawn" };
  }

  const savedObservation = resolveSavedObservation(saved);
  if (!savedObservation.ok) return savedObservation;
  const prior = savedObservation.observation;
  const binding = readBinding(prior);
  if (!binding.ok) {
    return recompute(
      binding.reason,
      binding.reason === DECISION_REASONS.invalidSavedState
        ? "saved decision binding is incomplete or inconsistent"
        : "saved observation is an unbound result record, not a before-work decision",
    );
  }

  const supported = readManifest(input);
  if (!supported.ok) {
    return recompute(
      DECISION_REASONS.inputNotBeforeWork,
      NOT_BEFORE_WORK,
    );
  }
  const manifest = supported.manifest;
  if (prior.taskScope?.taskId !== options.taskId || prior.observationId !== observationIdFor(options.taskId, options.subject)) {
    return recompute(DECISION_REASONS.subjectMismatch, "task and subject identity does not match the saved decision");
  }
  if (manifest.recipeId !== binding.binding.recipeId || manifest.recipeVersion !== binding.binding.recipeVersion) {
    return recompute(DECISION_REASONS.recipeChanged, "recipe id or version does not match the saved decision");
  }
  if (prior.revisionId !== `rev_${options.sequence}`) {
    return recompute(DECISION_REASONS.revisionChanged, "revision sequence does not match the saved decision");
  }

  const horizon = readHorizon(options.horizonHours);
  if (!horizon.ok) return horizon;
  const window = classifyStaleBaseline(prior.recordedAt.instant, options.clock, horizon.horizonHours);
  if (window.reason === "unparseable_clock" || window.reason === "horizon_not_supplied") {
    return { ok: false, message: "recipe window cannot be compared to the saved decision clock" };
  }
  const captured = captureManifest(manifest);
  if (window.stale) {
    return recompute(
      DECISION_REASONS.staleClock,
      "saved decision clock is outside the recipe window",
      { recipeWindow: window, inputDigest: captured.digest, mechanics: captured.mechanics },
    );
  }
  if (captured.digest !== binding.binding.inputDigest || captured.digest !== prior.source.version) {
    return recompute(
      DECISION_REASONS.digestMismatch,
      "before-work public input digest does not match the saved decision",
      { recipeWindow: window, inputDigest: captured.digest, savedInputDigest: binding.binding.inputDigest, mechanics: captured.mechanics },
    );
  }
  const integrity = verifyUsefulBody(binding.binding, binding.useful);
  if (!integrity.ok) {
    return recompute(
      integrity.reason,
      integrity.reason === DECISION_REASONS.integrityUnknown
        ? "saved decision has no useful-body digest from its producer; legacy rows are not certified"
        : "stored useful outcome or evidence does not match the digest bound at the producer",
      { recipeWindow: window, inputDigest: captured.digest, mechanics: captured.mechanics },
    );
  }

  return {
    ok: true,
    mode: DECIDE_OR_REUSE_MODE,
    verdict: REUSE_VERDICT,
    decision: decisionView(prior),
    inputDigest: captured.digest,
    sourceUri: prior.source.uri,
    revision: prior.revisionId,
    recipeId: binding.binding.recipeId,
    recipeVersion: binding.binding.recipeVersion,
    clock: prior.recordedAt.instant,
    recipeWindow: window,
    producerInvoked: false,
    mechanics: captured.mechanics,
    ...verdictLimits(binding.binding.recipeId),
  };
}

function gateDecision(input, saved, options, { requireOptIn }) {
  const inputBounds = checkInputBounds(input);
  if (!inputBounds.ok) return inputBounds;
  const savedBounds = checkInputBounds(saved);
  if (!savedBounds.ok) return savedBounds;
  if (rejectingPrivate(input) || rejectingPrivate(saved) || disallowedText(input) || disallowedText(selectUsefulFields(saved))) {
    return privateRejection();
  }
  if (requireOptIn) {
    const optionCheck = validateOptions(options);
    if (!optionCheck.ok) return optionCheck;
    if (options.optIn !== true || options.optInWithdrawn === true) {
      return { ok: false, message: "binding a useful decision requires opt-in" };
    }
  }
  return { ok: true };
}

export function rejectingPrivate(value) {
  const found = findPrivateField(value);
  if (!found) return null;
  if (found.path === "payment") return findPrivateField(value.payment, "payment");
  return found;
}

export function disallowedText(value, path = "") {
  if (typeof value === "string") {
    if (credentialHits(value).length || containsHostileMarkup(value) || looksLikeFilesystemPath(value)) {
      return path || "(text)";
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = disallowedText(value[index], `${path}/${index}`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (credentialHits(key).length || containsHostileMarkup(key) || looksLikeFilesystemPath(key)) {
        return path || "(key)";
      }
      const found = disallowedText(child, path ? `${path}/${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

function selectUsefulFields(value) {
  const useful = value?.payload?.usefulDecision ?? value?.usefulDecision ?? null;
  return useful;
}

function privateRejection() {
  return {
    ok: false,
    mode: DECIDE_OR_REUSE_MODE,
    verdict: REJECTED_VERDICT,
    reason: DECISION_REASONS.privateField,
    message: "refusing a public decision because a private field is present",
  };
}

function captureManifest(manifest) {
  const started = process.hrtime.bigint();
  const digest = digestPublicInput(manifest);
  const inputCaptureNs = Number(process.hrtime.bigint() - started);
  const inputCaptureBytes = Buffer.byteLength(JSON.stringify(sortKeys(manifest)), "utf8");
  return {
    digest,
    mechanics: {
      inputCaptureNs,
      inputCaptureBytes,
      decisionWork: "not_run",
    },
  };
}

export function readManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: NOT_BEFORE_WORK };
  }
  if (!SUPPORTED_RECIPE_IDS.includes(value.recipeId)) {
    return { ok: false, message: NOT_BEFORE_WORK };
  }
  if (typeof value.recipeVersion !== "string" || value.recipeVersion.trim() === "") {
    return { ok: false, message: "before-work manifest is missing its recipe version" };
  }
  // source-change-alert watches named fields. verification-reconcile compares the
  // whole observation identity, so a field list is optional there but still checked.
  const fieldsRequired = value.recipeId === SOURCE_CHANGE_RECIPE_ID;
  if ((fieldsRequired || value.fields !== undefined)
    && (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.some((field) => typeof field !== "string" || field.trim() === ""))) {
    return { ok: false, message: "before-work manifest is missing its field list" };
  }
  const prior = value.prior;
  const capture = value.capture;
  if (!prior || typeof prior !== "object" || Array.isArray(prior)) {
    return { ok: false, message: "before-work manifest is missing its prior capture" };
  }
  if (typeof prior.sha256 !== "string" || prior.sha256.trim() === "") {
    return { ok: false, message: "before-work manifest is missing the prior capture identity" };
  }
  if (!Number.isInteger(prior.sequence) || prior.sequence < 1) {
    return { ok: false, message: "before-work manifest is missing the prior sequence" };
  }
  if (typeof prior.createdAt !== "string" || Number.isNaN(Date.parse(prior.createdAt))) {
    return { ok: false, message: "before-work manifest is missing the prior clock" };
  }
  if (!prior.payload || typeof prior.payload !== "object" || Array.isArray(prior.payload)) {
    return { ok: false, message: "before-work manifest is missing the prior public payload" };
  }
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) {
    return { ok: false, message: "before-work manifest is missing the current capture" };
  }
  if (!isPublicHttpUrl(capture.url)) {
    return { ok: false, message: "before-work capture URL must be an absolute public http(s) URL" };
  }
  if (typeof capture.contentHash !== "string" || capture.contentHash.trim() === "") {
    return { ok: false, message: "before-work manifest is missing the capture identity" };
  }
  return { ok: true, manifest: value };
}

export function selectUseful(produced, manifest) {
  if (!produced || typeof produced !== "object" || Array.isArray(produced)) {
    return { ok: false, message: `produced decision must be a ${manifest.recipeId} result` };
  }
  if (produced.recipeId !== manifest.recipeId || produced.schema !== manifest.recipeVersion) {
    return { ok: false, message: "produced decision does not match the before-work recipe" };
  }
  if (!USEFUL_OUTCOMES.has(produced.outcome)) {
    return { ok: false, message: "produced decision is not a reusable useful outcome" };
  }
  if (manifest.recipeId === VERIFY_RECIPE_ID) return selectUsefulVerification(produced, manifest);
  const evidence = produced.evidence;
  if (!evidence || typeof evidence !== "object" || evidence.contentHash !== manifest.capture.contentHash) {
    return { ok: false, message: "produced decision does not match the before-work capture identity" };
  }
  const recovery = produced.recovery;
  if (!recovery || typeof recovery.action !== "string" || typeof recovery.operatorNext !== "string") {
    return { ok: false, message: "produced decision is missing its recovery" };
  }
  const useful = {
    recipeId: produced.recipeId,
    recipeVersion: produced.schema,
    outcome: produced.outcome,
    recovery: {
      action: recovery.action,
      operatorNext: recovery.operatorNext,
    },
    evidence: {
      kind: evidence.kind ?? null,
      contentHash: evidence.contentHash,
      changed: Array.isArray(evidence.changed) ? evidence.changed : [],
      unchanged: Array.isArray(evidence.unchanged) ? evidence.unchanged : [],
    },
  };
  if (rejectingPrivate(useful) || disallowedText(useful)) return privateRejection();
  return { ok: true, useful };
}

// verification-reconcile evidence names the candidate by path. Only the public
// identity, mismatched field names and the no-change claim are kept.
function selectUsefulVerification(produced, manifest) {
  const evidence = produced.evidence;
  if (!evidence || typeof evidence !== "object" || evidence.kind !== "verification_reconcile") {
    return { ok: false, message: "produced decision is missing its verification evidence" };
  }
  if (evidence.candidateDigest?.contentHash !== manifest.capture.contentHash) {
    return { ok: false, message: "produced decision does not match the before-work capture identity" };
  }
  if (produced.prior?.sha256 !== manifest.prior.sha256 || produced.prior?.sequence !== manifest.prior.sequence) {
    return { ok: false, message: "produced decision does not match the before-work prior" };
  }
  if (evidence.claims?.automaticPaymentReplay !== false) {
    return { ok: false, message: "produced decision does not record that payment was not replayed" };
  }
  const recovery = produced.recovery;
  if (!recovery || typeof recovery.action !== "string" || typeof recovery.operatorNext !== "string") {
    return { ok: false, message: "produced decision is missing its recovery" };
  }
  const mismatches = Array.isArray(evidence.mismatches) ? evidence.mismatches : [];
  const useful = {
    recipeId: produced.recipeId,
    recipeVersion: produced.schema,
    outcome: produced.outcome,
    recovery: {
      action: recovery.action,
      operatorNext: recovery.operatorNext,
    },
    evidence: {
      kind: evidence.kind,
      contentHash: evidence.candidateDigest.contentHash,
      mismatchedFields: mismatches.map((row) => String(row?.field ?? "")).filter(Boolean),
      partial: evidence.partial === true,
      noChangeProven: evidence.claims?.noChangeProven === true,
      automaticPaymentReplay: false,
    },
  };
  if (rejectingPrivate(useful) || disallowedText(useful)) return privateRejection();
  return { ok: true, useful };
}

export function readBinding(observation) {
  const binding = observation.payload?.decisionBinding;
  if (!binding || typeof binding !== "object" || binding.kind !== "before_work_public_input") {
    return { ok: false, reason: DECISION_REASONS.unboundLegacy };
  }
  const useful = observation.payload?.usefulDecision;
  if (!useful || typeof useful !== "object" || !observation.statement) {
    return { ok: false, reason: DECISION_REASONS.invalidSavedState };
  }
  if (binding.inputDigest !== observation.source?.version) {
    return { ok: false, reason: DECISION_REASONS.invalidSavedState };
  }
  if (typeof binding.recipeId !== "string" || typeof binding.recipeVersion !== "string" || typeof binding.inputDigest !== "string") {
    return { ok: false, reason: DECISION_REASONS.invalidSavedState };
  }
  if (useful.recipeId !== binding.recipeId || useful.recipeVersion !== binding.recipeVersion || !useful.outcome || !useful.recovery) {
    return { ok: false, reason: DECISION_REASONS.invalidSavedState };
  }
  return { ok: true, binding, useful };
}

// The canonical body is the stored useful decision object. Missing legacy
// digest stays unknown. A mismatch is corruption detection, not a signature.
export function verifyUsefulBody(binding, useful) {
  if (typeof binding?.usefulBodyDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(binding.usefulBodyDigest)) {
    return { ok: false, reason: DECISION_REASONS.integrityUnknown };
  }
  if (!useful || typeof useful !== "object" || digestPublicInput(useful) !== binding.usefulBodyDigest) {
    return { ok: false, reason: DECISION_REASONS.integrityMismatch };
  }
  return { ok: true };
}

function decisionView(observation) {
  const binding = observation.payload.decisionBinding;
  return {
    schema: observation.schema,
    observationId: observation.observationId,
    revisionId: observation.revisionId,
    inputDigest: observation.source.version,
    sourceUri: observation.source.uri,
    clock: observation.recordedAt.instant,
    statement: observation.statement,
    useful: observation.payload.usefulDecision,
    provenance: {
      recipeId: binding.recipeId,
      recipeVersion: binding.recipeVersion,
      revisionId: observation.revisionId,
      clock: observation.recordedAt.instant,
      sourceUri: observation.source.uri,
      inputDigest: binding.inputDigest,
      observationId: observation.observationId,
    },
  };
}

function recompute(reason, message, extra = {}) {
  return {
    ok: true,
    mode: DECIDE_OR_REUSE_MODE,
    verdict: RECOMPUTE_VERDICT,
    reason,
    message,
    producerInvoked: false,
    ...extra,
    ...verdictLimits(null),
  };
}

export function verdictLimits(recipeId) {
  return {
    costBaseline: costForRecipe(SUPPORTED_RECIPE_IDS.includes(recipeId) ? recipeId : COST_BASELINE_RECIPE),
    liveMetric: {
      distinctLaterAcceptedTasksTakingReuse: null,
      recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
      observedAcceptedTaskLedger: false,
    },
    cannotEstablish: [...CANNOT_ESTABLISH],
    publicSafeCertified: false,
    evidenceKind: "user_selected_unverified",
    kind: null,
  };
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function observationIdFor(taskId, subject) {
  const digest = createHash("sha256")
    .update(String(taskId), "utf8")
    .update("\0", "utf8")
    .update(String(subject), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `obs_${digest}`;
}

export function resolveSavedObservation(saved) {
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
