import { projectResult } from "./project.mjs";
import { assertObservationShape, n45RecordToObservation } from "./map.mjs";
import { OWNER_SCOPE_DEFAULT, RECIPE_URI } from "./pins.mjs";
import {
  containsHostileMarkup,
  credentialHits,
  exportContainsCredentialShape,
  isPublicHttpUrl,
  looksLikeFilesystemPath,
} from "./omit.mjs";
import { checkPayloadBytes } from "./limits.mjs";

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
