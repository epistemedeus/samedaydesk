/**
 * Vendor-free consume of AGL R05/R06 surfaces.
 * Never copies tools/result-reuse modules; dynamic-imports them when present.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OUTCOMES, REASONS, RESULT_SCHEMA } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const RESULT_REUSE_EXPORT_PATH = join(here, "../../result-reuse/src/export.mjs");
export const RESULT_REUSE_PORTABLE_PATH = join(here, "../../result-reuse/src/portable.mjs");

/** Candidate pins from AGL (draft PRs; amend when AGL second batch lands). */
export const AGL_IMPORT_MAP = Object.freeze({
  schema: "samedaydesk.recurring-decision-agl-import-map.v1",
  repo: "epistemedeus/samedaydesk",
  status: "candidates_pending_second_batch",
  doNotCopy: [
    "tools/result-reuse/src/export.mjs",
    "tools/result-reuse/src/portable.mjs",
    "tools/result-reuse/src/residual.mjs",
  ],
  r05: {
    pr: 364,
    url: "https://github.com/epistemedeus/samedaydesk/pull/364",
    head: "3a4a7538329292c11d94b148d58964fc0656dece",
    tree: "beef0d0a",
    entry: "tools/result-reuse/src/export.mjs",
    symbols: ["SUPPORTED_RECIPE_IDS", "digestPublicInput", "bindUsefulDecision", "decideOrReuse"],
    test: "tools/result-reuse/test/shared-capture-two-decisions.test.mjs",
  },
  r06: {
    pr: 366,
    url: "https://github.com/epistemedeus/samedaydesk/pull/366",
    head: "95c8a84155d01d67c707170e94aa148ba6542c50",
    tree: "d94b06d6",
    stackedOn: 364,
    entry: "tools/result-reuse/src/portable.mjs",
    schema: "samedaydesk.portable-decision.v1",
    symbols: [
      "PORTABLE_SCHEMA",
      "portableKey",
      "exportPortableDecision",
      "importPortableDecision",
      "retirePortableDecision",
      "readPortable",
    ],
    test: "tools/result-reuse/test/portable-decision.test.mjs",
    fixtures: "experiments/agl-r06-portable-decision-20261105/",
  },
  residualOptional: {
    pr: 365,
    url: "https://github.com/epistemedeus/samedaydesk/pull/365",
    head: "9d1f3f96",
    tree: "c774e95a",
    entry: "tools/result-reuse/src/residual.mjs",
    schema: "samedaydesk.result-reuse.residual-need.v1",
    note: "only if B6 needs residual; not stacked on 364",
  },
  recommendedCheckout: "95c8a84155d01d67c707170e94aa148ba6542c50",
});

export function aglModulePresence() {
  return {
    exportPath: RESULT_REUSE_EXPORT_PATH,
    portablePath: RESULT_REUSE_PORTABLE_PATH,
    exportPresent: existsSync(RESULT_REUSE_EXPORT_PATH),
    portablePresent: existsSync(RESULT_REUSE_PORTABLE_PATH),
    importMap: AGL_IMPORT_MAP,
  };
}

async function importIfPresent(path) {
  if (!existsSync(path)) return null;
  return import(pathToFileURL(path).href);
}

export async function loadAglExportModule() {
  return importIfPresent(RESULT_REUSE_EXPORT_PATH);
}

export async function loadAglPortableModule() {
  return importIfPresent(RESULT_REUSE_PORTABLE_PATH);
}

function shell(partial) {
  return {
    schema: RESULT_SCHEMA,
    useful: false,
    previous: null,
    statePath: null,
    cannotEstablish: [
      "This run-once consumer does not claim live recurrence.",
      "AGL bridge does not duplicate decide-or-reuse or portable producers.",
      "Voluntary paid choice remains an outside experiment, not a fixture assertion.",
    ],
    ...partial,
  };
}

/**
 * Map AGL decideOrReuse / importPortableDecision results into consumer outcomes.
 * Pass-through of the AGL payload stays under `agl`.
 */
