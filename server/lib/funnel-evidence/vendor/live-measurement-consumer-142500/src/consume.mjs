import { projectFunnel } from "../../funnel-decision-projection-141100/src/project.mjs";
import {
  ENTRY_URL,
  PAYMENT_URL,
  captureEin,
  captureEntry,
  capturePayment,
  captureQualified,
  coded,
  parseClosedJson,
  privateValue,
  readBounded,
  stripPrivate,
} from "./capture.mjs";

export const INPUT_SCHEMA = "neomorphic.live-measurement-input.v1";
export const READOUT_SCHEMA = "neomorphic.live-measurement-readout.v1";
export const PACKAGE_VERSION = "0.1.0";

const KNOWN_ADAPTERS = new Set([
  "ein-journey-events",
  "ein-conversion-report",
  "samedaydesk-evidence",
  "cohort-result",
  "economics-cost",
]);

function latestStamp(values) {
  const stamps = values.filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value)));
  if (stamps.length === 0) return null;
  return stamps.sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1);
}

function assertClean(value) {
  const rendered = JSON.stringify(value);
  if (/"uid"|"aid"|"email"|user_secret_value|sk_live|bearer\s/i.test(rendered)) throw coded("identity_in_result");
  return value;
}

function projectionSources(groups) {
  const sources = [];
  for (const group of groups) {
    if (!group || !KNOWN_ADAPTERS.has(group.adapter)) continue;
    if (!group.records || group.records.length === 0) continue;
    if (typeof group.sourceId !== "string" || typeof group.version !== "string") continue;
    sources.push({
      adapter: group.adapter,
      sourceId: group.sourceId,
      version: group.version,
      capture: group.capture || { coverage: "partial" },
      records: group.records,
    });
  }
  return sources;
}

function normalizeDocument(input) {
  if (!input || typeof input !== "object") return { payment: null, ein: null, entry: null, groups: [] };
  if (input.schema === "pilot.payment-delivery-receiving.v1" || input.paymentEvidence) {
    return { payment: input, ein: null, entry: null, groups: Array.isArray(input.qualified) ? input.qualified : [] };
  }
  if (input.window && input.events && input.project) {
    return { payment: null, ein: input, entry: null, groups: [] };
  }
  if (input.schema === "samedaydesk.original-task-correspondence.v1") {
    return { payment: null, ein: null, entry: input, groups: [] };
  }
  return {
    payment: input.payment ?? null,
    ein: input.ein ?? null,
    entry: input.entry ?? null,
    groups: Array.isArray(input.qualified) ? input.qualified : [],
  };
}

export function chooseNextAction(readout) {
  const comparison = readout.comparison;
  if (comparison?.payment?.windowInterpretation === "window_mismatch" || comparison?.ein?.interpretation === "window_mismatch") {
    return {
      action: "Keep the two windows apart. A mismatched window is not growth or churn. Read one source-qualified population inside one closed window before comparing counts.",
      changes: "Whether a later pair is the same population.",
    };
  }
  if (comparison?.payment?.cumulativeInterpretation === "restatement") {
    return {
      action: "Keep the lower reconciled total beside the earlier one as a restatement. Do not book the difference as revenue.",
      changes: "The ledger total only. Recognized income stays unknown without its own ledger record.",
    };
  }
  if (readout.payment?.status === "source_failure" || readout.payment?.status === "timeout" || readout.payment?.status === "oversize") {
    return {
      action: "Retry one bounded public payment read, or reuse the saved closed capture. Leave the missing plane unknown.",
      changes: "Whether the cumulative ledger and the requested window can be read. Unknown is not zero.",
    };
  }
  if (readout.payment?.status === "observed" && readout.payment.requestedWindow?.complete !== true) {
    const einNote = readout.ein?.status === "observed"
      ? " EIN's closed window still has no signup or payment row."
      : "";
    return {
      action: `Read payment events inside the requested window, or an explicit empty read for that same window, with source-qualified stored event ids.${einNote}`,
      changes: "Whether any settlement in the requested window is observed, and whether it joins a signup. The cumulative ledger does not become recognized income or a customer count.",
    };
  }
  if ((readout.projection?.excludedSynthetic || 0) > 0 && readout.payment?.status !== "observed") {
    return {
      action: "Leave the owner-QA receipt out of the live decision. A current acceptance needs a non-QA receipt that cites the same task as a request or delivery.",
      changes: "Whether caller acceptance is current for a real task.",
    };
  }
  if (readout.ein?.status === "observed" && readout.ein.signupRows == null && readout.ein.paymentRows == null) {
    return {
      action: "Wait for an actual intake, signup, or payment event with a stored id. Method refusals in this window are not failed deliveries.",
      changes: "Whether a later window contains a signup or payment row. The current histogram stays an aggregate.",
    };
  }
  if (readout.entry?.status === "observed" && readout.entry.inboundUse == null) {
    return {
      action: "Treat the task-entry descriptor as availability metadata only. Do not count it as a request, registration, or payment.",
      changes: "Nothing about inbound use until a correspondence receipt exists.",
    };
  }
  return {
    action: readout.projection?.nextMeasurement?.measure || "Supply one source-separated export with explicit refs and stated coverage.",
    changes: readout.projection?.nextMeasurement?.changes || "Which stage is observed.",
  };
}

