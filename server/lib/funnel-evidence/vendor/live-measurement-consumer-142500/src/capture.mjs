import { isCheckedPair, matchesCheckedCatalogClaim, matchesCheckedUnit } from "./settlement-unit-map.mjs";

const PRIVATE_KEY = /^(uid|user_id|userid|aid|email|e-mail|ip|ip_address|wallet|wallet_address|authorization|authorisation|bearer|token|access_token|password|secret|document_id|documentid|subject_id|subjectid|cookie|session|session_id|credential|credentiallocator)$/i;
const PRIVATE_VALUE = /user_secret_value|sk_live|bearer\s|eyJ[A-Za-z0-9_-]{10,}/i;
const EMAIL_VALUE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const PAYMENT_URL = "https://agents.samedaydesk.com/v0/commerce-demand.json?days=1";
export const ENTRY_URL = "https://samedaydesk.com/discovery/original-task-correspondence.json";
export const DEFAULT_MAX_BYTES = 262144;
export const DEFAULT_TIMEOUT_MS = 15000;

export function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function privateValue(value) {
  return typeof value === "string" && (PRIVATE_VALUE.test(value) || EMAIL_VALUE.test(value));
}

export function stripPrivate(value, state = { stripped: 0 }) {
  if (Array.isArray(value)) return value.map((item) => stripPrivate(item, state));
  if (!value || typeof value !== "object") {
    if (privateValue(value)) {
      state.stripped += 1;
      return null;
    }
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key) || privateValue(key)) {
      state.stripped += 1;
      continue;
    }
    out[key] = stripPrivate(item, state);
  }
  return out;
}

function shortToken(value, max = 80) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  if (privateValue(trimmed) || /[@\s]/.test(trimmed)) return null;
  return trimmed;
}

function stampOrNull(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function countOrNull(value) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

function atomicOrNull(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^[0-9]{1,24}$/.test(value)) return undefined;
  return value;
}

function boolOrNull(value) {
  if (value === true || value === false) return value;
  return null;
}

const UNIT_SCHEMA = "samedaydesk.commerce-settlement-unit.v1";
const SUMMARY_SCHEMA = "samedaydesk.commerce-settlement-summary.v1";
const UNIT_DECISIONS = new Set([
  "qualified",
  "missing",
  "partial",
  "conflicting",
  "rejected",
  "unmapped",
  "empty",
  "stale_cut",
  "unreadable",
  "absent",
]);
const OPEN_UNIT_DECISIONS = new Set(["missing", "partial", "conflicting", "rejected", "empty"]);
const FORBIDDEN_UNIT_KEY = /^(settlementreference|payer|treasury|sourceeventid|reconciliationid|paymentactor|wallet|email|uid|token|authorization|payto)$/i;
const TX_HASH = /0x[0-9a-fA-F]{64}/;
const UNIT_NETWORK = /^eip155:[1-9][0-9]{0,9}$/;
const UNIT_ASSET = /^0x[0-9a-fA-F]{40}$/;
const UNIT_SYMBOL = /^[A-Z0-9]{2,12}$/;

export function absentUnit(decision = "absent") {
  return {
    decision,
    comparable: false,
    network: null,
    asset: null,
    symbol: null,
    decimals: null,
    atomicScale: null,
    sourceCutSha256: null,
    recognizedIncomeAtomic: null,
  };
}

function forbiddenUnit(value) {
  try {
    const rendered = JSON.stringify(value);
    if (TX_HASH.test(rendered) || privateValue(rendered)) return true;
  } catch {
    return true;
  }
  const stack = [value];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const [key, item] of Object.entries(current)) {
      if (FORBIDDEN_UNIT_KEY.test(key)) return true;
      if (item && typeof item === "object") stack.push(item);
    }
  }
  return false;
}

function cutHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function interpretSettlementUnit(doc, plane) {
  if (!doc || typeof doc !== "object") return absentUnit();
  const top = Object.hasOwn(doc, "settlementUnit") ? doc.settlementUnit : undefined;
  const nested = doc.settlementReconciliation && typeof doc.settlementReconciliation === "object"
    ? doc.settlementReconciliation.settlementUnit
    : undefined;
  if (top == null && nested == null) return absentUnit();
  if (top != null && nested != null && JSON.stringify(top) !== JSON.stringify(nested)) return absentUnit("rejected");
  const raw = top ?? nested;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || forbiddenUnit(raw)) return absentUnit("rejected");
  if (raw.schemaVersion !== UNIT_SCHEMA || !UNIT_DECISIONS.has(raw.decision)) return absentUnit("rejected");
  if (raw.recognizedIncomeAtomic !== null || raw.customerAttribution !== null) return absentUnit("rejected");
  if (raw.decision === "absent") return absentUnit();
  if (raw.decision === "stale_cut" || raw.decision === "unreadable") return absentUnit(raw.decision);
  const binding = raw.bindsToParent;
  const bound = Boolean(
    binding
    && binding.summarySchema === SUMMARY_SCHEMA
    && binding.matchesSuppliedSummary === true
    && binding.amountAtomic === plane.amountAtomic
    && binding.reconciledSettlements === plane.reconciledSettlements
    && typeof binding.admissionCutId === "string"
    && /^[0-9a-f]{64}$/.test(binding.admissionCutId),
  );
  if (!bound) return absentUnit("stale_cut");
  if (raw.comparable !== (raw.decision === "qualified")) return absentUnit("rejected");
  if (raw.decision === "qualified") {
    const unit = raw.unit;
    if (!unit || typeof unit !== "object") return absentUnit("rejected");
    if (typeof unit.network !== "string" || !UNIT_NETWORK.test(unit.network)) return absentUnit("rejected");
    if (typeof unit.asset !== "string" || !UNIT_ASSET.test(unit.asset)) return absentUnit("rejected");
    if (typeof unit.symbol !== "string" || !UNIT_SYMBOL.test(unit.symbol)) return absentUnit("rejected");
    if (!Number.isInteger(unit.decimals) || unit.decimals < 0 || unit.decimals > 36) return absentUnit("rejected");
    let scale;
    try {
      scale = (10n ** BigInt(unit.decimals)).toString();
    } catch {
      return absentUnit("rejected");
    }
    if (raw.atomicScale !== scale || !cutHash(raw.sourceCutSha256)) return absentUnit("rejected");
    if (!matchesCheckedCatalogClaim(raw.catalog) || !matchesCheckedUnit(unit)) return absentUnit("rejected");
    return {
      decision: "qualified",
      comparable: true,
      network: unit.network,
      asset: unit.asset,
      symbol: unit.symbol,
      decimals: unit.decimals,
      atomicScale: scale,
      sourceCutSha256: cutHash(raw.sourceCutSha256),
      recognizedIncomeAtomic: null,
    };
  }
  if (raw.decision === "unmapped") {
    const unit = raw.unit;
    if (!unit || raw.unit.symbol !== null || raw.unit.decimals !== null || raw.atomicScale !== null) return absentUnit("rejected");
    if (typeof unit.network !== "string" || !UNIT_NETWORK.test(unit.network)) return absentUnit("rejected");
    if (typeof unit.asset !== "string" || !UNIT_ASSET.test(unit.asset)) return absentUnit("rejected");
    if (isCheckedPair(unit)) return absentUnit("rejected");
    if (raw.catalog != null && !(raw.catalog.usableEntries === 0 || matchesCheckedCatalogClaim(raw.catalog))) return absentUnit("rejected");
    return {
      decision: "unmapped",
      comparable: false,
      network: unit.network,
      asset: unit.asset.toLowerCase(),
      symbol: null,
      decimals: null,
      atomicScale: null,
      sourceCutSha256: cutHash(raw.sourceCutSha256),
      recognizedIncomeAtomic: null,
    };
  }
  if (!OPEN_UNIT_DECISIONS.has(raw.decision) || raw.unit !== null || raw.atomicScale !== null) return absentUnit("rejected");
  return {
    ...absentUnit(raw.decision),
    sourceCutSha256: cutHash(raw.sourceCutSha256),
  };
}

