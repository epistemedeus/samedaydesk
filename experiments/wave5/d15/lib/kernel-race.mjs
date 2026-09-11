import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIND } from "./contract.mjs";
import { sha256Bytes, sha256File } from "../../../../server/paid-useful-jobs/lib/digest.mjs";
import {
  D01_SHA,
  SDS52_SHA,
  ensureKernelRoot,
  kernelCli,
  kernelFixture,
  importKernel,
} from "./kernels.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PRELOAD_AFTER_COPY = join(here, "mutate-after-copy.cjs");
export const PRELOAD_AFTER_INSPECT = join(here, "mutate-after-first-read.cjs");

export function shaBuf(buf) {
  return sha256Bytes(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
}

export function writableCopy(src, dest) {
  writeFileSync(dest, readFileSync(src));
  return dest;
}

export function stageKernelBudget(root) {
  const work = mkdtempSync(join(tmpdir(), "d15-kstage-"));
  const before = join(work, "before.json");
  const after = join(work, "after.json");
  writableCopy(kernelFixture(root, "caller/vendor-budget-impact/before.json"), before);
  writableCopy(kernelFixture(root, "caller/vendor-budget-impact/after.json"), after);
  return {
    work,
    before,
    after,
    inspectAfterSha: sha256File(after),
    inspectBeforeSha: sha256File(before),
  };
}

function parseJsonStdout(stdout) {
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

export function spawnKernelCli(root, { jobId, inputs, outDir, preload, racePath, overwrite, flagPath, timeoutMs = 120_000 }) {
  const args = [];
  if (preload) args.push("-r", preload);
  args.push(kernelCli(root), "run", jobId);
  for (const [key, filePath] of Object.entries(inputs || {})) {
    if (!filePath) continue;
    args.push(`--${key}`, filePath);
  }
  args.push("--funding", "unfunded");
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    args.push("--out-dir", outDir);
  }
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: root,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      D15_RACE_PATH: racePath || "",
      D15_RACE_OVERWRITE: overwrite || "",
      D15_RACE_FLAG: flagPath || "",
    },
  });
  const wrapper = parseJsonStdout(result.stdout);
  return {
    status: result.status,
    signal: result.signal,
    stderr: result.stderr || "",
    wrapper,
    transportFailure: Boolean(result.error || result.signal || wrapper == null),
    error: result.error?.message || null,
  };
}

function impactFrom(wrapper, outDir) {
  const fromOut = outDir && existsSync(join(outDir, "budget-impact.json"))
    ? JSON.parse(readFileSync(join(outDir, "budget-impact.json"), "utf8"))
    : null;
  const fromOutput = wrapper?.outputs?.find((o) => o.name === "budget-impact.json");
  const fromPath = fromOutput?.path && existsSync(fromOutput.path)
    ? JSON.parse(readFileSync(fromOutput.path, "utf8"))
    : null;
  return fromOut || fromPath;
}

export function classifyKernelRace({ inspectSha, liveSha, wrapper, impact, control }) {
  const rec = wrapper?.receipt?.inputs?.find((i) => i.name === "after") || null;
  const receiptSha = rec?.sha256 || null;
  const status = wrapper?.analysis?.status || impact?.status || wrapper?.engine?.status || null;
  const summary = impact?.summary || wrapper?.engine?.summary || null;
  const refuseCode = wrapper?.code || null;
  const inputRefuse =
    wrapper &&
    wrapper.ok === false &&
    (refuseCode === "input-changed-after-preflight" || refuseCode === "input-changed" || wrapper.refused === true) &&
    wrapper.transport === "rejected";

  if (wrapper?.transport === "engine-crash" || wrapper?.code === "engine-crash" || wrapper?.code === "engine-timeout") {
    return {
      kind: KIND.ENGINE_FAILURE,
      productAccepted: false,
      receiptSha,
      liveSha,
      inspectSha,
      status,
      summary,
      wrongReceipt: false,
    };
  }

  if (inputRefuse) {
    return {
      kind: KIND.ACCURATE_REFUSE,
      productAccepted: true,
      receiptSha,
      liveSha,
      inspectSha,
      status,
      summary,
      wrongReceipt: false,
    };
  }

  const matchesInspect = receiptSha && inspectSha && receiptSha === inspectSha;
  const matchesLive = receiptSha && liveSha && receiptSha === liveSha;
  const domainMatchesControl = Boolean(
    control && status === control.status && summary === control.summary,
  );
  const domainMatchesNoChange = status === "informational" && /fieldChanges=0/.test(String(summary || ""));

  const wrongReceipt =
    (domainMatchesControl && matchesLive && liveSha !== inspectSha) ||
    (domainMatchesNoChange && matchesInspect && liveSha !== inspectSha);

  if (matchesInspect && domainMatchesControl && liveSha !== inspectSha) {
    return {
      kind: KIND.FROZEN_CONSUMED,
      productAccepted: true,
      receiptSha,
      liveSha,
      inspectSha,
      status,
      summary,
      wrongReceipt: false,
    };
  }

  if (matchesLive && liveSha !== inspectSha) {
    return {
      kind: KIND.RACE_CONSUMED_MUTATED,
      productAccepted: false,
      receiptSha,
      liveSha,
      inspectSha,
      status,
      summary,
      wrongReceipt,
    };
  }

  return {
    kind: matchesInspect ? KIND.FROZEN_CONSUMED : KIND.RACE_CONSUMED_MUTATED,
    productAccepted: false,
    receiptSha,
    liveSha,
    inspectSha,
    status,
    summary,
    wrongReceipt,
  };
}

