/**
 * W5-D01 supplied-input execution contract.
 * One implementation: createExecutor / runPaidOffer. Thin CLI and HTTP consume it.
 * Consumers (D02+) pin this version string. This file does not claim D08/D14 behavior.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const EXECUTION_CONTRACT_VERSION = "samedaydesk.paid-useful-jobs.execution.v1";

export const TRANSPORT_STATES = Object.freeze([
  "ok",
  "rejected",
  "acquisition-failed",
  "engine-crash",
  "timeout",
  "internal-error",
]);

export const DELIVERY_STATES = Object.freeze(["complete", "incomplete", "not-attempted"]);

function isPresentFile(outDir, name) {
  const p = join(outDir, name);
  return existsSync(p) && statSync(p).isFile();
}

/**
 * Delivery is about this run's isolated out dir, never a reused caller directory.
 * `complete` means every expected name exists as a file from this execution.
 */
export function assessDelivery(expectedNames, outDir) {
  const expected = [...(expectedNames || [])];
  if (!outDir) {
    return {
      status: "not-attempted",
      complete: false,
      expected,
      present: [],
      missing: expected,
      unexpected: [],
    };
  }
  const present = expected.filter((name) => isPresentFile(outDir, name));
  const missing = expected.filter((name) => !present.includes(name));
  let status = "complete";
  if (missing.length === expected.length && expected.length > 0) status = "not-attempted";
  else if (missing.length) status = "incomplete";
  return {
    status,
    complete: missing.length === 0,
    expected,
    present,
    missing,
    unexpected: [],
  };
}

/**
 * Transport is process/acquire/engine lifecycle, not analysis usefulness.
 * Engine JSON with ok:false is still transport ok when the process produced JSON.
 */
export function classifyTransport({ acquireError = false, engine = null, crashed = false, timeout = false } = {}) {
  if (acquireError) return "acquisition-failed";
  if (timeout || engine?.timedOut) return "timeout";
  if (crashed) return "engine-crash";
  if (!engine) return "internal-error";
  if (engine.schemaMatch && engine.schemaMatch.ok === false) return "engine-crash";
  if (engine.outcomeKind === "transport-failure") return "engine-crash";
  if (typeof engine.status === "number" && engine.status !== 0) {
    if (engine.json?.refused === true) return "ok";
    return "engine-crash";
  }
  if (engine.json) return "ok";
  return "engine-crash";
}

/**
 * Analysis is the engine's domain report. Valid refusal / no-change is not a crash.
 */
export function classifyAnalysis({ engine = null, delivery = null } = {}) {
  void delivery;
  const json = engine?.json;
  if (!json) {
    return {
      status: "not-run",
      outcome: crashedOutcome(engine),
      identityVerified: null,
    };
  }
  const identityVerified =
    typeof json.identityVerified === "boolean" ? json.identityVerified : null;
  if (json.ok === false || json.refused === true) {
    return {
      status: json.status || "refused",
      outcome: "refused",
      identityVerified,
    };
  }
  if (json.status === "informational" || json.status === "partial") {
    return { status: json.status, outcome: json.status, identityVerified };
  }
  if (json.status === "actionable") {
    return { status: "actionable", outcome: "actionable", identityVerified };
  }
  return {
    status: json.status || "completed",
    outcome: "completed",
    identityVerified,
  };
}

function crashedOutcome(engine) {
  if (!engine) return "not-run";
  if (engine.timedOut) return "timeout";
  return "crashed";
}