function sumAtomic(rows) {
  try {
    let total = 0n;
    for (const row of rows) {
      if (typeof row?.amountAtomic !== "string") return null;
      total += BigInt(row.amountAtomic);
    }
    return total.toString();
  } catch {
    return null;
  }
}

function copyBreakdown(map) {
  if (map == null) return { rows: null, invalid: false };
  if (!map || typeof map !== "object" || Array.isArray(map)) return { rows: null, invalid: true };
  const rows = {};
  for (const [key, row] of Object.entries(map)) {
    if (!/^[A-Za-z0-9_./:-]{1,80}$/.test(key) || privateValue(key)) return { rows: null, invalid: true };
    const settlements = countOrNull(row?.settlements);
    const amountAtomic = atomicOrNull(row?.amountAtomic);
    if (settlements === undefined || amountAtomic === undefined) return { rows: null, invalid: true };
    rows[key] = { settlements, amountAtomic };
  }
  return { rows, invalid: false };
}

function planeBoundaries(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    retainedEventZeroNeverMeansHistoricalZeroWhenCoverageIncomplete: input.retainedEventZeroNeverMeansHistoricalZeroWhenCoverageIncomplete === true,
    settlementNeverBecomesCustomer: input.settlementNeverBecomesCustomer === true,
    paymentKeyNeverBecomesCustomer: input.paymentKeyNeverBecomesCustomer === true,
    settlementNeverProvesBuyerValidDelivery: input.settlementNeverProvesBuyerValidDelivery === true,
    customerAttributionRequiresSeparateEvidence: input.customerAttributionRequiresSeparateEvidence === true,
  };
}

