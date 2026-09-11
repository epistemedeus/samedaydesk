import { existsSync, statSync } from "node:fs";
import { JOB_BY_ID } from "../../../../server/paid-useful-jobs/lib/jobs.mjs";

export const LAYER = Object.freeze({
  WRAPPER_REFUSE: "wrapper-refuse",
  ENGINE_FAILURE: "engine-failure",
  TRANSPORT_FAILURE: "transport-failure",
  INCOMPLETE_DELIVERY: "incomplete-delivery",
  USEFUL_DELIVERY: "useful-delivery",
});

export const WRAPPER_REFUSE_CODES = Object.freeze([
  "unknown-job",
  "missing-job",
  "missing-required-inputs",
  "input-malformed",
  "input-missing-file",
  "input-not-file",
  "input-oversize",
  "input-root-not-directory",
  "sample-not-a-sale",
  "live-sale-not-available",
  "live-settle-out-of-scope",
  "fixture-cannot-live-settle",
  "reserved-fixture-requires-payment",
]);

export const D01_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";

export function engineReport(result) {
  const engine = result?.engine;
  if (!engine || typeof engine !== "object") return null;
  if (engine.json && typeof engine.json === "object") return engine.json;
  if (typeof engine.appId === "string" || typeof engine.status === "string") return engine;
  return null;
}

function deliveryFromOutputs(job, result) {
  const expected = [...(job?.outputs || [])];
  const listed = Array.isArray(result?.outputs) ? result.outputs : [];
  const present = expected.filter((name) =>
    listed.some((o) => o && o.name === name && o.path && existsSync(o.path) && statSync(o.path).isFile()),
  );
  const missing = expected.filter((name) => !present.includes(name));
  let status = "complete";
  if (!expected.length) status = "complete";
  else if (missing.length === expected.length) status = "not-attempted";
  else if (missing.length) status = "incomplete";
  return { status, complete: missing.length === 0, expected, present, missing };
}

function analysisFromReport(report) {
  if (!report) return { status: "not-run", outcome: "not-run", identityVerified: null };
  const identityVerified = typeof report.identityVerified === "boolean" ? report.identityVerified : null;
  if (report.ok === false && report.status !== "refused" && report.status !== "informational" && report.status !== "partial") {
    return { status: report.status || "refused", outcome: "refused", identityVerified };
  }
  if (report.status === "refused" || report.refused === true) {
    return { status: report.status || "refused", outcome: "refused", identityVerified };
  }
  if (report.status === "informational" || report.status === "partial" || report.status === "actionable") {
    return { status: report.status, outcome: report.status, identityVerified };
  }
  return { status: report.status || "completed", outcome: report.status || "completed", identityVerified };
}

function spawnFailed(result) {
  const engine = result?.engine;
  if (!engine || typeof engine !== "object") return false;
  if (engine.timedOut) return true;
  if (typeof engine.status === "number" && engine.status !== 0 && !engine.json && !engine.appId) return true;
  return false;
}

export function classifyResult(result, { jobId = result?.jobId } = {}) {
  const job = jobId && JOB_BY_ID[jobId] ? JOB_BY_ID[jobId] : null;
  const report = engineReport(result);
  const payment = {
    fundingState: result?.fundingState || result?.receipt?.fundingState || null,
    sold: result?.sold === true,
    purchaseAuthority: result?.purchaseAuthority === true,
    liveSettlement: result?.liveSettlement || result?.receipt?.liveSettlement || "out-of-scope",
    sample: result?.sample === true,
    sampleReasons: Array.isArray(result?.sampleReasons) ? result.sampleReasons : [],
  };

  if (result?.contract === D01_CONTRACT && result.transport && result.analysis && result.delivery) {
    return fromKernel(result, job, report, payment);
  }
  return fromSds52(result, job, report, payment);
}

function fromKernel(result, job, report, payment) {
  const transport = result.transport;
  const analysis = result.analysis;
  const delivery = result.delivery;
  let layer = LAYER.USEFUL_DELIVERY;
  if (transport === "acquisition-failed" || transport === "engine-crash" || transport === "timeout" || transport === "internal-error") {
    layer = LAYER.TRANSPORT_FAILURE;
  } else if (transport === "rejected" || WRAPPER_REFUSE_CODES.includes(result.code)) {
    layer = LAYER.WRAPPER_REFUSE;
  } else if (!delivery?.complete) {
    layer = LAYER.INCOMPLETE_DELIVERY;
  } else if (analysis?.outcome === "crashed" || analysis?.status === "not-run") {
    layer = LAYER.ENGINE_FAILURE;
  }
  return {
    source: result.contract,
    layer,
    transport,
    analysis,
    delivery,
    payment,
    useful: layer === LAYER.USEFUL_DELIVERY,
    report,
    job,
  };
}

function fromSds52(result, job, report, payment) {
  const delivery = deliveryFromOutputs(job, result);
  const hashes = {
    engineDigest: report?.digest || null,
    inputsDigest: result?.receipt?.inputsDigest || null,
    outputsDigest: result?.receipt?.outputsDigest || null,
    firstOutputSha256: result?.outputs?.[0]?.sha256 || null,
  };

  if (!result || typeof result !== "object") {
    return {
      source: "sds52-wrapper",
      layer: LAYER.TRANSPORT_FAILURE,
      transport: "internal-error",
      analysis: { status: "not-run", outcome: "not-run", identityVerified: null },
      delivery,
      payment,
      useful: false,
      report: null,
      job,
      hashes,
    };
  }

  if (WRAPPER_REFUSE_CODES.includes(result.code)) {
    return {
      source: "sds52-wrapper",
      layer: LAYER.WRAPPER_REFUSE,
      transport: "rejected",
      analysis: { status: "not-run", outcome: "not-run", identityVerified: null },
      delivery: { ...delivery, status: "not-attempted", complete: false },
      payment,
      useful: false,
      report,
      job,
      hashes,
      code: result.code,
      error: result.error || null,
    };
  }

  if (spawnFailed(result) || result.code === "engine-crash" || result.code === "engine-timeout") {
    return {
      source: "sds52-wrapper",
      layer: LAYER.TRANSPORT_FAILURE,
      transport: result.code === "engine-timeout" ? "timeout" : "engine-crash",
      analysis: { status: "not-run", outcome: "crashed", identityVerified: null },
      delivery,
      payment,
      useful: false,
      report,
      job,
      hashes,
      code: result.code || "engine-crash",
      error: result.error || null,
    };
  }

  if (result.ok === false && (result.code === "engine-refused" || (report && report.ok === false && !delivery.complete))) {
    return {
      source: "sds52-wrapper",
      layer: LAYER.ENGINE_FAILURE,
      transport: report ? "ok" : "engine-crash",
      analysis: analysisFromReport(report),
      delivery,
      payment,
      useful: false,
      report,
      job,
      hashes,
      code: result.code || "engine-refused",
      error: result.error || null,
    };
  }

  if (!delivery.complete) {
    return {
      source: "sds52-wrapper",
      layer: LAYER.INCOMPLETE_DELIVERY,
      transport: report ? "ok" : "rejected",
      analysis: analysisFromReport(report),
      delivery,
      payment,
      useful: false,
      report,
      job,
      hashes,
      code: result.code || "missing-output",
      error: result.error || null,
    };
  }

  const analysis = analysisFromReport(report);
  return {
    source: "sds52-wrapper",
    layer: LAYER.USEFUL_DELIVERY,
    transport: "ok",
    analysis,
    delivery,
    payment,
    useful: true,
    report,
    job,
    hashes,
    code: result.code || null,
    error: result.error || null,
  };
}
