import { CATALOG_SCHEMA, CURRENCY, DECIMAL_AMOUNT, FEATURE, RESULT_SCHEMA, TASK_REF, TASK_SCHEMA } from "./constants.mjs";
import { canonical, compareDecimal, decimalZero, sha256 } from "./canonical.mjs";
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
    outputClaim: support.claim || (support.ok ? "demonstrated_guarantee" : "refused"),
  };
}

function selectionReason(entry) {
  const direct = entry.direct ? "direct" : "catalog";
  if (entry.price.state === "known_free") return `known_free_${direct}`;
  if (entry.price.state === "known") return `known_price_${direct}`;
  if (entry.price.state === "undenominated") return `undenominated_${direct}`;
  return `cost_unknown_${direct}`;
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
    outputClaim: row.outputClaim,
    untrustedText: row.untrustedText,
  };
}

function priceClass(price) {
  if (price?.state === "known_free") return "free";
  if (
    price?.state === "known"
    && typeof price.currency === "string"
    && CURRENCY.test(price.currency)
    && typeof price.amount === "string"
    && DECIMAL_AMOUNT.test(price.amount)
    && !decimalZero(price.amount)
  ) return "priced";
  return "open";
}

function compareNonPrice(left, right) {
  const keys = [
    [left.entry.direct === true ? 0 : 1, right.entry.direct === true ? 0 : 1],
    [left.entry.authority === "caller" && left.entry.direct === true ? 0 : 1, right.entry.authority === "caller" && right.entry.direct === true ? 0 : 1],
    [left.entry.id, right.entry.id],
  ];
  for (const [a, b] of keys) {
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function sameRouteStrength(left, right) {
  return (left.entry.direct === true) === (right.entry.direct === true)
    && (left.entry.authority === "caller" && left.entry.direct === true) === (right.entry.authority === "caller" && right.entry.direct === true);
}

function trace(rows) {
  return [...rows].sort((left, right) => left.entry.id.localeCompare(right.entry.id));
}

function chosen(best, extra) {
  return {
    state: "selected",
    reason: best.reason,
    entryId: best.entry.id,
    operationId: best.entry.operationId,
    sourceRef: best.entry.sourceRef,
    authority: best.entry.authority,
    tied: extra.tied,
    tieBreak: extra.tieBreak,
    owned: best.entry.owned === true,
    direct: best.entry.direct === true,
    cost: view(best).cost,
    route: best.route,
    nextAction: best.nextAction,
    preferenceIgnored: ["owned"],
    economicComparison: extra.economicComparison,
    impliedCheapest: false,
    alsoEligible: extra.alsoEligible,
    outputClaim: best.outputClaim,
    currency: extra.currency || best.entry.price.currency || null,
  };
}

function relationFor(row, mode) {
  if (mode === "free") return priceClass(row.entry.price) === "free" ? "same_known_free_class" : "dominated_by_known_free";
  return "higher_exact_decimal";
}

function selectEligible(eligible) {
  if (eligible.length === 0) {
    return {
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
      economicComparison: null,
      impliedCheapest: false,
      alsoEligible: [],
    };
  }
  const free = eligible.filter((row) => priceClass(row.entry.price) === "free");
  if (free.length > 0) {
    const ordered = [...free].sort(compareNonPrice);
    const best = ordered[0];
    const tied = free.filter((row) => sameRouteStrength(row, best));
    return chosen(best, {
      tied: tied.map((row) => row.entry.id).sort(),
      tieBreak: tied.length > 1 ? "caller_direct_then_entry_id" : null,
      economicComparison: "known_free",
      alsoEligible: trace(eligible.filter((row) => row.entry.id !== best.entry.id)).map((row) => ({
        id: row.entry.id,
        operationId: row.entry.operationId,
        cost: view(row).cost,
        relation: relationFor(row, "free"),
      })),
    });
  }
  const priced = eligible.filter((row) => priceClass(row.entry.price) === "priced");
  const open = eligible.filter((row) => priceClass(row.entry.price) === "open");
  const currencies = new Set(priced.map((row) => row.entry.price.currency));
  if (open.length === 0 && priced.length === eligible.length && currencies.size === 1) {
    const ordered = [...priced].sort((left, right) => {
      const amount = compareDecimal(left.entry.price.amount, right.entry.price.amount);
      if (amount !== 0) return amount;
      return compareNonPrice(left, right);
    });
    const best = ordered[0];
    const tied = priced.filter((row) => compareDecimal(row.entry.price.amount, best.entry.price.amount) === 0 && sameRouteStrength(row, best));
    return chosen(best, {
      tied: tied.map((row) => row.entry.id).sort(),
      tieBreak: tied.length > 1 ? "caller_direct_then_entry_id" : null,
      economicComparison: priced.length === 1 ? "sole_priced" : "exact_decimal",
      currency: best.entry.price.currency,
      alsoEligible: trace(priced.filter((row) => row.entry.id !== best.entry.id)).map((row) => ({
        id: row.entry.id,
        operationId: row.entry.operationId,
        cost: view(row).cost,
        relation: "higher_exact_decimal",
      })),
    });
  }
  if (eligible.length === 1) {
    return chosen(eligible[0], {
      tied: [eligible[0].entry.id],
      tieBreak: null,
      economicComparison: "sole_eligible",
      alsoEligible: [],
    });
  }
  return {
    state: "unranked",
    reason: "economic_rank_unresolved",
    entryId: null,
    operationId: null,
    sourceRef: null,
    tied: [],
    tieBreak: null,
    alternatives: trace(eligible).map(view),
    alternativeOrder: "entry_id_trace",
    economicComparison: "unresolved",
    impliedCheapest: false,
    owned: null,
    direct: null,
    cost: null,
    route: null,
    nextAction: null,
    preferenceIgnored: ["owned"],
    alsoEligible: [],
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
  const eligible = judged.filter((row) => row.eligible);
  const ineligible = judged.filter((row) => !row.eligible);
  const selected = selectEligible(eligible);
  return shell({
    occurredAt,
    source,
    query: {
      state: "accepted",
      errors: [],
      taskRef: task.taskRef,
      meaningId: task.requiredOutput.meaningId,
      meaningIdRole: "task_label",
      semanticEquivalence: false,
      outputSpec: "allowed_output_set",
      digest: sha256(canonical(task)),
    },
    render: {
      state: "rendered",
      eligible: trace(eligible).map(view),
      ineligible: trace(ineligible).map(view),
    },
    selected,
  });
}
