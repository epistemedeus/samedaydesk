export const EVENT_SCHEMA = "neomorphic.contributor-measurement.event.v1";
export const STATE_SCHEMA = "neomorphic.contributor-measurement.store.v1";
export const QUERY_SCHEMA = "neomorphic.contributor-measurement.query.v1";
export const POLICY_SCHEMA = "neomorphic.contributor-measurement.policy.v1";
export const MAX_EVENTS = 10000;
export const MAX_BYTES = 16 * 1024 * 1024;
export const STAGES = Object.freeze([
  "discovery", "signup", "claim", "submission", "review", "qualified_fulfillment",
  "consented_publication", "referral", "repeat_useful_work", "customer_revenue",
]);
export const RELATIONS = Object.freeze(["owner_qa", "sponsored", "recruited", "independent", "unknown"]);
export const ROUTES = Object.freeze(["search", "feed", "api", "mcp", "another_agent", "direct_invitation", "other", "unknown"]);
export const COVERAGE = Object.freeze(["complete", "partial", "capped", "unknown", "absent"]);
export const OUTCOMES = Object.freeze({
  discovery: ["visited"], signup: ["created"], claim: ["claimed", "full", "expired", "refused"],
  submission: ["submitted", "failed"], review: ["accepted_useful", "accepted_unknown", "rejected", "clarification", "withdrawn"],
  qualified_fulfillment: ["qualified", "unqualified", "unknown"],
  consented_publication: ["published", "withdrawn"], referral: ["shared", "arrived", "withdrawn"],
  repeat_useful_work: ["useful", "withdrawn"], customer_revenue: ["recognized", "withdrawn"],
});
export const REF_FIELDS = Object.freeze(["taskId", "workId", "reservationId", "termsId", "artifactId", "obligationId", "receiptId", "consentId", "referralId"]);
const WORK = ["taskId", "workId", "reservationId", "termsId", "artifactId"];
export const REQUIRED_REFS = Object.freeze({
  discovery: [], signup: [], claim: ["taskId"], submission: WORK, review: WORK,
  qualified_fulfillment: WORK, consented_publication: WORK,
  referral: ["referralId"], repeat_useful_work: WORK, customer_revenue: ["taskId", "workId"],
});
export function fail(code) { const error = new Error(code); error.code = code; throw error; }
export function keys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) fail("schema_keys");
}
export function token(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) ||
      /^(0x[0-9a-f]{40,64}|ew_ctr_|sk_|eyJ|bearer)/i.test(value)) fail("opaque_id_required");
  return value;
}
export function stamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("invalid_timestamp");
  return Date.parse(value);
}
export function oneOf(value, values) { if (!values.includes(value)) fail("schema_enum"); }
export function boundedArray(value, max) { if (!Array.isArray(value) || value.length > max) fail("array_bound"); }
export function unique(values) { if (new Set(values).size !== values.length) fail("duplicate_member"); }
export function factKey(value) { return JSON.stringify([value.producerId, value.factId]); }
export function eventKey(value) { return JSON.stringify([value.producerId, value.eventId]); }
export function actorKey(value) { return JSON.stringify([value.namespace, value.actorId]); }
export function validatePolicy(policy) {
  keys(policy, ["schema", "producers"]);
  if (policy.schema !== POLICY_SCHEMA) fail("policy_schema");
  boundedArray(policy.producers, 64);
  for (const producer of policy.producers) {
    keys(producer, ["id", "sourceVersion", "stages", "namespaces", "provenances"]);
    token(producer.id); token(producer.sourceVersion);
    for (const [list, allowed] of [[producer.stages, STAGES], [producer.provenances, ["fixture", "test", "production"]]]) {
      boundedArray(list, STAGES.length); unique(list); list.forEach((item) => oneOf(item, allowed));
    }
    boundedArray(producer.namespaces, 32); unique(producer.namespaces); producer.namespaces.forEach(token);
  }
  unique(policy.producers.map((producer) => producer.id));
  return policy;
}
export function validateEvent(event, policy) {
  keys(event, ["schema", "producerId", "sourceVersion", "eventId", "factId", "revision", "supersedes", "stage", "outcome",
    "occurredAt", "observedAt", "populationId", "namespace", "actorId", "actorRelation", "provenance", "evidence", "channel", "attribution", "refs", "parents"]);
  if (event.schema !== EVENT_SCHEMA) fail("event_schema");
  for (const field of ["producerId", "sourceVersion", "eventId", "factId", "populationId", "namespace", "actorId"]) token(event[field]);
  oneOf(event.stage, STAGES); oneOf(event.outcome, OUTCOMES[event.stage]); oneOf(event.actorRelation, RELATIONS);
  oneOf(event.provenance, ["fixture", "test", "production"]); oneOf(event.evidence, ["observed", "self_report"]);
  oneOf(event.channel, ["http", "email", "operator", "fixture"]);
  if (stamp(event.occurredAt) > stamp(event.observedAt)) fail("observation_before_occurrence");
  if (!Number.isSafeInteger(event.revision) || event.revision < 1 || event.revision > MAX_EVENTS) fail("invalid_revision");
  if (event.revision === 1 ? event.supersedes !== null : event.supersedes === null) fail("invalid_supersedes");
  if (event.supersedes !== null) token(event.supersedes);
  keys(event.attribution, ["observed", "declared"]);
  for (const value of Object.values(event.attribution)) if (value !== null) oneOf(value, ROUTES);
  // A submitted declaration never becomes observed acquisition evidence.
  if (event.evidence === "self_report" && event.attribution.observed !== null) fail("declared_source_is_not_observed");
  keys(event.refs, REQUIRED_REFS[event.stage], REF_FIELDS.filter((field) => !REQUIRED_REFS[event.stage].includes(field)));
  Object.values(event.refs).forEach(token);
  const required = event.stage === "claim" && event.outcome === "claimed" ? ["workId", "reservationId", "termsId"]
    : event.stage === "qualified_fulfillment" && event.outcome === "qualified" ? ["obligationId", "receiptId"]
    : event.stage === "consented_publication" && event.outcome === "published" ? ["consentId"] : [];
  if (required.some((field) => !event.refs[field])) fail("missing_binding");
  boundedArray(event.parents, 3);
  for (const parent of event.parents) { keys(parent, ["producerId", "factId"]); token(parent.producerId); token(parent.factId); }
  unique(event.parents.map(factKey));
  if (policy) {
    const producer = policy.producers.find((row) => row.id === event.producerId);
    if (!producer || producer.sourceVersion !== event.sourceVersion || !producer.stages.includes(event.stage) ||
        !producer.namespaces.includes(event.namespace) || !producer.provenances.includes(event.provenance)) fail("producer_scope_refused");
  }
  return event;
}
export function validateQuery(query, policy) {
  keys(query, ["schema", "window", "retentionSeconds", "populations"]);
  if (query.schema !== QUERY_SCHEMA) fail("query_schema");
  keys(query.window, ["from", "to", "asOf"]);
  if (stamp(query.window.from) >= stamp(query.window.to) || stamp(query.window.to) > stamp(query.window.asOf)) fail("invalid_window");
  if (!Number.isSafeInteger(query.retentionSeconds) || query.retentionSeconds < 1 || query.retentionSeconds > 31536000) fail("retention_bound");
  boundedArray(query.populations, 32);
  for (const population of query.populations) {
    keys(population, ["id", "namespace", "actorRelation", "provenance", "window", "membership", "members", "coverage"]);
    token(population.id); token(population.namespace); oneOf(population.actorRelation, RELATIONS);
    oneOf(population.provenance, ["fixture", "test", "production"]); oneOf(population.membership, COVERAGE);
    keys(population.window, ["from", "to", "asOf"]);
    if (stamp(population.window.from) >= stamp(population.window.to) || stamp(population.window.to) > stamp(population.window.asOf)) fail("invalid_window");
    if (population.members !== null) { boundedArray(population.members, MAX_EVENTS); unique(population.members); population.members.forEach(token); }
    if (population.membership === "complete" && population.members === null) fail("complete_members_required");
    keys(population.coverage, [], STAGES);
    for (const [stage, coverage] of Object.entries(population.coverage)) {
      keys(coverage, ["state", "producerIds"]); oneOf(coverage.state, COVERAGE);
      boundedArray(coverage.producerIds, 64); unique(coverage.producerIds); coverage.producerIds.forEach(token);
      if (coverage.state === "complete" && !coverage.producerIds.length) fail("complete_producers_required");
      if (policy && coverage.producerIds.some((id) => !policy.producers.some((row) => row.id === id && row.stages.includes(stage) &&
          row.namespaces.includes(population.namespace) && row.provenances.includes(population.provenance)))) fail("coverage_producer_refused");
    }
  }
  unique(query.populations.map((row) => JSON.stringify([row.id, row.namespace])));
  return query;
}
