/**
 * Synthetic period requests for the changed-period recipe, built from the vendored
 * Useful Commerce fixtures (task ids, contextId, Agent Entry caller, exchange
 * preview termsVersion values). scripts/build-artifacts.mjs writes them to
 * fixtures/; tests check the committed files equal this output. Not live data.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  agentEntryCaller,
  loadCallerTerms,
  owedReferenceV2Digest,
  periodNPlus1Preview,
  termsInputFromCaller,
  workExchangeCaller,
} from "./vendor-paths.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SCENARIO_CLOCK = "2026-11-12T10:30:00.000Z";
export const NOTICE = "Synthetic period request built by scripts/build-artifacts.mjs from vendored Useful Commerce synthetic fixtures. Not a live Make or n8n run and not customer data.";

export function mappingRegistry() {
  return JSON.parse(readFileSync(join(root, "config", "mapping-registry.json"), "utf8"));
}

const TITLE = "Synthetic: convert a CSV header row to JSON keys";
const ROWS = [
  { rowId: "r-001", suffix: "", n: ["order_id", "ship_date"], n1: ["order_id", "ship_date", "carrier"] },
  { rowId: "r-002", suffix: " (returns)", n: ["return_id", "reason"], n1: ["return_id", "reason"] },
  { rowId: "r-003", suffix: " (inventory)", n: ["sku", "on_hand"], n1: ["sku", "on_hand", "bin"] },
  { rowId: "r-004", suffix: " (suppliers)", n: null, n1: ["supplier_id", "lead_days"] },
  { rowId: "r-005", suffix: " (contacts)", n: null, n1: ["contact_id", "email"], consent: "no" },
];

function callerBlock(step) {
  const entry = agentEntryCaller();
  return { correlationId: entry.correlationId, step, tool: entry.tool, measurement: entry.measurement };
}

export function periodNRecords() {
  return ROWS.filter((r) => r.n).map((r) => ({
    rowId: r.rowId,
    captureRef: `cap-wk-cp-n-${r.rowId}`,
    capturedAt: "2026-11-12T09:00:00.000Z",
    heading: `${TITLE}${r.suffix}`,
    state: "complete",
    keys: r.n,
    notes: "synthetic row",
    consent: true,
  }));
}

export function periodNPlus1Records({ staleRowId = "r-004" } = {}) {
  return ROWS.map((r, i) => ({
    rowId: r.rowId,
    capture: {
      id: `cap-wk-cp-n1-${r.rowId}${r.rowId === staleRowId ? "-stale" : ""}`,
      at: r.rowId === staleRowId ? "2026-11-10T09:00:00.000Z" : r.rowId === "r-004" ? "2026-11-12T10:15:00.000Z" : "2026-11-12T10:00:00.000Z",
    },
    title: `${TITLE}${r.suffix}`,
    done: true,
    outputKeys: r.n1,
    priority: i + 1,
    consent: r.consent ?? "yes",
  }));
}

export function journeyOwedReference() {
  const ref = {
    schema: "pilot.agent-money.owed-reference.v2",
    synthetic: true,
    obligationId: "syn-oblig-walletless-0001",
    taskRef: agentEntryCaller().correlationId,
    integrity: "2b6113075c5f2b597a50462ceec384965280262b3fd0cc5d186a17763f9a3a71",
    state: "owed",
  };
  return { ...ref, referenceDigest: owedReferenceV2Digest(ref) };
}

export function periodNRequest({ termsPreview = null } = {}) {
  const caller = workExchangeCaller();
  return {
    synthetic: true,
    notice: NOTICE,
    period: {
      periodId: "period-N",
      taskId: caller.periodNTaskId,
      contextId: caller.contextId,
      followsTaskId: null,
      priorPeriodId: null,
      mappingVersion: "workflow-output.v1",
      termsInput: termsPreview ? termsInputFromCaller(caller, { preview: termsPreview }) : termsInputFromCaller(caller),
      caller: callerBlock(0),
    },
    records: periodNRecords(),
  };
}

export function periodNPlus1Request({ mappingVersion = "workflow-output.v2", stale = true, claimLocalHash = false, owedReference = journeyOwedReference() } = {}) {
  const caller = workExchangeCaller();
  const termsInput = termsInputFromCaller(caller, { preview: periodNPlus1Preview() });
  if (claimLocalHash) termsInput.claimedTermsVersion = loadCallerTerms({ ...termsInput, contextId: caller.contextId }).localTermsVersion;
  return {
    synthetic: true,
    notice: NOTICE,
    period: {
      periodId: "period-N+1",
      taskId: caller.periodNPlus1TaskId,
      contextId: caller.contextId,
      followsTaskId: caller.periodNTaskId,
      priorPeriodId: "period-N",
      mappingVersion,
      termsInput,
      caller: callerBlock(1),
      ...(owedReference ? { owedReference } : {}),
    },
    records: periodNPlus1Records({ staleRowId: stale ? "r-004" : null }),
  };
}

/** Faults the simulation injects at the client endpoint (never in a real provider). */
export const SCENARIO_FAULTS = Object.freeze([
  Object.freeze({ type: "uncommitted", periodId: "period-N+1", recordKey: "r-002" }),
  Object.freeze({ type: "lost_apply_reply", periodId: "period-N+1", recordKey: "r-003" }),
]);

export function buildFixtures() {
  return {
    "fixtures/period-n.request.json": periodNRequest(),
    "fixtures/period-n-plus-1.unadapted.request.json": periodNPlus1Request({ mappingVersion: "workflow-output.v1" }),
    "fixtures/period-n-plus-1.request.json": periodNPlus1Request(),
    "fixtures/period-n-plus-1.rerun.request.json": periodNPlus1Request({ stale: false }),
    "fixtures/period-n.terms-changed.request.json": periodNRequest({ termsPreview: periodNPlus1Preview() }),
    "fixtures/period-n-plus-1.local-hash.request.json": periodNPlus1Request({ stale: false, claimLocalHash: true }),
    "fixtures/faults.json": { synthetic: true, notice: "Faults injected by the simulation at the client endpoint only.", faults: SCENARIO_FAULTS },
  };
}
