import { copyFileSync, existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CatalogRefuse, getEngine, loadCatalog } from "./catalog.mjs";
import { d01AnalysisStatus } from "./contract.mjs";
import { invokeEngine } from "./invoke.mjs";
import { MODULE_ROOT } from "./paths.mjs";

export const D01_INJECTION = Object.freeze({
  status: "required",
  contract: "samedaydesk.paid-useful-jobs.execution.v1",
  testedWrapperSha: "6bed72dd22a396134aa5c957933b42c3a5746698",
  files: ["server/paid-useful-jobs/lib/wrapper.mjs", "server/paid-useful-jobs/lib/input-guard.mjs"],
  reason:
    "createExecutor injects acquireKit and runEngine only. getJob and materializeInputs always read the PR51 live catalog, so selected M01 engines are unknown-job before runEngine runs.",
  consumption:
    "createExecutor({ getJob: createM01AwareGetJob(d01GetJob), runEngine: runEngineForD01, acquireKit: () => MODULE_ROOT })",
  wrapperHunk: `export function createExecutor(deps = {}) {
  const acquireKit = deps.acquireKit || ensureUsefulJobsKit;
  const runEngine = deps.runEngine || runEngineJob;
  const resolveJob = deps.getJob || getJob;
  ...
      job = resolveJob(jobId);
  ...
      const materialized = materializeInputs(jobId, request, join(work, "inputs"), { getJob: resolveJob });
`,
  inputGuardHunk: `export function materializeInputs(jobId, request, workDir, deps = {}) {
  const job = (deps.getJob || getJob)(jobId);
`,
  optionalRefuseHunk:
    "If analysis.outcome is refused, return the engine refuse code instead of missing-output when promised files were never written. HTML lockfiles and page-change stderr refusals do not emit pin-delta.json / page-change.json.",
});

export function toD01Job(engine) {
  const required = (engine.cli.requiredInputs || []).filter((key) => key !== "outDir");
  return {
    id: engine.id,
    title: engine.id,
    summary: engine.notes?.[0] || engine.id,
    requiredInputs: Object.freeze(required.map((key) => `--${key}`)),
    optionalInputs: Object.freeze(["--example"]),
    outputs: Object.freeze(engine.outputs.map((row) => row.name)),
    exampleFlag: "--example",
    notes: engine.notes?.join(" ") || "",
    m01: true,
    pin: engine.pin,
  };
}

export function createM01AwareGetJob(d01GetJob) {
  const catalog = loadCatalog();
  const selected = new Set(catalog.engines.map((engine) => engine.id));
  return function m01AwareGetJob(jobId) {
    if (selected.has(jobId)) return toD01Job(getEngine(jobId, catalog));
    return d01GetJob(jobId);
  };
}

function engineJsonForD01(engine, result) {
  if (result.outcome.kind === "refused") {
    const refuse = result.refuseJson || {};
    return {
      ok: false,
      refused: true,
      code: refuse.code || result.outcome.code,
      error: refuse.error || refuse.message || result.outcome.code,
      status: "refused",
      ...refuse,
    };
  }
  if (result.outcome.kind === "transport-failure") {
    return result.stdoutJson;
  }
  const stdout = result.stdoutJson || {};
  return {
    ...stdout,
    ok: true,
    status: d01AnalysisStatus(engine, stdout),
  };
}

export function runEngineForD01(jobId, { files = {}, example = false, outDir, timeoutMs = 120_000 } = {}) {
  const engine = getEngine(jobId);
  const result = invokeEngine({
    engineId: jobId,
    outDir,
    example: example === true,
    mode: files.job && !files.before ? "job" : files.fields ? "compare" : undefined,
    timeoutMs,
    inputs: {
      before: files.before,
      after: files.after,
      used: files.used,
      job: files.job,
      fields: files.fields,
      clock: files.clock,
    },
  });
  const json = engineJsonForD01(engine, result);
  return {
    status: result.spawn.status,
    stdout: result.spawn.stdout || "",
    stderr: result.spawn.stderr || "",
    json,
    timedOut: false,
    signal: null,
    kit: MODULE_ROOT,
    cli: result.spawn.bin,
    args: result.spawn.argv,
    m01: result,
  };
}

