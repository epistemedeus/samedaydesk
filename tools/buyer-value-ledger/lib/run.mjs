import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  ERROR_CODES,
  PROHIBITED_INFERENCES,
  SCHEMA_ROW,
  SDS_MAIN_PIN,
} from "./pins.mjs";
import { hashRequest, hashTermsProvenance, sha256File } from "./hash-terms.mjs";
import { inspectBuyerClass, refuse } from "./labels.mjs";
import { honestyEnvelope } from "./revenue.mjs";
import { appendRow } from "./ledger.mjs";
import {
  createEngineAdapter,
  getCatalogJob,
  engineProvenance,
  measureOutputs,
  producedThisRun,
} from "./engine.mjs";
import { createSettlementAdapter, joinSettlement } from "./settlements.mjs";
import { classifyOutcome, classifyUsefulPaidWork, isAnalysisOutcome } from "./outcome.mjs";
import { d01BindingNote } from "./d01.mjs";
import { insertRow as postgresInsert } from "./postgres.mjs";

function fileDigest(filePath) {
  if (!filePath) return null;
  const buf = readFileSync(filePath);
  return { path: filePath, ...sha256File(buf) };
}

function canonicalRequest({ jobId, buyerClass, example, files }) {
  const inputs = example
    ? { example: true }
    : Object.fromEntries(
        Object.entries(files)
          .filter(([, value]) => value)
          .map(([key, filePath]) => [key, fileDigest(filePath)]),
      );
  return {
    jobId,
    buyerClass,
    example: Boolean(example),
    inputs,
  };
}

function mapPaidOffer(offer, durationMs) {
  const engineJson = offer?.engine || {
    ok: offer?.ok === true,
    status: offer?.code || offer?.receipt?.engineResult?.status || null,
    refused: offer?.refused === true,
    digest: offer?.receipt?.engineResult?.digest || null,
  };
  return {
    status: offer?.ok === true || offer?.engine?.ok === true || engineJson.ok === true ? 0 : offer?.ok === false ? 1 : 1,
    stdout: "",
    stderr: offer?.error || offer?.receipt?.error || "",
    json: engineJson,
    error: null,
    kit: null,
    kitSource: "d01-wrapper",
    kitVerified: true,
    durationMs,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    endedAt: new Date().toISOString(),
    d01Receipt: offer?.receipt || null,
  };
}

