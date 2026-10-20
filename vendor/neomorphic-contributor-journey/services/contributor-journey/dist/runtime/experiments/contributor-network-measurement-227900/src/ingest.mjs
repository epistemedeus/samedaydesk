import { isDeepStrictEqual } from "node:util";
import { STATE_SCHEMA, MAX_EVENTS, validateEvent, validatePolicy, factKey, eventKey, fail, keys, token } from "./contract.mjs";

export function emptyState() { return { schema: STATE_SCHEMA, events: [] }; }
export function validateState(state, policy) {
  keys(state, ["schema", "events"]);
  if (state.schema !== STATE_SCHEMA || !Array.isArray(state.events) || state.events.length > MAX_EVENTS) fail("invalid_store");
  validatePolicy(policy);
  return applyBatch(emptyState(), state.events, policy).state;
}
// Called under the consumer store's single-writer transaction, not the product ledger.
export function ingest(state, batch, policy) {
  validatePolicy(policy);
  return applyBatch(validateState(state, policy), batch, policy);
}
function applyBatch(state, batch, policy) {
  if (!Array.isArray(batch) || batch.length > MAX_EVENTS) fail("batch_bound");
  for (const event of batch) validateEvent(event, policy);
  const events = [...state.events];
  const deliveries = new Map(events.map((event) => [eventKey(event), event]));
  const heads = new Map();
  for (const event of events) heads.set(factKey(event), event);
  let inserted = 0, replayed = 0;
  for (const event of batch) {
    const seen = deliveries.get(eventKey(event));
    if (seen) {
      if (!isDeepStrictEqual(seen, event)) fail("idempotency_conflict");
      replayed++; continue;
    }
    const previous = heads.get(factKey(event));
    if (!previous) {
      if (event.revision !== 1) fail("correction_predecessor_missing");
    } else {
      if (event.revision !== previous.revision + 1 || event.supersedes !== previous.eventId) fail("correction_conflict");
      for (const field of ["stage", "populationId", "namespace", "actorId", "actorRelation", "provenance", "evidence", "channel", "occurredAt"]) {
        if (event[field] !== previous[field]) fail("correction_scope_changed");
      }
      for (const field of ["taskId", "workId"]) if (event.refs[field] !== previous.refs[field]) fail("correction_scope_changed");
      if (event.observedAt < previous.observedAt) fail("correction_time_reversed");
    }
    if (events.length === MAX_EVENTS) fail("store_capacity");
    const saved = structuredClone(event);
    events.push(saved); deliveries.set(eventKey(saved), saved); heads.set(factKey(saved), saved); inserted++;
  }
  return { state: { schema: STATE_SCHEMA, events }, receipt: { inserted, replayed, storedRevisions: events.length } };
}
export function readback(state, reference) {
  keys(reference, ["producerId", "eventId"]);
  token(reference.producerId); token(reference.eventId);
  const event = state.events.find((row) => eventKey(row) === eventKey(reference));
  if (!event) return { status: "absent", revision: null, active: null };
  const head = state.events.filter((row) => factKey(row) === factKey(event)).at(-1);
  return { status: "stored", revision: event.revision, active: head.eventId === event.eventId };
}
