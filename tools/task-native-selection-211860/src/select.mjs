import { CATALOG_SCHEMA, FEATURE, RESULT_SCHEMA, TASK_REF, TASK_SCHEMA } from "./constants.mjs";
import { canonical, sha256 } from "./canonical.mjs";
import { normalizeCallerEntry } from "./catalog.mjs";
import { supportsOutput } from "./schema-support.mjs";

function shell({ occurredAt, source, query, render, selected }) {
  return {
    schema: RESULT_SCHEMA,
    feature: FEATURE,
    occurredAt,
    source,
    stages: {
      query,
      render,
      selected,
      executed: { state: "not_executed", synthetic: false, autonomousExternalUse: false },
      usefulAcceptance: { state: "not_observed", accepted: false, independentCustomer: false },
    },
  };
}

export function parseTask(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["task_required"] };
  if (input.schema !== TASK_SCHEMA) errors.push("schema");
  if (typeof input.q === "string") errors.push("undifferentiated_query");
  if (typeof input.taskRef !== "string" || !TASK_REF.test(input.taskRef)) errors.push("taskRef");
  if (typeof input.requiredOutput?.meaningId !== "string" || input.requiredOutput.meaningId.length === 0) errors.push("meaningId");
  if (!Array.isArray(input.requiredOutput?.paths) || input.requiredOutput.paths.length === 0) errors.push("requiredOutput.paths");
  return { ok: errors.length === 0, errors };
}

function freshIndex(freshCatalog) {
  const map = new Map();
  for (const entry of freshCatalog?.entries || []) map.set(entry.id, entry);
  return map;
}

function priceBlocked(entry) {
  return entry.price.state === "conflict" || entry.price.state === "invalid";
}

export function judgeEntry(entry, task, fresh) {
  const reasons = [];
  if (entry.error) reasons.push(entry.error);
  if (fresh && entry.authority !== "caller") {
    const current = fresh.get(entry.id);
    if (!current) reasons.push("stale_source");
    else if (current.outputSchemaSha256 !== entry.outputSchemaSha256) reasons.push("source_changed");
  }
  const asOf = task.applicability?.asOf;
  if (entry.expiresAt && asOf && Date.parse(entry.expiresAt) < Date.parse(asOf)) reasons.push("expired");
  if (task.applicability?.freshness === "required" && entry.expiryState !== "known") reasons.push("expiry_unknown");
  if (priceBlocked(entry)) reasons.push("price_authority_conflict");
  if (task.applicability?.pricedExecution === "forbidden" && entry.price.charged !== false) reasons.push("priced_or_unknown");
  const support = supportsOutput(entry.outputSchema, task.requiredOutput);
  if (!support.ok) reasons.push(support.reason);
  const available = task.applicability?.availableInputs;
  if (Array.isArray(available)) {
    for (const name of entry.requiredInputs || []) {
      if (!available.includes(name)) reasons.push(`input_unavailable:${name}`);
    }
  }
  const eligible = reasons.length === 0;
  return {
    eligible,
    reasons,
    reason: eligible ? selectionReason(entry) : reasons[0],
    entry,
    sourceRef: entry.sourceRef,
    untrustedText: { summary: entry.summaryUntrusted || "", usedForSelection: false },
    cost: entry.price,
    route: {
      method: entry.method,
      path: entry.path,
      origin: entry.origin,
      scopes: entry.requiredInputs || [],
      subjectRoute: entry.subjectRoute || null,
    },
    nextAction: entry.nextAction,
    outputSupported: support.ok,
  };
}

function selectionReason(entry) {
  const direct = entry.direct ? "direct" : "catalog";
  if (entry.price.state === "known_free") return `known_free_${direct}`;
  if (entry.price.state === "known") return `known_price_${direct}`;
  return `cost_unknown_${direct}`;
}

function strength(row) {
  const price = row.entry.price;
  const freeRank = price.state === "known_free" ? 0 : price.state === "known" ? 1 : 2;
  const directRank = row.entry.direct === true ? 0 : 1;
  const amount = price.state === "known" ? Number(price.amount) : Number.POSITIVE_INFINITY;
  const caller = row.entry.authority === "caller" && row.entry.direct === true ? 0 : 1;
  return [freeRank, directRank, amount, caller, row.entry.id];
}

