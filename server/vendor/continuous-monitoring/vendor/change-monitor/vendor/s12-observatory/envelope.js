/**
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 SameDayDesk / Neomorphic LLC
 *
 * Consume a SameDayDesk observatory snapshot / sources registry.
 * Unavailable, partial, and stale are not zero. Sources are not added together.
 * No ranking of incomparable scalars. No total agent economy figure.
 */
import {
  BRIDGE_TRANSPORT,
  METRIC_COPY,
  NAMED_SOURCES,
  SCHEMA_VERSION,
  SOURCE_IDS,
  SOURCE_KIND,
  UNAVAILABLE_SOURCES,
  UPSTREAM_URL,
  namedSource,
} from "./contract.js";

const PROTO = new Set(["__proto__", "prototype", "constructor"]);
const MISSING_STATES = new Set(["missing", "unavailable", "error", "source_error"]);
const SERIES_MAX_POINTS = 14;

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isObservatoryEnvelope(body) {
  if (!isPlainObject(body)) return false;
  if (body.schemaVersion === SCHEMA_VERSION) return true;
  if (body.transport === BRIDGE_TRANSPORT && (hasText(body.sourceId) || hasObservationList(body))) {
    return true;
  }
  return hasObservationList(body) || isObservation(body);
}

export function isObservation(body) {
  if (!isPlainObject(body)) return false;
  if (!hasText(body.sourceId) && !hasText(body.sourceKind) && !hasText(body.providerId)) return false;
  return (
    Array.isArray(body.metrics) ||
    typeof body.availability === "string" ||
    body.providerTimestamp !== undefined ||
    body.sourceTime !== undefined ||
    isPlainObject(body.cache)
  );
}

export function parseSourcesRegistry(body, ctx = {}) {
  if (body == null) {
    return {
      ok: false,
      schemaVersion: null,
      sources: NAMED_SOURCES.map(cloneNamed),
      error: ctx.fetchError || { kind: "unavailable", message: "no registry body" },
    };
  }
  if (!isPlainObject(body) && !Array.isArray(body)) {
    return {
      ok: false,
      schemaVersion: null,
      sources: NAMED_SOURCES.map(cloneNamed),
      error: { kind: "parse", message: "registry was not an object" },
    };
  }
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body.sources)
      ? body.sources
      : Array.isArray(body.registry)
        ? body.registry
        : [];
  const byId = new Map();
  for (const entry of list) {
    const normalized = normalizeRegistryEntry(entry);
    if (normalized) byId.set(normalized.sourceId, normalized);
  }
  const sources = SOURCE_IDS.map((id) => {
    const fallback = cloneNamed(namedSource(id));
    const overlay = byId.get(id);
    return overlay ? { ...fallback, ...overlay, sourceId: id, sourceKind: overlay.sourceKind || fallback.sourceKind } : fallback;
  });
  return {
    ok: true,
    schemaVersion: isPlainObject(body) ? body.schemaVersion || SCHEMA_VERSION : SCHEMA_VERSION,
    sources,
    error: null,
  };
}

export function parseSnapshot(body, ctx = {}) {
  const fetchedAt = firstText(ctx.fetchedAt, isPlainObject(body) ? body.fetchedAt : null);
  const bridgeUrl = ctx.bridgeUrl || null;
  if (body == null) {
    return emptySnapshot(ctx, ctx.fetchError || { kind: "unavailable", message: "no readable body" });
  }
  if (!isPlainObject(body)) {
    return emptySnapshot(ctx, { kind: "parse", message: "snapshot was not an object" });
  }

  const rawList = listRawObservations(body);
  const observations = SOURCE_IDS.map((id) => {
    const found = rawList.find((entry) => sourceIdOf(entry) === id) || null;
    if (!found) {
      return placeholderObservation(id, {
        fetchedAt,
        availability: rawList.length ? "missing_from_snapshot" : "unavailable",
        error: body.error || ctx.fetchError || null,
      });
    }
    return normalizeObservation(found, { fetchedAt, bridgeUrl });
  });

  return {
    ok: true,
    schemaVersion: body.schemaVersion || SCHEMA_VERSION,
    fetchedAt: fetchedAt || firstText(body.fetchedAt),
    transport: firstText(body.transport, BRIDGE_TRANSPORT),
    bridgeUrl,
    observations,
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    errors: Array.isArray(body.errors) ? body.errors : [],
    withheldConclusions: Array.isArray(body.withheldConclusions) ? body.withheldConclusions : [],
    raw: body,
  };
}

