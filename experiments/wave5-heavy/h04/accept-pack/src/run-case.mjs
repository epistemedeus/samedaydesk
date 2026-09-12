import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { COMPOSITION_SHA, m01RunJobPath, observedCompositionSha } from "../../src/m01.mjs";
import { M01_WORKTREE } from "../../src/paths.mjs";
import { runCaptured, listFiles } from "../../src/runner.mjs";
import { PROMISED } from "./promised.mjs";
import { PACK_ROOT } from "./load-cases.mjs";

function resolveInput(dir, value) {
  if (value == null || typeof value !== "string") return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (isAbsolute(value)) return value;
  return resolve(dir, value);
}

function parseWrapper(stdout) {
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

export function promisedFor(engineId) {
  return PROMISED[engineId] || [];
}

export function missingPromised(outDir, engineId) {
  return promisedFor(engineId).filter((name) => !existsSync(join(outDir, name)));
}

/**
 * Delivery fails when promised catalog outputs are absent, even if stdout looked ok.
 */
export function deliveryStatus({ engineId, outDir, wrapper, exitCode }) {
  const missing = missingPromised(outDir, engineId);
  const refused =
    exitCode === 2 ||
    wrapper?.outcome?.kind === "refused" ||
    wrapper?.refuseJson?.refused === true;
  if (refused) {
    return {
      kind: "refused",
      pass: true,
      code: wrapper?.outcome?.code || wrapper?.refuseJson?.code || null,
      note: "Product refusal is a useful output, not a delivery failure.",
    };
  }
  if (missing.length) {
    return {
      kind: "incomplete-delivery",
      pass: false,
      code: "missing-promised-output",
      missing,
      note: "Empty or missing promised output must fail delivery.",
    };
  }
  if (wrapper?.outcome?.kind === "incomplete-delivery") {
    return { kind: "incomplete-delivery", pass: false, code: wrapper.outcome.code, missing };
  }
  if (exitCode === 0 && wrapper?.ok) {
    return { kind: "analysis", pass: true, analysis: wrapper?.outcome?.analysis || null };
  }
  return { kind: "transport-failure", pass: false, exitCode };
}

export function buildArgv(caseRow, outDir) {
  const engineId = caseRow.engineId || caseRow.m01EngineId || "lockfile-pin-delta";
  const args = [engineId];
  const inputs = caseRow.inputs || {};
  for (const key of ["before", "after", "used", "job", "fields", "clock"]) {
    if (inputs[key]) args.push(`--${key}`, String(resolveInput(caseRow.dir, inputs[key])));
  }
  const extra = !Array.isArray(caseRow.extraArgs) && caseRow.extraArgs && typeof caseRow.extraArgs === "object"
    ? caseRow.extraArgs
    : {};
  for (const [flag, camel] of [
    ["max-bytes", "maxBytes"],
    ["max-stale-ms", "maxStaleMs"],
    ["max-changes", "maxChanges"],
    ["max-json-depth", "maxJsonDepth"],
  ]) {
    const v = extra[camel] ?? extra[flag] ?? caseRow[camel];
    if (v != null && v !== false) args.push(`--${flag}`, String(v));
  }
  if (Array.isArray(caseRow.extraArgs)) args.push(...caseRow.extraArgs);
  if (Array.isArray(caseRow.extraArgv)) args.push(...caseRow.extraArgv);
  args.push("--out-dir", outDir);
  return args;
}

export async function runAcceptCase(caseRow, { worktree = M01_WORKTREE, runsRoot } = {}) {
  const engineId = caseRow.engineId || caseRow.m01EngineId || "lockfile-pin-delta";
  const runs = runsRoot || join(PACK_ROOT, "runs");
  const outDir = join(runs, caseRow.id, "out");
  mkdirSync(outDir, { recursive: true });
  const cli = m01RunJobPath(worktree);
  const args = buildArgv(caseRow, outDir);
  const captured = await runCaptured({
    argv: [process.execPath, cli, ...args],
    cwd: worktree,
    timeoutMs: 120_000,
    outDir,
  });
  const wrapper = parseWrapper(captured.stdout);
  const delivery = deliveryStatus({
    engineId,
    outDir,
    wrapper,
    exitCode: captured.exitCode,
  });
  const record = {
    id: caseRow.id,
    engineId,
    compositionSha: COMPOSITION_SHA,
    observedSha: observedCompositionSha(worktree),
    argv: captured.argv,
    cwd: captured.cwd,
    exitCode: captured.exitCode,
    durationMs: captured.durationMs,
    stdoutBytes: Buffer.byteLength(captured.stdout || ""),
    stderrBytes: Buffer.byteLength(captured.stderr || ""),
    outDirFiles: listFiles(outDir),
    promised: promisedFor(engineId),
    delivery,
    outcomeKind: wrapper?.outcome?.kind || delivery.kind,
    analysis: wrapper?.outcome?.analysis || null,
    refuseCode: wrapper?.outcome?.code || wrapper?.refuseJson?.code || null,
  };
  writeFileSync(join(runs, caseRow.id, "stdout.txt"), captured.stdout || "");
  writeFileSync(join(runs, caseRow.id, "stderr.txt"), captured.stderr || "");
  writeFileSync(join(runs, caseRow.id, "meta.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** Simulate missing promised output after a successful run (does not patch M01). */
export function simulateMissingOutput(outDir, engineId) {
  const promised = promisedFor(engineId);
  const target = promised[0];
  if (!target) return { simulated: false };
  const path = join(outDir, target);
  if (existsSync(path)) rmSync(path);
  const missing = missingPromised(outDir, engineId);
  return {
    simulated: true,
    removed: target,
    missing,
    deliveryMustFail: missing.length > 0,
  };
}
