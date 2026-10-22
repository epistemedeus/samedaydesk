import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractUsefulJobsKit, runUsefulJob, buildF08ShapedReceipt } from "../lib/kit.mjs";
import { fileEntry } from "../lib/receipt-shape.mjs";
import { SDS52_PIN_SHA, OWNED_DIR, REPO_ROOT, USEFUL_JOBS_ARCHIVE_SHA256 } from "../lib/pins.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const cli = join(OWNED_DIR, "bin/outbox.mjs");
export const receiverBin = join(OWNED_DIR, "bin/loopback-receiver.mjs");
export const callerBefore = join(OWNED_DIR, "fixtures/caller/vendor-budget-impact/before.json");
export const callerAfter = join(OWNED_DIR, "fixtures/caller/vendor-budget-impact/after.json");

let kitRootMemo = null;

export function kitRoot() {
  if (kitRootMemo) return kitRootMemo;
  const dest = join(tmpdir(), `job-delivery-outbox-kit-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 12)}`);
  kitRootMemo = extractUsefulJobsKit(dest);
  return kitRootMemo;
}

export function tmpSpace(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function runCli(args, opts = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: opts.timeout || 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return result;
}

export function parseCli(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    throw new Error(`empty CLI stdout status=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(text);
}

export function completedCallerReceipt(outDir) {
  mkdirSync(outDir, { recursive: true });
  const engine = runUsefulJob(
    kitRoot(),
    "vendor-budget-impact",
    ["--before", callerBefore, "--after", callerAfter],
    outDir,
  );
  if (engine.status !== 0) {
    throw new Error(`useful-jobs failed: ${engine.stderr || engine.stdout}`);
  }
  const engineJson = JSON.parse(String(engine.stdout).trim());
  const outputs = [
    { name: "budget-impact.json", path: join(outDir, "budget-impact.json") },
    { name: "budget-impact.md", path: join(outDir, "budget-impact.md") },
  ];
  const inputEntries = [fileEntry("before", callerBefore), fileEntry("after", callerAfter)];
  return buildF08ShapedReceipt({
    jobId: "vendor-budget-impact",
    outputFiles: outputs,
    inputEntries,
    engineJson,
    sample: false,
    fundingState: "reserved-fixture",
    outDir,
  });
}

export function sampleReceipt(outDir) {
  mkdirSync(outDir, { recursive: true });
  const engine = runUsefulJob(kitRoot(), "vendor-budget-impact", ["--example"], outDir);
  if (engine.status !== 0) {
    throw new Error(`useful-jobs --example failed: ${engine.stderr || engine.stdout}`);
  }
  const engineJson = JSON.parse(String(engine.stdout).trim());
  const outputs = [
    { name: "budget-impact.json", path: join(outDir, "budget-impact.json") },
    { name: "budget-impact.md", path: join(outDir, "budget-impact.md") },
  ];
  return buildF08ShapedReceipt({
    jobId: "vendor-budget-impact",
    outputFiles: outputs,
    inputEntries: [],
    engineJson,
    sample: true,
    sampleReasons: ["example-flag"],
    fundingState: "unfunded",
    outDir,
  });
}

export async function spawnReceiver(args = []) {
  const child = spawn(process.execPath, [receiverBin, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const info = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`receiver start timeout stderr=${stderr}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const line = stdout.split("\n").find((l) => l.startsWith("{"));
      if (line) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (code && !stdout.includes("{")) {
        clearTimeout(timer);
        reject(new Error(`receiver exited ${code} stderr=${stderr}`));
      }
    });
  });
  return { child, ...info };
}

export function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

export function waitForFile(path, timeoutMs = 8_000) {
  const start = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${path}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return readFileSync(path, "utf8");
}

export function sds52Worktree() {
  const dest = process.env.SDS52_PIN_WORKTREE || join(tmpdir(), "sds-pr52-ro");
  const cliPath = join(dest, "server/paid-useful-jobs/bin/cli.mjs");
  if (existsSync(cliPath)) return dest;
  const add = spawnSync(
    "git",
    ["-C", REPO_ROOT, "worktree", "add", "--detach", dest, SDS52_PIN_SHA],
    { encoding: "utf8" },
  );
  if (add.status !== 0) {
    throw new Error(`SDS52 worktree ${SDS52_PIN_SHA} unavailable: ${add.stderr || add.stdout}`);
  }
  if (!existsSync(cliPath)) {
    throw new Error(`SDS52 worktree missing paid-useful-jobs CLI at ${cliPath}`);
  }
  return dest;
}

export const PG_BIN = process.env.OUTBOX_PG_BIN || "/usr/lib/postgresql/16/bin";
