#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pins from "./PINS.json" with { type: "json" };

const fixtureDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const childPath = path.join(fixtureDir, "bounded-child.mjs");
const wasmPath = path.join(fixtureDir, "answer.wasm");
const prlimit = "/usr/bin/prlimit";

export function assertPinnedBytes(bytes, expected) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    const error = new Error("pinned fixture hash mismatch");
    error.code = "fixture_hash_mismatch";
    error.actual = actual;
    throw error;
  }
  return actual;
}

export function assessCopiedVenv({ copiedAcrossHosts = false, venvHome = null, homeExists = true } = {}) {
  if (copiedAcrossHosts || (venvHome && homeExists === false)) {
    return { pass: false, portable: false, reason: "copied_venv_not_portable" };
  }
  return { pass: true, portable: false, reason: "interpreter_on_this_host" };
}

export function finalizeReport(report) {
  if (report.wholeHostSandbox === true) {
    throw new Error("probe refuses a whole-host sandbox claim");
  }
  return { ...report, wholeHostSandbox: false, isolation: "process-rlimit-and-pipes-only" };
}

function waitExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function spawnCollected(command, args, { input = null, timeoutMs = 8000, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: env || { PATH: process.env.PATH || "", LANG: "C", LC_ALL: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf) => { stdout = (stdout + buf).slice(-8000); });
    child.stderr.on("data", (buf) => { stderr = (stderr + buf).slice(-4000); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, pid: child.pid });
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr: error.message, timedOut, pid: child.pid });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function checkLinux() {
  const evidence = { platform: process.platform, arch: process.arch, machine: os.machine(), release: os.release() };
  return { id: "linux-x64", pass: evidence.platform === "linux" && evidence.arch === "x64" && evidence.machine === "x86_64", evidence };
}

async function checkPython() {
  const ran = await spawnCollected(process.env.PYTHON || "python3", ["-c", "import json,platform,sys; print(json.dumps({'executable':sys.executable,'version':sys.version.split()[0],'machine':platform.machine()}))"]);
  let parsed = null;
  try { parsed = JSON.parse(ran.stdout); } catch { parsed = null; }
  const copied = assessCopiedVenv({ copiedAcrossHosts: false });
  return {
    id: "python",
    pass: ran.code === 0 && parsed?.machine === "x86_64" && copied.pass === true,
    evidence: { ...parsed, exitCode: ran.code, portableVenv: false, reason: copied.reason },
  };
}

async function checkPrlimit() {
  let present = false;
  try { await access(prlimit); present = true; } catch { present = false; }
  const ran = present ? await spawnCollected(prlimit, ["--version"]) : null;
  return { id: "prlimit", pass: present && ran.code === 0, evidence: { path: prlimit, present, exitCode: ran?.code ?? null } };
}

async function checkProc() {
  const status = await readFile("/proc/self/status", "utf8");
  const selfPid = Number(status.match(/^Pid:\s+(\d+)/m)?.[1]);
  const child = spawn(process.execPath, [childPath, "identity"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH || "", LANG: "C" },
  });
  let stdout = "";
  child.stdout.on("data", (buf) => { stdout += buf; });
  const exit = await waitExit(child);
  let row = null;
  try { row = JSON.parse(stdout); } catch { row = null; }
  const statFields = row?.stat ? row.stat.split(") ")[1]?.split(/\s+/) : null;
  const startTicks = statFields?.[19] ?? null;
  let gone = false;
  try {
    await stat(`/proc/${row?.pid}`);
  } catch {
    gone = true;
  }
  const pass = selfPid === process.pid && row?.pid === child.pid && /^[0-9]+$/.test(String(startTicks)) && exit.code === 0 && gone;
  return { id: "proc-identity", pass, evidence: { selfPid, childPid: row?.pid ?? null, startTicks, exit, reaped: gone } };
}

async function checkPipes() {
  const token = "foundry-pipe\n";
  const ran = await spawnCollected(process.execPath, [childPath, "echo"], { input: token, timeoutMs: 3000 });
  return {
    id: "child-pipes",
    pass: ran.code === 0 && ran.stdout === token,
    evidence: { exitCode: ran.code, signal: ran.signal, matched: ran.stdout === token },
  };
}

