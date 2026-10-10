/**
 * Bounded convergence document for one GET.
 * The original capture and a newly fetched page cut stay separate.
 * A metadata total is not a rank. Unavailable is not zero.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyFetchAvailability, classifyProviderTimestamp, judgeMetric } from "./contract.js";
import { classifyUnit, measuredLabel } from "./measurement.js";
import { createBoundedFetcher } from "./bounded-fetch.js";
import { listSourceIds } from "./registry.js";
import {
  CONVERGENCE_SCHEMA,
  DISCOVERY,
  OWNED_RESOURCES,
  discoveryPageUrl,
  historicalPin,
  splitBridgeEnrollment,
} from "./convergence-enrollment.js";

export function integerLabel(value, unit = "count") {
  const judged = measuredLabel(value, unit);
  return judged.state === "measured" ? judged.value : null;
}

function counterUnit(name) {
  if (name === DISCOVERY.callCounter) return "provider_call_label";
  if (name === DISCOVERY.payerCounter) return "provider_payer_label";
  return "provider_label";
}

function counterLabel(name, state, value) {
  const unit = counterUnit(name);
  return { name, state, value, unit, unitClass: classifyUnit(unit).unitClass };
}

function readCounter(raw, name) {
  if (raw == null) return counterLabel(name, "unavailable", null);
  if (typeof raw === "object") {
    if (Array.isArray(raw)) return counterLabel(name, "invalid", null);
    if (raw.state === "measured") {
      const value = integerLabel(raw.value, counterUnit(name));
      return value == null
        ? counterLabel(name, "invalid", null)
        : counterLabel(name, "measured", value);
    }
    if (raw.state === "missing" || raw.state === "unavailable") {
      return counterLabel(name, raw.state, null);
    }
    return counterLabel(name, "invalid", null);
  }
  const value = integerLabel(raw, counterUnit(name));
  return value == null
    ? counterLabel(name, "invalid", null)
    : counterLabel(name, "measured", value);
}

function readAccept(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return {
    entries: list.filter((entry) => entry && typeof entry === "object").map((entry) => ({
      scheme: typeof entry.scheme === "string" ? entry.scheme : null,
      network: typeof entry.network === "string" ? entry.network : null,
      asset: typeof entry.asset === "string" ? entry.asset : null,
      amountAtomic: integerLabel(entry.amountAtomic ?? entry.amount, "atomic"),
      unit: "atomic",
      unitClass: "atomic",
      income: null,
      payToOmitted: entry.payTo != null,
      convertedToCurrency: false,
    })),
    income: null,
    convertedToCurrency: false,
  };
}

function clockFor(sourceTime, requestTime) {
  if (typeof sourceTime !== "string" || sourceTime === "") {
    return { sourceTime: null, state: "source_unknown", providerTimestampState: "missing" };
  }
  const picked = classifyProviderTimestamp(sourceTime, requestTime, Date.parse(requestTime));
  if (picked.state === "invalid") {
    const parsed = Date.parse(sourceTime);
    const reference = Date.parse(requestTime);
    if (Number.isFinite(parsed) && Number.isFinite(reference) && parsed - reference > 120000) {
      return { sourceTime: picked.timestamp, state: "future", providerTimestampState: "invalid" };
    }
    return { sourceTime: picked.timestamp, state: "source_unknown", providerTimestampState: "invalid" };
  }
  if (picked.state === "stale") {
    return { sourceTime: picked.timestamp, state: "stale", providerTimestampState: "stale" };
  }
  if (picked.state === "ok") {
    return { sourceTime: picked.timestamp, state: "current", providerTimestampState: "ok" };
  }
  return { sourceTime: null, state: "source_unknown", providerTimestampState: "missing" };
}

function rowsFromNormalized(resources) {
  if (!Array.isArray(resources)) return { rows: [], invalid: true };
  const rows = [];
  for (const resource of resources) {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) continue;
    if (typeof resource.resource !== "string") continue;
    const counters = resource.counters && typeof resource.counters === "object" ? resource.counters : {};
    rows.push({
      resource: resource.resource,
      clusterKey: typeof resource.clusterKey === "string" && resource.clusterKey ? resource.clusterKey : resource.resource,
      call: readCounter(counters[DISCOVERY.callCounter], DISCOVERY.callCounter),
      payer: readCounter(counters[DISCOVERY.payerCounter], DISCOVERY.payerCounter),
      sourceTime: typeof resource.lastUpdated === "string" ? resource.lastUpdated : null,
      listedAccept: readAccept(resource.listedAccept && resource.listedAccept.entries),
    });
  }
  return { rows, invalid: false };
}

function rowsFromProviderItems(items) {
  if (!Array.isArray(items)) return [];
  const rows = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (typeof item.resource !== "string") continue;
    const quality = item.quality && typeof item.quality === "object" && !Array.isArray(item.quality)
      ? item.quality
      : null;
    rows.push({
      resource: item.resource,
      clusterKey: item.resource,
      call: readCounter(quality ? quality[DISCOVERY.callCounter] : undefined, DISCOVERY.callCounter),
      payer: readCounter(quality ? quality[DISCOVERY.payerCounter] : undefined, DISCOVERY.payerCounter),
      sourceTime: typeof item.lastUpdated === "string" ? item.lastUpdated : null,
      listedAccept: readAccept(item.accepts),
    });
  }
  return rows;
}

function dedupe(rows) {
  const byUrl = new Map();
  const contradictory = new Set();
  const duplicates = [];
  for (const row of rows) {
    if (contradictory.has(row.resource)) continue;
    const prior = byUrl.get(row.resource);
    if (!prior) {
      byUrl.set(row.resource, row);
      continue;
    }
    const signature = (entry) => JSON.stringify([
      entry.call, entry.payer, entry.sourceTime, entry.listedAccept,
    ]);
    if (signature(prior) !== signature(row)) {
      contradictory.add(row.resource);
      byUrl.delete(row.resource);
    } else {
      duplicates.push(row.resource);
    }
  }
  return {
    rows: [...byUrl.values()],
    contradictory: [...contradictory],
    duplicates: [...new Set(duplicates)],
  };
}

function rankRows(rows, requestTime) {
  const cleaned = dedupe(rows);
  const groups = new Map();
  for (const row of cleaned.rows) {
    const key = row.clusterKey || row.resource;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const ranked = [];
  const unranked = [];
  for (const [clusterKey, members] of groups) {
    const measured = members.filter((row) => row.call.state === "measured");
    const clocks = members.map((row) => ({
      resource: row.resource,
      ...clockFor(row.sourceTime, requestTime),
    }));
    if (measured.length === 0) {
      unranked.push({
        clusterKey,
        resources: members.map((row) => row.resource),
        callLabels: members.map((row) => row.call),
        clocks,
        reason: "call_label_not_measured",
      });
      continue;
    }
    const top = measured.reduce((best, row) => (BigInt(row.call.value) > BigInt(best.call.value) ? row : best));
    ranked.push({
      clusterKey,
      resources: members.map((row) => row.resource),
      callLabel: top.call,
      payerLabels: members.map((row) => ({ resource: row.resource, ...row.payer })),
      listedAccepts: members.map((row) => ({
        resource: row.resource,
        entries: row.listedAccept.entries,
        income: null,
        convertedToCurrency: false,
      })),
      clocks,
      callsSummed: false,
      payersSummed: false,
      callsReducedBy: members.length > 1 ? "max_not_sum" : "single_resource",
      responseOrderUsed: false,
      catalogRank: false,
    });
  }
  ranked.sort((left, right) => {
    const delta = BigInt(right.callLabel.value) - BigInt(left.callLabel.value);
    if (delta !== 0n) return delta > 0n ? 1 : -1;
    return left.clusterKey < right.clusterKey ? -1 : left.clusterKey > right.clusterKey ? 1 : 0;
  });
  let lastValue = null;
  let lastRank = 0;
  ranked.forEach((row, index) => {
    if (row.callLabel.value !== lastValue) {
      lastRank = index + 1;
      lastValue = row.callLabel.value;
    }
    row.rank = lastRank;
    row.tie = ranked.filter((item) => item.callLabel.value === row.callLabel.value).length > 1;
  });
  const clockStates = cleaned.rows.map((row) => clockFor(row.sourceTime, requestTime).state);
  const distinct = [...new Set(clockStates)];
  return {
    ...cleaned,
    ranked,
    unranked,
    clock: {
      mixed: distinct.length > 1,
      states: distinct,
      futureCount: clockStates.filter((state) => state === "future").length,
      staleCount: clockStates.filter((state) => state === "stale").length,
      unknownCount: clockStates.filter((state) => state === "source_unknown").length,
      currentCount: clockStates.filter((state) => state === "current").length,
    },
  };
}

function ownRows(rows, contradictory, ownedResources, requestTime) {
  const conflicts = new Set(contradictory);
  return (ownedResources || []).map((entry) => {
    const resource = entry && typeof entry.resource === "string" ? entry.resource : null;
    const base = {
      resource,
      offeringId: entry?.offeringId ?? null,
      notInFetchedPagesIsCatalogAbsence: false,
      ownedSettlements: { state: "unknown", value: null, source: "not_in_this_observation" },
      declaredUsefulness: { state: "unknown", value: null, source: "not_in_this_observation" },
      outsideAcceptance: { state: "unknown", value: null, source: "not_in_this_observation" },
      walletInference: false,
      labelToMoney: false,
      nextAction: nextAction(entry),
    };
    if (resource && conflicts.has(resource)) {
      return {
        ...base,
        listing: "contradictory_duplicate",
        callLabel: { name: DISCOVERY.callCounter, state: "invalid", value: null, unit: "provider_call_label", unitClass: "count" },
        payerLabel: { name: DISCOVERY.payerCounter, state: "invalid", value: null, unit: "provider_payer_label", unitClass: "count" },
        listedAccept: null,
        clock: { state: "source_unknown", sourceTime: null },
      };
    }
    const row = resource ? rows.find((item) => item.resource === resource) : null;
    if (!row) {
      return {
        ...base,
        listing: "not_in_fetched_pages",
        callLabel: { name: DISCOVERY.callCounter, state: "unavailable", value: null, unit: "provider_call_label", unitClass: "count" },
        payerLabel: { name: DISCOVERY.payerCounter, state: "unavailable", value: null, unit: "provider_payer_label", unitClass: "count" },
        listedAccept: null,
        clock: { state: "source_unknown", sourceTime: null },
      };
    }
    return {
      ...base,
      listing: "listed_in_fetched_pages",
      callLabel: row.call,
      payerLabel: row.payer,
      listedAccept: row.listedAccept,
      clock: clockFor(row.sourceTime, requestTime),
    };
  });
}

function nextAction(entry) {
  const task = entry && entry.compatibleTask;
  if (!task || task.compatible !== true || task.method !== "GET" || entry.method !== "GET") return null;
  if (typeof task.path !== "string" || typeof task.input !== "string" || typeof task.output !== "string") return null;
  return {
    path: task.path,
    method: "GET",
    input: task.input,
    output: task.output,
    trafficReferral: false,
  };
}

function resolvePin(pinOverride) {
  if (pinOverride && typeof pinOverride.sha256 === "string" && /^[0-9a-f]{64}$/.test(pinOverride.sha256)) {
    return { sha256: pinOverride.sha256, required: false };
  }
  return historicalPin();
}

export function readOriginalCapture(filePath, pinOverride) {
  const pin = resolvePin(pinOverride);
  if (!filePath) {
    return {
      state: "unavailable",
      reason: "original_capture_absent",
      sha256: null,
      expectedSha256: pin ? pin.sha256 : null,
      document: null,
      measuredZero: false,
    };
  }
  if (!pin) {
    return {
      state: "error",
      reason: "historical_pin_unavailable",
      sha256: null,
      expectedSha256: null,
      document: null,
      measuredZero: false,
    };
  }
  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch {
    return {
      state: "unavailable",
      reason: "original_capture_unreadable",
      sha256: null,
      expectedSha256: pin.sha256,
      document: null,
      measuredZero: false,
    };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== pin.sha256) {
    return {
      state: "error",
      reason: "original_capture_hash_mismatch",
      sha256,
      expectedSha256: pin.sha256,
      document: null,
      measuredZero: false,
    };
  }
  try {
    return {
      state: "ok",
      reason: null,
      sha256,
      expectedSha256: pin.sha256,
      document: JSON.parse(bytes.toString("utf8")),
      measuredZero: false,
    };
  } catch {
    return {
      state: "error",
      reason: "original_capture_invalid_json",
      sha256,
      expectedSha256: pin.sha256,
      document: null,
      measuredZero: false,
    };
  }
}

function originalWindow(loaded, requestTime, ownedResources) {
  const pin = {
    sha256: loaded.expectedSha256,
    observedSha256: loaded.sha256,
    required: false,
  };
  if (loaded.state !== "ok") {
    return {
      sourceId: DISCOVERY.sourceId,
      availability: loaded.state === "error" ? "error" : "unavailable",
      reason: loaded.reason,
      measuredZero: false,
      pin,
      sourceTime: null,
      collectionTime: null,
      coverage: {
        advertisedTotal: null,
        advertisedTotalState: "absent",
        observedListingCount: null,
        marketWide: false,
      },
      convergence: null,
      ownRow: ownRows([], [], ownedResources, requestTime),
      rowsEmitted: false,
    };
  }
  const source = loaded.document?.sources?.cdp;
  const parsed = rowsFromNormalized(source?.resources);
  const ranked = parsed.invalid ? null : rankRows(parsed.rows, requestTime);
  const sourceTime = typeof source?.freshness?.newestLastUpdated === "string"
    ? source.freshness.newestLastUpdated
    : null;
  const collectionTime = typeof loaded.document?.observedAt === "string"
    ? loaded.document.observedAt
    : (typeof source?.freshness?.retrievedAt === "string" ? source.freshness.retrievedAt : null);
  const sourceClock = clockFor(sourceTime, requestTime);
  const collectionClock = collectionTime ? clockFor(sourceTime, collectionTime) : { state: "source_unknown" };
  const futureOnly = Boolean(ranked && ranked.rows.length > 0 && ranked.clock.futureCount === ranked.rows.length);
  const advertised = source?.coverage ? integerLabel(source.coverage.advertisedTotal) : null;
  const advertisedState = source?.coverage && (source.coverage.advertisedTotal == null || source.coverage.advertisedTotal === "")
    ? "absent"
    : advertised == null
      ? (source?.coverage ? "invalid" : "absent")
      : "present";
  const observed = ranked ? String(ranked.rows.length) : null;
  let availability = "partial";
  if (!ranked) availability = "error";
  else if (futureOnly || sourceClock.state === "future") availability = "error";
  else if (ranked.clock.mixed) availability = "partial";
  else if (sourceClock.state === "stale" || ranked.clock.staleCount === ranked.rows.length) availability = "stale";
  return {
    sourceId: DISCOVERY.sourceId,
    provider: "cdp",
    method: "GET",
    availability,
    measuredZero: false,
    reason: null,
    pin,
    sourceTime: sourceClock.sourceTime,
    sourceClock: sourceClock.state,
    collectionTime,
    collectionClock: collectionClock.state,
    pageRetrievedAt: typeof source?.freshness?.retrievedAt === "string" ? source.freshness.retrievedAt : null,
    requestTime,
    refreshedFetchIsNewEvents: false,
    clock: ranked ? {
      mixed: ranked.clock.mixed,
      states: ranked.clock.states,
      futureCount: ranked.clock.futureCount,
      staleCount: ranked.clock.staleCount,
      unknownCount: ranked.clock.unknownCount,
      currentCount: ranked.clock.currentCount,
    } : null,
    window: {
      kind: typeof source?.window?.kind === "string" ? source.window.kind : null,
      counterName: typeof source?.window?.counterName === "string" ? source.window.counterName : null,
      realtime: false,
    },
    coverage: {
      state: typeof source?.coverage?.state === "string" ? source.coverage.state : null,
      advertisedTotal: advertisedState === "present" ? advertised : null,
      advertisedTotalState: advertisedState,
      observedListingCount: observed,
      pagesFetched: Number.isInteger(source?.coverage?.pagesFetched) ? source.coverage.pagesFetched : null,
      marketWide: false,
      comprehensive: false,
      realtime: false,
    },
    convergence: ranked && !futureOnly && ranked.ranked.length ? {
      scope: "fetched_resources_only",
      marketWide: false,
      realtime: false,
      responseOrderUsed: false,
      top: ranked.ranked[0],
      rankCount: ranked.ranked.length,
      rowsEmitted: false,
    } : null,
    ownRow: ranked
      ? ownRows(ranked.rows, ranked.contradictory, ownedResources, requestTime)
      : ownRows([], [], ownedResources, requestTime),
    duplicatePages: ranked ? ranked.duplicates : [],
    contradictoryResources: ranked ? ranked.contradictory : [],
    rowsEmitted: false,
    separatedFromCurrentCut: true,
  };
}

function pageReceipt(capture, requested) {
  const httpStatus = Number.isInteger(capture?.httpStatus) ? capture.httpStatus : null;
  const fetchAvailability = classifyFetchAvailability(capture);
  const base = {
    requested,
    url: capture?.sourceUrl || null,
    httpStatus,
    collectionTime: capture?.fetchedAt || null,
    bytes: Number.isInteger(capture?.bytes) ? capture.bytes : null,
    paidAuthority: false,
    itemsUsedForRank: false,
    observedLimit: null,
    observedOffset: null,
    advertisedTotal: null,
    advertisedTotalState: "unavailable",
  };
  if (httpStatus === 402) {
    return { ...base, ok: false, availability: "unavailable", reason: "upstream_402", quoteAccepted: false };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { ...base, ok: false, availability: "unavailable", reason: `upstream_${httpStatus}` };
  }
  if (fetchAvailability) {
    return {
      ...base,
      ok: false,
      availability: fetchAvailability,
      reason: capture?.error?.code || fetchAvailability,
    };
  }
  const body = capture?.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ...base, ok: false, availability: "error", reason: "invalid_body", advertisedTotalState: "invalid" };
  }
  const pagination = body.pagination && typeof body.pagination === "object" && !Array.isArray(body.pagination)
    ? body.pagination
    : null;
  const total = pagination ? integerLabel(pagination.total) : null;
  const totalState = !pagination || pagination.total == null || pagination.total === ""
    ? "absent"
    : total == null
      ? "invalid"
      : "present";
  return {
    ...base,
    ok: true,
    availability: "ok",
    reason: null,
    observedLimit: pagination ? integerLabel(pagination.limit) : null,
    observedOffset: pagination ? integerLabel(pagination.offset) : null,
    advertisedTotal: totalState === "present" ? total : null,
    advertisedTotalState: totalState,
    items: rowsFromProviderItems(body.items),
  };
}

async function fetchDiscovery(fetcher, { admitItems = true } = {}) {
  const requested = { ...DISCOVERY.firstPage, type: DISCOVERY.type };
  const firstCapture = await fetcher.getCapture(
    "cdp_discovery_page_1",
    discoveryPageUrl(DISCOVERY.firstPage),
  );
  const first = pageReceipt(firstCapture, requested);
  if (!first.ok) return { pages: [publicPage(first)], rows: [], stopped: first.reason, admitItems };
  if (!admitItems) {
    return {
      pages: [publicPage(first, false)],
      rows: [],
      stopped: "metadata_only",
      admitItems: false,
    };
  }
  const observedLimit = first.observedLimit == null ? null : Number(first.observedLimit);
  const observedOffset = first.observedOffset == null ? null : Number(first.observedOffset);
  const nextOffset = Number.isInteger(observedLimit) && Number.isInteger(observedOffset)
    ? observedOffset + observedLimit
    : null;
  const rows = first.items.slice();
  if (nextOffset == null) {
    return { pages: [publicPage(first, true)], rows, stopped: "next_offset_unknown" };
  }
  const secondRequest = { limit: observedLimit, offset: nextOffset, type: DISCOVERY.type };
  const secondCapture = await fetcher.getCapture(
    "cdp_discovery_page_2",
    discoveryPageUrl({ limit: observedLimit, offset: nextOffset }),
  );
  const second = pageReceipt(secondCapture, secondRequest);
  const pages = [publicPage(first, true), publicPage(second, second.ok)];
  if (!second.ok) return { pages, rows, stopped: second.reason, admitItems: true };
  return { pages, rows: rows.concat(second.items), stopped: null, admitItems: true };
}

function publicPage(page, itemsUsedForRank = false) {
  return {
    requested: page.requested,
    url: page.url,
    httpStatus: page.httpStatus,
    collectionTime: page.collectionTime,
    bytes: page.bytes,
    paidAuthority: false,
    quoteAccepted: page.quoteAccepted === false ? false : undefined,
    availability: page.availability,
    reason: page.reason,
    itemsUsedForRank: Boolean(itemsUsedForRank && page.ok),
    observedLimit: page.observedLimit,
    observedOffset: page.observedOffset,
    advertisedTotal: page.advertisedTotal,
    advertisedTotalState: page.advertisedTotalState,
  };
}

function metadataCut(fetched, requestTime, ownedResources) {
  const page = fetched.pages[0] || null;
  const ok = Boolean(page && page.availability === "ok");
  return {
    sourceId: DISCOVERY.sourceId,
    provider: "cdp",
    method: "GET",
    availability: ok ? "partial" : (page ? page.availability : "unavailable"),
    measuredZero: false,
    reason: ok ? "metadata_only" : (fetched.stopped || "metadata_only"),
    separatedFromOriginalWindow: true,
    rowsFromOriginal: false,
    itemsAdmitted: false,
    requestTime,
    refreshedFetchIsNewEvents: false,
    coverage: {
      advertisedTotal: ok ? page.advertisedTotal : null,
      advertisedTotalState: ok ? page.advertisedTotalState : (page ? page.advertisedTotalState : "unavailable"),
      observedListingCount: null,
      marketWide: false,
      realtime: false,
      pagesFetched: 0,
    },
    pages: fetched.pages,
    convergence: null,
    ownRow: ownRows([], [], ownedResources, requestTime).map((row) => ({
      ...row,
      listing: "metadata_only",
    })),
  };
}

function currentCut(fetched, requestTime, ownedResources) {
  if (!fetched) {
    return {
      sourceId: DISCOVERY.sourceId,
      availability: "unavailable",
      reason: "not_requested",
      measuredZero: false,
      separatedFromOriginalWindow: true,
      rowsFromOriginal: false,
      coverage: {
        advertisedTotal: null,
        advertisedTotalState: "not_requested",
        observedListingCount: null,
        marketWide: false,
      },
      pages: [],
      convergence: null,
      ownRow: ownRows([], [], ownedResources, requestTime),
    };
  }
  const ranked = rankRows(fetched.rows, requestTime);
  const totals = fetched.pages.map((page) => page.advertisedTotal).filter((value) => value != null);
  const distinctTotals = [...new Set(totals)];
  const futureOnly = ranked.rows.length > 0 && ranked.clock.futureCount === ranked.rows.length;
  let availability = "partial";
  if (fetched.rows.length === 0) availability = fetched.pages.some((page) => page.availability === "error") ? "error" : "unavailable";
  else if (futureOnly) availability = "error";
  else if (ranked.clock.mixed) availability = "partial";
  else if (ranked.clock.staleCount === ranked.rows.length) availability = "stale";
  return {
    sourceId: DISCOVERY.sourceId,
    provider: "cdp",
    method: "GET",
    availability,
    measuredZero: false,
    reason: fetched.stopped,
    separatedFromOriginalWindow: true,
    rowsFromOriginal: false,
    requestTime,
    refreshedFetchIsNewEvents: false,
    clock: ranked.clock,
    coverage: {
      advertisedTotal: distinctTotals.length === 1 ? distinctTotals[0] : null,
      advertisedTotalState: distinctTotals.length === 0
        ? (fetched.pages.some((page) => page.advertisedTotalState === "invalid") ? "invalid" : "absent")
        : distinctTotals.length === 1 ? "present" : "changed_between_pages",
      advertisedTotals: totals,
      observedListingCount: fetched.pages.some((page) => page.itemsUsedForRank)
        ? String(ranked.rows.length)
        : null,
      truncated: distinctTotals.length === 1 ? BigInt(ranked.rows.length) < BigInt(distinctTotals[0]) : null,
      marketWide: false,
      realtime: false,
      pagesFetched: fetched.pages.filter((page) => page.itemsUsedForRank).length,
    },
    pages: fetched.pages,
    duplicatePages: ranked.duplicates,
    contradictoryResources: ranked.contradictory,
    convergence: futureOnly || ranked.ranked.length === 0 ? null : {
      scope: "pages_fetched_this_request",
      marketWide: false,
      realtime: false,
      responseOrderUsed: false,
      top: ranked.ranked[0],
      rank: ranked.ranked,
    },
    unranked: ranked.unranked,
    ownRow: ownRows(ranked.rows, ranked.contradictory, ownedResources, requestTime),
  };
}

function slimObservation(observation) {
  return {
    sourceId: observation.sourceId,
    sourceKind: observation.sourceKind,
    upstreamUrl: observation.upstreamUrl,
    availability: observation.availability,
    httpStatus: observation.httpStatus,
    fetchedAt: observation.fetchedAt,
    providerTimestamp: observation.providerTimestamp,
    providerTimestampState: observation.providerTimestampState,
    metrics: Array.isArray(observation.metrics) ? observation.metrics.map((metric) => {
      const judged = judgeMetric(metric);
      return {
        key: judged.key,
        state: judged.state,
        value: judged.value,
        unit: judged.unit,
        unitClass: judged.unitClass,
        window: judged.window,
        population: judged.population,
      };
    }) : [],
    measuredZero: false,
  };
}

export async function buildConvergence({
  runtime,
  mode,
  requestTime,
  fetchImpl,
  now,
  timeoutMs,
  maxBytes,
  originalCapturePath,
  capturePin,
  ownedResources = OWNED_RESOURCES,
}) {
  const loaded = readOriginalCapture(originalCapturePath, capturePin);
  const modulePin = historicalPin()?.sha256 || null;
  const bridgeIds = listSourceIds();
  const enrollment = splitBridgeEnrollment(bridgeIds);
  let bridge;
  if (mode === "bridge") {
    const snapshot = await runtime.observeAll();
    bridge = {
      fetched: true,
      schemaVersion: snapshot.schemaVersion,
      fetchedAt: snapshot.fetchedAt,
      additivity: snapshot.additivity,
      observations: snapshot.observations.map(slimObservation),
      enrollment,
    };
  } else {
    bridge = {
      fetched: false,
      reason: mode === "metadata" ? "not_fetched_on_metadata" : "not_fetched_on_refresh",
      observations: enrollment.enrolled.concat(enrollment.presentNotEnrolled).map((sourceId) => ({
        sourceId,
        availability: "unavailable",
        reason: "not_fetched_this_request",
        metrics: null,
        measuredZero: false,
        providerTimestamp: null,
        fetchedAt: null,
      })),
      enrollment,
      existingRoute: "/api/observatory/snapshot",
    };
  }
  let discovery = null;
  if (mode === "refresh" || mode === "metadata") {
    const fetcher = createBoundedFetcher({
      fetchImpl,
      now,
      timeoutMs,
      maxBytes,
      cacheTtlMs: 0,
    });
    discovery = await fetchDiscovery(fetcher, { admitItems: mode === "refresh" });
  }
  const original = originalWindow(loaded, requestTime, ownedResources);
  const current = discovery && discovery.admitItems === false
    ? metadataCut(discovery, requestTime, ownedResources)
    : currentCut(discovery, requestTime, ownedResources);
  const route = mode === "refresh"
    ? "/api/observatory/convergence/refresh"
    : mode === "metadata"
      ? "/api/observatory/convergence/metadata"
      : "/api/observatory/convergence";
  return {
    schemaVersion: CONVERGENCE_SCHEMA,
    transport: "samedaydesk-bridge",
    route,
    requestTime,
    authority: {
      paid: false,
      methods: ["GET", "OPTIONS"],
      postUsed: false,
      quotePostUsed: false,
      purchaseAuthority: false,
    },
    additivity: "not_additive",
    upstreamBudget: {
      discoveryPagesMax: mode === "metadata" ? 1 : DISCOVERY.maxPages,
      discoveryPagesFetched: discovery ? discovery.pages.length : 0,
      bridgeUpstream: mode === "bridge" ? "existing_observatory_adapters" : "not_fetched",
    },
    enrollment: {
      bridge: enrollment,
      discovery: {
        sourceId: DISCOVERY.sourceId,
        method: DISCOVERY.method,
        documentUrl: DISCOVERY.documentUrl,
        operationId: DISCOVERY.operationId,
        firstPage: DISCOVERY.firstPage,
        maxPages: DISCOVERY.maxPages,
      },
      ownedResources: ownedResources.map((entry) => ({
        resource: entry.resource,
        offeringId: entry.offeringId,
      })),
      originalCapture: {
        sha256: modulePin,
        required: false,
        installed: loaded.state === "ok" && loaded.expectedSha256 === modulePin,
      },
    },
    originalWindow: original,
    currentCut: current,
    denominatorDelta: {
      originalAdvertisedTotal: original.coverage.advertisedTotal,
      currentAdvertisedTotal: current.coverage.advertisedTotal,
      changed: original.coverage.advertisedTotalState === "present" && current.coverage.advertisedTotalState === "present"
        ? original.coverage.advertisedTotal !== current.coverage.advertisedTotal
        : null,
      rankRefreshed: false,
      eventDataRefreshed: false,
      rowsMixed: false,
    },
    bridge,
    withheld: [
      "market_wide_traffic",
      "realtime_transactions",
      "label_to_money",
      "wallet_inference",
      "cross_source_total",
      "traffic_referral",
    ],
  };
}
