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
