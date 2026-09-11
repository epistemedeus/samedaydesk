import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPin, SDS_ROOT } from "./paths.mjs";

function engineBin(root) {
  return join(root, "bin/page-change.mjs");
}

function assertEngine(root) {
  const bin = engineBin(root);
  if (!existsSync(bin)) {
    const error = new Error(`page-change CLI missing at ${bin}`);
    error.code = "engine_missing";
    throw error;
  }
  return bin;
}

function git(args, cwd = SDS_ROOT) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function worktreeHead(root) {
  const result = git(["rev-parse", "HEAD"], root);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function packageRootFrom(worktree, pin) {
  return join(worktree, pin.engine.path);
}

function describeEngine(root, source, sha, pin) {
  return {
    root,
    bin: engineBin(root),
    source,
    sha,
    pinSha: pin.engine.sha,
  };
}

function ensureWorktree(pin) {
  const dest = join(tmpdir(), `w5-m09-co13-${pin.engine.sha.slice(0, 12)}`);
  const root = packageRootFrom(dest, pin);
  if (existsSync(engineBin(root))) {
    const sha = worktreeHead(dest);
    if (sha && sha !== pin.engine.sha) {
      const error = new Error(`worktree HEAD ${sha} does not match pin ${pin.engine.sha}`);
      error.code = "engine_pin_mismatch";
      throw error;
    }
    return describeEngine(root, "worktree", sha ?? pin.engine.sha, pin);
  }

  if (existsSync(dest)) {
    git(["worktree", "remove", "--force", dest]);
    rmSync(dest, { recursive: true, force: true });
  }

  const fetch = git(["fetch", "origin", pin.engine.sha]);
  if (fetch.status !== 0) {
    const error = new Error(`git fetch ${pin.engine.sha} failed: ${fetch.stderr}`);
    error.code = "engine_fetch_failed";
    throw error;
  }
  const add = git(["worktree", "add", "--detach", dest, pin.engine.sha]);
  if (add.status !== 0 && !existsSync(engineBin(root))) {
    const error = new Error(`git worktree add failed: ${add.stderr}`);
    error.code = "engine_worktree_failed";
    throw error;
  }
  assertEngine(root);
  return describeEngine(root, "worktree", pin.engine.sha, pin);
}

export function resolveEngine({ env = process.env, pin = loadPin() } = {}) {
  if (env.PAGE_CHANGE_ENGINE_ROOT) {
    const root = resolve(env.PAGE_CHANGE_ENGINE_ROOT);
    assertEngine(root);
    return describeEngine(root, "env", env.PAGE_CHANGE_ENGINE_SHA ?? worktreeHead(root), pin);
  }
  return ensureWorktree(pin);
}

function parseJsonLine(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return null;
  }
}

export function spawnCompare({
  engine,
  before,
  after,
  fields,
  clock,
  outDir,
  extraArgs = [],
  timeoutMs = 20_000,
} = {}) {
  const args = [
    engine.bin,
    "compare",
    "--before",
    before,
    "--after",
    after,
    "--out-dir",
    outDir,
  ];
  if (fields) {
    args.push("--fields", Array.isArray(fields) ? fields.join(",") : fields);
  }
  if (clock !== undefined) {
    args.push("--clock", clock);
  }
  args.push(...extraArgs);

  const spawned = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });

  const stdoutParsed = parseJsonLine(spawned.stdout);
  const stderrParsed = parseJsonLine(spawned.stderr);
  return {
    exitCode: spawned.status ?? 1,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    signal: spawned.signal,
    error: spawned.error ? spawned.error.message : null,
    body: stdoutParsed,
    refusal: stderrParsed && stderrParsed.ok === false ? stderrParsed : null,
    timedOut: spawned.signal === "SIGTERM" && spawned.error?.code === "ETIMEDOUT",
  };
}

export function readEnginePackage(engine) {
  const pkg = JSON.parse(readFileSync(join(engine.root, "package.json"), "utf8"));
  return {
    name: pkg.name,
    version: pkg.version,
    sha: engine.sha,
    source: engine.source,
    root: engine.root,
  };
}