export async function runLabelledJob(request = {}, adapters = {}) {
  const labelled = inspectBuyerClass(request);
  if (!labelled.ok) return labelled;

  const jobId = request.jobId;
  if (!jobId) {
    return refuse(ERROR_CODES.UNKNOWN_JOB, "jobId is required");
  }

  let job;
  try {
    job = getCatalogJob(jobId);
  } catch (err) {
    return refuse(ERROR_CODES.UNKNOWN_JOB, err.message);
  }

  const example = request.example === true || request.example === "true";
  const files = request.files && typeof request.files === "object" ? request.files : {};
  if (!example) {
    const required = (job.requiredInputs || []).map((flag) => String(flag).replace(/^--/, ""));
    const missing = required.filter((key) => !files[key]);
    if (missing.length) {
      return refuse(
        ERROR_CODES.MISSING_REQUIRED_INPUTS,
        `caller mode requires ${required.map((k) => `--${k}`).join(", ")}; use --example for labeled fixtures`,
        { missing },
      );
    }
  }

  const engine = adapters.engine || createEngineAdapter();
  const settlements = adapters.settlements || createSettlementAdapter();
  let work;
  try {
    work = request.outDir || mkdtempSync(join(tmpdir(), `bvl-${jobId}-`));
    mkdirSync(work, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      refused: false,
      code: ERROR_CODES.ENGINE_SPAWN_FAILED,
      message: err.message,
      outcomeKind: "transport_failure",
      usefulPaidWork: false,
      usefulDelivery: false,
      independentDemand: false,
      organicDemand: false,
      jobRevenueUsdc: null,
      purchaseAuthority: false,
    };
  }

  const canonical = canonicalRequest({ jobId, buyerClass: labelled.buyerClass, example, files });
  const requestHash = hashRequest(canonical);
  const beforeOutputs = measureOutputs(work, job.outputs);

  let spawned;
  try {
    if (adapters.paidOffer) {
      const started = process.hrtime.bigint();
      const offer = await adapters.paidOffer({
        jobId,
        example,
        inputs: files,
        files,
        outDir: work,
      });
      const durationMs = Math.max(0, Number(process.hrtime.bigint() - started) / 1e6);
      spawned = mapPaidOffer(offer, durationMs);
    } else {
      spawned = await engine.run(jobId, {
        files,
        example,
        outDir: work,
        kitOptions: request.kitOptions || {},
      });
    }
  } catch (err) {
    if (err.code === ERROR_CODES.ARCHIVE_PIN_MISMATCH) {
      return refuse(ERROR_CODES.ARCHIVE_PIN_MISMATCH, err.message, {
        outcomeKind: "transport_failure",
        usefulPaidWork: false,
        usefulDelivery: false,
        kitVerified: false,
        blockers: ["wrong_source_cache"],
      });
    }
    spawned = {
      status: null,
      stdout: "",
      stderr: String(err.message || err),
      json: null,
      error: err,
      kitSource: "unknown",
      kitVerified: false,
      durationMs: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };
  }

  const outcomeKind = classifyOutcome({
    status: spawned.status,
    json: spawned.json,
    error: spawned.error,
  });
  const measured = measureOutputs(work, job.outputs);
  const produced = producedThisRun(beforeOutputs, measured);
  const usableOutput = isAnalysisOutcome(outcomeKind) && produced && measured.usableOutput;

  let settlementRecords = [];
  if (adapters.settlementRecords) {
    settlementRecords = adapters.settlementRecords;
  } else {
    const loaded = await settlements.load();
    settlementRecords = loaded.records;
  }

  const settlementJoin = joinSettlement({
    operationId: request.operationId || request["operation-id"] || null,
    jobId,
    outcomeKind,
    records: settlementRecords,
  });

  const paid = classifyUsefulPaidWork({
    kitVerified: spawned.kitVerified !== false,
    outcomeKind,
    producedThisRun: produced,
    usableOutput,
    settlementJoin,
    sample: example,
    buyerClass: labelled.buyerClass,
    purchaseAuthority: false,
  });

  const row = {
    schema: SCHEMA_ROW,
    runId: `bvl_${randomBytes(8).toString("hex")}`,
    jobId,
    buyerClass: labelled.buyerClass,
    sample: example,
    independentDemand: false,
    organicDemand: false,
    prohibitedInferences: [...PROHIBITED_INFERENCES],
    durationMs: Math.round(spawned.durationMs || 0),
    outputBytes: measured.outputBytes,
    outputs: measured.outputs,
    outputsDigest: measured.outputsDigest,
    usableOutput,
    producedThisRun: produced,
    outcomeKind,
    usefulDelivery: paid.usefulDelivery,
    usefulPaidWork: paid.usefulPaidWork,
    paidWorkBlockers: paid.blockers,
    engine: {
      ok: isAnalysisOutcome(outcomeKind),
      status: spawned.json?.status || null,
      exitCode: spawned.status,
      digest: spawned.json?.digest || null,
      ...engineProvenance(),
      kitSource: spawned.kitSource,
      kitVerified: spawned.kitVerified === true,
    },
    settlementJoin,
    jobRevenueUsdc: null,
    citedBankedUsdcIsNotJobRevenue: true,
    requestHash,
    hashTerms: hashTermsProvenance(),
    d01: d01BindingNote(),
    evidence: {
      callerInputs: example ? "example-sample" : "fixture",
      jobExecution: adapters.paidOffer ? "d01-wrapper-pin" : "local-runtime",
      kitSource: spawned.kitSource === "local-http" ? "local-http" : adapters.paidOffer ? "d01-wrapper" : "local-file",
      externalAcceptance: false,
    },
    purchaseAuthority: false,
    sdsMainPin: SDS_MAIN_PIN,
    startedAt: spawned.startedAt,
    endedAt: spawned.endedAt,
    outDir: work,
  };

  if (request.ledgerPath) {
    appendRow(request.ledgerPath, row);
  }
  if (request.postgres) {
    row.evidence.postgres = "local-runtime";
    postgresInsert(request.postgres, row);
  }

  return {
    ok: isAnalysisOutcome(outcomeKind),
    refused: outcomeKind === "analysis_refusal",
    outcomeKind,
    usefulPaidWork: paid.usefulPaidWork,
    usefulDelivery: paid.usefulDelivery,
    row,
    ledgerPath: request.ledgerPath || null,
    honesty: honestyEnvelope({ kitSource: spawned.kitSource }),
    engineStdout: spawned.stdout,
    engineStderr: spawned.stderr,
  };
}