function stageInputs(job, request, workDir) {
  mkdirSync(workDir, { recursive: true });
  const example = request?.example === true || request?.example === "true";
  const raw = request?.inputs && typeof request.inputs === "object" ? { ...request.inputs } : {};
  const required = (job.requiredInputs || []).map((flag) => String(flag).replace(/^--/, ""));
  if (!example) {
    const missing = required.filter((key) => raw[key] == null || raw[key] === "");
    if (missing.length) {
      const err = new Error(`Caller mode requires ${required.join(", ")}`);
      err.code = "missing-required-inputs";
      throw err;
    }
  }
  const files = {};
  const keys = new Set([...required, "before", "after", "used", "job", "fields", "clock"]);
  for (const key of keys) {
    const value = raw[key];
    if (value == null || value === "") continue;
    if (key === "fields" || key === "clock") {
      files[key] = value;
      continue;
    }
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      files[key] = value;
      continue;
    }
    if (typeof value === "string" && existsSync(value) && statSync(value).isFile()) {
      const staged = join(workDir, `${key}${value.endsWith(".html") ? ".html" : ".json"}`);
      copyFileSync(value, staged);
      files[key] = staged;
    } else {
      const staged = join(workDir, `${key}.json`);
      writeFileSync(staged, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
      files[key] = staged;
    }
  }
  return { example, files };
}

/**
 * D01-shaped execution over M01 engines. Uses D01 classify* when provided.
 * Does not claim a live sale. Unpatched D01 createExecutor cannot select these jobs.
 */
export async function runCatalogPaidOffer(request = {}, d01Contract = null) {
  const executionId = request.executionId || `m01-${Date.now()}`;
  const jobId = request.jobId;
  if (!jobId) {
    return {
      ok: false,
      refused: true,
      jobId: null,
      code: "missing-job",
      sold: false,
      contract: D01_INJECTION.contract,
      executionId,
    };
  }
  let engine;
  try {
    engine = getEngine(jobId);
  } catch (err) {
    if (err instanceof CatalogRefuse) {
      return {
        ok: false,
        refused: true,
        jobId,
        code: "unknown-job",
        error: err.message,
        sold: false,
        contract: D01_INJECTION.contract,
        executionId,
      };
    }
    throw err;
  }
  const job = toD01Job(engine);
  const work = mkdtempSync(join(tmpdir(), `m01-${jobId}-`));
  const runOutDir = request.outDir || mkdtempSync(join(tmpdir(), `m01-${jobId}-out-`));
  let staged;
  try {
    staged = stageInputs(job, request, join(work, "inputs"));
  } catch (err) {
    return {
      ok: false,
      refused: true,
      jobId,
      code: err.code || "missing-required-inputs",
      error: err.message,
      sold: false,
      contract: D01_INJECTION.contract,
      executionId,
    };
  }
  const engineResult = runEngineForD01(jobId, {
    files: staged.files,
    example: staged.example,
    outDir: runOutDir,
  });
  const delivery = d01Contract?.assessDelivery
    ? d01Contract.assessDelivery(job.outputs, runOutDir)
    : { status: "complete", complete: engineResult.m01.outcome.kind === "analysis", expected: job.outputs };
  const transport = d01Contract?.classifyTransport
    ? d01Contract.classifyTransport({ engine: engineResult })
    : engineResult.json
      ? "ok"
      : "engine-crash";
  const analysis = d01Contract?.classifyAnalysis
    ? d01Contract.classifyAnalysis({ engine: engineResult, delivery })
    : {
        status: engineResult.json?.status || "completed",
        outcome: engineResult.m01.outcome.kind === "refused" ? "refused" : engineResult.json?.status || "completed",
      };

  if (transport !== "ok") {
    return {
      ok: false,
      refused: true,
      jobId,
      code: transport === "timeout" ? "engine-timeout" : "engine-crash",
      sold: false,
      purchaseAuthority: false,
      transport,
      analysis,
      delivery,
      engine: engineResult.json,
      executionId,
      contract: D01_INJECTION.contract,
      d01Injection: D01_INJECTION,
    };
  }

  if (analysis.outcome === "refused" || engineResult.json?.refused === true) {
    return {
      ok: false,
      refused: true,
      jobId,
      code: engineResult.json?.code || "refused",
      error: engineResult.json?.error || engineResult.json?.message || "engine refused",
      sold: false,
      purchaseAuthority: false,
      transport,
      analysis,
      delivery,
      engine: engineResult.json,
      executionId,
      contract: D01_INJECTION.contract,
      d01Injection: D01_INJECTION,
    };
  }

  const ok = transport === "ok" && delivery.complete === true;
  return {
    ok,
    refused: !ok,
    jobId,
    code: ok ? null : "missing-output",
    sold: false,
    purchaseAuthority: false,
    transport,
    analysis,
    delivery,
    engine: engineResult.json,
    outputs: job.outputs.filter((name) => existsSync(join(runOutDir, name))),
    runOutDir,
    executionId,
    contract: D01_INJECTION.contract,
    d01Injection: D01_INJECTION,
  };
}
