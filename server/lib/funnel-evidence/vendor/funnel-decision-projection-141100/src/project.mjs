// Source-separated funnel decision, receiving 0.1.1.
// Cohort 0.1.0 and economics intake stay outside this file.
// Their result and cost-view contracts are inputs. This file does not
// import or execute the sealed cohort engine.
import { createHash } from "node:crypto";

export const REQUEST_SCHEMA = "neomorphic.funnel-decision-request.v1";
export const RESULT_SCHEMA = "neomorphic.funnel-decision.v1";
export const PACKAGE_VERSION = "0.1.1";

export const STAGES = [
  "encounter",
  "request",
  "refusal",
  "account_signup",
  "task_preparation",
  "valid_delivery",
  "caller_acceptance",
  "settlement",
  "recognized_income",
  "later_recurrence",
];

const ADAPTERS = new Set([
  "core",
  "ein-journey-events",
  "ein-conversion-report",
  "samedaydesk-evidence",
  "cohort-result",
  "economics-cost",
]);

const COVERABLE = new Set(STAGES);
const DISCOVERY_TOOLS = new Set([
  "initialize", "tools/list", "ping", "mcp", "get_formation_contract",
  "getFormationContract", "compare_states", "explain_ein_route",
  "get_compliance_deadlines", "compareStates", "explainEinRoute",
  "getComplianceDeadlines", "getComplianceCalendar",
]);
const PREPARE_TOOLS = new Set(["prepare_application", "prepareApplication"]);
const WINDOW_CONFLICTS = new Set([
  "reversed_window",
  "future_window",
  "incompatible_windows",
  "numerator_exceeds_denominator",
]);

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function opaqueRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,80}$/.test(trimmed)) return null;
  if (/[@\s]/.test(trimmed) || /https?:/i.test(trimmed)) return null;
  if (/(^|[^A-Za-z0-9])(bearer|sk_|eyJ)/i.test(trimmed)) return null;
  if (/(^|[^A-Za-z0-9])wallet([^A-Za-z0-9]|$)/i.test(trimmed)) return null;
  return trimmed;
}

function stamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw coded("bad_timestamp");
  return value;
}

function coverageOf(capture) {
  const coverage = capture?.coverage || "unknown";
  if (!["complete", "partial", "capped", "unknown", "absent"].includes(coverage)) throw coded("bad_coverage");
  return coverage;
}

function blankStage(stage) {
  return {
    stage,
    observed: false,
    count: null,
    eligibleDenominator: null,
    coverage: "absent",
    rate: null,
    late: 0,
  };
}

function addConflict(conflicts, item) {
  const key = canonical(item);
  if (!conflicts.some((existing) => canonical(existing) === key)) conflicts.push(item);
}

function plane(metric) {
  if (!metric || typeof metric !== "object") return { covered: false, count: null };
  if (metric.count == null || metric.state === "unobserved_denominator") return { covered: false, count: null };
  if (!Number.isSafeInteger(metric.count) || metric.count < 0) throw coded("bad_metric");
  return { covered: true, count: metric.count, observed: metric.count > 0 };
}

function scopeOf(event) {
  return `src:${event.adapter}:${event.sourceId || "core"}`;
}

function eventContentKey(event) {
  return digest({
    stage: event.stage,
    signal: event.signal,
    body: event.body,
    taskRef: event.taskRef,
    operationId: event.operationId,
    attemptId: event.attemptId,
    amountAtomic: event.amountAtomic,
    currency: event.currency,
    occurredAt: event.occurredAt,
  });
}

function seal(event) {
  event.contentKey = eventContentKey(event);
  return event;
}

function baseEvent(source, record) {
  return {
    sourceIndex: source.index,
    adapter: source.adapter,
    sourceId: source.sourceId || "core",
    stage: null,
    signal: null,
    storedEventId: opaqueRef(record.storedEventId || record.stored_event_id),
    authoritativeEventId: opaqueRef(record.authoritativeEventId || record.authoritative_event_id),
    operationId: opaqueRef(record.operationId || record.operation_id),
    taskRef: opaqueRef(record.taskRef || record.task_ref),
    attemptId: opaqueRef(record.attempt_id || record.attemptId),
    retryOf: opaqueRef(record.retryOf),
    correctionOf: opaqueRef(record.correctionOf),
    late: record.late === true,
    synthetic: record.synthetic === true || record.ownerQa === true || record.owner_qa === true,
    declaredIndependent: record.declaredIndependent === true || record.declaredSource === "independent_agent",
    acceptance: null,
    currency: typeof record.currency === "string" ? record.currency : null,
    amountAtomic: typeof record.amountAtomic === "string"
      ? record.amountAtomic
      : (typeof record.amount_minor === "number" && Number.isFinite(record.amount_minor) ? String(record.amount_minor) : null),
    occurredAt: typeof record.occurred_at === "string" ? record.occurred_at : (typeof record.occurredAt === "string" ? record.occurredAt : null),
    legacyUnknown: false,
    externalOnly: false,
    taskRefBound: record.taskRefBound !== false,
    body: null,
  };
}

function refsOf(event) {
  const scope = scopeOf(event);
  const refs = [];
  if (event.taskRef && event.taskRefBound !== false) refs.push(`${scope}|task:${event.taskRef}`);
  if (event.operationId) refs.push(`${scope}|op:${event.operationId}`);
  if (event.attemptId) refs.push(`${scope}|attempt:${event.attemptId}`);
  if (event.storedEventId) refs.push(`${scope}|evt:${event.storedEventId}`);
  if (event.authoritativeEventId) refs.push(`auth:${event.authoritativeEventId}`);
  return refs;
}

