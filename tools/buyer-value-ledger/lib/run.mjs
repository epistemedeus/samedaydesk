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
import { createEngineAdapter, getCatalogJob, engineProvenance, measureOutputs } from "./engine.mjs";
import { createSettlementAdapter, joinSettlement } from "./settlements.mjs";
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
  const work = request.outDir || mkdtempSync(join(tmpdir(), `bvl-${jobId}-`));
  mkdirSync(work, { recursive: true });

  const spawned = await engine.run(jobId, {
    files,
    example,
    outDir: work,
    kitOptions: request.kitOptions || {},
  });

  const engineOk = spawned.status === 0 && spawned.json?.ok === true;
  const measured = measureOutputs(work, job.outputs);
  const usableOutput = engineOk && measured.usableOutput;

  let settlementRecords = [];
  if (adapters.settlementRecords) {
    settlementRecords = adapters.settlementRecords;
  } else {
    const loaded = await settlements.load();
    settlementRecords = loaded.records;
  }

  const settlementJoin = joinSettlement({
    operationId: request.operationId || request["operation-id"] || null,
    records: settlementRecords,
  });

  const canonical = canonicalRequest({ jobId, buyerClass: labelled.buyerClass, example, files });
  const requestHash = hashRequest(canonical);

  const row = {
    schema: SCHEMA_ROW,
    runId: `bvl_${randomBytes(8).toString("hex")}`,
    jobId,
    buyerClass: labelled.buyerClass,
    sample: example,
    independentDemand: false,
    organicDemand: false,
    prohibitedInferences: [...PROHIBITED_INFERENCES],
    durationMs: Math.round(spawned.durationMs),
    outputBytes: measured.outputBytes,
    outputs: measured.outputs,
    usableOutput,
    engine: {
      ok: engineOk,
      status: spawned.json?.status || null,
      exitCode: spawned.status,
      digest: spawned.json?.digest || null,
      ...engineProvenance(),
      kitSource: spawned.kitSource,
    },
    settlementJoin,
    jobRevenueUsdc: null,
    citedBankedUsdcIsNotJobRevenue: true,
    requestHash,
    hashTerms: hashTermsProvenance(),
    evidence: {
      callerInputs: example ? "example-sample" : "fixture",
      jobExecution: "local-runtime",
      kitSource: spawned.kitSource === "local-http" ? "local-http" : "local-file",
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
    ok: engineOk,
    refused: !engineOk,
    row,
    ledgerPath: request.ledgerPath || null,
    honesty: honestyEnvelope({ kitSource: spawned.kitSource }),
    engineStdout: spawned.stdout,
    engineStderr: spawned.stderr,
  };
}