export function observationById(snapshot, sourceId) {
  if (!snapshot || !Array.isArray(snapshot.observations)) return null;
  return snapshot.observations.find((entry) => entry && entry.sourceId === sourceId) || null;
}

export function normalizeObservation(body, ctx = {}) {
  const sourceId = sourceIdOf(body) || "unknown";
  const named = namedSource(sourceId);
  const fetchedAt = firstText(body.fetchedAt, ctx.fetchedAt);
  const providerTimestamp = firstPresent(body.providerTimestamp, body.sourceTime);
  const providerTimestampState =
    firstText(body.providerTimestampState, body.sourceTimeState) ||
    (providerTimestamp == null || providerTimestamp === "" ? "missing" : "ok");
  const metrics = normalizeMetrics(body.metrics);
  const availability = normalizeAvailability(body.availability, metrics, body.error);

  return {
    schemaVersion: firstText(body.schemaVersion, SCHEMA_VERSION),
    sourceId,
    sourceKind: firstText(body.sourceKind, named && named.sourceKind, SOURCE_KIND[sourceId]),
    title: named ? named.title : sourceId,
    upstreamUrl: firstText(body.upstreamUrl, body.sourceUrl, named && named.upstreamUrl, UPSTREAM_URL[sourceId]),
    fetchedAt,
    providerTimestamp: providerTimestamp == null || providerTimestamp === "" ? null : providerTimestamp,
    providerTimestampState,
    availability,
    httpStatus: Number.isInteger(body.httpStatus) ? body.httpStatus : ctx.httpStatus ?? null,
    cache: isPlainObject(body.cache) ? body.cache : null,
    metrics,
    coverage: body.coverage ?? null,
    errors: Array.isArray(body.errors) ? body.errors : body.error ? [body.error] : [],
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    evidenceClass: firstText(body.evidenceClass, body.evidencePlane),
    rawSourceLink: firstText(body.rawSourceLink, body.upstreamUrl, named && named.upstreamUrl),
    withheldConclusions: Array.isArray(body.withheldConclusions)
      ? body.withheldConclusions
      : defaultWithheld(sourceId),
    establishes: firstText(body.establishes, body.does, named && named.establishes),
    doesNotEstablish: firstText(body.doesNotEstablish, body.doesNot, named && named.doesNotEstablish),
    error: body.error ?? null,
    series: Array.isArray(body.series) ? body.series : null,
    methodologyVersion: firstText(body.methodologyVersion, body.rawExcerpt && body.rawExcerpt.methodologyVersion),
    rawExcerpt: body.rawExcerpt ?? null,
    paidActivity: isPlainObject(body.paidActivity) ? body.paidActivity : null,
    transport: firstText(body.transport, BRIDGE_TRANSPORT),
  };
}

export function normalizeMetrics(metrics) {
  if (!Array.isArray(metrics)) return [];
  const out = [];
  for (const entry of metrics) {
    const metric = normalizeMetric(entry);
    if (metric) out.push(metric);
  }
  return out;
}

export function normalizeMetric(metric) {
  if (!isPlainObject(metric) || typeof metric.key !== "string" || !metric.key) return null;
  const state = typeof metric.state === "string" && metric.state ? metric.state : inferMetricState(metric);
  const value = valueForState(metric.value, state);
  return {
    key: metric.key,
    value,
    unit: metric.unit ?? null,
    state,
    definition: typeof metric.definition === "string" ? metric.definition : null,
    population: metric.population ?? null,
    window: metric.window ?? null,
    evidenceClass: metric.evidenceClass ?? null,
    sourcePath: typeof metric.sourcePath === "string" ? metric.sourcePath : null,
    ratioAlignment: typeof metric.ratioAlignment === "string" ? metric.ratioAlignment : null,
    numeratorKey: typeof metric.numeratorKey === "string" ? metric.numeratorKey : null,
    denominatorKey: typeof metric.denominatorKey === "string" ? metric.denominatorKey : null,
    sample: metric.sample === undefined ? null : metric.sample,
  };
}