function subtractCount(newer, older) {
  if (!Number.isSafeInteger(newer) || !Number.isSafeInteger(older)) return null;
  return newer - older;
}

export function comparePlanes(older, newer) {
  const payment = comparePayment(older.payment, newer.payment);
  const ein = compareEin(older.ein, newer.ein);
  return {
    payment,
    ein,
    recognizedIncomeAtomic: null,
    independentCustomers: null,
    notGrowth: true,
    notChurn: true,
    summedAcrossWindows: false,
  };
}

function comparePayment(older, newer) {
  const base = {
    compatible: false,
    cumulativeInterpretation: "unknown",
    windowInterpretation: "unknown",
    retentionInterpretation: "unknown",
    reconciledDelta: null,
    amountDelta: null,
    retainedActorDelta: null,
    currency: null,
    currencies: [older?.currency, newer?.currency].filter((value, index, list) => value && list.indexOf(value) === index),
    olderCumulative: older?.cumulative?.reconciledSettlements ?? null,
    newerCumulative: newer?.cumulative?.reconciledSettlements ?? null,
    olderAmountAtomic: older?.cumulative?.amountAtomic ?? null,
    newerAmountAtomic: newer?.cumulative?.amountAtomic ?? null,
    customers: null,
    recognizedIncomeAtomic: null,
  };
  if (older?.status !== "observed" || newer?.status !== "observed") return base;
  const sameBaseline = older.cumulative?.baseline && older.cumulative.baseline === newer.cumulative?.baseline;
  const olderWindow = `${older.requestedWindow?.start || ""}|${older.requestedWindow?.end || ""}`;
  const newerWindow = `${newer.requestedWindow?.start || ""}|${newer.requestedWindow?.end || ""}`;
  const windowsKnown = Boolean(older.requestedWindow?.start && newer.requestedWindow?.start);
  const sameWindow = windowsKnown && olderWindow === newerWindow;
  base.compatible = Boolean(sameBaseline);
  if (!sameBaseline) {
    base.cumulativeInterpretation = "baseline_mismatch";
    base.windowInterpretation = windowsKnown && !sameWindow ? "window_mismatch" : "unknown";
    return base;
  }
  const delta = subtractCount(newer.cumulative.reconciledSettlements, older.cumulative.reconciledSettlements);
  base.reconciledDelta = delta;
  if (delta == null) base.cumulativeInterpretation = "unknown";
  else if (delta < 0) base.cumulativeInterpretation = "restatement";
  else if (delta > 0) base.cumulativeInterpretation = "ledger_change";
  else base.cumulativeInterpretation = "unchanged";
  const sameCurrency = older.currency && older.currency === newer.currency;
  base.currency = sameCurrency ? older.currency : null;
  base.currencies = [older.currency, newer.currency].filter((value, index, list) => value && list.indexOf(value) === index);
  if (!sameCurrency) base.amountDelta = null;
  else if (older.cumulative.amountAtomic && newer.cumulative.amountAtomic) {
    base.amountDelta = (BigInt(newer.cumulative.amountAtomic) - BigInt(older.cumulative.amountAtomic)).toString();
  }
  if (windowsKnown && !sameWindow) base.windowInterpretation = "window_mismatch";
  else if (!windowsKnown || older.requestedWindow?.complete !== true || newer.requestedWindow?.complete !== true) base.windowInterpretation = "window_unknown";
  else base.windowInterpretation = "same_window";
  const actorDelta = subtractCount(newer.eventPlane?.retainedPaidSuccessActors, older.eventPlane?.retainedPaidSuccessActors);
  base.retainedActorDelta = actorDelta;
  if (actorDelta == null) base.retentionInterpretation = "unknown";
  else if (actorDelta < 0) base.retentionInterpretation = "retention_shrink";
  else if (actorDelta > 0) base.retentionInterpretation = "retention_increase";
  else base.retentionInterpretation = "unchanged";
  return base;
}

