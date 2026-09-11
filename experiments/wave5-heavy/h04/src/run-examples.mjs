import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { RUNS_DIR } from "./paths.mjs";
import { loadCatalog } from "./catalog.mjs";
import { compareRun } from "./compare.mjs";
import { getEngine, loadEngines, worktreeSha } from "./engines.mjs";
import { runEngine } from "./runner.mjs";

function resolveInput(dir, value) {
  if (value == null || value === false || value === true) return value;
  if (typeof value !== "string") return value;
  if (isAbsolute(value)) return value;
  return resolve(dir, value);
}

function defaultPageFields(example) {
  if (example.fields) {
    return Array.isArray(example.fields) ? example.fields.join(",") : String(example.fields);
  }
  if (example.inputs?.fields) return String(example.inputs.fields);
  return "title,description,headings";
}

function defaultPageClock(example) {
  return example.clock || example.inputs?.clock || "2026-09-08T12:00:00.000Z";
}

export function buildExampleArgv(engine, example, { outDir, jobId } = {}) {
  const args = [];
  if (engine.id === "sds52-paid-useful-jobs" || (engine.aliases || []).includes("sds52")) {
    const job = jobId || example.jobId || example.job || "vendor-budget-impact";
    args.push("run", job);
  }
  if (engine.id === "w4-page-change-offline-job" || (engine.aliases || []).includes("w4-pages")) {
    const command =
      example.command ||
      (example.inputs?.job || example.job ? "job" : "compare");
    args.push(command);
  }
  if (example.example === true || example.sample === true) args.push("--example");

  const inputs = example.inputs && typeof example.inputs === "object" ? example.inputs : {};
  for (const [key, value] of Object.entries(inputs)) {
    if (key === "fields" || key === "clock") continue;
    if (value == null || value === false) continue;
    if (value === true) {
      args.push(`--${key}`);
      continue;
    }
    args.push(`--${key}`, String(resolveInput(example.dir, value)));
  }

  if (engine.family === "page-facts" || engine.id === "w4-page-change-offline-job") {
    if (!args.includes("--fields") && (args[0] === "compare" || example.fields)) {
      args.push("--fields", defaultPageFields(example));
    }
    if (!args.includes("--clock") && args[0] !== "journey") {
      args.push("--clock", defaultPageClock(example));
    }
  }

  if (outDir && !args.includes("--out-dir")) args.push("--out-dir", outDir);
  if (Array.isArray(example.extraArgs)) args.push(...example.extraArgs);
  return args;
}

const SDS52_JOBS = new Set([
  "api-upgrade-brief",
  "vendor-budget-impact",
  "feed-agenda",
  "evidence-ci-annotation",
  "listing-repair-packet",
  "repeat-job-record",
]);

function resolveEngineRef(id, engines) {
  if (!id) return null;
  if (SDS52_JOBS.has(id) || /^sds52-(?!paid-useful-jobs$|wrapper$).+/.test(id)) {
    const jobId = SDS52_JOBS.has(id) ? id : id.replace(/^sds52-/, "");
    const engine = getEngine("sds52-paid-useful-jobs", engines);
    return engine ? { engine, jobId } : null;
  }
  const engine = getEngine(id, engines);
  return engine ? { engine, jobId: exampleJobFromEngine(engine, id) } : null;
}

function exampleJobFromEngine(engine, id) {
  if (engine.id !== "sds52-paid-useful-jobs") return null;
  if (SDS52_JOBS.has(id)) return id;
  return null;
}

function enginesForExample(example, engines) {
  const ids = example.engines || example.engineId || example.engine;
  if (Array.isArray(ids) && ids.length) {
    return ids.map((id) => resolveEngineRef(id, engines)).filter(Boolean);
  }
  if (typeof ids === "string") {
    const found = resolveEngineRef(ids, engines);
    return found ? [found] : [];
  }
  return engines
    .filter((e) => e.family === example.family)
    .map((engine) => ({ engine, jobId: example.jobId || example.job || null }));
}

export async function runCatalog({
  examplesDir,
  runsDir = RUNS_DIR,
  engines: engineList,
} = {}) {
  const loaded = engineList ? { engines: engineList, source: "provided" } : loadEngines();
  const catalog = loadCatalog({ examplesDir });
  mkdirSync(runsDir, { recursive: true });
  const summary = {
    at: new Date().toISOString(),
    source: loaded.source,
    exampleCount: catalog.examples.length,
    missingFamilies: catalog.missingFamilies,
    catalogErrors: catalog.errors,
    runs: [],
  };

  for (const example of catalog.examples) {
    const targets = enginesForExample(example, loaded.engines);
    if (!targets.length) {
      summary.runs.push({
        exampleId: example.id,
        engineId: null,
        exitCode: null,
        ok: false,
        compare: { result: "unknown", reason: "no-engine-for-example" },
      });
      continue;
    }
    for (const target of targets) {
      const engine = target.engine;
      const runDir = join(runsDir, example.id, engine.id);
      const outDir = join(runDir, "out");
      mkdirSync(outDir, { recursive: true });
      const args = buildExampleArgv(engine, example, { outDir, jobId: target.jobId });
      const executedSha = worktreeSha(engine.worktree);
      const { captured, meta } = await runEngine({
        engine,
        args,
        runDir,
        outDir,
        sample: example.example === true || example.sample === true,
        phase: "run",
        note: example.kind ? `kind=${example.kind}` : null,
        executedSha,
      });
      const compare = compareRun({
        expectedPath: example.expectedReportPath,
        example,
        outDir,
        stdout: captured.stdout,
        stderr: captured.stderr,
        exitCode: captured.exitCode,
      });
      writeFileSync(join(runDir, "compare.json"), `${JSON.stringify(compare, null, 2)}\n`);
      summary.runs.push({
        exampleId: example.id,
        engineId: engine.id,
        sha: engine.sha,
        executedSha,
        exitCode: captured.exitCode,
        ok: captured.ok === true && captured.exitCode === 0,
        durationMs: captured.durationMs,
        compare: compare.result,
        outDirFiles: captured.outDirFiles,
        stdoutPreview: meta.stdoutPreview,
      });
    }
  }

  writeFileSync(join(runsDir, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}
