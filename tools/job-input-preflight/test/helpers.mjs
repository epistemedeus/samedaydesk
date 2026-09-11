import { spawn, spawnSync } from "node:child_process";
import { BIN, REPO_ROOT } from "../lib/roots.mjs";

export function runCli(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: opts.cwd || REPO_ROOT,
    timeout: opts.timeout ?? 60_000,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return decode(r.status, r.stdout, r.stderr);
}

/** Use when an in-process HTTP server must keep accepting connections. */
export function runCliAsync(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: opts.cwd || REPO_ROOT,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolve(decode(status, stdout, stderr)));
  });
}

function decode(status, stdout, stderr) {
  let json = null;
  const text = String(stdout || "").trim();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status, stdout: stdout || "", stderr: stderr || "", json };
}

export const JOURNEY_ARGS = [
  "vendor-budget-impact",
  "--before",
  "caller/vendor-budget-impact/before.json",
  "--after",
  "caller/vendor-budget-impact/after.json",
  "--input-root",
  "tools/job-input-preflight/fixtures",
];
