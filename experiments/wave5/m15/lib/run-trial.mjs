import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { classifyInvocation, trialExecutionOk } from "./classify.mjs";
import { ENGINE_OUTPUTS, REPORT_JSON, TRIAL_SCHEMA, TRIAL_SCHEMA_VERSION, loadPins } from "./pins.mjs";
import { IncompleteEngine, stageEngine } from "./stage-engine.mjs";

export function spawnEngine(bin, args, { cwd, timeoutMs = 30_000 } = {}) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd,
  });
  const timedOut = Boolean(result.error && result.error.code === "ETIMEDOUT");
  return {
    spawnError: timedOut ? null : result.error || null,
    timedOut,
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function runEngineCompare({ engine, before, after, used, outDir, extraArgs = [] } = {}) {
  mkdirSync(outDir, { recursive: true });
  const args = ["--before", before, "--after", after, "--used", used, "--out-dir", outDir, ...extraArgs];
  const spawned = spawnEngine(engine.bin, args, { cwd: engine.root });
  const classified = classifyInvocation({
    ...spawned,
    outputJsonExists: existsSync(join(outDir, ENGINE_OUTPUTS[0])),
    outputMdExists: existsSync(join(outDir, ENGINE_OUTPUTS[1])),
  });
  return { args, spawned, classified };
}

export function buildReport({
  command,
  pair = null,
  corpusCase = null,
  engine,
  classified,
  spawned,
  args,
  outDir,
  pins,
} = {}) {
  const briefPath = join(outDir, ENGINE_OUTPUTS[0]);
  const brief = existsSync(briefPath) ? JSON.parse(readFileSync(briefPath, "utf8")) : null;
  return {
    schema: TRIAL_SCHEMA,
    schemaVersion: TRIAL_SCHEMA_VERSION,
    assignment: "W5-M15",
    command,
    fieldPhase: pins.field.status,
    maintainerUsefulness: "unknown",
    messagesSent: false,
    sold: false,
    purchaseAuthority: false,
    customerBrief: false,
    postgres: pins.postgres,
    engine: {
      wave4Id: pins.m02.wave4Id,
      wave5Id: pins.m02.wave5Id,
      sha: engine.sha,
      method: engine.method,
      bin: engine.bin,
      package: pins.m02.package,
    },
    pair: pair
      ? {
          id: pair.id,
          source: pair.source,
        }
      : null,
    corpusCase: corpusCase
      ? {
          id: corpusCase.id,
          prediction: corpusCase.meta?.prediction || null,
        }
      : null,
    invocation: {
      argv: args,
      isolated: engine.method !== "monorepo-path",
      exitCode: spawned.exitCode,
    },
    outcome: {
      kind: classified.kind,
      analysisStatus: classified.analysisStatus,
      refuseCode: classified.refuseCode,
      reason: classified.reason,
      engineOk: classified.engineOk,
      trialExecutionOk: trialExecutionOk(classified),
      termsVersion: brief?.termsVersion || classified.parsed?.termsVersion || null,
      breaking: classified.parsed?.breaking ?? brief?.impact?.breaking?.length ?? null,
      unknown: classified.parsed?.unknown ?? brief?.impact?.unknown?.length ?? null,
    },
    remainingBindings: [
      { id: "W5-M02", status: "tested-at-pin", sha: pins.m02.sha },
      { id: "W5-M06", status: pins.m06.status },
      { id: "W5-D24", status: pins.d24.status },
      { id: "F", status: "owner-dry-run-only" },
    ],
    outputs: {
      outDir,
      report: join(outDir, REPORT_JSON),
      driftBriefJson: existsSync(briefPath),
      driftBriefMd: existsSync(join(outDir, ENGINE_OUTPUTS[1])),
    },
  };
}

export function writeReport(report, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, REPORT_JSON);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export function prepareEngine({ dest, env = process.env } = {}) {
  return stageEngine({ dest, env });
}

export { IncompleteEngine, stageEngine, resolve };
