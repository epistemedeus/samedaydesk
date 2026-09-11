import { existsSync } from "node:fs";
import { join } from "node:path";
import { getJob } from "../../../../server/paid-useful-jobs/index.mjs";

export const SCHEMA = "samedaydesk.wave5.d17.domain-outcome.v1";

export const OUTCOMES = Object.freeze({
  ANALYSIS_CHANGE: "analysis_change",
  ANALYSIS_NO_CHANGE: "analysis_no_change",
  ANALYSIS_REFUSAL: "analysis_refusal",
  ANALYSIS_PARTIAL: "analysis_partial",
  INCOMPLETE_DELIVERY: "incomplete_delivery",
  ENGINE_FAILURE: "engine_failure",
  TRANSPORT_FAILURE: "transport_failure",
  WRAPPER_REFUSAL: "wrapper_refusal",
});

/** Pre-engine wrapper codes. Not analysis, not engine execution. */
export const WRAPPER_REFUSAL_CODES = Object.freeze([
  "missing-job",
  "unknown-job",
  "missing-required-inputs",
  "input-oversize",
  "input-malformed",
  "input-missing-file",
  "input-not-file",
  "input-root-not-directory",
  "sample-not-a-sale",
  "live-sale-not-available",
  "reserved-fixture-requires-payment",
  "fixture-cannot-live-settle",
  "live-settle-out-of-scope",
]);

const WRAPPER_REFUSAL_SET = new Set(WRAPPER_REFUSAL_CODES);

const ANALYSIS_FROM_STATUS = Object.freeze({
  actionable: OUTCOMES.ANALYSIS_CHANGE,
  informational: OUTCOMES.ANALYSIS_NO_CHANGE,
  refused: OUTCOMES.ANALYSIS_REFUSAL,
  partial: OUTCOMES.ANALYSIS_PARTIAL,
});

export function expectedOutputs(jobId) {
  try {
    return [...getJob(jobId).outputs];
  } catch {
    return [];
  }
}

