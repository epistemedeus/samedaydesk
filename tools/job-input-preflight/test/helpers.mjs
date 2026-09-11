import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BIN, REPO_ROOT } from "../lib/roots.mjs";

export function decodeCli(status, stdout, stderr) {
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

export function runCli(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: opts.cwd || REPO_ROOT,
    timeout: opts.timeout ?? 60_000,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return decodeCli(r.status, r.stdout, r.stderr);
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
    child.on("close", (status) => resolve(decodeCli(status, stdout, stderr)));
  });
}

export function runD01Cli(d01RepoRoot, args, opts = {}) {
  const cli = path.join(d01RepoRoot, "server/paid-useful-jobs/bin/cli.mjs");
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: d01RepoRoot,
    timeout: opts.timeout ?? 120_000,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return decodeCli(r.status, r.stdout, r.stderr);
}

/** Valid pricing-row JSON padded with spaces to an exact byte length. */
export function writePaddedPricingJson(filePath, byteLength, extra = {}) {
  const payload = {
    label: "caller",
    rows: [{ field: extra.field || "wave5-d02-size-boundary", value: extra.value ?? 2, unit: extra.unit || "u" }],
  };
  const json = `${JSON.stringify(payload)}\n`;
  const need = byteLength - Buffer.byteLength(json);
  if (need < 0) {
    throw new Error(`base JSON is already ${Buffer.byteLength(json)} bytes; requested ${byteLength}`);
  }
  writeFileSync(filePath, Buffer.concat([Buffer.from(json), Buffer.alloc(need, 0x20)]));
  return filePath;
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