function compareEin(older, newer) {
  const base = {
    compatible: false,
    interpretation: "unknown",
    boundedDelta: null,
    olderBoundedCount: older?.boundedCount ?? null,
    newerBoundedCount: newer?.boundedCount ?? null,
    rate: null,
    methodRefusalIsNotFailedDelivery: true,
  };
  if (older?.status !== "observed" || newer?.status !== "observed") return base;
  const left = `${older.window?.startInclusive || ""}|${older.window?.endExclusive || ""}`;
  const right = `${newer.window?.startInclusive || ""}|${newer.window?.endExclusive || ""}`;
  if (!older.window?.startInclusive || left !== right) {
    base.interpretation = "window_mismatch";
    return base;
  }
  if (older.capped || newer.capped || older.populationMatches !== true || newer.populationMatches !== true) {
    base.compatible = false;
    base.interpretation = "coverage_not_comparable";
    return base;
  }
  base.compatible = true;
  base.boundedDelta = subtractCount(newer.boundedCount, older.boundedCount);
  base.interpretation = base.boundedDelta === 0 ? "unchanged" : "same_window_count_change";
  return base;
}

export function consume(input, options = {}) {
  const stripped = { stripped: 0 };
  const cleaned = stripPrivate(input, stripped);
  const normalized = normalizeDocument(cleaned);
  const groups = normalized.groups.map((group) => captureQualified(group, stripped)).filter(Boolean);
  const ownerQaRecords = groups.reduce((sum, group) => sum + group.records.filter((record) => record.ownerQa === true || record.owner_qa === true || record.synthetic === true).length, 0);
  const payment = normalized.payment ? capturePayment(normalized.payment) : { kind: "payment-aggregate", status: "absent", rowsMaterialized: 0 };
  const ein = normalized.ein ? captureEin(normalized.ein) : { kind: "ein-window", status: "absent", rowsMaterialized: 0 };
  const entry = normalized.entry ? captureEntry(normalized.entry) : { kind: "task-entry-descriptor", status: "absent", inboundUse: null, registration: null };
  const observationTime = latestStamp([
    payment.sourceGeneratedAt,
    payment.captureObservedAt,
    ein.observedAt,
    ein.readTime,
  ]);
  const renderedAt = options.now || observationTime;
  if (typeof renderedAt !== "string" || !Number.isFinite(Date.parse(renderedAt))) throw coded("bad_timestamp");
  const requestAsOf = latestStamp([
    observationTime,
    renderedAt,
    ...groups.map((group) => group.capture?.asOf),
  ]) || renderedAt;
  let projection;
  try {
    projection = projectFunnel({
      schema: "neomorphic.funnel-decision-request.v1",
      asOf: requestAsOf,
      sources: projectionSources(groups),
    });
  } catch (error) {
    throw coded(error.code || "projection_failed");
  }
  const readout = {
    schema: READOUT_SCHEMA,
    package: "live-measurement-consumer",
    version: PACKAGE_VERSION,
    observationTime,
    renderedAt,
    privateFieldsStripped: stripped.stripped > 0,
    ownerQaRecords,
    payment,
    ein,
    entry,
    projection: {
      schema: projection.schema,
      version: projection.version,
      decision: projection.decision,
      nextMeasurement: projection.nextMeasurement,
      measuredNow: projection.measuredNow,
      missingJoins: projection.missingJoins,
      stages: projection.stages,
      excludedSynthetic: projection.excludedSynthetic,
      recognizedIncomeAtomic: projection.recognizedIncomeAtomic,
      independentCustomers: projection.independentCustomers,
      hostedAcquisitionVerified: projection.hostedAcquisitionVerified,
      cohortEngineExecuted: projection.engines.cohortEngineExecuted,
      libraryProbe: projection.engines.libraryProbe,
      conflicts: projection.conflicts,
    },
    rowsMaterialized: 0,
    recognizedIncomeAtomic: null,
    independentCustomers: null,
    hostedAcquisitionVerified: false,
    cohortEngineExecuted: false,
  };
  readout.nextAction = chooseNextAction(readout);
  return assertClean(readout);
}