function eventScope(event) {
  const scope = scopeOf(event);
  if (event.taskRef && event.taskRefBound !== false) return `${scope}|task:${event.taskRef}`;
  if (event.operationId) return `${scope}|op:${event.operationId}`;
  if (event.attemptId) return `${scope}|attempt:${event.attemptId}`;
  if (event.storedEventId) return `${scope}|evt:${event.storedEventId}`;
  return `${scope}|row:${event.sourceIndex}`;
}

function parseEinEvent(source, record) {
  if (!record || record.schema !== "pilot.journey.event.v1" || record.brand !== "ein") throw coded("ein_event_shape");
  const event = baseEvent(source, record);
  event.body = { event: record.event, tool: record.tool || null, outcome: record.outcome || null };
  if (record.event === "page_viewed") event.stage = "encounter";
  else if (record.event === "signup_completed") event.stage = "account_signup";
  else if (record.event === "checkout_started") event.signal = "checkout_started";
  else if (record.event === "payment_succeeded") event.stage = "settlement";
  else if (record.event === "identity_linked") event.signal = "identity_linked_unjoinable";
  else if (record.event === "agent_call") {
    if (typeof record.http_status !== "number") {
      event.legacyUnknown = true;
      event.signal = "legacy_unknown_agent_call";
    } else if (PREPARE_TOOLS.has(record.tool) && record.outcome === "ok" && Array.isArray(record.activation_states) && record.activation_states.includes("prepared")) {
      event.stage = "task_preparation";
    } else if (typeof record.tool === "string" && DISCOVERY_TOOLS.has(record.tool)) {
      event.stage = "encounter";
      event.signal = "machine_encounter";
    } else {
      event.signal = "agent_call_not_a_funnel_stage";
    }
  } else {
    event.signal = "unclassified_ein_event";
  }
  return [seal(event)];
}

function parseConversionReport(source, record) {
  if (!record || typeof record.join_key !== "string" || !record.totals) throw coded("ein_conversion_shape");
  return [seal({
    ...baseEvent(source, {}),
    signal: "ein_conversion_report",
    externalOnly: true,
    passthrough: {
      joinKey: record.join_key,
      sessions: record.totals.sessions ?? null,
      checkoutStarts: record.totals.checkout_starts ?? null,
      paid: record.totals.paid ?? null,
      unknown: record.totals.unknown ?? null,
      prohibitedInferenceCount: Array.isArray(record.prohibited_inferences) ? record.prohibited_inferences.length : null,
    },
    body: { totals: record.totals },
  })];
}

function receiptBody(record) {
  return {
    disposition: record.disposition || null,
    delivered: record.delivered === true,
    accepted: record.accepted === true,
    submitted: record.submitted === true,
  };
}

function parseOriginalReceipt(source, record) {
  if (record.schema !== "samedaydesk.original-task-receipt.v1") return [];
  const withdrawn = record.disposition === "withdrawn" || record.stage === "withdrawn";
  const events = [];
  const push = (patch) => {
    events.push(seal({ ...baseEvent(source, record), body: receiptBody(record), ...patch }));
  };
  if (record.submitted === true) push({ stage: "request" });
  if (record.disposition === "useful_refusal") push({ stage: "refusal" });
  if (record.disposition === "scoped_result" || record.triaged === true) push({ signal: "triaged_result" });
  if (record.delivered === true) push({ stage: "valid_delivery" });
  if (record.accepted === true) push({ stage: "caller_acceptance", acceptance: "current" });
  if (withdrawn) push({ acceptance: "withdrawn", signal: "withdrawal" });
  return events;
}

function parseDeliveryRow(source, record) {
  const event = baseEvent(source, record);
  event.taskRefBound = record.taskRefBound === true;
  if (!event.taskRefBound) event.taskRef = null;
  event.body = {
    callerAcceptance: record.callerAcceptance || null,
    outcomeDelivery: record.outcomeDelivery || null,
    deliveryClass: record.deliveryClass || null,
    usefulness: record.usefulness || null,
    paidEvidencePresent: record.paidEvidencePresent === true,
  };
  if (record.callerAcceptance === "accepted" && event.taskRef) {
    event.stage = "caller_acceptance";
    event.acceptance = "current";
  } else if (record.callerAcceptance === "revoked" || record.callerAcceptance === "withdrawn") {
    event.acceptance = record.callerAcceptance;
    event.signal = "acceptance_not_current";
  } else if (record.callerAcceptance === "absent") {
    event.signal = "acceptance_declaration_absent";
  }
  if (record.paidEvidencePresent === true) {
    const payment = seal({
      ...event,
      stage: "settlement",
      signal: "paid_evidence",
      acceptance: null,
      body: event.body,
    });
    if (event.stage || event.signal) return [seal(event), payment];
    return [payment];
  }
  return [seal(event)];
}

function parseObservatory(source, record) {
  const observations = record.schemaVersion === "pilot.external-observatory.v1" && Array.isArray(record.observations)
    ? record.observations
    : [record];
  return observations.map((row) => seal({
    ...baseEvent(source, {}),
    externalOnly: true,
    signal: "external_observatory",
    body: {
      sourceId: row.sourceId || null,
      sourceKind: row.sourceKind || null,
      availability: row.availability || null,
      coverageComplete: row.coverage?.complete === true,
    },
  }));
}