function compareStrength(left, right) {
  const a = strength(left);
  const b = strength(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

function sameStrength(left, right) {
  const a = strength(left);
  const b = strength(right);
  return a.slice(0, 4).every((value, index) => value === b[index]);
}

function view(row) {
  return {
    id: row.entry.id,
    operationId: row.entry.operationId,
    eligible: row.eligible,
    reason: row.reason,
    reasons: row.reasons,
    sourceRef: row.sourceRef,
    authority: row.entry.authority,
    owned: row.entry.owned === true,
    direct: row.entry.direct === true,
    cost: {
      state: row.entry.price.state,
      amount: row.entry.price.amount,
      currency: row.entry.price.currency,
      charged: row.entry.price.charged,
      atomicComparison: row.entry.price.atomic?.comparison || null,
      conflict: row.entry.price.conflict,
    },
    route: row.route,
    nextAction: row.nextAction,
    outputSupported: row.outputSupported,
    untrustedText: row.untrustedText,
  };
}

export function selectTask({ catalog, task, freshCatalog = null, now }) {
  const occurredAt = now || new Date().toISOString();
  const source = {
    catalogSchema: catalog?.schema || null,
    acquiredAt: catalog?.acquiredAt || null,
    coverage: catalog?.coverage || null,
  };
  if (!catalog || catalog.schema !== CATALOG_SCHEMA || !Array.isArray(catalog.entries)) {
    return shell({
      occurredAt,
      source,
      query: { state: "rejected", errors: ["catalog_schema"], taskRef: task?.taskRef || null, digest: null },
      render: { state: "not_rendered", eligible: [], ineligible: [] },
      selected: { state: "not_selected", reason: "catalog_schema", entryId: null },
    });
  }
  const parsed = parseTask(task);
  if (!parsed.ok) {
    return shell({
      occurredAt,
      source,
      query: { state: "rejected", errors: parsed.errors, taskRef: task?.taskRef || null, digest: null },
      render: { state: "not_rendered", eligible: [], ineligible: [] },
      selected: { state: "not_selected", reason: "query_rejected", entryId: null },
    });
  }
  const entries = catalog.entries.map((entry) => ({ ...entry }));
  if (task.directAlternative) {
    const caller = normalizeCallerEntry(task.directAlternative);
    entries.push(caller.entry || { id: "caller:rejected", error: caller.error, price: { state: "unknown", charged: null, atomic: null, conflict: null }, requiredInputs: [], outputSchema: null, outputSchemaSha256: null, summaryUntrusted: "", nextAction: null, authority: "caller", owned: false, direct: false, operationId: null, sourceRef: null, method: null, path: null, origin: null });
  }
  const fresh = freshCatalog ? freshIndex(freshCatalog) : null;
  const judged = entries.map((entry) => judgeEntry(entry, task, fresh));
  const eligible = judged.filter((row) => row.eligible).sort(compareStrength);
  const ineligible = judged.filter((row) => !row.eligible);
  let selected;
  if (eligible.length === 0) {
    selected = {
      state: "no_fit",
      reason: "no_eligible_output",
      entryId: null,
      operationId: null,
      sourceRef: null,
      tied: [],
      tieBreak: null,
      owned: null,
      direct: null,
      cost: null,
      route: null,
      nextAction: null,
    };
  } else {
    const best = eligible[0];
    const tied = eligible.filter((row) => sameStrength(row, best));
    selected = {
      state: "selected",
      reason: best.reason,
      entryId: best.entry.id,
      operationId: best.entry.operationId,
      sourceRef: best.entry.sourceRef,
      authority: best.entry.authority,
      tied: tied.map((row) => row.entry.id),
      tieBreak: tied.length > 1 ? "caller_direct_then_entry_id" : null,
      owned: best.entry.owned === true,
      direct: best.entry.direct === true,
      cost: view(best).cost,
      route: best.route,
      nextAction: best.nextAction,
      preferenceIgnored: ["owned"],
    };
  }
  return shell({
    occurredAt,
    source,
    query: {
      state: "accepted",
      errors: [],
      taskRef: task.taskRef,
      meaningId: task.requiredOutput.meaningId,
      digest: sha256(canonical(task)),
    },
    render: {
      state: "rendered",
      eligible: eligible.map(view),
      ineligible: ineligible.map(view),
    },
    selected,
  });
}