export function displayMetricValue(metric) {
  if (!metric) {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  const state = metric.state || "missing";
  if (state === "missing") {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  if (MISSING_STATES.has(state) && (metric.value == null || state !== "ok")) {
    if (metric.value == null || state === "unavailable" || state === "error" || state === "source_error") {
      return { text: state, numeric: null, invented: false };
    }
  }
  if (state !== "ok") {
    if (metric.value == null) return { text: state, numeric: null, invented: false };
    if (state === "contradictory") {
      return { text: "contradictory (not displayed as a ratio)", numeric: null, invented: false };
    }
  }
  if (metric.value == null) {
    return { text: "missing (not zero)", numeric: null, invented: false };
  }
  return { text: formatScalar(metric.value, metric.unit), numeric: asNumeric(metric.value), invented: false };
}

export function metricCopy(sourceId, key) {
  const table = METRIC_COPY[sourceId] || {};
  return table[key] || { label: key, not: null };
}

export function crossSourceSum(_snapshot) {
  return {
    refused: true,
    total: null,
    figure: null,
    reason: "Named sources are not additive. This overlay does not emit a total agent economy figure.",
  };
}

export function rankedIncomparableScalars(_snapshot) {
  return {
    refused: true,
    ranking: [],
    reason: "Scalars from different sources do not share a definition and are not ranked.",
  };
}

export function extractProviderSeries(observation, { maxPoints = SERIES_MAX_POINTS } = {}) {
  if (!observation || observation.sourceId !== "x402stats") return null;
  const raw =
    (Array.isArray(observation.series) && observation.series) ||
    (observation.rawExcerpt && Array.isArray(observation.rawExcerpt.series) && observation.rawExcerpt.series) ||
    null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const points = raw.slice(-maxPoints).map((point) => {
    if (!isPlainObject(point)) return { date: null };
    return {
      date: point.date || point.day || null,
      sellers: point.sellers,
      transactions: point.transactions,
      volumeUsd: point.volumeUsd,
      buyers: point.buyers,
      newSellers: point.newSellers,
    };
  });
  return {
    sourceId: "x402stats",
    label: "x402stats provider series only",
    not: "global agent traffic, a shared-definition time series across sources, or a growth chart of the agent economy",
    chart: false,
    comparableAcrossSources: false,
    growthAsTraffic: false,
    pointCount: raw.length,
    points,
    methodologyVersion: observation.methodologyVersion || null,
  };
}

export function buildConsumerExample(snapshot, { registry } = {}) {
  const observations = snapshot && Array.isArray(snapshot.observations) ? snapshot.observations : [];
  const capability = observations.find((entry) => entry && entry.sourceId === "smithery_mcp") || null;
  const evidence = {
    snapshotFetchedAt: snapshot && snapshot.fetchedAt ? snapshot.fetchedAt : null,
    sources: observations.map((entry) => ({
      sourceId: entry.sourceId,
      fetchedAt: entry.fetchedAt || null,
      providerTimestamp: entry.providerTimestamp || null,
      providerTimestampState: entry.providerTimestampState || "missing",
      availability: entry.availability || null,
    })),
    purchaseExecuted: false,
  };

  const chosen = pickCapabilityReference(capability);
  if (!chosen) {
    const status = !capability || capability.availability === "missing_from_snapshot"
      ? "capability_source_missing"
      : capability.availability && capability.availability !== "ok" && capability.availability !== "partial"
        ? "capability_source_unavailable"
        : "no_capability_reference";
    return {
      status,
      chosen: null,
      evidence,
      action: "none",
      purchaseExecuted: false,
      note:
        "No existing capability or workflow reference was present in the capability source envelope. None was invented. This page does not execute a purchase.",
      registry: registry || null,
    };
  }

  return {
    status: "chosen",
    chosen: {
      sourceId: capability.sourceId,
      id: chosen.id,
      qualifiedName: chosen.qualifiedName,
      displayName: chosen.displayName,
      kind: "catalog_registration",
    },
    evidence: {
      ...evidence,
      capabilitySourceFetchedAt: capability.fetchedAt || null,
      capabilityProviderTimestamp: capability.providerTimestamp || null,
      capabilityReferenceId: chosen.id,
      capabilityQualifiedName: chosen.qualifiedName,
    },
    action: "retain_evidence_only",
    purchaseExecuted: false,
    note: "Chosen from the capability catalog snapshot. Evidence ids and timestamps retained. No purchase is executed.",
    registry: registry || null,
  };
}

export function pickCapabilityReference(observation) {
  if (!observation || !["ok", "partial"].includes(observation.availability)) return null;
  const excerpt = observation.rawExcerpt;
  const servers = serversFromExcerpt(excerpt);
  const first = servers[0] || null;
  if (first && (hasText(first.id) || hasText(first.qualifiedName))) {
    return {
      id: firstText(first.id, first.qualifiedName),
      qualifiedName: first.qualifiedName || null,
      displayName: firstText(first.displayName, first.qualifiedName, first.id),
    };
  }
  if (Array.isArray(observation.capabilityReferences) && observation.capabilityReferences[0]) {
    const ref = observation.capabilityReferences[0];
    if (isPlainObject(ref) && (hasText(ref.id) || hasText(ref.qualifiedName))) {
      return {
        id: firstText(ref.id, ref.qualifiedName),
        qualifiedName: ref.qualifiedName || null,
        displayName: firstText(ref.displayName, ref.qualifiedName, ref.id),
      };
    }
  }
  return null;
}

export function freshnessRows(snapshot, registry) {
  const byId = new Map((registry && registry.sources ? registry.sources : []).map((entry) => [entry.sourceId, entry]));
  const observations = snapshot && Array.isArray(snapshot.observations) ? snapshot.observations : [];
  return SOURCE_IDS.map((id) => {
    const observation = observations.find((entry) => entry.sourceId === id) || placeholderObservation(id, {});
    const meta = byId.get(id) || namedSource(id);
    return {
      sourceId: id,
      sourceKind: observation.sourceKind || (meta && meta.sourceKind),
      title: observation.title || (meta && meta.title) || id,
      availability: observation.availability || "unavailable",
      fetchedAt: observation.fetchedAt || null,
      providerTimestamp: observation.providerTimestamp || null,
      providerTimestampState: observation.providerTimestampState || "missing",
      cache: observation.cache,
      upstreamUrl: observation.upstreamUrl || (meta && meta.upstreamUrl),
      establishes: (meta && meta.establishes) || observation.establishes,
      doesNotEstablish: (meta && meta.doesNotEstablish) || observation.doesNotEstablish,
    };
  });
}

export function unavailableNote() {
  return UNAVAILABLE_SOURCES.map((entry) => ({ ...entry }));
}

export function numbersShownFor(observation) {
  if (!observation || !Array.isArray(observation.metrics)) return [];
  if (observation.availability === "unavailable" || observation.availability === "error" || observation.availability === "missing_from_snapshot") {
    return [];
  }
  return observation.metrics.filter((metric) => metric.state === "ok" && metric.value != null);
}

function listRawObservations(body) {
  if (Array.isArray(body.observations)) return body.observations.filter(isPlainObject);
  if (isPlainObject(body.observations)) return Object.values(body.observations).filter(isPlainObject);
  if (isPlainObject(body.snapshot)) return listRawObservations(body.snapshot);
  if (Array.isArray(body.sources) && body.sources.some(isObservation)) {
    return body.sources.filter(isObservation);
  }
  if (isObservation(body)) return [body];
  return [];
}

function hasObservationList(body) {
  return listRawObservations(body).length > 0;
}

function sourceIdOf(body) {
  if (!isPlainObject(body)) return null;
  if (hasText(body.sourceId) && SOURCE_IDS.includes(body.sourceId)) return body.sourceId;
  if (hasText(body.providerId) && SOURCE_IDS.includes(body.providerId)) return body.providerId;
  if (hasText(body.sourceId)) return body.sourceId;
  if (body.sourceKind === "work_market") return "moltjobs";
  if (body.sourceKind === "settlement") return "x402stats";
  if (body.sourceKind === "capability_discovery") return "smithery_mcp";
  return hasText(body.sourceId) ? body.sourceId : null;
}

function normalizeAvailability(availability, metrics, error) {
  if (typeof availability === "string" && availability) return availability;
  if (error) return "error";
  if (metrics.some((metric) => metric.state === "ok")) {
    return metrics.every((metric) => metric.state === "ok") ? "ok" : "partial";
  }
  return "unavailable";
}

function inferMetricState(metric) {
  if (metric.value == null) return "missing";
  return "ok";
}

function valueForState(value, state) {
  if (state === "missing" || state === "unavailable" || state === "error" || state === "source_error") {
    return null;
  }
  return value === undefined ? null : value;
}

function formatScalar(value, unit) {
  if (unit === "USDC") return `${value} USDC`;
  if (unit === "USD" && (typeof value === "number" || typeof value === "string")) return `${value} USD`;
  if (unit === "ms" && typeof value === "number") return formatMs(value);
  if (unit === "ratio" && typeof value === "number") return String(value);
  return String(value);
}

function formatMs(ms) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 120) return `${seconds.toFixed(1)} s (${ms} ms)`;
  const hours = seconds / 3600;
  if (hours < 48) return `${hours.toFixed(2)} h (${ms} ms)`;
  const days = hours / 24;
  return `${days.toFixed(2)} d (${ms} ms)`;
}

function asNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function serversFromExcerpt(excerpt) {
  if (typeof excerpt === "string") {
    try { excerpt = JSON.parse(excerpt); } catch { return []; }
  }
  if (Array.isArray(excerpt)) return excerpt.filter(isPlainObject);
  if (!isPlainObject(excerpt)) return [];
  if (Array.isArray(excerpt.servers)) return excerpt.servers.filter(isPlainObject);
  if (isPlainObject(excerpt.server)) return [excerpt.server];
  if (isPlainObject(excerpt.servers)) return Object.values(excerpt.servers).filter(isPlainObject);
  return [];
}

function normalizeRegistryEntry(entry) {
  if (!isPlainObject(entry) || !hasText(entry.sourceId)) return null;
  return {
    sourceId: entry.sourceId,
    sourceKind: firstText(entry.sourceKind, SOURCE_KIND[entry.sourceId]),
    title: firstText(entry.title, namedSource(entry.sourceId) && namedSource(entry.sourceId).title, entry.sourceId),
    upstreamUrl: firstText(entry.upstreamUrl, UPSTREAM_URL[entry.sourceId]),
    establishes: firstText(entry.establishes, entry.does, namedSource(entry.sourceId) && namedSource(entry.sourceId).establishes),
    doesNotEstablish: firstText(
      entry.doesNotEstablish,
      entry.doesNot,
      namedSource(entry.sourceId) && namedSource(entry.sourceId).doesNotEstablish,
    ),
  };
}