export function replayKernelCli(root, { window, jobId = "vendor-budget-impact" } = {}) {
  const staged = stageKernelBudget(root);
  const outDir = join(staged.work, "out");
  const flagPath = join(staged.work, "flag.json");
  const preload = window === "after-inspect" ? PRELOAD_AFTER_INSPECT : PRELOAD_AFTER_COPY;
  const spawned = spawnKernelCli(root, {
    jobId,
    inputs: { before: staged.before, after: staged.after },
    outDir,
    preload,
    racePath: staged.after,
    overwrite: staged.before,
    flagPath,
  });
  const liveSha = sha256File(staged.after);
  const impact = impactFrom(spawned.wrapper, outDir);
  return {
    staged,
    spawned,
    liveSha,
    inspectSha: staged.inspectAfterSha,
    impact,
    flag: existsSync(flagPath) ? JSON.parse(readFileSync(flagPath, "utf8")) : null,
    enginePath: impact?.caller?.after || null,
  };
}

export async function d01PostMaterializeLibrary() {
  const root = ensureKernelRoot(D01_SHA);
  const { wrapper, engine, contract } = await importKernel(root);
  if (typeof wrapper.createExecutor !== "function") {
    return { root, skipped: false, missingCreateExecutor: true };
  }
  const staged = stageKernelBudget(root);
  let seen = null;
  const execute = wrapper.createExecutor({
    runEngine(jobId, opts) {
      seen = {
        afterSha: shaBuf(readFileSync(opts.files.after)),
        engineAfter: opts.files.after,
      };
      writeFileSync(staged.after, readFileSync(staged.before));
      return engine.runEngineJob(jobId, opts);
    },
  });
  const result = await execute({
    jobId: "vendor-budget-impact",
    inputs: { before: staged.before, after: staged.after },
  });
  const liveSha = sha256File(staged.after);
  const impact = impactFrom(result, result.outDir || result.runOutDir);
  return {
    root,
    contract: result.contract || contract.EXECUTION_CONTRACT_VERSION,
    result,
    seen,
    liveSha,
    inspectSha: staged.inspectAfterSha,
    impact,
    engineConsumedInspect: seen?.afterSha === staged.inspectAfterSha,
  };
}

export async function d01NoChangeControl() {
  const root = ensureKernelRoot(D01_SHA);
  const { wrapper } = await importKernel(root);
  const staged = stageKernelBudget(root);
  writeFileSync(staged.after, readFileSync(staged.before));
  const result = await wrapper.runPaidOffer({
    jobId: "vendor-budget-impact",
    inputs: { before: staged.before, after: staged.after },
  });
  const impact = impactFrom(result, result.outDir || result.runOutDir);
  return { root, result, impact };
}

export async function d01ConcurrentOutDir() {
  const root = ensureKernelRoot(D01_SHA);
  const { wrapper } = await importKernel(root);
  const change = stageKernelBudget(root);
  const noChange = stageKernelBudget(root);
  writeFileSync(noChange.after, readFileSync(noChange.before));
  const shared = mkdtempSync(join(tmpdir(), "d15-shared-out-"));
  const [changed, quiet] = await Promise.all([
    wrapper.runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: change.before, after: change.after },
      outDir: shared,
    }),
    wrapper.runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: noChange.before, after: noChange.after },
      outDir: shared,
    }),
  ]);
  const published = JSON.parse(readFileSync(join(shared, "budget-impact.json"), "utf8"));
  const changedIsolated = JSON.parse(readFileSync(join(changed.runOutDir, "budget-impact.json"), "utf8"));
  const quietIsolated = JSON.parse(readFileSync(join(quiet.runOutDir, "budget-impact.json"), "utf8"));
  const changedPublishedPath = changed.outputs.find((o) => o.name === "budget-impact.json")?.path;
  const publishedAtChangedOutput = changedPublishedPath && existsSync(changedPublishedPath)
    ? JSON.parse(readFileSync(changedPublishedPath, "utf8"))
    : null;
  return {
    root,
    shared,
    changed,
    quiet,
    published,
    changedIsolated,
    quietIsolated,
    aliasExposed: changed.runOutDir !== quiet.runOutDir,
    publishedMatchesChanged: published.status === changedIsolated.status,
    publishedMatchesQuiet: published.status === quietIsolated.status,
    changedOutputFollowsAlias: publishedAtChangedOutput?.status !== changedIsolated.status,
  };
}

export function sds52MutateThenCall() {
  const root = ensureKernelRoot(SDS52_SHA);
  const staged = stageKernelBudget(root);
  writeFileSync(staged.after, readFileSync(staged.before));
  const outDir = join(staged.work, "out");
  const spawned = spawnKernelCli(root, {
    jobId: "vendor-budget-impact",
    inputs: { before: staged.before, after: staged.after },
    outDir,
  });
  const impact = impactFrom(spawned.wrapper, outDir);
  return {
    root,
    spawned,
    inspectSha: staged.inspectAfterSha,
    liveSha: sha256File(staged.after),
    impact,
  };
}