async function checkSignals() {
  const child = spawn(process.execPath, [childPath, "signal"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH || "", LANG: "C" },
  });
  let stdout = "";
  child.stdout.on("data", (buf) => { stdout += buf; });
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 2000);
    child.stdout.on("data", () => {
      if (stdout.includes("ready\n")) { clearTimeout(timer); resolve(true); }
    });
  });
  if (ready) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    child.kill("SIGTERM");
  } else child.kill("SIGKILL");
  const exit = await waitExit(child);
  return {
    id: "child-signals",
    pass: ready && stdout.includes("sigterm\n") && exit.code === 0,
    evidence: { ready, exit, sawSigterm: stdout.includes("sigterm\n") },
  };
}

async function checkTimeout() {
  const started = Date.now();
  const ran = await spawnCollected(process.execPath, [childPath, "sleep"], { timeoutMs: 400 });
  const elapsedMs = Date.now() - started;
  return {
    id: "child-timeout",
    pass: ran.timedOut === true && ran.signal === "SIGKILL" && elapsedMs < 3000,
    evidence: { elapsedMs, code: ran.code, signal: ran.signal, timedOut: ran.timedOut },
  };
}

async function checkLimits() {
  const started = Date.now();
  const ran = await spawnCollected(prlimit, [
    "--cpu=1", "--nofile=32", "--core=0", "--fsize=1048576", "--stack=8388608",
    "--", process.execPath, childPath, "spin",
  ], { timeoutMs: 8000 });
  return {
    id: "resource-limits",
    pass: ran.code !== 0 && (ran.signal === "SIGXCPU" || ran.signal === "SIGKILL") && ran.timedOut === false,
    evidence: {
      elapsedMs: Date.now() - started,
      code: ran.code,
      signal: ran.signal,
      timedOut: ran.timedOut,
      ceilings: { cpuSeconds: 1, nofile: 32, core: 0, fsize: 1048576, stack: 8388608 },
    },
  };
}

async function checkFixture() {
  const bytes = await readFile(wasmPath);
  const sha256 = assertPinnedBytes(bytes, pins.fixtures["answer.wasm"]);
  const childBytes = await readFile(childPath);
  assertPinnedBytes(childBytes, pins.fixtures["bounded-child.mjs"]);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const answer = instance.exports.answer();
  return {
    id: "prebuilt-fixture",
    pass: answer === 42,
    evidence: { sha256, bytes: bytes.length, answer, runtime: "node-webassembly", compilerInvoked: false },
  };
}

async function checkCompiler() {
  const ran = await spawnCollected("bash", ["-lc", "command -v clang || true"], { timeoutMs: 2000 });
  return {
    id: "compiler-not-required",
    pass: true,
    evidence: {
      requiredForProbe: false,
      clangPath: ran.stdout.trim() || null,
      note: "compiler is only required when building fixtures",
    },
  };
}

async function pythonImport(python, code, env) {
  return spawnCollected(python, ["-c", code], {
    timeoutMs: 20000,
    env: env || { PATH: process.env.PATH || "", LANG: "C", LC_ALL: "C" },
  });
}

