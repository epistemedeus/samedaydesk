import { deltaToRpcPayload, validateDelta, validateLegacyObservation } from "./schema.js";

export function createSupabasePulseTransport(rpcFn) {
  return {
    async rpc(fn, args) {
      return rpcFn(fn, args);
    },
  };
}

export function createPulseStoreFromTransport(transport, { configured = true } = {}) {
  return {
    configured,

    async flush(flushId, delta) {
      const validated = validateDelta(delta);
      const payload = deltaToRpcPayload(validated);
      const { data, error } = await transport.rpc("pulse_apply_delta", {
        p_flush_id: flushId,
        p_delta: payload,
      });
      if (error) {
        const err = new Error(error.message || "pulse_flush_failed");
        err.code = error.code || error.details || "pulse_flush_failed";
        throw err;
      }
      return data;
    },

    async readSnapshot(observationStart, observationEnd) {
      const { data, error } = await transport.rpc("pulse_read_snapshot", {
        p_observation_start: observationStart,
        p_observation_end: observationEnd ?? new Date().toISOString(),
      });
      if (error) {
        const err = new Error(error.message || "pulse_read_failed");
        err.code = "pulse_read_failed";
        throw err;
      }
      return data;
    },

    async importLegacyObservation(importKey, observation) {
      const validated = validateLegacyObservation(observation);
      const { data, error } = await transport.rpc("pulse_import_legacy_observation", {
        p_import_key: importKey,
        p_observation: validated,
      });
      if (error) {
        const err = new Error(error.message || "pulse_legacy_import_failed");
        err.code = error.message?.includes("pulse_legacy_import_conflict")
          ? "pulse_legacy_import_conflict"
          : "pulse_legacy_import_failed";
        throw err;
      }
      return data;
    },

    health() {
      return {
        configured,
        transport: configured ? "supabase_rpc" : "unconfigured",
      };
    },
  };
}