export function compareMeasurements(older, newer, options = {}) {
  const left = consume(older, options);
  const right = consume(newer, options);
  const comparison = comparePlanes(left, right);
  const combined = { ...right, comparison };
  return assertClean({
    schema: "neomorphic.live-measurement-comparison.v1",
    package: "live-measurement-consumer",
    version: PACKAGE_VERSION,
    renderedAt: right.renderedAt,
    older: left,
    newer: right,
    comparison,
    nextAction: chooseNextAction(combined),
    recognizedIncomeAtomic: null,
    independentCustomers: null,
  });
}

export async function readPublicOnce(options = {}) {
  const paymentUrl = options.paymentUrl || PAYMENT_URL;
  const entryUrl = options.entryUrl || ENTRY_URL;
  const paymentRead = await readBounded(paymentUrl, options);
  const entryRead = await readBounded(entryUrl, options);
  const payment = paymentRead.ok ? parseClosedJson(paymentRead.text) : { ok: false, code: paymentRead.code };
  const entry = entryRead.ok ? parseClosedJson(entryRead.text) : { ok: false, code: entryRead.code };
  const input = {
    schema: INPUT_SCHEMA,
    payment: payment.ok ? payment.doc : { status: payment.code === "timeout" || payment.code === "oversize" ? payment.code : "source_failure", code: payment.code },
    entry: entry.ok ? entry.doc : { status: entry.code === "timeout" || entry.code === "oversize" ? entry.code : "source_failure", code: entry.code },
    ein: options.ein || null,
    qualified: options.qualified || [],
  };
  const readout = consume(input, options);
  readout.fetch = {
    payment: { url: paymentUrl, ok: paymentRead.ok, code: paymentRead.ok ? "ok" : paymentRead.code },
    entry: { url: entryUrl, ok: entryRead.ok, code: entryRead.ok ? "ok" : entryRead.code },
    polling: false,
  };
  return assertClean(readout);
}

export function renderReadout(result) {
  const payment = result.payment || result.newer?.payment;
  const ein = result.ein || result.newer?.ein;
  const decision = result.projection?.decision || result.newer?.projection?.decision;
  const lines = [
    "Live measurement",
    `observation: ${result.observationTime || result.newer?.observationTime || "unknown"}`,
    `rendered: ${result.renderedAt}`,
    `decision: ${decision?.kind || "unknown"}`,
    `reasons: ${(decision?.reasons || []).join(", ") || "none"}`,
    "",
    payment?.status === "observed"
      ? `Payment cumulative reconciled ${payment.cumulative.reconciledSettlements}, amount atomic ${payment.cumulative.amountAtomic}, currency ${payment.cumulative.currency || "unknown"}, baseline ${payment.cumulative.baseline}`
      : `Payment ${payment?.status || "absent"}`,
    payment?.status === "observed"
      ? `Requested window coverage ${payment.requestedWindow.coverage || "unknown"}, complete ${payment.requestedWindow.complete}, paid actors ${payment.eventPlane.requestedWindowPaidSuccessActors}`
      : "Requested window unknown",
    ein?.status === "observed"
      ? `EIN window ${ein.boundedCount} events, page_viewed ${ein.events.page_viewed}, agent_call ${ein.events.agent_call}, rows 0`
      : `EIN ${ein?.status || "absent"}`,
    "Recognized income unknown",
    "Customers unknown",
    "",
    "Next action",
    result.nextAction.action,
    `This changes: ${result.nextAction.changes}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export { privateValue };