export function mapAglVerdict(aglResult, { intentId = "", subject = "", clock = null, horizonHours = null } = {}) {
  if (!aglResult || typeof aglResult !== "object") {
    return {
      ok: false,
      ...shell({
        outcome: OUTCOMES.unknown,
        reason: REASONS.invalidInput,
        freshness: { clock, horizonHours, priorAt: null, captureAt: null, withinHorizon: false },
        decision: { intentId, subject, changedFields: [], unchangedFields: [], digestPrior: null, digestCapture: null },
        controls: { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null },
        message: "empty AGL result",
        agl: null,
      }),
    };
  }

  if (aglResult.ok === false) {
    return {
      ok: false,
      ...shell({
        outcome: OUTCOMES.unknown,
        reason: REASONS.invalidInput,
        freshness: { clock, horizonHours, priorAt: null, captureAt: null, withinHorizon: false },
        decision: { intentId, subject, changedFields: [], unchangedFields: [], digestPrior: null, digestCapture: null },
        controls: { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null },
        message: aglResult.message || "AGL refused input",
        agl: aglResult,
      }),
    };
  }

  const reasonCode = aglResult.reason || null;
  const staleish = reasonCode && String(reasonCode).includes("stale");
  const unsupportedish = reasonCode && /unsupported|recipe_changed|input_not_before_work|fields_mismatch|private/i.test(String(reasonCode));
  const unavailableish = reasonCode && /missing|retired|withdrawn|subject_mismatch|revision/i.test(String(reasonCode));

  let outcome;
  let useful = false;
  let reason = reasonCode || REASONS.fieldsMatch;

  if (aglResult.verdict === "reuse" || aglResult.mode === "import-decision" && !aglResult.reason && aglResult.ok) {
    // import success often returns reuse-shaped payload; decideOrReuse reuse has verdict reuse
    if (aglResult.verdict === "reuse" || (aglResult.decision && !aglResult.reason && aglResult.ok && aglResult.mode !== "decide-or-reuse")) {
      outcome = OUTCOMES.usefulNoChange;
      useful = true;
      reason = reasonCode || REASONS.fieldsMatch;
    } else if (aglResult.verdict === "reuse") {
      outcome = OUTCOMES.usefulNoChange;
      useful = true;
      reason = reasonCode || REASONS.fieldsMatch;
    }
  }

  if (outcome == null) {
    if (aglResult.verdict === "reuse") {
      outcome = OUTCOMES.usefulNoChange;
      useful = true;
      reason = reasonCode || REASONS.fieldsMatch;
    } else if (staleish) {
      outcome = OUTCOMES.stale;
      reason = REASONS.captureStale;
    } else if (unavailableish) {
      outcome = OUTCOMES.unavailable;
      reason = reasonCode || REASONS.captureMissing;
    } else if (unsupportedish) {
      outcome = OUTCOMES.unsupported;
      reason = reasonCode || REASONS.captureUnsupported;
    } else if (aglResult.verdict === "recompute") {
      // Recompute means caller should produce again: treat as useful_change signal for continuity.
      outcome = OUTCOMES.usefulChange;
      useful = true;
      reason = reasonCode || REASONS.digestsDiffer;
    } else if (aglResult.ok && aglResult.decision && !aglResult.verdict) {
      outcome = OUTCOMES.usefulNoChange;
      useful = true;
      reason = reasonCode || REASONS.fieldsMatch;
    } else {
      outcome = OUTCOMES.unknown;
      reason = reasonCode || REASONS.invalidInput;
    }
  }

  return {
    ok: true,
    ...shell({
      outcome,
      useful,
      reason,
      freshness: {
        clock: clock ?? aglResult.clock ?? null,
        horizonHours,
        priorAt: aglResult.clock ?? null,
        captureAt: null,
        withinHorizon: !staleish,
      },
      decision: {
        intentId,
        subject,
        changedFields: useful && outcome === OUTCOMES.usefulChange ? ["*"] : [],
        unchangedFields: useful && outcome === OUTCOMES.usefulNoChange ? ["*"] : [],
        digestPrior: aglResult.savedInputDigest ?? null,
        digestCapture: aglResult.inputDigest ?? null,
      },
      controls: { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null },
      message: aglResult.message || null,
      agl: aglResult,
      via: "tools/result-reuse",
    }),
  };
}

export async function decideOrReuseViaAgl(saved, input, options = {}) {
  const mod = await loadAglExportModule();
  if (!mod?.decideOrReuse) {
    return {
      ok: false,
      ...shell({
        outcome: OUTCOMES.unavailable,
        reason: REASONS.aglModulesMissing,
        freshness: {
          clock: options.clock ?? null,
          horizonHours: options.horizonHours ?? null,
          priorAt: null,
          captureAt: null,
          withinHorizon: false,
        },
        decision: {
          intentId: options.intentId ?? "",
          subject: options.subject ?? "",
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null },
        message:
          "tools/result-reuse/src/export.mjs decideOrReuse not present; checkout AGL candidate head 95c8a841 (carries PR364) or keep using direct evaluate",
        presence: aglModulePresence(),
      }),
    };
  }
  const aglResult = mod.decideOrReuse(saved, input, options);
  return mapAglVerdict(aglResult, {
    intentId: options.intentId,
    subject: options.subject,
    clock: options.clock,
    horizonHours: options.horizonHours,
  });
}

export async function importPortableViaAgl(portable, manifest, options = {}) {
  const mod = await loadAglPortableModule();
  if (!mod?.importPortableDecision) {
    return {
      ok: false,
      ...shell({
        outcome: OUTCOMES.unavailable,
        reason: REASONS.aglModulesMissing,
        freshness: {
          clock: options.clock ?? null,
          horizonHours: options.horizonHours ?? null,
          priorAt: null,
          captureAt: null,
          withinHorizon: false,
        },
        decision: {
          intentId: options.intentId ?? "",
          subject: options.subject ?? "",
          changedFields: [],
          unchangedFields: [],
          digestPrior: null,
          digestCapture: null,
        },
        controls: { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null },
        message:
          "tools/result-reuse/src/portable.mjs importPortableDecision not present; checkout AGL candidate head 95c8a841",
        presence: aglModulePresence(),
      }),
    };
  }
  const aglResult = mod.importPortableDecision(portable, manifest, options);
  return mapAglVerdict(aglResult, {
    intentId: options.intentId,
    subject: options.subject,
    clock: options.clock,
    horizonHours: options.horizonHours,
  });
}
