import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const WRAPPER_REJECT_CODES = new Set([
  "missing-job",
  "unknown-job",
  "missing-required-inputs",
  "sample-not-a-sale",
  "reserved-fixture-requires-payment",
  "live-sale-not-available",
  "live-settle-out-of-scope",
  "fixture-cannot-live-settle",
  "input-missing-file",
  "input-malformed",
  "input-oversize",
  "input-not-file",
  "input-root-not-directory",
  "input-schema-mismatch",
  "input-jsonl-not-document",
  "missing-output",
]);

export function engineReport(result) {
  if (!result || typeof result !== "object") return null;
  const e = result.engine;
  if (!e || typeof e !== "object") return null;
  if (e.json && typeof e.json === "object") return e.json;
  if ("digest" in e || "appId" in e || ("ok" in e && "status" in e)) return e;
  return null;
}

export function assessDelivery(expectedNames, outDir) {
  const expected = [...(expectedNames || [])];
  if (!outDir) {
    return { status: "not-attempted", complete: false, expected, present: [], missing: expected };
  }
  const present = expected.filter((name) => {
    const p = join(outDir, name);
    return existsSync(p) && statSync(p).isFile();
  });
  const missing = expected.filter((name) => !present.includes(name));
  let status = "complete";
  if (missing.length === expected.length && expected.length > 0) status = "not-attempted";
  else if (missing.length) status = "incomplete";
  return { status, complete: missing.length === 0, expected, present, missing };
}

function classifyTransport({ result, report, spawn }) {
  if (spawn?.timedOut || result?.code === "engine-timeout") return "timeout";
  if (spawn && spawn.status == null && spawn.signal) return "engine-crash";
  if (result?.code === "wrapper-unreadable") return "engine-crash";
  if (result?.code === "kit-acquisition-failed") return "acquisition-failed";
  if (result?.code && WRAPPER_REJECT_CODES.has(result.code)) return "rejected";
  if (result?.code === "internal-error") return "internal-error";
  const msg = `${result?.error || ""} ${spawn?.stderr || ""}`;
  if (/archive sha256|timeout waiting for useful-jobs|tar extract failed/i.test(msg)) {
    return "acquisition-failed";
  }
  if (report) return "ok";
  if (result?.ok === true) return "ok";
  if (spawn && spawn.status !== 0) return "engine-crash";
  return "internal-error";
}

function classifyAnalysis(result, report) {
  if (result?.analysis && typeof result.analysis === "object" && result.analysis.status) {
    return result.analysis;
  }
  if (!report) {
    return {
      status: "not-run",
      outcome: result?.code || "not-run",
      identityVerified: null,
    };
  }
  const identityVerified =
    typeof report.identityVerified === "boolean" ? report.identityVerified : null;
  if (report.ok === false || report.refused === true) {
    return { status: report.status || "refused", outcome: "refused", identityVerified };
  }
  if (report.status === "informational" || report.status === "partial") {
    return { status: report.status, outcome: report.status, identityVerified };
  }
  if (report.status === "actionable") {
    return { status: "actionable", outcome: "actionable", identityVerified };
  }
  return { status: report.status || "completed", outcome: "completed", identityVerified };
}

/**
 * Consumer-side view of an SDS52 wrapper result.
 * If D01 fields are already present they are recorded, not invented.
 * Transport failure is never labelled a useful analysis outcome.
 */
export function classifyWrapperResult(result, { expectedOutputs = [], outDir = null, spawn = null } = {}) {
  const report = engineReport(result);
  const delivery =
    result?.delivery && typeof result.delivery === "object"
      ? result.delivery
      : assessDelivery(expectedOutputs, outDir);
  const transport = result?.transport || classifyTransport({ result, report, spawn });
  const analysis = classifyAnalysis(result, report);
  const crashLike = ["engine-crash", "timeout", "acquisition-failed", "internal-error"].includes(
    transport,
  );
  const sold = result?.sold === true;
  const sample = result?.sample === true;
  const wrapperOk = result?.ok === true;
  const validNoChange = transport === "ok" && analysis.outcome === "informational" && delivery.complete;
  const validRefusal = analysis.outcome === "refused" && !crashLike;
  const usefulDelivery =
    wrapperOk && delivery.complete && sold === false && sample !== true && !crashLike;

  return {
    transport,
    analysis,
    delivery,
    sold: sold === true,
    sample,
    wrapperOk,
    crashLike,
    validNoChange,
    validRefusal,
    usefulDelivery,
    engineDigest: report?.digest || null,
    inputsDigest: result?.receipt?.inputsDigest || null,
    outputsDigest: result?.receipt?.outputsDigest || null,
    contract: result?.contract || null,
    fundingState: result?.fundingState || null,
    code: result?.code || null,
  };
}

export function classifySpawnFailure(spawn) {
  const stderr = String(spawn?.stderr || "");
  const stdout = String(spawn?.stdout || "");
  const timedOut = spawn?.timedOut === true;
  const transport = timedOutTransport(spawn, stderr);
  return {
    ok: false,
    refused: true,
    code: timedOut ? "engine-timeout" : /archive sha256|tar extract/i.test(stderr) ? "kit-acquisition-failed" : "wrapper-unreadable",
    error: stderr.trim() || stdout.trim() || `wrapper exit ${spawn?.status} signal ${spawn?.signal}`,
    sold: false,
    sample: false,
    fundingState: "rejected",
    outputs: [],
    engine: null,
    receipt: null,
    _spawn: spawn,
    _classified: classifyWrapperResult(
      {
        ok: false,
        sold: false,
        code: timedOut ? "engine-timeout" : "wrapper-unreadable",
        error: stderr || stdout,
      },
      { spawn: { ...spawn, timedOut } },
    ),
  };
}

function timedOutTransport(spawn, stderr) {
  if (spawn?.timedOut) return "timeout";
  if (spawn?.signal) return "engine-crash";
  if (/archive sha256|tar extract failed|timeout waiting for useful-jobs/i.test(stderr)) {
    return "acquisition-failed";
  }
  return "engine-crash";
}
