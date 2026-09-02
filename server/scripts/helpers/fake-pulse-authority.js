import crypto from "node:crypto";
import {
  LEGACY_IMPORT_KEY,
  emptyDelta,
  legacyObservationHash,
  mergeCounterMaps,
  mergeSellerRepair,
  validateDelta,
  validateLegacyObservation,
} from "../../lib/pulse-store/schema.js";

function deltaHash(delta) {
  return crypto.createHash("md5").update(JSON.stringify(delta)).digest("hex");
}

function emptyAggregate() {
  const delta = emptyDelta();
  return {
    total: 0,
    humans: 0,
    bots: 0,
    aiCrawlers: 0,
    mcpSurfaceGets: 0,
    mcpProtocolRequests: 0,
    mcpProtocolMessages: 0,
    mcpProtocolByMethod: { ...delta.mcpProtocolByMethod },
    byPath: {},
    byReferer: {},
    byAiBot: {},
    funnel: { ...delta.funnel },
    sellerRepair: structuredClone(delta.sellerRepair),
  };
}

function mergeAggregate(existing, delta) {
  return {
    total: existing.total + delta.total,
    humans: existing.humans + delta.humans,
    bots: existing.bots + delta.bots,
    aiCrawlers: existing.aiCrawlers + delta.aiCrawlers,
    mcpSurfaceGets: existing.mcpSurfaceGets + delta.mcpSurfaceGets,
    mcpProtocolRequests: existing.mcpProtocolRequests + delta.mcpProtocolRequests,
    mcpProtocolMessages: existing.mcpProtocolMessages + delta.mcpProtocolMessages,
    mcpProtocolByMethod: mergeCounterMaps(existing.mcpProtocolByMethod, delta.mcpProtocolByMethod),
    byPath: mergeCounterMaps(existing.byPath, delta.byPath),
    byReferer: mergeCounterMaps(existing.byReferer, delta.byReferer),
    byAiBot: mergeCounterMaps(existing.byAiBot, delta.byAiBot),
    funnel: mergeCounterMaps(existing.funnel, delta.funnel),
    sellerRepair: mergeSellerRepair(existing.sellerRepair, delta.sellerRepair),
  };
}

export function createFakePulseAuthority() {
  let aggregate = emptyAggregate();
  const receipts = new Map();
  const legacyImports = new Map();

  return {
    async applyDelta(flushId, deltaInput) {
      const delta = validateDelta(deltaInput);
      const hash = deltaHash(delta);
      const existing = receipts.get(flushId);
      if (existing) {
        if (existing.hash !== hash) {
          const err = new Error("pulse_flush_id_conflict");
          err.code = "pulse_flush_id_conflict";
          throw err;
        }
        return { status: "already_applied", flushId };
      }
      aggregate = mergeAggregate(aggregate, delta);
      receipts.set(flushId, { hash });
      return { status: "applied", flushId };
    },

    async readSnapshot(observationStartInput, observationEnd = new Date().toISOString()) {
      const out = {
        schemaVersion: 2,
        observationStart: observationStartInput || new Date().toISOString(),
        observationEnd,
        ...aggregate,
      };
      const legacy = legacyImports.get(LEGACY_IMPORT_KEY);
      if (legacy) {
        out.legacyUncertainty = {
          ...legacy,
          authority: "incomplete_historical_evidence",
        };
      }
      return out;
    },

    async importLegacyObservation(importKey, observationInput) {
      const observation = validateLegacyObservation(observationInput);
      const hash = legacyObservationHash(observation);
      const existing = legacyImports.get(importKey);
      if (existing) {
        if (existingHash(existing) !== hash) {
          const err = new Error("pulse_legacy_import_conflict");
          err.code = "pulse_legacy_import_conflict";
          throw err;
        }
        return {
          status: "already_imported",
          importKey,
          authority: "incomplete_historical_evidence",
        };
      }
      legacyImports.set(importKey, { ...observation, observationHash: hash });
      return {
        status: "imported",
        importKey,
        authority: "incomplete_historical_evidence",
      };
    },
  };
}

function existingHash(row) {
  return row.observationHash || legacyObservationHash(row);
}

export function createFakeRpcTransport(authority = createFakePulseAuthority(), options = {}) {
  let applyThenErrorUsed = false;
  return {
    authority,
    async rpc(fn, args) {
      if (fn === "pulse_apply_delta") {
        const data = await authority.applyDelta(args.p_flush_id, args.p_delta);
        if (options.applyThenError && !applyThenErrorUsed) {
          applyThenErrorUsed = true;
          return { data: null, error: { message: "network_timeout" } };
        }
        return { data, error: null };
      }
      if (fn === "pulse_read_snapshot") {
        return {
          data: await authority.readSnapshot(args.p_observation_start, args.p_observation_end),
          error: null,
        };
      }
      if (fn === "pulse_import_legacy_observation") {
        return {
          data: await authority.importLegacyObservation(args.p_import_key, args.p_observation),
          error: null,
        };
      }
      return { data: null, error: { message: `unknown_rpc:${fn}` } };
    },
  };
}
