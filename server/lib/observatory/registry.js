/**
 * Fixed-upstream adapter registry. Named sources only.
 */

import * as moltjobs from "./adapters/moltjobs.js";
import * as x402stats from "./adapters/x402stats.js";
import * as smitheryMcp from "./adapters/smithery-mcp.js";
import { createBoundedFetcher } from "./bounded-fetch.js";
import {
  DOCUMENTED_UNAVAILABLE_SOURCES,
  SCHEMA_VERSION,
  createCatalog,
  createEnvelope,
  createSnapshot,
  specsToUnavailableMetrics,
} from "./contract.js";

export class UnknownSourceError extends Error {
  constructor(sourceId) {
    super(`unknown observatory source: ${sourceId}`);
    this.name = "UnknownSourceError";
    this.code = "unknown_source";
    this.sourceId = sourceId;
  }
}

const ADAPTERS = new Map([
  [moltjobs.sourceId, moltjobs],
  [x402stats.sourceId, x402stats],
  [smitheryMcp.sourceId, smitheryMcp],
]);

export function listSourceIds() {
  return [...ADAPTERS.keys()];
}

export function listSources() {
  return [...ADAPTERS.values()].map((adapter) => publicDescriptor(adapter));
}

export function getSource(sourceId) {
  return ADAPTERS.get(sourceId) || null;
}

export function listCatalog() {
  return createCatalog(listSources());
}

export function createObservatoryRuntime(options = {}) {
  const fetcher = options.fetcher || createBoundedFetcher(options);
  const nowMs = typeof options.now === "function" ? options.now : () => Date.now();

  async function observe(sourceId) {
    const adapter = getSource(sourceId);
    if (!adapter) throw new UnknownSourceError(sourceId);
    try {
      const capture = await fetcher.getCapture(adapter.sourceId, adapter.upstreamUrl);
      return adapter.observe(capture, { nowMs: nowMs() });
    } catch (error) {
      if (error instanceof UnknownSourceError) throw error;
      const fetchedAt = new Date(nowMs()).toISOString();
      return createEnvelope({
        sourceId: adapter.sourceId,
        sourceKind: adapter.sourceKind,
        upstreamUrl: adapter.upstreamUrl,
        fetchedAt,
        providerTimestamp: null,
        providerTimestampState: "missing",
        availability: "error",
        httpStatus: null,
        cache: {
          hit: false,
          ageMs: null,
          stale: false,
          ttlMs: null,
          fetchedAt,
        },
        metrics: specsToUnavailableMetrics(adapter.metricSpecs || [], "error"),
        errors: [{
          code: "bridge_error",
          message: error && error.message ? error.message : "observation failed",
        }],
        warnings: [],
        evidenceClass: adapter.evidenceClass,
        rawSourceLink: adapter.upstreamUrl,
        withheldConclusions: adapter.descriptor.withheldConclusions,
      });
    }
  }

  async function observeAll() {
    const fetchedAt = new Date(nowMs()).toISOString();
    const observations = await Promise.all(listSourceIds().map((id) => observe(id)));
    return createSnapshot({
      fetchedAt,
      observations,
      documentedUnavailable: DOCUMENTED_UNAVAILABLE_SOURCES,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    observe,
    observeAll,
    listSources,
    listCatalog,
    getSource,
    fetcher,
  };
}

function publicDescriptor(adapter) {
  const descriptor = adapter.descriptor;
  return {
    sourceId: descriptor.sourceId,
    sourceKind: descriptor.sourceKind,
    upstreamUrl: descriptor.upstreamUrl,
    evidenceClass: descriptor.evidenceClass,
    establishes: descriptor.establishes,
    doesNotEstablish: descriptor.doesNotEstablish,
    withheldConclusions: descriptor.withheldConclusions,
    notes: descriptor.notes,
    metricKeys: descriptor.metricKeys,
  };
}