function placeholderObservation(sourceId, extra) {
  const named = namedSource(sourceId);
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceId,
    sourceKind: named ? named.sourceKind : SOURCE_KIND[sourceId],
    title: named ? named.title : sourceId,
    upstreamUrl: named ? named.upstreamUrl : UPSTREAM_URL[sourceId] || null,
    fetchedAt: extra.fetchedAt || null,
    providerTimestamp: null,
    providerTimestampState: "missing",
    availability: extra.availability || "unavailable",
    httpStatus: null,
    cache: null,
    metrics: [],
    coverage: null,
    errors: extra.error ? [extra.error] : [],
    warnings: [],
    evidenceClass: null,
    rawSourceLink: named ? named.upstreamUrl : null,
    withheldConclusions: defaultWithheld(sourceId),
    establishes: named ? named.establishes : null,
    doesNotEstablish: named ? named.doesNotEstablish : null,
    error: extra.error || null,
    series: null,
    methodologyVersion: null,
    rawExcerpt: null,
    paidActivity: null,
    transport: BRIDGE_TRANSPORT,
  };
}

function emptySnapshot(ctx, error) {
  return {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    fetchedAt: ctx.fetchedAt || null,
    transport: BRIDGE_TRANSPORT,
    bridgeUrl: ctx.bridgeUrl || null,
    observations: SOURCE_IDS.map((id) => placeholderObservation(id, { fetchedAt: ctx.fetchedAt, error })),
    warnings: [],
    errors: error ? [error] : [],
    withheldConclusions: ["total_agent_economy", "cross_source_sum", "global_agent_traffic"],
    error,
    raw: null,
  };
}

function defaultWithheld(sourceId) {
  const common = ["total_agent_economy", "cross_source_sum", "global_agent_traffic"];
  if (sourceId === "moltjobs") return [...common, "agent_traffic", "customers", "profit", "demand", "repeat_demand", "conversion_funnel"];
  if (sourceId === "x402stats") return [...common, "unique_customers", "organic_demand_proof", "neomorphic_revenue", "paid_demand_population"];
  if (sourceId === "smithery_mcp") return [...common, "runtime_heartbeats", "active_traffic", "installs", "paid_demand_population"];
  return common;
}

function cloneNamed(entry) {
  return entry ? { ...entry } : null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function hasOwn(object, key) {
  return isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key) && !PROTO.has(key);
}

export {
  buildPaidActivityDrilldown,
  buildOperatorDecision,
  refusedFunnelMath,
  refuseCrossSourceSum,
  refuseRegistryAsPaidDemand,
  refuseOrganicAsPaidCustomers,
  alignedBoundedRatio,
  missingNotZero,
} from "./paid-activity.js";