function parseSamedaydesk(source, record) {
  if (!record || typeof record !== "object") throw coded("sds_shape");
  if (record.schema === "samedaydesk.original-task-receipt.v1") return parseOriginalReceipt(source, record);
  if (record.schema === "samedaydesk.ordinary-delivery-join.v1") {
    const rows = Array.isArray(record.rows) ? record.rows : [];
    return rows.flatMap((row) => parseDeliveryRow(source, row));
  }
  if (record.schemaVersion === "pilot.external-observatory.v1" || record.sourceKind) {
    if (record.schemaVersion && record.schemaVersion !== "pilot.external-observatory.v1") throw coded("observatory_shape");
    return parseObservatory(source, record);
  }
  if (record.callerAcceptance || record.paidEvidencePresent === true || record.deliveryClass) {
    return parseDeliveryRow(source, record);
  }
  throw coded("sds_shape");
}

function parseCohort(source, record) {
  if (!record || record.schema !== "neomorphic.task-cohort-merchant-adapter-result.v1") throw coded("cohort_shape");
  const operationId = opaqueRef(record.objective?.operationId);
  const events = [];
  const mapping = {
    attempt: "request",
    delivery: "valid_delivery",
    caller_useful: "caller_acceptance",
    later_useful: "later_recurrence",
  };
  for (const [key, stage] of Object.entries(mapping)) {
    const read = plane(record.metrics?.[key]);
    if (!read.covered || read.count < 1) continue;
    events.push(seal({
      ...baseEvent(source, { operationId }),
      stage,
      operationId,
      acceptance: stage === "caller_acceptance" ? "current" : null,
      signal: "cohort_metric",
      weight: read.count,
      body: { metric: key, count: read.count },
    }));
  }
  if (record.commerce && Object.prototype.hasOwnProperty.call(record.commerce, "independentCustomers")) {
    events.push(seal({
      ...baseEvent(source, {}),
      signal: "declared_independent_ignored",
      declaredIndependent: record.commerce.independentCustomers != null,
      externalOnly: true,
      body: {},
    }));
  }
  return events;
}

function parseRecurrence(source, record) {
  return seal({
    ...baseEvent(source, record),
    stage: "later_recurrence",
    signal: "recurrence",
    body: {
      nextDueAt: record.nextDueAt,
      renewedChoice: record.renewedChoice === true,
    },
  });
}

function parseEconomics(source, record) {
  if (!record || record.schema !== "neomorphic.economics-cost-views.v1") throw coded("economics_shape");
  if (record.total != null || record.added === true) {
    return [seal({ ...baseEvent(source, {}), signal: "double_counted_cost", externalOnly: true, body: {} })];
  }
  return [seal({ ...baseEvent(source, {}), signal: "economics_cost", externalOnly: true, cost: record, body: {} })];
}

function eventsFromSource(source) {
  const records = Array.isArray(source.records) ? source.records : [];
  const out = [];
  for (const record of records) {
    if (record?.schema === "neomorphic.recurrence.v1") {
      out.push(parseRecurrence(source, record));
      continue;
    }
    if (source.adapter === "ein-journey-events") out.push(...parseEinEvent(source, record));
    else if (source.adapter === "ein-conversion-report") out.push(...parseConversionReport(source, record));
    else if (source.adapter === "samedaydesk-evidence") out.push(...parseSamedaydesk(source, record));
    else if (source.adapter === "cohort-result") out.push(...parseCohort(source, record));
    else if (source.adapter === "economics-cost") out.push(...parseEconomics(source, record));
    else if (source.adapter === "core") throw coded("core_has_records");
  }
  return out;
}

function normalizeCost(supplied, coercion) {
  if (!supplied || typeof supplied !== "object") return { state: "unknown", amount: null };
  if (supplied.state === "unknown") {
    if (supplied.amount != null) coercion.push("unknown_cost_not_zero");
    return { state: "unknown", amount: null };
  }
  if (supplied.state === "observed_zero") return { state: "observed_zero", amount: 0 };
  if (supplied.state === "observed") {
    if (typeof supplied.amount !== "number" || !Number.isFinite(supplied.amount) || supplied.amount < 0) {
      coercion.push("invalid_cost");
      return { state: "unknown", amount: null };
    }
    return { state: "observed", amount: supplied.amount };
  }
  return { state: "unknown", amount: null };
}

function separateCosts(records) {
  const views = {
    includedPool: { state: "unknown", amount: null },
    incrementalCash: { state: "unknown", amount: null },
    modeledReplacement: { state: "unknown", amount: null },
    activeAttention: { state: "unknown", amount: null },
  };
  const seen = {
    includedPool: null,
    incrementalCash: null,
    modeledReplacement: null,
    activeAttention: null,
  };
  const coercion = [];
  const conflicts = [];
  let doubleCounted = false;
  for (const event of records) {
    if (event.signal === "double_counted_cost") {
      doubleCounted = true;
      continue;
    }
    if (event.signal !== "economics_cost") continue;
    for (const key of Object.keys(views)) {
      const supplied = event.cost[key];
      if (!supplied) continue;
      const normalized = normalizeCost(supplied, coercion);
      if (seen[key] == null) {
        seen[key] = normalized;
        views[key] = normalized;
        continue;
      }
      if (canonical(seen[key]) !== canonical(normalized)) {
        addConflict(conflicts, { code: "cost_view_conflict", view: key });
        views[key] = { state: "unknown", amount: null };
        seen[key] = { state: "unknown", amount: null };
      }
    }
  }
  return { ...views, additive: false, total: null, coercion, doubleCounted, conflicts };
}

