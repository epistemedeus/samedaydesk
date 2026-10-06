#!/usr/bin/env node
import { createHash } from "node:crypto";
import { runBounded } from "./bounded-child.mjs";
import { access, cp, mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {LAYOUT,MANIFEST,runtimeContentIdentity,sealOfflineRuntime,verifyOfflineRuntime} from './runtime-layout.mjs';

import { WHEEL_URL, WHEEL_SHA256, CPYTHON_URL, CPYTHON_SHA256 } from "./runtime-artifacts.mjs";
export { WHEEL_URL, WHEEL_SHA256, CPYTHON_URL, CPYTHON_SHA256 } from "./runtime-artifacts.mjs";

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

async function installStandalone({ runtimeDir, tarball, wheelPath, expectedContent = null }) {
  await mkdir(path.dirname(runtimeDir), { recursive: true });
  // Build-only staging. Candidate failure never changes an existing runtime.
  const stage = await mkdtemp(path.join(path.dirname(runtimeDir), ".runtime-stage-"));
  const candidate = path.join(stage, "candidate");
  let backup, retainStage = false;
  try {
    const bytes = tarball ? await boundedFile(tarball, 40 * 1024 * 1024) : await download(CPYTHON_URL, 40 * 1024 * 1024);
    if (sha256(bytes) !== CPYTHON_SHA256) throw coded("cpython_checksum");
    const archive = path.join(stage, "cpython.tar.gz");
    await writeFile(archive, bytes);
    const unpacked = await run("tar", ["-xzf", archive, "-C", stage]);
    if (unpacked.code !== 0) throw coded("runtime_setup_failed");
    // Colocate the full pinned installation. Make internal executable/library
    // aliases regular files so an archive or ordinary copy cannot rebase links.
    await cp(path.join(stage, "python"), candidate, { recursive: true, dereference: true });
    // The unchanged sealed loader needs version metadata. Omit venv's absolute
    // home override: CPython discovers its stdlib beside its own executable.
    await writeFile(path.join(candidate, "pyvenv.cfg"), "include-system-site-packages = false\nversion = 3.12.15\n");
    const installedPython = path.join(candidate, "bin", "python");
    let wheel = wheelPath, tempWheel = "";
    if (!wheel) {
      const bytes = await download(WHEEL_URL, 11 * 1024 * 1024);
      if (sha256(bytes) !== WHEEL_SHA256) throw coded("wheel_checksum");
      tempWheel = await mkdtemp(path.join(tmpdir(), "sds-wheel-"));
      wheel = path.join(tempWheel, "wasmtime.whl");
      await writeFile(wheel, bytes, { mode: 0o600 });
    } else if (sha256(await boundedFile(wheel, 11 * 1024 * 1024)) !== WHEEL_SHA256) {
      throw coded("wheel_checksum");
    }
    try { await installWheel(installedPython, wheel); }
    finally { if (tempWheel) await rm(tempWheel, { recursive: true, force: true }); }
    if (!(await runtimeReady(installedPython))) throw coded("runtime_setup_failed");
    const sealed = await sealOfflineRuntime(candidate, { archiveSha256: CPYTHON_SHA256, wheelSha256: WHEEL_SHA256 });
    if (expectedContent && JSON.stringify(sealed.content) !== JSON.stringify(expectedContent)) throw coded("runtime_identity_changed");
    if (expectedContent) {
      if (JSON.stringify(await runtimeContentIdentity(runtimeDir)) !== JSON.stringify(expectedContent)) throw coded("runtime_identity_changed");
      backup = path.join(stage, "previous");
      await rename(runtimeDir, backup);
    }
    try { await rename(candidate, runtimeDir); }
    catch (error) {
      if (backup) try { await rename(backup, runtimeDir); }
      catch { retainStage = true; throw coded("runtime_layout_restore_failed"); }
      throw error;
    }
    return { layout: LAYOUT, deployable: true, contentPreserved: expectedContent ? true : null };
  } finally {
    // Keep the previous directory available if rollback itself failed.
    if (!retainStage) await rm(stage, { recursive: true, force: true });
  }
}

export async function materializeReferenceRuntime(options = {}) {
  if (process.platform !== "linux" || process.arch !== "x64") throw coded("runtime_platform");
  const executionRoot = options.executionRoot || defaultExecutionRoot;
  const runtimeDir = options.runtimeDir || path.join(executionRoot, ".runtime");
  const python = path.join(runtimeDir, "bin", "python");
  const childTimeoutMs = options.childTimeoutMs ?? 30_000;
  const deployable = options.deployable === true;
  const standaloneDir = options.standaloneDir || path.join(path.dirname(runtimeDir), ".python-standalone");
  if (await exists(runtimeDir)) {
    if (await exists(path.join(runtimeDir, MANIFEST))) {
      let layout;
      try { layout = await verifyOfflineRuntime(runtimeDir, { archiveSha256: CPYTHON_SHA256, wheelSha256: WHEEL_SHA256 }); }
      catch(error) {
        if(error.code!=='runtime_publication_modes' || !deployable)throw error;
        // Explicit build-time receiving only; stage the pinned bytes and atomically
        // publish them. Never chmod an existing delivery during an HTTP request.
        const expectedContent=await runtimeContentIdentity(runtimeDir);
        layout=await installStandalone({runtimeDir,expectedContent,tarball:options.tarball||process.env.FOUNDRY_CPYTHON_TARBALL||'',wheelPath:options.wheelPath||''});
        return {ok:true,action:'publication-received',...layout};
      }
      if (!(await runtimeReady(python, childTimeoutMs))) throw coded("runtime_incomplete");
      return { ok: true, action: "present", ...layout };
    }
    if (deployable || await exists(path.join(standaloneDir, "bin/python3"))) {
      let expectedContent;
      try { expectedContent = await runtimeContentIdentity(runtimeDir); }
      catch { throw coded("runtime_incomplete"); }
      const layout = await installStandalone({ runtimeDir, tarball: options.tarball || process.env.FOUNDRY_CPYTHON_TARBALL || "",
        wheelPath: options.wheelPath || "", expectedContent });
      return { ok: true, action: "layout-received", ...layout };
    }
    if (await exists(python) && await runtimeReady(python, childTimeoutMs)) return { ok: true, action: "present", layout: "host-venv", deployable: false };
    throw coded("runtime_incomplete");
  }
  const forceStandalone = deployable || options.forceStandalone === true || process.env.FOUNDRY_RUNTIME_FORCE_STANDALONE === "1";
  const defaultRuntime = path.resolve(runtimeDir) === path.resolve(executionRoot, ".runtime");
  const system = await runBounded("python3", ["-I", "-c", "import sys; raise SystemExit(0 if sys.version_info[0]==3 else 1)"], { timeoutMs: 5000 });
  try {
    if (!forceStandalone && defaultRuntime && system.code === 0 && !system.reason) {
      const setup = path.join(executionRoot, "setup-runtime.py");
      const result = await run("python3", [setup], { cwd: executionRoot, timeoutMs: 60_000 });
      if (result.code !== 0 || !(await runtimeReady(python))) throw coded("runtime_setup_failed");
      return { ok: true, action: "setup-runtime.py" };
    }
    const layout=await installStandalone({ runtimeDir,
      tarball: options.tarball || process.env.FOUNDRY_CPYTHON_TARBALL || "", wheelPath: options.wheelPath || "" });
    return { ok: true, action: "cpython-standalone",...layout };
  } catch (error) {
    await rm(runtimeDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.slice(2).some(a=>a!=='--deployable') || process.argv.length>3)throw coded('runtime_arguments_invalid');
    const result = await materializeReferenceRuntime({deployable:process.argv.includes('--deployable')});
    process.stdout.write(`${JSON.stringify({ ...result, privatePythonWebServer: false })}\n`);
  } catch (error) {
    process.stderr.write(`${error.code || "runtime_setup_failed"}\n`);
    process.exit(1);
  }
}