export function capturePayment(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { kind: "payment-aggregate", status: "unreadable", rowsMaterialized: 0 };
  }
  if (doc.kind === "payment-aggregate" && doc.schema === "samedaydesk.commerce-payment-evidence-readout.v1") return doc;
  if (doc.status === "source_failure" || doc.status === "timeout" || doc.status === "oversize") {
    return {
      kind: "payment-aggregate",
      status: doc.status === "source_failure" ? "source_failure" : doc.status,
      code: shortToken(doc.code, 40) || doc.status,
      rowsMaterialized: 0,
      cumulative: null,
      requestedWindow: null,
      customers: null,
      recognizedIncomeAtomic: null,
    };
  }
  const evidence = doc.paymentEvidence;
  if (!evidence || evidence.schemaVersion !== "samedaydesk.commerce-payment-evidence-readout.v1") {
    return { kind: "payment-aggregate", status: "unreadable", rowsMaterialized: 0 };
  }
  const settlement = evidence.settlementPlane || {};
  const byClass = copyBreakdown(settlement.byClass);
  const byRoute = copyBreakdown(settlement.byRoute);
  const amountAtomic = atomicOrNull(settlement.amountAtomic);
  const reconciled = countOrNull(settlement.reconciledSettlements);
  const currency = typeof settlement.currency === "string" && /^[A-Z]{3,8}$/.test(settlement.currency) ? settlement.currency : null;
  const invalid = amountAtomic === undefined || reconciled === undefined || byClass.invalid || byRoute.invalid;
  const classSum = byClass.rows ? sumAtomic(Object.values(byClass.rows)) : null;
  const routeSum = byRoute.rows ? sumAtomic(Object.values(byRoute.rows)) : null;
  const unit = invalid
    ? ((doc.settlementUnit || doc.settlementReconciliation?.settlementUnit) ? absentUnit("rejected") : absentUnit())
    : interpretSettlementUnit(doc, {
      amountAtomic: amountAtomic ?? null,
      reconciledSettlements: reconciled ?? null,
    });
  const rare = doc.durableRareFunnel;
  const rareOk = rare && rare.schemaVersion === "samedaydesk.commerce-rare-funnel-evidence.v1";
  const tail = doc.coverage?.prospectiveTail;
  return {
    kind: "payment-aggregate",
    status: invalid ? "invalid_aggregate" : "observed",
    schema: evidence.schemaVersion,
    relationship: shortToken(evidence.relationship, 80),
    sourceGeneratedAt: stampOrNull(doc.generatedAt),
    captureObservedAt: stampOrNull(doc.observedAt),
    httpStatus: doc.status === 200 ? 200 : null,
    integrityStatus: shortToken(doc.integrityStatus, 64),
    retainedParseableEventCount: countOrNull(doc.retainedParseableEventCount) ?? null,
    retainedParseableEventCountIsNotADenominator: true,
    requestedWindow: {
      days: countOrNull(doc.requestedWindowDays) ?? null,
      start: stampOrNull(doc.requestedWindowStart),
      end: stampOrNull(doc.requestedWindowEnd),
      complete: boolOrNull(doc.requestedWindowComplete),
      coverage: shortToken(doc.requestedWindowCoverage, 80),
    },
    eventPlane: {
      coverage: shortToken(evidence.eventPlane?.coverage, 80),
      retainedPaidSuccessActors: countOrNull(evidence.eventPlane?.retainedPaidSuccessActors) ?? null,
      retainedRepeatPaidSuccessActors: countOrNull(evidence.eventPlane?.retainedRepeatPaidSuccessActors) ?? null,
      requestedWindowPaidSuccessActors: countOrNull(evidence.eventPlane?.requestedWindowPaidSuccessActors) ?? null,
      requestedWindowRepeatPaidSuccessActors: countOrNull(evidence.eventPlane?.requestedWindowRepeatPaidSuccessActors) ?? null,
    },
    cumulative: {
      population: "ledger_since_baseline",
      enabled: settlement.enabled === true,
      baseline: stampOrNull(settlement.baseline),
      coverage: shortToken(settlement.coverage, 40),
      reconciledSettlements: reconciled ?? null,
      amountAtomic: amountAtomic ?? null,
      currency,
      byClass: byClass.rows,
      byRoute: byRoute.rows,
      classTotalsMatch: Boolean(classSum && amountAtomic && classSum === amountAtomic),
      routeTotalsMatch: Boolean(routeSum && amountAtomic && routeSum === amountAtomic),
      unit,
    },
    rareFunnel: rareOk ? {
      schema: rare.schemaVersion,
      paidSuccessEvents: countOrNull(rare.paidSuccessEvents) ?? null,
      paidSuccessActors: countOrNull(rare.paidSuccessActors) ?? null,
      independentUsefulDemand: shortToken(rare.independentUsefulDemand, 40),
      requestedWindowComplete: boolOrNull(rare.coverage?.requestedWindowComplete),
      requestedWindowCoverage: shortToken(rare.coverage?.requestedWindowCoverage, 80),
      retainedObservationStartsBeforeRequestedWindow: rare.coverage?.retainedObservationStartsBeforeRequestedWindow === true,
      captureContinuityProven: rare.coverage?.captureContinuityProven === true,
      integrityStatus: shortToken(rare.coverage?.integrityStatus, 40),
      retainedParseableRecordCount: countOrNull(rare.coverage?.retainedParseableRecordCount) ?? null,
      doesNotClassifyRevenue: rare.boundaries?.doesNotClassifyRevenue === true,
      actorCountsAreNotOperatorCounts: rare.boundaries?.actorCountsAreNotOperatorCounts === true,
      notAddedToSettlementLedger: true,
    } : null,
    sourceBoundaries: tail && typeof tail === "object" ? {
      windowReachIsNotUniqueCustomers: tail.windowReachIsNotUniqueCustomers === true,
      windowReachIsNotConversionDenominator: tail.windowReachIsNotConversionDenominator === true,
      discardedHistoryStaysLost: tail.discardedHistoryStaysLost === true,
      historicalBackfill: tail.historicalBackfill === true,
    } : null,
    customers: {
      attributableCustomerCount: countOrNull(evidence.customerPlane?.attributableCustomerCount) ?? null,
      buyerValidDeliveryCount: countOrNull(evidence.customerPlane?.buyerValidDeliveryCount) ?? null,
      repeatIndependentCustomerCount: countOrNull(evidence.customerPlane?.repeatIndependentCustomerCount) ?? null,
    },
    boundaries: planeBoundaries(evidence.boundaries),
    independentPaidSuccessActors: countOrNull(doc.independentPaidSuccessActors) ?? null,
    independentActorsAreNotCustomers: true,
    rowsMaterialized: 0,
    recognizedIncomeAtomic: null,
    currency,
    unit,
  };
}