function collapse(events) {
  const duplicates = [];
  const conflicts = [];
  const byKey = new Map();
  const kept = [];
  const dropped = new Set();
  for (const event of events) {
    if (!event.storedEventId || event.externalOnly) {
      kept.push(event);
      continue;
    }
    const key = `${scopeOf(event)}|evt:${event.storedEventId}|${event.stage || ""}|${event.signal || ""}`;
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, event);
      kept.push(event);
      continue;
    }
    if (prior.contentKey === event.contentKey) duplicates.push(event.storedEventId);
    else {
      addConflict(conflicts, { code: "duplicate_stored_event_conflict", storedEventId: key });
      dropped.add(prior);
      dropped.add(event);
    }
  }
  const authGroups = new Map();
  for (const event of kept) {
    if (dropped.has(event) || event.externalOnly || !event.authoritativeEventId) continue;
    const key = `auth:${event.authoritativeEventId}|${event.stage || ""}|${event.signal || ""}`;
    const group = authGroups.get(key) || [];
    group.push(event);
    authGroups.set(key, group);
  }
  for (const [key, group] of authGroups) {
    if (group.length < 2) continue;
    const same = group.every((event) => event.contentKey === group[0].contentKey);
    if (same) {
      for (const event of group.slice(1)) {
        dropped.add(event);
        duplicates.push(event.storedEventId || key);
      }
      continue;
    }
    addConflict(conflicts, { code: "authoritative_event_conflict", authoritativeEventId: key });
    for (const event of group) dropped.add(event);
  }
  return { events: kept.filter((event) => !dropped.has(event)), duplicates, conflicts };
}

function indexEvents(events) {
  const byQualified = new Map();
  const byAuth = new Map();
  for (const event of events) {
    if (event.storedEventId) {
      const key = `${scopeOf(event)}|evt:${event.storedEventId}`;
      const list = byQualified.get(key) || [];
      list.push(event);
      byQualified.set(key, list);
    }
    if (event.authoritativeEventId) {
      const list = byAuth.get(event.authoritativeEventId) || [];
      list.push(event);
      byAuth.set(event.authoritativeEventId, list);
    }
  }
  return { byQualified, byAuth };
}

function targetsOf(event, ref, indexes) {
  if (!ref) return [];
  const local = (indexes.byQualified.get(`${scopeOf(event)}|evt:${ref}`) || []).filter((item) => item !== event);
  if (local.length > 0) return local;
  return (indexes.byAuth.get(ref) || []).filter((item) => item !== event);
}

function walkPointer(start, field, indexes) {
  const chain = [];
  const seen = new Set();
  let cursor = start;
  while (cursor && cursor[field]) {
    if (seen.has(cursor)) return { cycle: true, chain };
    seen.add(cursor);
    chain.push(cursor);
    const next = targetsOf(cursor, cursor[field], indexes);
    if (next.length === 0) return { cycle: false, resolved: false, chain };
    const further = next.filter((item) => item[field]);
    if (further.length === 0) return { cycle: false, resolved: true, chain, targets: next };
    const nextRefs = new Set(further.map((item) => item[field]));
    if (nextRefs.size > 1) return { cycle: false, resolved: false, ambiguous: true, chain };
    cursor = further[0];
  }
  return { cycle: false, resolved: false, chain };
}

function applyAcceptance(targets, acceptance) {
  if (acceptance !== "withdrawn" && acceptance !== "revoked" && acceptance !== "current") return;
  const marked = targets.filter((event) => event.stage === "caller_acceptance" || event.acceptance);
  const applyTo = marked.length > 0 ? marked : targets;
  for (const event of applyTo) event.acceptance = acceptance;
}

function rootKey(targets) {
  return targets.map((event) => `${scopeOf(event)}|evt:${event.storedEventId || ""}|${event.stage || ""}|${event.signal || ""}`).sort().join("&");
}

function applyRetryAndCorrection(events) {
  const indexes = indexEvents(events);
  const suppress = new Set();
  const conflicts = [];
  let retryCycle = false;
  let correctionCycle = false;
  for (const event of events) {
    if (!event.retryOf) continue;
    const walked = walkPointer(event, "retryOf", indexes);
    if (walked.cycle || walked.ambiguous) {
      retryCycle = true;
      continue;
    }
    if (walked.resolved) for (const item of walked.chain) suppress.add(item);
  }
  if (retryCycle) addConflict(conflicts, { code: "retry_cycle" });

  const resolved = [];
  for (const event of events) {
    if (!event.correctionOf) continue;
    const walked = walkPointer(event, "correctionOf", indexes);
    if (walked.cycle || walked.ambiguous) {
      correctionCycle = true;
      continue;
    }
    if (!walked.resolved) continue;
    resolved.push(walked);
  }
  if (correctionCycle) addConflict(conflicts, { code: "correction_cycle" });
  const targeted = new Set();
  for (const walked of resolved) {
    for (const step of walked.chain.slice(1)) targeted.add(step);
  }
  const tips = resolved.filter((walked) => !targeted.has(walked.chain[0]));
  const groups = new Map();
  for (const tip of tips) {
    const key = rootKey(tip.targets);
    const group = groups.get(key) || [];
    group.push(tip);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const acceptances = [...new Set(group.map((tip) => tip.chain[0].acceptance).filter((value) => value === "withdrawn" || value === "revoked" || value === "current"))];
    const members = new Set();
    for (const tip of group) for (const step of tip.chain) members.add(step);
    for (const walked of resolved) {
      if (rootKey(walked.targets) === rootKey(group[0].targets)) {
        for (const step of walked.chain) members.add(step);
      }
    }
    if (acceptances.length > 1) {
      addConflict(conflicts, { code: "correction_conflict" });
      continue;
    }
    if (acceptances.length === 1) applyAcceptance(group[0].targets, acceptances[0]);
    for (const item of members) suppress.add(item);
  }
  return { events: events.filter((event) => !suppress.has(event)), conflicts };
}

function shareRef(left, right) {
  const refs = new Set(refsOf(left));
  for (const ref of refsOf(right)) if (refs.has(ref)) return true;
  return false;
}

