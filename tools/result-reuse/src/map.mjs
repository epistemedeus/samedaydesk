import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  ID_MAX,
  OBSERVATION_SCHEMA,
  OWNER_SCOPE_DEFAULT,
  RECIPE_URI,
  TASK_FAMILY,
  TEXT_MAX,
  URI_MAX,
  VERSION_MAX,
} from "./pins.mjs";
import { isPublicHttpUrl } from "./omit.mjs";

const RECORD_CLASSES = Object.freeze(["observation", "hypothesis", "correction"]);

/**
 * Explicit field map from N45 `n49-adapter.mjs` at pin N45_PIN.
 * Not a second protocol.
 *
 * N45 class            -> epistemicStatus / lifecycle / supersedes
 * observation          -> observed / active
 * hypothesis           -> inferred / active
 * correction           -> observed / active + supersedes rev_{correctsSequence}
 * projectId + subject  -> observationId obs_{sha256(projectId NUL subject)[0:32]}
 * data                 -> payload
 * note                 -> statement
 * HTTP sequence        -> revisionId rev_{sequence}
 * correspondence projectId -> taskScope.taskId
 * execute              -> always false
 */
export function n45RecordToObservation(record, {
  projectId,
  sequence,
  ownerScope = OWNER_SCOPE_DEFAULT,
  recordedAt,
} = {}) {
  if (!RECORD_CLASSES.includes(record?.class)) {
    throw new Error("adapter requires an N45 record class");
  }
  const subject = boundedText(record.subject, ID_MAX, "subject");
  const taskId = boundedText(projectId, ID_MAX, "taskScope.taskId");
  const scope = boundedText(ownerScope, ID_MAX, "ownerScope");
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("adapter requires a positive sequence");
  }
  if (!isoInstant(recordedAt)) throw new Error("adapter requires an explicit wall UTC clock");
  if (record.class === "correction") {
    if (!Number.isInteger(record.correctsSequence) || record.correctsSequence < 1) {
      throw new Error("correction requires a positive correctsSequence");
    }
    if (record.correctsSequence >= sequence) {
      throw new Error("correction must supersede an earlier sequence");
    }
  } else if (record.correctsSequence != null) {
    throw new Error("correctsSequence is only valid for a correction");
  }

  const observationId = stableObservationId(taskId, subject);
  const revisionId = boundedText(`rev_${sequence}`, ID_MAX, "derived revisionId");
  const payload = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : {};
  const sourceUri = publicUrl(payload.url) || RECIPE_URI;
  if (sourceUri.length > URI_MAX) throw new Error("source URI exceeds the contract limit");
  const sourceVersion = boundedText(firstNonempty(payload.contentHash, payload.sourceVersion), VERSION_MAX, "source.version");
  const instant = isoInstant(recordedAt);
  const statement = boundedText(firstNonempty(record.note, `${record.class} ${subject}`), TEXT_MAX, "statement");
  const sourceMissing = payload.reuseProvenance?.originalEvidenceUrlAvailable === false;

  const observation = {
    schema: OBSERVATION_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    observationId,
    revisionId,
    taskScope: {
      taskId,
      taskFamily: TASK_FAMILY,
      ownerScope: scope,
    },
    source: {
      uri: sourceUri,
      version: sourceVersion,
    },
    epistemicStatus: sourceMissing
      ? "source_unavailable"
      : record.class === "hypothesis" ? "inferred" : "observed",
    lifecycleStatus: "active",
    statement,
    payload,
    recordedAt: { instant, domain: "wall_utc" },
    execute: false,
  };

  const retrievedAt = isoInstant(payload.fetchedAt);
  if (retrievedAt) {
    observation.source.retrievedAt = { instant: retrievedAt, domain: "source_server" };
  }

  if (record.class === "correction") {
    observation.supersedes = {
      observationId,
      revisionId: boundedText(`rev_${record.correctsSequence}`, ID_MAX, "superseded revisionId"),
    };
  }

  return observation;
}

export function assertObservationShape(observation) {
  if (!observation || observation.schema !== OBSERVATION_SCHEMA) {
    return { ok: false, message: "schema must be neomorphic.task-memory.observation.v1" };
  }
  if (observation.contractVersion !== CONTRACT_VERSION) {
    return { ok: false, message: "contractVersion must be 1" };
  }
  if (observation.execute !== false) {
    return { ok: false, message: "execute must be false" };
  }
  if (!isPublicHttpUrl(observation.source?.uri)) {
    return { ok: false, message: "source.uri must be an absolute http(s) URL" };
  }
  if (!observation.source?.version || String(observation.source.version).trim() === "") {
    return { ok: false, message: "source.version is required" };
  }
  if (!observation.statement || String(observation.statement).trim() === "") {
    return { ok: false, message: "statement is required" };
  }
  return { ok: true, value: observation };
}

function publicUrl(value) {
  return isPublicHttpUrl(value) ? value : null;
}

function isoInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function firstNonempty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function boundedText(value, max, label) {
  if (value == null) throw new Error(`${label} is required`);
  const text = String(value).trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} exceeds the contract limit`);
  return text;
}

function stableObservationId(taskId, subject) {
  const digest = createHash("sha256")
    .update(taskId, "utf8")
    .update("\0", "utf8")
    .update(subject, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `obs_${digest}`;
}