function classifyCalls(calls) {
  if (!Array.isArray(calls)) return { status: "unknown", accepted: null, methodRefusal: null, badRpc: null, toolRefusal: null, other: null };
  const totals = { accepted: 0, methodRefusal: 0, badRpc: 0, toolRefusal: 0, other: 0 };
  for (const row of calls) {
    const count = countOrNull(row?.count);
    if (count == null) return { status: "invalid", accepted: null, methodRefusal: null, badRpc: null, toolRefusal: null, other: null };
    const status = row.http_status;
    const tool = row.tool;
    if (status === 405) totals.methodRefusal += count;
    else if (tool === "get_application_status" && (status === 400 || status === 401)) totals.toolRefusal += count;
    else if (status === 400) totals.badRpc += count;
    else if (status === 200 && row.outcome === "ok") totals.accepted += count;
    else totals.other += count;
  }
  return { status: "observed", ...totals, methodRefusalIsNotFailedDelivery: true };
}

export function captureEin(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { kind: "ein-window", status: "unreadable", rowsMaterialized: 0 };
  }
  if (doc.kind === "ein-window" && doc.window && doc.status) return doc;
  if (doc.status === "source_failure" || doc.status === "timeout" || doc.status === "oversize") {
    return {
      kind: "ein-window",
      status: doc.status === "source_failure" ? "source_failure" : doc.status,
      code: shortToken(doc.code, 40) || doc.status,
      rowsMaterialized: 0,
      boundedCount: null,
      recognizedIncomeAtomic: null,
    };
  }
  if (!doc.window || !doc.events || typeof doc.events !== "object") {
    return { kind: "ein-window", status: "unreadable", rowsMaterialized: 0 };
  }
  const boundedCount = countOrNull(doc.boundedCount);
  const projectedCount = countOrNull(doc.projectedCount);
  const pageViewed = countOrNull(doc.events.page_viewed);
  const agentCall = countOrNull(doc.events.agent_call);
  const invalid = [boundedCount, projectedCount, pageViewed, agentCall].some((value) => value === undefined);
  const composition = classifyCalls(doc.calls);
  const knownEvents = (pageViewed ?? 0) + (agentCall ?? 0);
  return {
    kind: "ein-window",
    status: invalid || composition.status === "invalid" ? "invalid_aggregate" : "observed",
    observedAt: stampOrNull(doc.observedAt),
    readTime: stampOrNull(doc.readTime),
    window: {
      startInclusive: stampOrNull(doc.window.startInclusive),
      endExclusive: stampOrNull(doc.window.endExclusive),
    },
    boundedCount: boundedCount ?? null,
    projectedCount: projectedCount ?? null,
    bounds: {
      count: countOrNull(doc.bounds?.count) ?? null,
      projection: countOrNull(doc.bounds?.projection) ?? null,
    },
    capped: doc.capped === true,
    populationMatches: doc.populationMatches === true,
    populationIsNotAConversionDenominator: true,
    events: {
      page_viewed: pageViewed ?? null,
      agent_call: agentCall ?? null,
    },
    histogramMatchesBoundedCount: !invalid && knownEvents === boundedCount,
    composition,
    unknownCallStatus: countOrNull(doc.unknownCallStatus) ?? null,
    noCallCoverage: Array.isArray(doc.noCallCoverage)
      ? doc.noCallCoverage.filter((item) => shortToken(item, 80)).map((item) => shortToken(item, 80))
      : [],
    noCallCoverageIsNotZero: true,
    ownership: shortToken(doc.ownership, 40),
    release: "unknown",
    credentialExported: doc.credentialExported === true,
    credentialsCopied: false,
    subjectOrderDraftReads: doc.subjectOrderDraftReads === true,
    rowsMaterialized: 0,
    signupRows: null,
    paymentRows: null,
    recognizedIncomeAtomic: null,
  };
}