function demandEvents(events) {
  return events.filter((event) => !event.externalOnly && !event.synthetic && !event.legacyUnknown && event.stage);
}

function bindingFor(source, requestAsOf) {
  const capture = source.capture || {};
  const coverage = coverageOf(capture);
  const from = capture.from || null;
  const to = capture.to || null;
  const captureAsOf = capture.asOf || null;
  const populationId = opaqueRef(capture.populationId);
  let windowError = null;
  if (from && to && Date.parse(from) > Date.parse(to)) windowError = "reversed_window";
  else if ((to && Date.parse(to) > Date.parse(requestAsOf)) || (captureAsOf && Date.parse(captureAsOf) > Date.parse(requestAsOf))) windowError = "future_window";
  else if (to && captureAsOf && Date.parse(to) > Date.parse(captureAsOf)) windowError = "future_window";
  const closed = !windowError && from && to && captureAsOf && populationId
    && Date.parse(from) <= Date.parse(to)
    && Date.parse(to) <= Date.parse(captureAsOf)
    && Date.parse(captureAsOf) <= Date.parse(requestAsOf);
  const scope = `src:${source.adapter}:${source.sourceId || "core"}`;
  return {
    coverage,
    from,
    to,
    asOf: captureAsOf,
    populationId,
    windowError,
    bound: closed ? `${scope}|pop:${populationId}|${from}|${to}|${captureAsOf}` : null,
    scope,
  };
}

function placement(event, binding) {
  if (!binding || binding.windowError || !(binding.from && binding.to)) return "unwindowed";
  if (!event.occurredAt || !Number.isFinite(Date.parse(event.occurredAt))) return "untimed";
  const at = Date.parse(event.occurredAt);
  if (at < Date.parse(binding.from) || at > Date.parse(binding.to)) return "outside";
  if (binding.asOf && at > Date.parse(binding.asOf)) return "outside";
  return "inside";
}

function recurrenceStateOf(event, asOf) {
  const due = Date.parse(event.body?.nextDueAt);
  if (!Number.isFinite(due)) return "unknown";
  if (due > Date.parse(asOf)) return "not_yet_due";
  if (event.body?.renewedChoice === true) return "renewed_choice";
  return "due_unobserved";
}

