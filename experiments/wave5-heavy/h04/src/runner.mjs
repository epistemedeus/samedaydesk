import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { engineCliPath } from "./engines.mjs";

const MAX_CAPTURE = 8 * 1024 * 1024;

function appendCapped(cur, chunk) {
  if (cur.length >= MAX_CAPTURE) return cur;
  const s = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  if (cur.length + s.length <= MAX_CAPTURE) return cur + s;
  return `${cur}${s.slice(0, MAX_CAPTURE - cur.length)}\n[truncated]\n`;
}

export function listFiles(dir) {
  if (!dir || !existsSync(dir)) return [];
  const out = [];
  const walk = (current, prefix) => {
    let ents;
    try {
      ents = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(current, ent.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, "");
  return out.sort();
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Spawn a process and capture argv, cwd, exitCode, stdout, stderr, durationMs.
 * Never sets ok without a numeric exitCode of 0.
 */
export function runCaptured({
  argv,
  cwd,
  timeoutMs = 60_000,
  env = process.env,
  outDir = null,
} = {}) {
  const started = Date.now();
  if (!Array.isArray(argv) || argv.length === 0) {
    return Promise.resolve({
      argv: Array.isArray(argv) ? argv : [],
      cwd: cwd ?? null,
      exitCode: null,
      signal: null,
      timedOut: false,
      spawnError: "argv required",
      stdout: "",
      stderr: "",
      durationMs: 0,
      ok: false,
      outDir,
      outDirFiles: listFiles(outDir),
    });
  }

  if (outDir) ensureDir(outDir);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (extra) => {
      if (settled) return;
      settled = true;
      const exitCode = extra.exitCode === undefined ? null : extra.exitCode;
      resolve({
        argv,
        cwd: cwd ?? null,
        exitCode,
        signal: extra.signal ?? null,
        timedOut,
        spawnError: extra.spawnError ?? null,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        ok: exitCode === 0 && !timedOut && !extra.spawnError,
        outDir,
        outDirFiles: listFiles(outDir),
      });
    };

    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: cwd || undefined,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finish({ exitCode: null, spawnError: err.message });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCapped(stderr, chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 1000).unref();
    }, timeoutMs);
    timer.unref?.();

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ exitCode: null, spawnError: err.message });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({ exitCode: code, signal });
    });
  });
}

export function oneLine(text, max = 200) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function writeRunRecord(runDir, captured, extra = {}) {
  ensureDir(runDir);
  writeFileSync(join(runDir, "stdout.txt"), captured.stdout ?? "");
  writeFileSync(join(runDir, "stderr.txt"), captured.stderr ?? "");
  const meta = {
    engineId: extra.engineId ?? null,
    phase: extra.phase ?? null,
    sha: extra.sha ?? null,
    executedSha: extra.executedSha ?? null,
    worktree: extra.worktree ?? captured.cwd ?? null,
    argv: captured.argv,
    cwd: captured.cwd,
    exitCode: captured.exitCode,
    signal: captured.signal,
    timedOut: captured.timedOut,
    spawnError: captured.spawnError,
    durationMs: captured.durationMs,
    ok: captured.ok === true && captured.exitCode === 0,
    sample: extra.sample === true,
    sampleNotCustomerJob: extra.sample === true,
    note: extra.note ?? null,
    outDir: captured.outDir,
    outDirFiles: captured.outDirFiles,
    stdoutPreview: oneLine(captured.stdout),
    stderrPreview: oneLine(captured.stderr),
    capturedAt: extra.capturedAt ?? new Date().toISOString(),
    node: process.version,
    harnessCwd: process.cwd(),
    ...("compare" in extra ? { compare: extra.compare } : {}),
  };
  writeFileSync(join(runDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

export function engineArgv(engine, args) {
  return [process.execPath, engineCliPath(engine), ...args];
}

export async function runEngine({
  engine,
  args,
  runDir,
  outDir = null,
  timeoutMs,
  sample = false,
  phase = null,
  note = null,
  executedSha = null,
} = {}) {
  ensureDir(runDir);
  if (outDir) ensureDir(outDir);
  const captured = await runCaptured({
    argv: engineArgv(engine, args),
    cwd: engine.worktree,
    timeoutMs: timeoutMs ?? engine.timeoutMs ?? 60_000,
    outDir,
  });
  const meta = writeRunRecord(runDir, captured, {
    engineId: engine.id,
    phase,
    sha: engine.sha,
    executedSha,
    worktree: engine.worktree,
    sample,
    note,
  });
  return { captured, meta, runDir, outDir };
}

export function readTextIf(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function ensureParent(file) {
  mkdirSync(dirname(file), { recursive: true });
}