function parseBody(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Wrapper success puts the engine envelope on `body.engine`.
 * Wrapper engine-refuse puts the spawn record `{ status, stdout, stderr, json }`.
 */
export function inspectEngine(body) {
  const e = body?.engine;
  if (!e || typeof e !== "object") {
    return { present: false, ran: false, processStatus: null, envelope: null };
  }
  if (typeof e.ok === "boolean" && typeof e.status === "string") {
    return {
      present: true,
      ran: true,
      processStatus: 0,
      envelope: e,
      envelopeOk: e.ok,
      analysisStatus: e.status,
      digest: e.digest || null,
    };
  }
  const envelope = e.json && typeof e.json === "object" ? e.json : null;
  const analysisStatus =
    typeof envelope?.status === "string" ? envelope.status : null;
  return {
    present: true,
    ran: true,
    processStatus: typeof e.status === "number" ? e.status : null,
    envelope,
    envelopeOk: envelope ? envelope.ok !== false : false,
    analysisStatus,
    digest: envelope?.digest || null,
    stderr: e.stderr || null,
  };
}

function presentNames({ body, outDir, expected }) {
  const fromBody = new Set((body?.outputs || []).map((o) => o?.name).filter(Boolean));
  const names = [];
  for (const name of expected) {
    const onDisk = outDir ? existsSync(join(outDir, name)) : false;
    if (onDisk || fromBody.has(name)) names.push(name);
  }
  return names;
}

function analysisLayer(status) {
  if (status === "actionable") return "change";
  if (status === "informational") return "no-change";
  if (status === "refused") return "refusal";
  if (status === "partial") return "partial";
  return "not-run";
}

/**
 * Classify one wrapper CLI/library result.
 * wrapper.ok is observed, never the analysis outcome.
 */
export function classifyDomainOutcome(input = {}) {
  const processStatus = input.status;
  const signal = input.signal ?? null;
  const stderr = String(input.stderr || "");
  const body = input.body !== undefined ? input.body : parseBody(input.stdout);
  const jobId = input.jobId || body?.jobId || null;
  const expected = Array.isArray(input.expectedOutputs)
    ? input.expectedOutputs
    : expectedOutputs(jobId);
  const outDir = input.outDir || body?.receipt?.outDir || null;
  const engine = inspectEngine(body);
  const delivered = presentNames({ body, outDir, expected });
  const deliveryComplete = expected.length > 0 && delivered.length === expected.length;
  const deliveryNone = expected.length > 0 && delivered.length === 0;

  const layers = {
    transport: "ok",
    engine: engine.ran ? (engine.envelope && engine.envelopeOk && engine.processStatus === 0 ? "ok" : "failed") : "not-run",
    delivery: "not-run",
    payment: body?.fundingState || null,
    analysis: "not-run",
  };

  const report = {
    schema: SCHEMA,
    jobId,
    outcome: null,
    processStatus: processStatus ?? null,
    signal,
    wrapperOk: body?.ok === true,
    wrapperRefused: body?.refused === true,
    wrapperCode: body?.code || null,
    engineStatus: engine.analysisStatus,
    engineEnvelopeOk: engine.envelope ? engine.envelopeOk : null,
    engineDigest: engine.digest,
    receiptRefused: body?.receipt?.engineResult?.refused === true,
    expectedOutputs: expected,
    deliveredOutputs: delivered,
    layers,
    notes: [],
  };

  if (!body || typeof body !== "object") {
    layers.transport = signal ? "crash" : "unparseable";
    layers.delivery = "none";
    report.outcome = OUTCOMES.TRANSPORT_FAILURE;
    report.notes.push("Process produced no parseable wrapper JSON.");
    if (/useful-jobs archive|EACCES|timeout waiting for useful-jobs/i.test(stderr)) {
      report.notes.push("Acquisition/extract failed before wrapper try; not an analysis refusal.");
    }
    return report;
  }

  if (signal || (typeof processStatus === "number" && processStatus !== 0 && processStatus !== 2)) {
    layers.transport = "crash";
    layers.delivery = deliveryNone ? "none" : delivered.length ? "incomplete" : "none";
    report.outcome = OUTCOMES.TRANSPORT_FAILURE;
    report.notes.push(`Wrapper process exit ${processStatus} is not a structured analysis report.`);
    return report;
  }

  if (!engine.ran && WRAPPER_REFUSAL_SET.has(body.code)) {
    layers.engine = "not-run";
    layers.delivery = "none";
    report.outcome = OUTCOMES.WRAPPER_REFUSAL;
    report.notes.push(`Pre-engine wrapper code ${body.code}.`);
    return report;
  }

  if (expected.length > 0) {
    layers.delivery = deliveryComplete ? "complete" : deliveryNone ? "none" : "incomplete";
  }

  if (engine.ran && engine.envelope && engine.envelopeOk && engine.processStatus === 0) {
    layers.engine = "ok";
    layers.analysis = analysisLayer(engine.analysisStatus);
    if (!deliveryComplete) {
      report.outcome = OUTCOMES.INCOMPLETE_DELIVERY;
      report.notes.push(
        "Engine envelope is not proof of delivery; catalog outputs are missing. Not a useful change/no-change/refusal report.",
      );
      return report;
    }
    const mapped = ANALYSIS_FROM_STATUS[engine.analysisStatus];
    if (!mapped) {
      report.outcome = OUTCOMES.ENGINE_FAILURE;
      report.notes.push(`Unknown engine status ${engine.analysisStatus}.`);
      return report;
    }
    report.outcome = mapped;
    if (mapped === OUTCOMES.ANALYSIS_REFUSAL) {
      report.notes.push("Valid analysis refusal with delivered artifacts is not a transport or engine failure.");
    } else if (mapped === OUTCOMES.ANALYSIS_NO_CHANGE) {
      report.notes.push("Valid no-change report is useful delivery, not a missed edit.");
    }
    if (body.receipt?.engineResult?.refused === true && mapped !== OUTCOMES.ANALYSIS_REFUSAL) {
      report.notes.push("receipt.engineResult.refused is not the analysis layer.");
    }
    if (mapped === OUTCOMES.ANALYSIS_REFUSAL && body.receipt?.engineResult?.refused !== true) {
      report.notes.push(
        "Current SDS52 receipt.engineResult.refused stays false when status is refused; classify from engine.status.",
      );
    }
    return report;
  }

  layers.engine = "failed";
  layers.delivery = deliveryComplete ? "complete" : deliveryNone ? "none" : "incomplete";
  layers.analysis = analysisLayer(engine.analysisStatus);
  report.outcome = OUTCOMES.ENGINE_FAILURE;
  report.notes.push(
    "Engine exited or returned ok:false without a complete analysis artifact set. Distinct from a delivered status=refused report.",
  );
  return report;
}

export function classifyWrapperCliResult(result, extra = {}) {
  return classifyDomainOutcome({
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    body: result.body,
    outDir: extra.outDir,
    jobId: extra.jobId,
    expectedOutputs: extra.expectedOutputs,
  });
}
