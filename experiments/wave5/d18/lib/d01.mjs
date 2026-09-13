import { existsSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { D01_CLI_REL, D01_REF, D03_TESTED_SHA, D01_TESTED_SHA, REPO_ROOT } from "./pins.mjs";
import { git, gitFetchWithRetry, haveCommit } from "./git.mjs";

export function d01CliExists(root) {
  return Boolean(root) && existsSync(join(root, D01_CLI_REL));
}

export function ensureD01Root({ sha = D01_TESTED_SHA } = {}) {
  if (process.env.F08_ROOT && d01CliExists(process.env.F08_ROOT)) return process.env.F08_ROOT;
  if (process.env.D01_ROOT && d01CliExists(process.env.D01_ROOT)) return process.env.D01_ROOT;
  if (d01CliExists(REPO_ROOT)) return REPO_ROOT;

  const target = join(tmpdir(), `w5-d18-d01-${sha.slice(0, 12)}`);
  if (d01CliExists(target)) return target;

  if (!haveCommit(sha)) {
    const fetched = gitFetchWithRetry(["origin", D01_REF]);
    if (fetched.status !== 0 && !haveCommit(sha)) {
      const err = new Error(fetched.stderr || `git fetch origin ${D01_REF} failed`);
      err.code = "missing-d01";
      throw err;
    }
  }

  mkdirSync(tmpdir(), { recursive: true });
  if (!d01CliExists(target)) {
    const add = git(["worktree", "add", "--detach", target, sha]);
    if (add.status !== 0 && !d01CliExists(target)) {
      const err = new Error(add.stderr || `git worktree add failed for D01 ${sha}`);
      err.code = "missing-d01";
      throw err;
    }
  }
  if (!d01CliExists(target)) {
    const err = new Error(`D01 CLI missing at ${target}`);
    err.code = "missing-d01";
    throw err;
  }
  return target;
}

export function d01Cli(root = ensureD01Root()) {
  return join(root, D01_CLI_REL);
}

export function d01Fixture(root, rel) {
  return join(root, "server/paid-useful-jobs/fixtures", rel);
}

function parseStdoutJson(stdout) {
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

export function spawnPaidWrapper({
  d01Root = ensureD01Root(),
  jobId,
  extraArgs = [],
  outDir,
  timeoutMs = 120_000,
} = {}) {
  if (!d01CliExists(d01Root)) {
    const err = new Error(`D01 CLI missing under ${d01Root}`);
    err.code = "missing-d01";
    throw err;
  }
  mkdirSync(outDir, { recursive: true });
  const args = [d01Cli(d01Root), "run", jobId, ...extraArgs, "--out-dir", outDir];
  const result = spawnSync(process.execPath, args, {
    cwd: d01Root,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: parseStdoutJson(result.stdout),
    args,
    jobId,
    d01Root,
    testedSha: D01_TESTED_SHA,
    d03Pin: D03_TESTED_SHA,
    outDir,
  };
}

export function spawnPaidWrapperAsync({
  d01Root = ensureD01Root(),
  jobId,
  extraArgs = [],
  outDir,
  env = {},
} = {}) {
  if (!d01CliExists(d01Root)) {
    const err = new Error(`D01 CLI missing under ${d01Root}`);
    err.code = "missing-d01";
    throw err;
  }
  mkdirSync(outDir, { recursive: true });
  const args = [d01Cli(d01Root), "run", jobId, ...extraArgs, "--out-dir", outDir];
  const child = spawn(process.execPath, args, {
    cwd: d01Root,
    env: { ...process.env, ...env },
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
  const wait = () =>
    new Promise((resolveWait) => {
      child.once("close", (status, signal) => {
        resolveWait({
          status,
          signal,
          stdout,
          stderr,
          json: parseStdoutJson(stdout),
          pid: child.pid,
          args,
          jobId,
          d01Root,
          testedSha: D01_TESTED_SHA,
          outDir,
        });
      });
    });
  return { child, wait, pid: child.pid, args, jobId, outDir };
}