export function projectFunnel(input) {
  if (!input || input.schema !== REQUEST_SCHEMA) throw coded("request_schema");
  const asOf = stamp(input.asOf);
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const pinned = sources.map((source, index) => {
    if (!source || !ADAPTERS.has(source.adapter)) throw coded("bad_adapter");
    if (source.adapter !== "core" && (typeof source.sourceId !== "string" || typeof source.version !== "string")) throw coded("bad_source_pin");
    coverageOf(source.capture);
    if (source.capture?.from) stamp(source.capture.from);
    if (source.capture?.to) stamp(source.capture.to);
    if (source.capture?.asOf) stamp(source.capture.asOf);
    if (Array.isArray(source.covers) && source.covers.some((stage) => !COVERABLE.has(stage))) throw coded("bad_cover");
    return { ...source, index };
  });
  const bindings = pinned.map((source) => bindingFor(source, asOf));

  let parsed = [];
  const passthrough = [];
  for (const source of pinned) parsed.push(...eventsFromSource(source));
  for (const event of parsed) if (event.passthrough) passthrough.push(event.passthrough);

  const identityIgnored = parsed.some((event) => event.signal === "identity_linked_unjoinable") ||
    pinned.some((source) => (source.records || []).some((record) => record && typeof record === "object" &&
      ["uid", "aid", "email", "ip", "wallet"].some((key) => record[key] != null)));

  const excludedSynthetic = parsed.filter((event) => event.synthetic).length;
  parsed = parsed.filter((event) => !event.synthetic);
  const collapsed = collapse(parsed);
  const retried = applyRetryAndCorrection(collapsed.events);
  parsed = retried.events;

  const equalGroups = new Map();
  for (const event of demandEvents(parsed)) {
    const key = `${event.stage}|${event.contentKey}`;
    equalGroups.set(key, (equalGroups.get(key) || 0) + 1);
  }
  const equalContentDistinct = [...equalGroups.values()].filter((count) => count > 1).length;

  const costs = separateCosts(parsed);
  const conflicts = [...collapsed.conflicts, ...retried.conflicts];
  for (const conflict of costs.conflicts) addConflict(conflicts, conflict);
  if (costs.doubleCounted) addConflict(conflicts, { code: "double_counted_cost" });
  for (const binding of bindings) {
    if (binding.windowError) addConflict(conflicts, { code: binding.windowError, scope: binding.scope });
  }

  const recurrenceEvents = parsed.filter((event) => event.signal === "recurrence");
  const scopeRows = new Map();
  for (const event of recurrenceEvents) {
    const key = eventScope(event);
    const list = scopeRows.get(key) || [];
    list.push(event);
    scopeRows.set(key, list);
  }
  const byScope = [...scopeRows.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([scope, rows]) => {
    const states = [...new Set(rows.map((event) => recurrenceStateOf(event, asOf)))];
    const nextDueAt = rows.map((event) => event.body?.nextDueAt).filter((value) => typeof value === "string").sort()[0] || null;
    if (states.length !== 1) {
      addConflict(conflicts, { code: "recurrence_scope_conflict", scope });
      return { scope, state: "conflict", nextDueAt };
    }
    return { scope, state: states[0], nextDueAt };
  });
  const recurrenceState = byScope.length === 0 ? "unknown" : (byScope.length === 1 ? byScope[0].state : "scoped");
  const renewedScopes = byScope.filter((row) => row.state === "renewed_choice");

  const stages = Object.fromEntries(STAGES.map((stage) => [stage, blankStage(stage)]));
  const coveredBy = Object.fromEntries(STAGES.map((stage) => [stage, []]));
  for (const source of pinned) {
    const coverage = coverageOf(source.capture);
    const covers = Array.isArray(source.covers) ? source.covers : [];
    for (const stage of covers) {
      coveredBy[stage].push(source);
      if (stages[stage].coverage === "absent") stages[stage].coverage = coverage;
      else if (stages[stage].coverage !== coverage) stages[stage].coverage = "unknown";
    }
  }

  const counted = demandEvents(parsed);
  const untimed = Object.fromEntries(STAGES.map((stage) => [stage, false]));
  for (const event of counted) {
    if (event.signal === "recurrence") continue;
    if (event.stage === "caller_acceptance" && event.acceptance && event.acceptance !== "current") continue;
    const binding = bindings[event.sourceIndex];
    const place = placement(event, binding);
    if (place === "outside") continue;
    if (place === "untimed") untimed[event.stage] = true;
    const stage = stages[event.stage];
    const weight = Number.isSafeInteger(event.weight) ? event.weight : 1;
    stage.count = (stage.count || 0) + weight;
    stage.observed = stage.count > 0;
    if (event.late) stage.late += weight;
    if (stage.coverage === "absent") stage.coverage = coverageOf(pinned[event.sourceIndex].capture);
  }
  if (renewedScopes.length > 0) {
    stages.later_recurrence.count = renewedScopes.length;
    stages.later_recurrence.observed = true;
    if (stages.later_recurrence.coverage === "absent") stages.later_recurrence.coverage = "partial";
  }

  for (const stage of Object.values(stages)) {
    if (stage.stage === "recognized_income") {
      stage.count = null;
      stage.observed = false;
      stage.eligibleDenominator = null;
      stage.rate = null;
      continue;
    }
    const contributors = coveredBy[stage.stage];
    if (contributors.length === 0) continue;
    const contributorBindings = contributors.map((source) => bindings[source.index]);
    if (contributorBindings.some((binding) => binding.windowError)) {
      stage.eligibleDenominator = null;
      stage.rate = null;
      stage.coverage = "unknown";
      continue;
    }
    const capped = contributorBindings.some((binding) => binding.coverage === "capped") || stage.coverage === "capped";
    if (capped || stage.late > 0 || untimed[stage.stage]) {
      stage.eligibleDenominator = null;
      stage.rate = null;
      if (capped) stage.coverage = "capped";
      continue;
    }
    const complete = contributorBindings.every((binding) => binding.coverage === "complete");
    if (!complete) {
      stage.eligibleDenominator = null;
      stage.rate = null;
      continue;
    }
    const bounds = contributorBindings.map((binding) => binding.bound);
    const distinct = [...new Set(bounds)];
    const incompatible = distinct.length > 1 || bounds.length > 1 && distinct.some((bound) => !bound);
    if (incompatible) {
      addConflict(conflicts, { code: "incompatible_windows", stage: stage.stage });
      stage.count = null;
      stage.observed = false;
      stage.late = 0;
      stage.eligibleDenominator = null;
      stage.rate = null;
      stage.coverage = "unknown";
      continue;
    }
    if (!bounds[0]) {
      stage.eligibleDenominator = null;
      stage.rate = null;
      continue;
    }
    const denominators = contributors.map((source) => source.capture?.eligibleDenominator);
    const agreed = denominators.every((value) => value === denominators[0]) && Number.isSafeInteger(denominators[0]) && denominators[0] >= 0;
    if (!agreed) {
      stage.eligibleDenominator = null;
      stage.rate = null;
      continue;
    }
    if (stage.count == null) stage.count = 0;
    stage.eligibleDenominator = denominators[0];
    stage.coverage = "complete";
    stage.observed = stage.count > 0;
    if (stage.count > denominators[0]) {
      addConflict(conflicts, {
        code: "numerator_exceeds_denominator",
        stage: stage.stage,
        numerator: stage.count,
        denominator: denominators[0],
      });
      stage.rate = null;
    } else if (denominators[0] > 0) {
      stage.rate = { numerator: stage.count, denominator: denominators[0] };
    } else {
      stage.rate = null;
    }
  }

  const visible = [];
  for (const event of counted) {
    if (event.signal === "recurrence") continue;
    if (event.stage === "caller_acceptance" && event.acceptance && event.acceptance !== "current") continue;
    if (placement(event, bindings[event.sourceIndex]) === "outside") continue;
    visible.push(event);
  }
  const lateJoins = visible.filter((event) => event.late).map((event) => ({
    stage: event.stage,
    storedEventId: event.storedEventId,
  }));
  const settlements = visible.filter((event) => event.stage === "settlement");
  const others = visible.filter((event) => event.stage !== "settlement");
  const unattached = [];
  for (const settlement of settlements) {
    const attached = others.some((event) => shareRef(settlement, event));
    if (!attached) unattached.push({ kind: "settlement", storedEventId: settlement.storedEventId, operationId: settlement.operationId, taskRef: settlement.taskRef });
  }
  const currencies = new Set(settlements.map((event) => event.currency).filter(Boolean));
  if (currencies.size > 1) addConflict(conflicts, { code: "mixed_currency", currencies: [...currencies].sort() });

  const acceptanceEvents = parsed.filter((event) => event.acceptance);
  const currentAcceptance = acceptanceEvents.filter((event) => event.acceptance === "current");
  const revoked = acceptanceEvents.filter((event) => event.acceptance === "revoked" || event.acceptance === "withdrawn");
  let acceptanceConflict = conflicts.some((item) => item.code === "acceptance_source_conflict");
  for (const accepted of currentAcceptance) {
    for (const pulled of revoked) {
      const linked = accepted.correctionOf === pulled.storedEventId || pulled.correctionOf === accepted.storedEventId;
      if (!linked && shareRef(accepted, pulled)) acceptanceConflict = true;
    }
  }
  if (acceptanceConflict) addConflict(conflicts, { code: "acceptance_source_conflict" });
  const boundAcceptanceEvents = acceptanceConflict ? [] : currentAcceptance.filter((accepted) =>
    visible.some((event) => event !== accepted && (event.stage === "request" || event.stage === "valid_delivery" || event.signal === "triaged_result") && shareRef(accepted, event)));
  const boundAcceptance = boundAcceptanceEvents.length > 0;

  const legacyUnknown = parsed.filter((event) => event.legacyUnknown).length;
  const declaredIndependentIgnored = parsed.some((event) => event.declaredIndependent) ||
    pinned.some((source) => (source.records || []).some((record) => record?.declaredIndependent === true || record?.declaredSource === "independent_agent"));
  const boundEmpty = pinned.some((source, index) => bindings[index].coverage === "complete" && bindings[index].bound && source.capture?.eligibleDenominator === 0);

  let decision = "measure";
  const reasons = [];
  if (conflicts.length > 0) {
    decision = "repair";
    reasons.push(...new Set(conflicts.map((item) => item.code)));
  } else if (boundEmpty && visible.length === 0) {
    decision = "decline";
    reasons.push("covered_empty_population");
  } else if (boundAcceptance) {
    decision = "continue";
    reasons.push("current_acceptance_bound_to_task");
    if (byScope.some((row) => row.state === "not_yet_due" && boundAcceptanceEvents.some((accepted) => eventScope(accepted) === row.scope || recurrenceEvents.some((event) => eventScope(event) === row.scope && shareRef(accepted, event))))) {
      reasons.push("recurrence_not_yet_due");
    }
  } else {
    reasons.push("a_decision_changing_join_is_missing");
  }
  if (revoked.length > 0 && !boundAcceptance) reasons.push("acceptance_not_current");

  const signup = stages.account_signup.observed;
  const paymentJoined = settlements.some((settlement) => visible.some((event) => event.stage === "account_signup" && shareRef(settlement, event)));
  const deliveryObserved = stages.valid_delivery.observed || parsed.some((event) => event.signal === "triaged_result" || event.body?.deliveryClass);
  const acceptanceMissing = !boundAcceptance && !acceptanceConflict;
  const relevantRecurrence = byScope.filter((row) => row.state === "not_yet_due" && boundAcceptanceEvents.some((accepted) => {
    if (eventScope(accepted) === row.scope) return true;
    return recurrenceEvents.some((event) => eventScope(event) === row.scope && shareRef(accepted, event));
  })).sort((left, right) => String(left.nextDueAt).localeCompare(String(right.nextDueAt)) || left.scope.localeCompare(right.scope));

  let nextMeasurement;
  if (conflicts.some((item) => item.code === "mixed_currency")) {
    nextMeasurement = {
      measure: "Keep each currency on its own settlement. Do not add them.",
      changes: "Whether one single-currency settlement is attached to a task.",
    };
  } else if (conflicts.some((item) => item.code === "cost_view_conflict" || item.code === "double_counted_cost")) {
    nextMeasurement = {
      measure: "Keep each cost view on its own record. Unknown, negative, and nonfinite amounts stay unknown.",
      changes: "Whether a cost view is observed. Views are not added together.",
    };
  } else if (acceptanceConflict) {
    nextMeasurement = {
      measure: "Name which stored event is the current correction, using correctionOf.",
      changes: "Whether caller acceptance is current.",
    };
  } else if (conflicts.some((item) => item.code === "duplicate_stored_event_conflict" || item.code === "authoritative_event_conflict")) {
    nextMeasurement = {
      measure: "Keep conflicting bindings, amounts, and currencies on separate stored events, or name one shared authoritative event.",
      changes: "Whether those rows are one event or a conflict.",
    };
  } else if (conflicts.some((item) => WINDOW_CONFLICTS.has(item.code))) {
    nextMeasurement = {
      measure: "Bind one source-qualified population and a closed from/to/asOf window, and keep the numerator within that denominator.",
      changes: "Whether a rate or covered zero can be read. An unbound, reversed, or future window stays unknown.",
    };
  } else if (revoked.length > 0 && !boundAcceptance) {
    nextMeasurement = {
      measure: "A later acceptance that cites the same task, operation, or stored event, or a record that the withdrawal stands.",
      changes: "Whether acceptance is current again.",
    };
  } else if (Object.values(stages).some((stage) => stage.coverage === "capped")) {
    nextMeasurement = {
      measure: "An uncapped eligible denominator for the same population and window.",
      changes: "Whether a rate can be stated. The observed count stays a count.",
    };
  } else if (deliveryObserved && acceptanceMissing && (stages.valid_delivery.observed || parsed.some((event) => event.signal === "triaged_result" || event.body?.deliveryClass))) {
    nextMeasurement = {
      measure: "A caller acceptance that cites the same task, operation, or stored event as the delivery export.",
      changes: "Whether the delivered work is accepted. Capture and schema validity do not decide it.",
    };
  } else if (signup && !paymentJoined) {
    nextMeasurement = {
      measure: "A payment_succeeded event, or an explicit no-order read, that cites the same attempt or stored event as the signup.",
      changes: "Whether settlement joins the signup. A nearby timestamp, account id, or machine call does not.",
    };
  } else if (unattached.length > 0) {
    nextMeasurement = {
      measure: "The task, operation, or stored-event ref this settlement belongs to.",
      changes: "Whether the settlement attaches. It is not recognized income either way.",
    };
  } else if (relevantRecurrence.length > 0) {
    nextMeasurement = {
      measure: `Read the same task at or after ${relevantRecurrence[0].nextDueAt}.`,
      changes: "Later recurrence only. The current acceptance does not become a failure before it is due.",
    };
  } else if (visible.length === 0 && renewedScopes.length === 0) {
    nextMeasurement = {
      measure: "One source-separated discovery, signup, task, delivery, or payment export with explicit task, operation, or stored-event refs and a stated coverage.",
      changes: "Which stage is observed. Provider observations are optional.",
    };
  } else {
    nextMeasurement = {
      measure: "The eligible denominator for the stages this export does not cover.",
      changes: "Whether the observed counts can be read against a population.",
    };
  }

  const observedStages = STAGES.filter((stage) => stages[stage].observed);
  const result = {
    schema: RESULT_SCHEMA,
    package: "funnel-decision-projection",
    version: PACKAGE_VERSION,
    asOf,
    hostedAcquisitionVerified: false,
    paymentAuthority: "none",
    recognizedIncomeAtomic: null,
    independentCustomers: null,
    stages: STAGES.map((stage) => stages[stage]),
    missingJoins: [
      ...(signup && !paymentJoined ? ["signup_payment"] : []),
      ...(unattached.length > 0 ? ["unattached_settlement"] : []),
      ...(acceptanceMissing && deliveryObserved ? ["caller_acceptance"] : []),
      ...(identityIgnored ? ["account_and_machine_call"] : []),
    ],
    missingDenominators: STAGES.filter((stage) => stages[stage].eligibleDenominator == null),
    conflicts,
    unattached,
    lateJoins,
    duplicates: collapsed.duplicates,
    equalContentDistinct,
    excludedSynthetic,
    legacyUnknown,
    declaredIndependentIgnored,
    recurrence: { state: recurrenceState, failed: false, byScope },
    costs: {
      includedPool: costs.includedPool,
      incrementalCash: costs.incrementalCash,
      modeledReplacement: costs.modeledReplacement,
      activeAttention: costs.activeAttention,
      additive: false,
      total: null,
      coercion: costs.coercion,
      doubleCounted: costs.doubleCounted,
    },
    passthrough,
    decision: { kind: decision, reasons },
    nextMeasurement,
    measuredNow: observedStages,
    requiresFutureInstrumentation: [
      "Account signup and machine-call identity stay unjoined without a shared task, operation, or stored event.",
      "Observatory metrics stay an external plane and are not this funnel's demand.",
      "Recognized income stays unobserved until a future explicit recognition record exists.",
      "Unique visitors are not counted.",
      "Live private account joins and buyer backfill stay unmeasured.",
    ],
    engines: {
      cohortArchive: "task-cohort-consumer@0.1.0",
      cohortArchiveMutable: false,
      cohortEngineExecuted: false,
      economicsPackage: "task-economics-delivery@0.1.1",
      intakeCalled: false,
      distributionExecuted: false,
      hostedAcquisitionVerified: false,
      libraryProbe: "not_run",
    },
    limits: [
      "Counts and eligible denominators are separate. A missing or capped denominator is not zero and is not a rate.",
      "A rate needs one source-qualified population and the same closed from/to/asOf window. Reversed, future, and unbound windows stay unknown.",
      "Retries and corrections resolve inside the same source, or through a shared authoritative event id. Equal local ids from different sources stay separate.",
      "Equal content with a different stored event stays distinct. The same stored event with a conflicting binding or amount is a conflict.",
      "Time, email, IP, wallet, account id, and declared source are not joins.",
      "Settlement, capture, and schema validity are not caller acceptance or recognized income.",
      "Recurrence and acceptance follow the joined task or operation. A not-yet-due row does not fail that task or another task.",
      "This package does not spend, price, authorize, or publish.",
    ],
  };
  const rendered = JSON.stringify(result);
  if (/"uid"|"aid"|user_secret_value|bearer /i.test(rendered)) throw coded("identity_in_result");
  result.resultId = digest(result);
  return result;
}

