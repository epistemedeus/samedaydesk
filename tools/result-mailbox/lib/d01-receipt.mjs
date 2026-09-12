import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Bytes } from "./digest.mjs";
import { refuse, isPlainObject } from "./errors.mjs";
import {
  D01_EXECUTION_CONTRACT,
  D01_RECEIPT_PIN,
  D01_RECEIPT_PR,
  D01_RECEIPT_SCHEMA,
  SHA256_HEX_RE,
  USEFUL_JOBS_CATALOG_PATH,
} from "./pins.mjs";
import { seedFromOutDir } from "./seed.mjs";

export const D01_RESULT_CONTRACT = Object.freeze({
  owner: "W5-D01",
  repo: "epistemedeus/samedaydesk",
  sha: D01_RECEIPT_PIN,
  pr: D01_RECEIPT_PR,
  contract: D01_EXECUTION_CONTRACT,
  receiptSchema: D01_RECEIPT_SCHEMA,
  note: "Current D01 execution.v1 pin. Mailbox maps a complete execution result plus outDir to an envelope. Does not import wrapper.mjs. Useful analysis refusal with complete artifacts is retrievable; crash and missing output are not.",
});

function listedOutputs(value) {
  const rows = Array.isArray(value?.outputs) ? value.outputs : [];
  return rows.filter((item) => isPlainObject(item) && typeof item.name === "string" && item.name);
}

function assertOutputSchema(item) {
  if (!isPlainObject(item) || typeof item.name !== "string" || !item.name) {
    throw refuse("invalid-d01-execution", "D01 output requires a basename name");
  }
  if (item.name.includes("/") || item.name.includes("\\") || item.name === "." || item.name === "..") {
    throw refuse("invalid-d01-execution", `D01 output name is not a basename: ${item.name}`);
  }
  if (!Number.isSafeInteger(item.bytes) || item.bytes < 0) {
    throw refuse("invalid-d01-execution", `D01 output ${item.name} bytes must be a non-negative integer`);
  }
  if (typeof item.sha256 !== "string" || !SHA256_HEX_RE.test(item.sha256)) {
    throw refuse("invalid-d01-execution", `D01 output ${item.name} sha256 must be 64 lowercase hex`);
  }
  return item;
}

export function asD01Execution(value) {
  if (!isPlainObject(value)) {
    throw refuse("invalid-d01-execution", "D01 execution result must be a JSON object");
  }
  if (value.schema !== D01_RECEIPT_SCHEMA && value.contract === D01_EXECUTION_CONTRACT && typeof value.jobId === "string") {
    return value;
  }
  if (
    value.schema === D01_RECEIPT_SCHEMA &&
    value.contract === D01_EXECUTION_CONTRACT &&
    typeof value.jobId === "string"
  ) {
    return {
      ok: value.delivery?.complete === true && value.transport === "ok",
      jobId: value.jobId,
      contract: value.contract,
      transport: value.transport,
      analysis: value.analysis,
      delivery: value.delivery,
      outputs: value.outputs,
      receipt: value,
      sample: value.sample === true,
      sampleReasons: value.sampleReasons || [],
      engine: value.engine,
      outDir: value.outDir,
      executionId: value.executionId || null,
      sold: false,
    };
  }
  throw refuse(
    "invalid-d01-execution",
    `need ${D01_EXECUTION_CONTRACT} (full result or receipt.v1 that carries that contract). aeef964 receipt.v1 without contract/delivery is not accepted`,
  );
}

