#!/usr/bin/env node
import { createHash } from "node:crypto";
import { runBounded } from "./bounded-child.mjs";
import { access, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WHEEL_URL = "https://files.pythonhosted.org/packages/6b/49/d62b41a6ae9063681bb6af018ff49b75d49f853bbf672c7ddebedf21d69e/wasmtime-49.0.0-py3-none-manylinux1_x86_64.whl";
export const WHEEL_SHA256 = "94f0288f9e1c33924995a72bb769f4c4e2885002391589dd6992cdaa35d1990a";
export const CPYTHON_URL = "https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.12.15%2B20261003-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz";
export const CPYTHON_SHA256 = "731af898886c5f821890dc901eca3c651cca8e51fa7308c159d12a1194aeac91";

const defaultExecutionRoot = fileURLToPath(new URL(
  "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/",
  import.meta.url,
));

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function run(command, args, options = {}) {
  const result = await runBounded(command, args, options);
  if (result.reason) throw coded(`runtime_child_${result.reason}`);
  return result;
}

async function boundedFile(file, limit) {
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw coded("runtime_download_failed");
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) throw coded("runtime_download_failed");
    return bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function download(url, limit, { timeoutMs = 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader;
  try {
    const response = await fetch(url, { signal: controller.signal });
    reader = response.body?.getReader();
    const length = Number(response.headers.get("content-length"));
    if (!response.ok || !reader || length > limit) throw coded("runtime_download_failed");
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw coded("runtime_download_failed");
      chunks.push(Buffer.from(value));
    }
    if (size === 0) throw coded("runtime_download_failed");
    return Buffer.concat(chunks, size);
  } catch {
    throw coded("runtime_download_failed");
  } finally {
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    clearTimeout(timer);
  }
}

async function runtimeReady(python, timeoutMs = 30_000) {
  const result = await run(python, ["-I", "-c", "import importlib.metadata, wasmtime as w; assert importlib.metadata.version('wasmtime')=='49.0.0'; e=w.Engine(); m=w.Module(e, b'\\x00asm\\x01\\x00\\x00\\x00'); w.Instance(w.Store(e), m, [])"], { timeoutMs });
  return result.code === 0;
}

export async function installWheel(python, wheelPath, { timeoutMs = 30_000 } = {}) {
  const located = await run(python, ["-I", "-c", "import sysconfig; print(sysconfig.get_path('purelib'))"],
    { capture: true, stdoutLimit: 4096, timeoutMs });
  const pure = located.stdout.trim();
  if (located.code !== 0 || !path.isAbsolute(pure) || /[\r\n\0]/.test(pure)) throw coded("runtime_setup_failed");
  const script = [
    "import pathlib, sys, zipfile",
    "wheel, site = sys.argv[1], pathlib.Path(sys.argv[2])",
    "site.mkdir(parents=True, exist_ok=True)",
    "with zipfile.ZipFile(wheel) as archive:",
    "    for name in archive.namelist():",
    "        parts = pathlib.PurePosixPath(name).parts",
    "        if name.startswith('/') or '..' in parts:",
    "            raise SystemExit('wheel path')",
    "    archive.extractall(site)",
  ].join("\n");
  const extracted = await run(python, ["-I", "-c", script, wheelPath, pure], { timeoutMs });
  if (extracted.code !== 0) throw coded("runtime_setup_failed");
}

async function installStandalone({ runtimeDir, standaloneDir, tarball, wheelPath }) {
  const python = path.join(standaloneDir, "bin", "python3");
  await mkdir(path.dirname(standaloneDir), { recursive: true });
  if (!(await exists(python))) {
    const bytes = tarball ? await boundedFile(tarball, 40 * 1024 * 1024) : await download(CPYTHON_URL, 40 * 1024 * 1024);
    if (sha256(bytes) !== CPYTHON_SHA256) throw coded("cpython_checksum");
    const temp = await mkdtemp(path.join(tmpdir(), "sds-cpython-"));
    try {
      const archive = path.join(temp, "cpython.tar.gz");
      await writeFile(archive, bytes);
      const unpacked = await run("tar", ["-xzf", archive, "-C", temp]);
      if (unpacked.code !== 0) throw coded("runtime_setup_failed");
      const moved = await run("mv", [path.join(temp, "python"), standaloneDir]);
      if (moved.code !== 0) throw coded("runtime_setup_failed");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
  if (await exists(runtimeDir)) throw coded("runtime_incomplete");
  const venv = await run(python, ["-m", "venv", "--without-pip", runtimeDir]);
  if (venv.code !== 0) throw coded("runtime_setup_failed");
  const venvPython = path.join(runtimeDir, "bin", "python");
  let wheel = wheelPath;
  let tempWheel = "";
  if (!wheel) {
    const bytes = await download(WHEEL_URL, 11 * 1024 * 1024);
    if (sha256(bytes) !== WHEEL_SHA256) throw coded("wheel_checksum");
    tempWheel = await mkdtemp(path.join(tmpdir(), "sds-wheel-"));
    wheel = path.join(tempWheel, "wasmtime.whl");
    await writeFile(wheel, bytes, { mode: 0o600 });
  } else if (sha256(await boundedFile(wheel, 11 * 1024 * 1024)) !== WHEEL_SHA256) {
    throw coded("wheel_checksum");
  }
  try {
    await installWheel(venvPython, wheel);
  } finally {
    if (tempWheel) await rm(tempWheel, { recursive: true, force: true });
  }
  if (!(await runtimeReady(venvPython))) throw coded("runtime_setup_failed");
}

export async function materializeReferenceRuntime(options = {}) {
  if (process.platform !== "linux" || process.arch !== "x64") throw coded("runtime_platform");
  const executionRoot = options.executionRoot || defaultExecutionRoot;
  const runtimeDir = options.runtimeDir || path.join(executionRoot, ".runtime");
  const python = path.join(runtimeDir, "bin", "python");
  const childTimeoutMs = options.childTimeoutMs ?? 30_000;
  if (await exists(python) && await runtimeReady(python, childTimeoutMs)) {
    return { ok: true, action: "present" };
  }
  if (await exists(runtimeDir)) throw coded("runtime_incomplete");
  const forceStandalone = options.forceStandalone === true || process.env.FOUNDRY_RUNTIME_FORCE_STANDALONE === "1";
  const defaultRuntime = path.resolve(runtimeDir) === path.resolve(executionRoot, ".runtime");
  const system = await runBounded("python3", ["-I", "-c", "import sys; raise SystemExit(0 if sys.version_info[0]==3 else 1)"], { timeoutMs: 5000 });
  try {
    if (!forceStandalone && defaultRuntime && system.code === 0 && !system.reason) {
      const setup = path.join(executionRoot, "setup-runtime.py");
      const result = await run("python3", [setup], { cwd: executionRoot, timeoutMs: 60_000 });
      if (result.code !== 0 || !(await runtimeReady(python))) throw coded("runtime_setup_failed");
      return { ok: true, action: "setup-runtime.py" };
    }
    const standaloneDir = options.standaloneDir || path.join(path.dirname(runtimeDir), ".python-standalone");
    await installStandalone({ runtimeDir, standaloneDir,
      tarball: options.tarball || process.env.FOUNDRY_CPYTHON_TARBALL || "", wheelPath: options.wheelPath || "" });
    return { ok: true, action: "cpython-standalone" };
  } catch (error) {
    await rm(runtimeDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await materializeReferenceRuntime();
    process.stdout.write(`${JSON.stringify({ ok: true, action: result.action, privatePythonWebServer: false })}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || "runtime_setup_failed"}\n`);
    process.exit(1);
  }
}