export function captureEntry(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { kind: "task-entry-descriptor", status: "unreadable", inboundUse: null, registration: null };
  }
  if (doc.kind === "task-entry-descriptor" && doc.schema === "samedaydesk.original-task-correspondence.v1" && doc.status) return doc;
  if (doc.status === "source_failure" || doc.status === "timeout" || doc.status === "oversize") {
    return {
      kind: "task-entry-descriptor",
      status: doc.status === "source_failure" ? "source_failure" : doc.status,
      code: shortToken(doc.code, 40) || doc.status,
      availability: null,
      inboundUse: null,
      registration: null,
    };
  }
  if (doc.schema !== "samedaydesk.original-task-correspondence.v1") {
    return { kind: "task-entry-descriptor", status: "unreadable", inboundUse: null, registration: null };
  }
  return {
    kind: "task-entry-descriptor",
    status: "observed",
    schema: doc.schema,
    performsNoRequest: doc.thisDescriptorPerformsNoRequest === true,
    acceptance: doc.acceptance === true,
    payment: doc.payment === true,
    fundedJob: doc.fundedJob === true,
    deliveryPromise: doc.deliveryPromise === true,
    defaultDisposition: shortToken(doc.defaultDisposition, 40),
    acquisitionKind: shortToken(doc.acquisition?.kind, 40),
    checkoutIsNotAcquisition: doc.acquisition?.checkoutIsNotAcquisition === true,
    residentPoller: doc.operator?.residentPoller === true,
    onDemand: doc.operator?.onDemand === true,
    universalCapability: doc.taskAction?.universalCapability === true,
    availability: "not_read",
    inboundUse: null,
    registration: null,
    demand: null,
  };
}

export function captureQualified(group, stripped) {
  if (!group || typeof group !== "object") return null;
  const records = Array.isArray(group.records) ? group.records : [];
  const clean = [];
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const copy = stripPrivate(record, stripped);
    if (JSON.stringify(copy).match(PRIVATE_VALUE)) continue;
    clean.push(copy);
  }
  return {
    adapter: group.adapter,
    sourceId: group.sourceId,
    version: group.version,
    capture: group.capture || null,
    records: clean,
    provenance: group.provenance === "owner_qa" || group.ownerQa === true ? "owner_qa" : "supplied",
  };
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // The owned body is already closed or was never readable.
  }
}

export async function readBounded(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!response || response.status !== 200) {
      if (response) await cancelBody(response);
      return { ok: false, code: "source_failure", status: response?.status ?? null, url };
    }
    const reader = response.body?.getReader?.();
    if (!reader) {
      const text = await response.text();
      if (Buffer.byteLength(text) > maxBytes) return { ok: false, code: "oversize", url };
      return { ok: true, url, text };
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, code: "oversize", url };
      }
      chunks.push(Buffer.from(step.value));
    }
    return { ok: true, url, text: Buffer.concat(chunks).toString("utf8") };
  } catch (error) {
    const name = error?.name || "";
    if (name === "AbortError" || name === "TimeoutError") return { ok: false, code: "timeout", url };
    return { ok: false, code: "source_failure", url };
  } finally {
    clearTimeout(timer);
  }
}

export function parseClosedJson(text) {
  try {
    return { ok: true, doc: JSON.parse(text) };
  } catch {
    return { ok: false, code: "unreadable" };
  }
}
