import { LAYERS } from "./constants.mjs";
import { createSeedCatalog, FIXTURE_NOW } from "./catalog.mjs";
import { inputsCompatible, validateCapability } from "./validate.mjs";

/**
 * Local runnable adapters.
 * Distinguishes advertised capability, runnable adapter, and delivered evidence.
 * Never fetches arbitrary external URLs.
 */

const ADAPTERS = {
  "fixture-demo-echo": async (capability, inputs) => {
    return {
      ok: true,
      evidenceClass: "internal",
      layer: LAYERS.EVIDENCE,
      capabilityId: capability.id,
      deliveredAt: FIXTURE_NOW,
      result: {
        echo: String(inputs.message),
        evidenceClass: "internal",
      },
      note: "Fixture demo evidence. Not a customer delivery.",
    };
  },
  "local-fixture-batch-extract": async (capability, inputs) => {
    const urls = Array.isArray(inputs.urls) ? inputs.urls : [];
    return {
      ok: true,
      evidenceClass: "internal",
      layer: LAYERS.EVIDENCE,
      capabilityId: capability.id,
      deliveredAt: FIXTURE_NOW,
      result: {
        jobStatus: "completed",
        sources: urls.map((url, index) => ({
          id: `item-${String(index + 1).padStart(3, "0")}`,
          source: String(url),
          status: "fixture_echo",
          data: { title: `Fixture echo for ${url}` },
          note: "Local fixture; no network fetch was performed.",
        })),
        quote: capability.price,
      },
      note: "Local fixture projection of a SameDayDesk-shaped batch result. URLs were not fetched.",
    };
  },
  "local-record-lab-handoff": async (capability) => ({
    ok: true,
    evidenceClass: "internal",
    layer: LAYERS.EVIDENCE,
    capabilityId: capability.id,
    deliveredAt: FIXTURE_NOW,
    result: {
      projectionSummary: "Open /labs/record-lab/ with your own extraction JSON. This adapter does not upload or fetch.",
      provenanceNotes: ["handoff_only", "no_network"],
      completionLink: capability.completionLink,
    },
    note: "Handoff evidence only; the lab page performs the local projection.",
  }),
  "local-interface-change-handoff": async (capability) => ({
    ok: true,
    evidenceClass: "internal",
    layer: LAYERS.EVIDENCE,
    capabilityId: capability.id,
    deliveredAt: FIXTURE_NOW,
    result: {
      diffSummary: "Open /labs/interface-change/ with local documents. This adapter does not fetch remote specs.",
      completionLink: capability.completionLink,
    },
    note: "Handoff evidence only; the lab page performs the local diff.",
  }),
};

export function listRunnableAdapterIds() {
  return Object.keys(ADAPTERS).sort();
}

/**
 * Execute a capability through its declared runnable adapter when present.
 * Returns a structured no-result refusal when the adapter is missing or inputs fail.
 */
export async function runCapability(capability, inputs = {}, { nowMs = Date.parse(FIXTURE_NOW) } = {}) {
  const validation = validateCapability(capability, { nowMs });
  if (!validation.ok) {
    return {
      ok: false,
      reason: "capability_rejected",
      refusals: validation.refusals,
      errors: validation.errors,
      evidence: null,
    };
  }

  const adapterId = capability.runnableAdapterId;
  if (!adapterId || !ADAPTERS[adapterId]) {
    return {
      ok: false,
      reason: "no_runnable_adapter",
      refusals: ["no_result"],
      errors: ["advertised capability has no runnable adapter in this local market"],
      evidence: null,
      advertised: {
        id: capability.id,
        completionLink: capability.completionLink,
        executionRoute: capability.executionRoute,
      },
    };
  }

  const compat = inputsCompatible(capability, inputs);
  if (!compat.ok) {
    return {
      ok: false,
      reason: "incompatible_input",
      refusals: ["incompatible_input"],
      errors: [
        ...compat.missing.map((k) => `missing input ${k}`),
        ...compat.incompatible.map((k) => `incompatible input ${k}`),
      ],
      evidence: null,
    };
  }

  const evidence = await ADAPTERS[adapterId](capability, inputs);
  return {
    ok: true,
    reason: null,
    refusals: [],
    errors: [],
    evidence,
    layers: {
      advertised: capability.id,
      runnable: adapterId,
      delivered: evidence.layer,
    },
  };
}

export function createLocalMarket({ catalog, nowMs } = {}) {
  const seed = catalog || createSeedCatalog();
  return {
    list() {
      return seed.map((item) => ({ ...item }));
    },
    async run(id, inputs) {
      const capability = seed.find((item) => item.id === id);
      if (!capability) {
        return {
          ok: false,
          reason: "no_result",
          refusals: ["no_result"],
          errors: [`unknown capability ${id}`],
          evidence: null,
        };
      }
      return runCapability(capability, inputs, { nowMs });
    },
  };
}