export function renderDecision(result) {
  const lines = [
    "Funnel decision",
    `as of ${result.asOf}`,
    `decision: ${result.decision.kind}`,
    `reasons: ${result.decision.reasons.join(", ")}`,
    "",
    "Stages",
  ];
  for (const stage of result.stages) {
    const count = stage.count == null ? "count missing" : `count ${stage.count}`;
    const denominator = stage.eligibleDenominator == null ? "eligible denominator missing" : `eligible denominator ${stage.eligibleDenominator}`;
    const rate = stage.rate ? `rate ${stage.rate.numerator}/${stage.rate.denominator}` : "no rate";
    lines.push(`${stage.stage}: ${stage.observed ? "observed" : "not observed"}, ${count}, ${denominator}, ${rate}`);
  }
  lines.push(
    "",
    "Missing joins",
    result.missingJoins.length ? result.missingJoins.join(", ") : "none named",
    "",
    `Recurrence: ${result.recurrence.state}`,
    "",
    "Next measurement",
    result.nextMeasurement.measure,
    `This changes: ${result.nextMeasurement.changes}`,
    "",
    "Measured now",
    result.measuredNow.length ? result.measuredNow.join(", ") : "no stage is observed",
    "",
    "Still needs serving instrumentation",
    ...result.requiresFutureInstrumentation.map((line) => `- ${line}`),
    "",
    "Limits",
    ...result.limits.map((line) => `- ${line}`),
    "",
  );
  return `${lines.join("\n")}\n`;
}
