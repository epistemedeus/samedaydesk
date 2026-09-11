import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BIND, KIND, REFUSE_CODE, contractRecord } from "./contract.mjs";
import { PAID_CLI, REPO_ROOT } from "./paths.mjs";
import { executeInputs, freezeCallerInputs, liveDrift } from "./freeze.mjs";
import { mutateLive } from "./mutate.mjs";
import { attachDomain, classifyRace } from "./classify.mjs";

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

export function spawnPaidCli({ jobId, inputs, outDir, timeoutMs = 120_000 }) {
  const args = [PAID_CLI, "run", jobId];
  for (const [key, filePath] of Object.entries(inputs || {})) {
    if (!filePath) continue;
    args.push(`--${key}`, filePath);
  }
  args.push("--funding", "unfunded");
  if (outDir) args.push("--out-dir", outDir);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const wrapper = parseJsonStdout(result.stdout);
  if (result.error || result.signal || wrapper == null) {
    return {
      transport: {
        failure: true,
        code: result.error?.code || (result.signal ? "cli-signal" : "cli-unparseable"),
        error: result.error?.message || result.stderr || "paid cli produced no JSON",
        status: result.status,
        signal: result.signal || null,
      },
      wrapper: wrapper,
      status: result.status,
      stderr: result.stderr || "",
    };
  }
  return { transport: { failure: false }, wrapper, status: result.status, stderr: result.stderr || "" };
}

function readOutputs(outDir) {
  if (!outDir) return {};
  const impactPath = join(outDir, "budget-impact.json");
  const repeatPath = join(outDir, "repeat-job.json");
  return {
    impact: existsSync(impactPath) ? JSON.parse(readFileSync(impactPath, "utf8")) : null,
    repeat: existsSync(repeatPath) ? JSON.parse(readFileSync(repeatPath, "utf8")) : null,
  };
}

export async function runRace(request = {}) {
  const jobId = request.jobId;
  const bind = request.bind || BIND.FROZEN;
  const workDir = request.workDir || mkdtempSync(join(tmpdir(), "d15-race-"));
  mkdirSync(workDir, { recursive: true });
  const outDir = request.outDir || join(workDir, "out");
  mkdirSync(outDir, { recursive: true });

  const snapshot = freezeCallerInputs({
    jobId,
    inputs: request.inputs,
    workDir,
  });

  const mutated = request.mutate ? mutateLive(snapshot, request.mutate) : null;
  const drifted = liveDrift(snapshot);

  if (bind === BIND.VERIFY_LIVE && drifted.length) {
    const classified = classifyRace({
      bind,
      snapshot,
      drifted,
      wrapper: null,
      transport: null,
      mutated: Boolean(mutated),
    });
    return {
      ok: false,
      kind: classified.kind,
      code: REFUSE_CODE,
      error: "Caller path bytes changed after preflight freeze",
      sold: false,
      engineInvoked: false,
      bind,
      jobId,
      contract: contractRecord(),
      sample: snapshot.sample,
      freeze: Object.fromEntries(
        Object.entries(snapshot.files).map(([key, e]) => [
          key,
          { kind: e.kind, sha256: e.sha256, livePath: e.livePath, frozenPath: e.frozenPath },
        ]),
      ),
      drifted,
      mutated,
      wrapper: null,
      domain: { status: null, digest: null, summary: null },
      outputs: [],
      outDir,
    };
  }

  const execInputs = executeInputs(snapshot, bind);
  const spawned = spawnPaidCli({ jobId, inputs: execInputs, outDir });
  const classified = attachDomain(
    classifyRace({
      bind,
      snapshot,
      drifted,
      wrapper: spawned.wrapper,
      transport: spawned.transport,
      mutated: Boolean(mutated),
    }),
    spawned.wrapper,
    readOutputs(outDir),
  );

  const wrapper = spawned.wrapper;
  return {
    ok: classified.kind === KIND.FROZEN_CONSUMED || (classified.kind === KIND.ACCURATE_REFUSE),
    kind: classified.kind,
    code: classified.code || wrapper?.code || null,
    error: wrapper?.error || spawned.transport?.error || null,
    sold: wrapper?.sold === true,
    engineInvoked: classified.engineInvoked === true,
    bind,
    jobId,
    contract: contractRecord(),
    sample: snapshot.sample,
    freeze: Object.fromEntries(
      Object.entries(snapshot.files).map(([key, e]) => [
        key,
        { kind: e.kind, sha256: e.sha256, livePath: e.livePath, frozenPath: e.frozenPath },
      ]),
    ),
    drifted,
    mutated,
    compared: classified.compared ?? null,
    matchedFreeze: classified.matchedFreeze ?? null,
    matchedMutatedLive: classified.matchedMutatedLive ?? null,
    wrapper,
    domain: classified.domain,
    outputs: wrapper?.outputs || [],
    outDir,
    cliStatus: spawned.status,
  };
}