async function checkWasmtime(options) {
  const system = await pythonImport("python3", "import wasmtime,json; print(json.dumps({'version':getattr(wasmtime,'__version__',None)}))");
  if (system.code === 0) {
    let version = null;
    try { version = JSON.parse(system.stdout).version; } catch { version = null; }
    return {
      id: "python-native-wasmtime",
      pass: version === pins.wasmtimeVersion,
      evidence: { source: "system", version, pinned: pins.wasmtimeVersion, wheelSha256: null },
    };
  }
  if (!options.exerciseWasmtime) {
    return {
      id: "python-native-wasmtime",
      pass: false,
      evidence: { source: "absent", install: "not-attempted", stderr: system.stderr.slice(-300) },
    };
  }
  const dir = await mkdtemp(path.join(tmpdir(), "vf08-probe-"));
  try {
    const venv = path.join(dir, "venv");
    const made = await spawnCollected("python3", ["-m", "venv", venv], { timeoutMs: 30000 });
    const ensurepip = made.code === 0;
    const pip = ensurepip ? path.join(venv, "bin", "pip") : "pip3";
    const python = ensurepip ? path.join(venv, "bin", "python") : "python3";
    const target = path.join(dir, "site");
    const wheelDir = path.join(dir, "wheels");
    const downloaded = await spawnCollected(pip, [
      "download", `wasmtime==${pins.wasmtimeVersion}`, "-d", wheelDir,
      "--only-binary=:all:", "--no-deps",
      "--platform", "manylinux1_x86_64", "--python-version", "312", "--implementation", "cp",
    ], { timeoutMs: 60000 });
    if (downloaded.code !== 0) {
      return {
        id: "python-native-wasmtime",
        pass: false,
        evidence: { source: "download-failed", ensurepip, stderr: (downloaded.stderr || downloaded.stdout).slice(-400) },
      };
    }
    const { readdir } = await import("node:fs/promises");
    const names = (await readdir(wheelDir)).filter((name) => name.endsWith(".whl"));
    const wheel = names.find((name) => name.includes("manylinux1_x86_64")) || names[0];
    if (!wheel) return { id: "python-native-wasmtime", pass: false, evidence: { source: "wheel-missing", ensurepip } };
    const wheelBytes = await readFile(path.join(wheelDir, wheel));
    const wheelSha256 = createHash("sha256").update(wheelBytes).digest("hex");
    if (wheelSha256 !== pins.wasmtimeWheelSha256) {
      return {
        id: "python-native-wasmtime",
        pass: false,
        evidence: { source: "wheel-hash-mismatch", wheel, wheelSha256, pinned: pins.wasmtimeWheelSha256 },
      };
    }
    const installArgs = ensurepip
      ? ["install", "--no-deps", "--no-index", path.join(wheelDir, wheel)]
      : ["install", "--no-deps", "--no-index", "--target", target, path.join(wheelDir, wheel)];
    const installed = await spawnCollected(pip, installArgs, { timeoutMs: 30000 });
    if (installed.code !== 0) {
      return {
        id: "python-native-wasmtime",
        pass: false,
        evidence: { source: "install-failed", ensurepip, wheelSha256, stderr: (installed.stderr || installed.stdout).slice(-300) },
      };
    }
    const importEnv = {
      PATH: process.env.PATH || "",
      LANG: "C",
      LC_ALL: "C",
      PYTHONDONTWRITEBYTECODE: "1",
    };
    if (!ensurepip) importEnv.PYTHONPATH = target;
    const imported = await pythonImport(
      python,
      "import glob,json,os,wasmtime; root=os.path.dirname(wasmtime.__file__); sos=glob.glob(root+'/**/*.so', recursive=True); print(json.dumps({'engine':hasattr(wasmtime,'Engine'),'native':[os.path.basename(p) for p in sos]}))",
      importEnv,
    );
    let parsed = null;
    try { parsed = JSON.parse(imported.stdout); } catch { parsed = null; }
    const native = Array.isArray(parsed?.native) && parsed.native.some((name) => name.includes("libwasmtime"));
    return {
      id: "python-native-wasmtime",
      pass: imported.code === 0 && parsed?.engine === true && native,
      evidence: {
        source: ensurepip ? "fresh-venv" : "fresh-target",
        ensurepip,
        engine: parsed?.engine === true,
        native: parsed?.native ?? [],
        wheel,
        wheelSha256,
        pinnedVersion: pins.wasmtimeVersion,
        venvDeleted: true,
        copiedVenvAccepted: false,
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runProbe(options = {}) {
  const checks = [];
  checks.push(await checkLinux());
  checks.push(await checkPython());
  checks.push(await checkPrlimit());
  checks.push(await checkProc());
  checks.push(await checkPipes());
  checks.push(await checkSignals());
  checks.push(await checkTimeout());
  checks.push(await checkLimits());
  checks.push(await checkFixture());
  checks.push(await checkCompiler());
  checks.push(await checkWasmtime(options));
  const failed = checks.filter((check) => !check.pass).map((check) => check.id);
  return finalizeReport({
    probe: "vf08-host-capability",
    notProduction: true,
    wholeHostSandbox: false,
    pins: { vf08Export: pins.vf08Export, f93Export: pins.f93Export },
    failed,
    ok: failed.length === 0,
    checks,
  });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const exerciseWasmtime = process.argv.includes("--exercise-runtime");
  const report = await runProbe({ exerciseWasmtime });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 2);
}
