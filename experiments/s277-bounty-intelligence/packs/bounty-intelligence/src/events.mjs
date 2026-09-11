import { SCHEMA_EVENT, LIFECYCLE_EVENTS } from "./constants.mjs";
import { sha256Canonical } from "./hash.mjs";
import { nowIso } from "./clock.mjs";

export { LIFECYCLE_EVENTS };

function eventId(type, taskId, at, extra) {
  return `evt_${sha256Canonical({ type, taskId, at, extra }).slice(0, 24)}`;
}

export function compactEvent({ type, taskId, at, payload = {}, dataLabel = "derived" }) {
  if (!LIFECYCLE_EVENTS.includes(type)) {
    throw new Error(`unknown lifecycle event type: ${type}`);
  }
  return {
    schema: SCHEMA_EVENT,
    eventId: eventId(type, taskId, at, payload),
    type,
    at,
    taskId,
    reservationId: payload.reservationId || null,
    payload,
    dataLabel,
  };
}

/**
 * From comparison records, emit discovery events.
 * Further stages only appear when a labelled experience log supplies them.
 * This is not an analytics platform.
 */
export function compactEvents({ records = [], experienceLog = [], now } = {}) {
  const at = nowIso(now);
  const events = [];
  for (const rec of records) {
    events.push(
      compactEvent({
        type: "discovery",
        taskId: rec.taskId,
        at: rec.observedAt || at,
        dataLabel: rec.dataLabel,
        payload: {
          adapter: rec.source?.adapter,
          nativeId: rec.source?.nativeId,
          url: rec.source?.url,
          availablePaidJob: rec.status?.availablePaidJob === true,
          funding: rec.funding?.status,
          termsVersion: rec.termsVersion,
        },
      }),
    );
  }
  for (const row of experienceLog) {
    const type = row.type;
    if (!LIFECYCLE_EVENTS.includes(type) || type === "discovery") continue;
    events.push(
      compactEvent({
        type,
        taskId: row.taskId,
        at: row.at || at,
        dataLabel: row.dataLabel || "synthetic-edge",
        payload: row.payload || {},
      }),
    );
  }
  return events;
}

export function emptyPipeline(taskId, at) {
  return LIFECYCLE_EVENTS.map((type) => ({
    type,
    present: type === "discovery",
    taskId,
    at: type === "discovery" ? at : null,
  }));
}
