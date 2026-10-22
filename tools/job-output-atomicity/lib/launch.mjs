import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { F08_CLI_REL, F08_TESTED_SHA } from "./pins.mjs";
import { killProcessGroup } from "./reap.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HOLD_HOOK = join(here, "../hooks/hold-on-publish.mjs");

export function f08Cli(f08Root) {
  return join(f08Root, F08_CLI_REL);
}

export function defaultVendorBudgetArgs(f08Root, outDir) {
  const fixtures = join(f08Root, "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact");
  const payment = join(f08Root, "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json");
  return {
    jobId: "vendor-budget-impact",
    args: [
      f08Cli(f08Root),
      "run",
      "vendor-budget-impact",
      "--before",
      join(fixtures, "before.json"),
      "--after",
      join(fixtures, "after.json"),
      "--funding",
      "reserved-fixture",
      "--payment",
      payment,
      "--out-dir",
      outDir,
    ],
  };
}

export function launchPaidWrapper({
  f08Root,
  outDir,
  jobId = "vendor-budget-impact",
  extraArgs = [],
  extraEnv = {},
  hold = null,
  timeoutMs = 120_000,
  detached = false,
} = {}) {
  if (!f08Root || !existsSync(f08Cli(f08Root))) {
    const err = new Error(`F08 CLI missing under ${f08Root}`);
    err.code = "missing-f08";
    throw err;
  }
  mkdirSync(outDir, { recursive: true });
  const prepared =
    jobId === "vendor-budget-impact" && extraArgs.length === 0
      ? defaultVendorBudgetArgs(f08Root, outDir)
      : { jobId, args: [f08Cli(f08Root), "run", jobId, ...extraArgs, "--out-dir", outDir] };

  const runId = extraEnv.JOA_RUN_ID || randomUUID();
  const env = { ...process.env, ...extraEnv, JOA_RUN_ID: runId };
  const nodeArgs = [...prepared.args];
  if (hold) {
    const importUrl = pathToFileURL(HOLD_HOOK).href;
    nodeArgs.unshift("--import", importUrl);
    env.JOA_HOLD_NAMES = (hold.names || ["receipt.json"]).join(",");
    env.JOA_HOLD_MS = String(hold.ms ?? 20_000);
    if (hold.partial) env.JOA_PARTIAL = "1";
    if (hold.beforeWrite) env.JOA_HOLD_BEFORE = "1";
    if (hold.notifyPath) env.JOA_PUBLISH_NOTIFY = hold.notifyPath;
  }

  const spawnOpts = {
    cwd: f08Root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  };

  if (!detached) {
    const result = spawnSync(process.execPath, nodeArgs, spawnOpts);
    return {
      runId,
      status: result.status,
      signal: result.signal,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      pid: result.pid || null,
      args: nodeArgs,
      jobId: prepared.jobId,
      f08Root,
      testedSha: F08_TESTED_SHA,
    };
  }

  const child = spawn(process.execPath, nodeArgs, {
    cwd: f08Root,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let exitInfo = null;
  const waiters = [];
  child.on("close", (status, signal) => {
    exitInfo = { status, signal, stdout, stderr };
    for (const resolveWait of waiters) resolveWait(exitInfo);
    waiters.length = 0;
  });

  const wait = ({ killAfterMs } = {}) =>
    new Promise((resolveWait) => {
      const finish = (info) => {
        resolveWait({
          runId,
          status: info.status,
          signal: info.signal,
          stdout: info.stdout,
          stderr: info.stderr,
          pid: child.pid,
          args: nodeArgs,
          jobId: prepared.jobId,
          f08Root,
          testedSha: F08_TESTED_SHA,
        });
      };
      if (exitInfo) {
        finish(exitInfo);
        return;
      }
      const timer =
        killAfterMs != null
          ? setTimeout(() => {
              killProcessGroup(child.pid);
            }, killAfterMs)
          : null;
      waiters.push((info) => {
        if (timer) clearTimeout(timer);
        finish(info);
      });
    });

  return { child, runId, wait, pid: child.pid, args: nodeArgs, jobId: prepared.jobId };
}

export async function loadF08Digest(f08Root) {
  const href = pathToFileURL(join(f08Root, "server/paid-useful-jobs/lib/digest.mjs")).href;
  return import(href);
}

export function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