export function assertD01ExecutionRetrievable(execution) {
  const exec = asD01Execution(execution);
  if (typeof exec.jobId !== "string" || !exec.jobId) {
    throw refuse("invalid-d01-execution", "D01 execution jobId is required");
  }
  if (exec.receipt && exec.receipt.schema && exec.receipt.schema !== D01_RECEIPT_SCHEMA) {
    throw refuse(
      "invalid-d01-execution",
      `nested receipt schema must be ${D01_RECEIPT_SCHEMA}, not mailbox envelope terms`,
    );
  }
  if (exec.transport !== "ok") {
    throw refuse(
      "d01-transport-not-retrievable",
      `D01 transport ${exec.transport || "unknown"} cannot be stored as useful delivery`,
      {
        status: "d01-transport-not-retrievable",
        detail: {
          transport: exec.transport || null,
          code: exec.code || null,
          analysis: exec.analysis || null,
        },
      },
    );
  }
  if (!exec.delivery || exec.delivery.complete !== true) {
    throw refuse(
      "d01-missing-output",
      "D01 delivery is not complete; missing or crashed output cannot be picked up",
      {
        status: "d01-missing-output",
        detail: {
          delivery: exec.delivery || null,
          code: exec.code || null,
          analysis: exec.analysis || null,
        },
      },
    );
  }
  const outputs = listedOutputs(exec);
  if (outputs.length < 1) {
    throw refuse("d01-missing-output", "D01 execution lists no outputs");
  }
  outputs.forEach(assertOutputSchema);
  if (outputs.length !== exec.outputs.length || new Set(outputs.map((o) => o.name)).size !== outputs.length) {
    throw refuse("invalid-d01-execution", "Output identity contains invalid or duplicate rows");
  }
  const catalog = JSON.parse(readFileSync(USEFUL_JOBS_CATALOG_PATH, "utf8"));
  const job = catalog.jobs.find((j) => j.id === exec.jobId);
  if (!job || job.outputs.length !== outputs.length || job.outputs.some((name) => !outputs.some((o) => o.name === name))) {
    throw refuse("invalid-d01-execution", "D01 output names do not match the authoritative job catalog");
  }
  if (exec.receipt) {
    const nested = exec.receipt;
    if (nested.jobId !== exec.jobId || nested.contract !== exec.contract ||
        nested.transport !== "ok" || nested.delivery?.complete !== true ||
        (nested.executionId && exec.executionId && nested.executionId !== exec.executionId)) {
      throw refuse("invalid-d01-execution", "Nested receipt contradicts execution identity or completion");
    }
    const nestedOutputs = listedOutputs(nested);
    nestedOutputs.forEach(assertOutputSchema);
    if (nestedOutputs.length !== outputs.length || new Set(nestedOutputs.map((o) => o.name)).size !== outputs.length ||
        outputs.some((o) => !nestedOutputs.some((n) => n.name === o.name && n.bytes === o.bytes && n.sha256 === o.sha256))) {
      throw refuse("invalid-d01-execution", "Nested receipt output identity differs from execution");
    }
  }
  const expected = Array.isArray(exec.delivery.expected) ? exec.delivery.expected : outputs.map((o) => o.name);
  for (const name of expected) {
    if (!outputs.some((o) => o.name === name)) {
      throw refuse("d01-missing-output", `D01 delivery expected ${name} but outputs omit it`);
    }
  }
  return exec;
}

export function assertD01Receipt(receipt) {
  return assertD01ExecutionRetrievable(receipt);
}

export function verifyOutputBytes(outDir, listed) {
  const files = [];
  for (const item of listed) {
    const path = join(outDir, item.name);
    if (!existsSync(path)) {
      throw refuse("d01-missing-output", `D01 out-dir is missing ${item.name}`);
    }
    const buf = readFileSync(path);
    const digest = sha256Bytes(buf);
    if (typeof item.sha256 === "string" && item.sha256 !== digest) {
      throw refuse(
        "digest-mismatch",
        `D01 listed sha256 for ${item.name} does not match file bytes`,
      );
    }
    if (Number.isSafeInteger(item.bytes) && item.bytes !== buf.length) {
      throw refuse("digest-mismatch", `D01 listed bytes for ${item.name} do not match file bytes`);
    }
    files.push({ name: item.name, path, buf, bytes: buf.length, sha256: digest });
  }
  return files;
}

export function seedFromD01Execution({
  mailbox,
  requestId,
  execution,
  outDir,
  clock,
  expiresAt,
  ttlSeconds,
  payment = null,
  expectedJobId = null,
}) {
  const parsed = typeof execution === "string" ? JSON.parse(readFileSync(execution, "utf8")) : execution;
  const checked = assertD01ExecutionRetrievable(parsed);
  if (expectedJobId && expectedJobId !== checked.jobId) {
    throw refuse(
      "invalid-d01-execution",
      "seed --job-id does not match D01 execution jobId",
      { detail: { expectedJobId, executionJobId: checked.jobId } },
    );
  }
  const resolvedOut =
    outDir || checked.runOutDir || checked.receipt?.runOutDir || checked.receipt?.outDir;
  if (!resolvedOut) {
    throw refuse("d01-missing-output", "D01 execution seed requires outDir");
  }
  const files = verifyOutputBytes(resolve(resolvedOut), listedOutputs(checked));
  const d01 = {
    contract: D01_EXECUTION_CONTRACT,
    pin: D01_RECEIPT_PIN,
    executionId: checked.executionId || null,
    transport: checked.transport,
    analysis: checked.analysis || null,
    deliveryComplete: true,
    outputIdentity: files.map((f) => ({ name: f.name, bytes: f.bytes, sha256: f.sha256 })),
  };
  const seeded = seedFromOutDir({
    mailbox,
    requestId,
    jobId: checked.jobId,
    outDir: resolvedOut,
    clock,
    expiresAt,
    ttlSeconds,
    sample: checked.sample === true,
    sampleReasons: checked.sampleReasons || [],
    engine: checked.engine || checked.receipt?.engine || null,
    engineResult: {
      ok: true,
      status: checked.analysis?.status || checked.engine?.status || null,
      digest: checked.receipt?.outputsDigest || null,
      analysis: checked.analysis || null,
      transport: checked.transport,
    },
    payment,
    expectedOutputNames:
      Array.isArray(checked.delivery?.expected) && checked.delivery.expected.length
        ? checked.delivery.expected
        : files.map((f) => f.name),
    preloadedFiles: files,
    extraEnvelope: { d01 },
  });
  seeded.d01 = seeded.envelope?.d01 || d01;
  return seeded;
}

export function seedFromD01Receipt(opts) {
  const execution = opts.receipt ?? opts.execution;
  return seedFromD01Execution({ ...opts, execution });
}
