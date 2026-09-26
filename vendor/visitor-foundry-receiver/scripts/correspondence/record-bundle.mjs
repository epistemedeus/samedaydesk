/**
 * Correspondence record-bundle export.
 *
 * Partial and missing history is disclosed. Missing events are not invented.
 * Corrections are appended records; prior event bytes are not rewritten.
 */

import {
  CORRESPONDENCE_RECORD_BUNDLE_SCHEMA,
  DEFAULT_EVENT_LIMIT,
  MAX_EVENT_LIMIT,
} from "./constants.mjs";
import { assertCorrespondenceOrigin } from "./client.mjs";
import { assertNoSecretInPublicValue, collectSecrets } from "./redact.mjs";

export { CORRESPONDENCE_RECORD_BUNDLE_SCHEMA };

const CORRECTS_EVENT_ID_RE = /(?:^|\n)correctsEventId=([A-Za-z0-9_.:-]+)/g;

export function parseCorrectsEventId(text) {
  if (typeof text !== "string" || !text) return null;
  const matches = [...text.matchAll(CORRECTS_EVENT_ID_RE)];
  if (!matches.length) return null;
  const id = matches[matches.length - 1][1];
  return id && id.length <= 200 ? id : null;
}

export function assessCorrespondenceHistory(events, { nextCursor = null, truncated = false } = {}) {
  const list = Array.isArray(events) ? events : [];
  const sequences = [];
  const ids = new Set();
  for (const event of list) {
    if (event && typeof event.id === "string") ids.add(event.id);
    if (Number.isInteger(event?.sequence) && event.sequence >= 1) sequences.push(event.sequence);
  }
  const minSeq = sequences.length ? Math.min(...sequences) : null;
  const maxSeq = sequences.length ? Math.max(...sequences) : null;
  const uniqueSeq = new Set(sequences);
  const prefixMissing = minSeq != null && minSeq > 1;
  const laterMissing = Boolean(nextCursor) || truncated === true;
  const sequenceGap = minSeq != null && maxSeq - minSeq + 1 !== uniqueSeq.size;
  const missingCorrectionTargets = [];
  for (const event of list) {
    if (event?.kind !== "correction") continue;
    const target = parseCorrectsEventId(event.text);
    if (target && !ids.has(target)) missingCorrectionTargets.push(target);
  }
  const windowIncomplete = prefixMissing || laterMissing || sequenceGap;
  const complete = list.length > 0 && !windowIncomplete && missingCorrectionTargets.length === 0;
  const reasons = [];
  if (prefixMissing) reasons.push("the window does not start at sequence 1");
  if (sequenceGap) reasons.push("sequence numbers are not contiguous");
  if (laterMissing) reasons.push("later events may exist");
  if (missingCorrectionTargets.length) reasons.push("a correction target is absent from this window");
  if (list.length === 0) reasons.push("this window contains no events");
  const disclosure = complete
    ? null
    : `Correspondence history is incomplete or truncated. Missing events are not invented.${
        reasons.length ? ` ${reasons.join("; ")}.` : ""
      }`;
  return {
    complete,
    truncated: windowIncomplete,
    disclosure,
    afterCursor: nextCursor ?? null,
    prefixMissing,
    sequenceGap,
    laterMissing,
    missingCorrectionTargets,
  };
}

export function buildCorrespondenceRecordBundle({
  baseUrl,
  project,
  events,
  nextCursor = null,
  truncated = false,
  secrets = [],
} = {}) {
  if (!project || typeof project !== "object" || typeof project.id !== "string") {
    const error = new Error("record bundle requires a project");
    error.code = "malformed";
    throw error;
  }
  if (!Array.isArray(events)) {
    const error = new Error("record bundle requires events");
    error.code = "malformed";
    throw error;
  }
  const origin = baseUrl ? assertCorrespondenceOrigin(baseUrl) : baseUrl ?? null;
  const clonedEvents = structuredClone(events);
  const history = assessCorrespondenceHistory(clonedEvents, { nextCursor, truncated });
  const bundle = {
    schema: CORRESPONDENCE_RECORD_BUNDLE_SCHEMA,
    baseUrl: origin,
    project: structuredClone(project),
    events: clonedEvents,
    nextCursor: history.afterCursor,
    truncated: history.truncated,
    history,
  };
  assertNoSecretInPublicValue(bundle, collectSecrets(...secrets), "record-bundle");
  return bundle;
}

export function recordBundleFromEventPage({
  baseUrl,
  project,
  page,
  truncated = false,
  secrets = [],
} = {}) {
  const events = Array.isArray(page?.events) ? page.events : [];
  const nextCursor = page?.nextCursor ?? null;
  return buildCorrespondenceRecordBundle({
    baseUrl,
    project,
    events,
    nextCursor,
    truncated: truncated === true || Boolean(nextCursor),
    secrets,
  });
}

export async function exportCorrespondenceRecordBundle(
  client,
  { projectId, token, project = null, limit = DEFAULT_EVENT_LIMIT, secrets = [] } = {},
) {
  if (!client || typeof client.listEvents !== "function") {
    const error = new Error("correspondence client is required");
    error.code = "not_configured";
    throw error;
  }
  const pageLimit = Math.min(Math.max(Number(limit) || DEFAULT_EVENT_LIMIT, 1), MAX_EVENT_LIMIT);
  const events = [];
  let after;
  for (;;) {
    const page = await client.listEvents({
      projectId,
      token,
      after,
      limit: pageLimit,
    });
    const batch = Array.isArray(page?.events) ? page.events : [];
    if (batch.length === 0) break;
    events.push(...batch);
    if (!page.nextCursor) break;
    after = page.nextCursor;
  }
  let resolvedProject = project;
  if (!resolvedProject) {
    const got = await client.getProject({ projectId, token });
    resolvedProject = got.project;
  }
  return buildCorrespondenceRecordBundle({
    baseUrl: client.baseUrl,
    project: resolvedProject,
    events,
    nextCursor: null,
    truncated: false,
    secrets: secrets.length ? secrets : collectSecrets(token),
  });
}
