import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT, SDS52_PIN } from "./pins.mjs";
import { refuse } from "./refuse.mjs";

const WRAPPER_REL = "server/paid-useful-jobs";
const CLI_REL = join(WRAPPER_REL, "bin/cli.mjs");

function redact(text) {
  return String(text || "").replace(/x-access-token:[^@\s]+/g, "x-access-token:redacted");
}

function git(args, { cwd = REPO_ROOT } = {}) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
}

function fetchPin() {
  let delay = 4000;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = git(["fetch", "--no-tags", "origin", SDS52_PIN]);
    if (result.status === 0) return;
    if (attempt === 3) {
      throw refuse(
        "sds52-wrapper-missing",
        `git fetch of SDS52 pin ${SDS52_PIN} failed`,
        { status: result.status },
      );
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    delay *= 2;
  }
}

function wrapperCli(root) {
  return join(root, "bin/cli.mjs");
}

function isWrapperRoot(root) {
  return Boolean(root) && existsSync(wrapperCli(root));
}

function findListedWorktree() {
  const listed = git(["worktree", "list", "--porcelain"]);
  if (listed.status !== 0) return null;
  const lines = String(listed.stdout || "").split("\n");
  let current = null;
  for (const line of lines) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
    else if (line.startsWith("HEAD ") && current) {
      const sha = line.slice("HEAD ".length).trim();
      if (sha.startsWith(SDS52_PIN) && existsSync(join(current, CLI_REL))) {
        return join(current, WRAPPER_REL);
      }
    } else if (line === "") current = null;
  }
  return null;
}

function materializeWrapperRoot() {
  const dest = join(tmpdir(), `sds52-wrapper-${SDS52_PIN.slice(0, 12)}`);
  const existingCli = join(dest, CLI_REL);
  if (existsSync(existingCli)) return join(dest, WRAPPER_REL);

  const listed = findListedWorktree();
  if (listed) return listed;

  const hasPin = git(["cat-file", "-e", `${SDS52_PIN}^{commit}`]);
  if (hasPin.status !== 0) fetchPin();

  const added = git(["worktree", "add", "--detach", dest, SDS52_PIN]);
  if (added.status !== 0 && !existsSync(existingCli)) {
    throw refuse(
      "sds52-wrapper-missing",
      `cannot materialize SDS52 wrapper ${SDS52_PIN}`,
      { git: redact(added.stderr || added.stdout) },
    );
  }
  if (!existsSync(existingCli)) {
    throw refuse(
      "sds52-wrapper-missing",
      `SDS52 worktree lacks ${CLI_REL}`,
      { dest },
    );
  }
  return join(dest, WRAPPER_REL);
}

export function resolveWrapperRoot() {
  const env = process.env.SDS52_WRAPPER_ROOT;
  if (env) {
    const root = resolve(env);
    if (!isWrapperRoot(root)) {
      throw refuse(
        "sds52-wrapper-missing",
        "SDS52_WRAPPER_ROOT does not contain bin/cli.mjs",
        { root },
      );
    }
    return root;
  }

  const inRepo = join(REPO_ROOT, WRAPPER_REL);
  if (isWrapperRoot(inRepo)) return inRepo;

  const known = "/tmp/ro-worktrees/sds-pr52-aeef964f/server/paid-useful-jobs";
  if (isWrapperRoot(known)) return known;

  const listed = findListedWorktree();
  if (listed) return listed;

  return materializeWrapperRoot();
}

export function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
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

export function engineJsonFromWrapper(wrapper) {
  if (!wrapper || typeof wrapper !== "object") return null;
  const engine = wrapper.engine;
  if (!engine || typeof engine !== "object") return null;
  if (engine.json && typeof engine.json === "object") return engine.json;
  if ("ok" in engine && !("stdout" in engine)) return engine;
  return null;
}

export function runViaSds52(jobId, { files = {}, example = false, outDir, timeoutMs = 120_000 } = {}) {
  const root = resolveWrapperRoot();
  const cli = wrapperCli(root);
  const args = ["run", jobId];
  if (example) args.push("--example");
  else {
    for (const [key, filePath] of Object.entries(files)) {
      if (!filePath) continue;
      args.push(`--${key}`, filePath);
    }
  }
  if (outDir) args.push("--out-dir", outDir);

  const spawned = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: join(root, "../.."),
  });

  const wrapper = parseJsonObject(spawned.stdout);
  return {
    status: spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    json: engineJsonFromWrapper(wrapper),
    wrapper,
    pin: SDS52_PIN,
    cli,
  };
}

export { SDS52_PIN };
