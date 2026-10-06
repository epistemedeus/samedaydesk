#!/usr/bin/env node
import { access, readFile, realpath } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { verifyOfflineRuntime, MANIFEST } from "./runtime-layout.mjs";
import { CPYTHON_SHA256, WHEEL_SHA256 } from "./materialize-runtime.mjs";
import { runBounded } from "./bounded-child.mjs";
import { limitedPythonLaunch, launcherPins } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/launch.mjs";
import { DEFAULT_LIMITS } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs";

const python = fileURLToPath(new URL(
  "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime/bin/python", import.meta.url,
));
const prlimitPath = "/usr/bin/prlimit";

async function flag(file, mode) {
  return access(file, mode).then(() => true).catch(() => false);
}

// The only executable override is for private diagnostic regressions, never HTTP.
export async function collectProbe({ pythonCommand = "python3", referencePython = python, timeoutMs = 5000 } = {}) {
  const linuxX64 = process.platform === "linux" && process.arch === "x64";
  const procReadable = await Promise.all(["/proc/self/stat", "/proc/sys/kernel/random/boot_id"].map(file => readFile(file, "utf8"))).then(() => true).catch(() => false);
  const procFdReadable = await flag("/proc/self/fd", constants.R_OK | constants.X_OK);
  let childProcReadable = false;
  const prlimit = await flag(prlimitPath, constants.X_OK);
  const system = await runBounded(pythonCommand, ["-I", "-c", "import sys; raise SystemExit(0 if sys.version_info[0]==3 else 1)"], { timeoutMs });
  const ownInterpreter = path.resolve(referencePython) === path.resolve(python);
  let runtimeLayout = null, runtimeLayoutFailure = null;
  if (ownInterpreter && await flag(path.join(path.dirname(path.dirname(python)), MANIFEST), constants.F_OK)) {
    try { runtimeLayout = (await verifyOfflineRuntime(path.dirname(path.dirname(python)),
      { archiveSha256: CPYTHON_SHA256, wheelSha256: WHEEL_SHA256 })).layout; }
    catch (error) {
      runtimeLayoutFailure = ["runtime_layout_invalid", "runtime_layout_link", "runtime_layout_capacity", "runtime_layout_manifest", "runtime_content_changed"].includes(error?.code)
        ? error.code : "runtime_layout_unavailable";
    }
  }
  const installed = runtimeLayoutFailure ? { code: null, reason: runtimeLayoutFailure, stdout: "" }
    : await runBounded(referencePython, ["-I", "-S", "-c", "import sys; assert sys.version_info[0]==3; print('installed-python')"], { timeoutMs, capture: true, stdoutLimit: 128 });
  const installedPython = installed.code === 0 && installed.reason === null && installed.stdout === "installed-python\n";
  const bundledRoot = fileURLToPath(new URL("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.python-standalone/", import.meta.url));
  const legacyBundle = await realpath(referencePython).then(file => file.startsWith(bundledRoot)).catch(() => false);
  if (legacyBundle) runtimeLayout = "legacy-standalone-venv";
  const bundledPython = installedPython && (legacyBundle || runtimeLayout === "self-contained-regular-v1");
  let launcher;
  try { launcher = launcherPins(); } catch {}
  const script = [
    "import json, os, resource",
    "assert resource.getrlimit(resource.RLIMIT_AS) == (536870912,536870912)",
    "assert resource.getrlimit(resource.RLIMIT_CPU) == (2,2)",
    "assert resource.getrlimit(resource.RLIMIT_STACK) == (8388608,8388608)",
    "assert resource.getrlimit(resource.RLIMIT_FSIZE) == (1048576,1048576)",
    "assert resource.getrlimit(resource.RLIMIT_NOFILE) == (32,32)",
    "assert resource.getrlimit(resource.RLIMIT_CORE) == (0,0)",
    "print(json.dumps({'limits':True,'pid':os.getpid()}),flush=True)",
    "import importlib.metadata, wasmtime as w",
    "assert importlib.metadata.version('wasmtime') == '49.0.0'",
    "c = w.Config(); c.consume_fuel = True; c.parallel_compilation = False",
    "e = w.Engine(c)",
    // Fixed installed diagnostic, no caller source or guest imports.
    "m = w.Module(e, w.wat2wasm('(module (func (export \"answer\") (result i32) i32.const 42))'))",
    "assert len(m.imports) == 0",
    "s = w.Store(e); s.set_fuel(1000); s.set_limits(memory_size=262144,instances=1,tables=1,memories=1)",
    "i = w.Instance(s,m,[]); assert i.exports(s)['answer'](s) == 42",
    "assert s.get_fuel() < 1000",
    "print('reference-executed')",
  ].join("\n");
  const plan = limitedPythonLaunch(referencePython, DEFAULT_LIMITS, ["-c", script]);
  const reference = launcher && !runtimeLayoutFailure ? await runBounded(plan.command, plan.args, { env: { LANG: "C", LC_ALL: "C" }, timeoutMs, capture: true, stdoutLimit: 1024,
    onSpawn(pid) { try { const stat = readFileSync(`/proc/${pid}/stat`, "utf8"); childProcReadable = /^[0-9]+$/.test(stat.slice(stat.lastIndexOf(") ")+2).split(" ")[19]); } catch {} } })
    : { code: null, reason: runtimeLayoutFailure || "launcher_identity_unavailable", stdout: "", pid: null };
  let launcherIdentityStable = false;
  try { launcherIdentityStable = Boolean(launcher && JSON.stringify(launcher) === JSON.stringify(launcherPins())); } catch {}
  const lines = reference.stdout.trim().split("\n");
  let enforcement, launcherFailure;
  try { enforcement = JSON.parse(lines[0]);
    if (["launcher_arguments_invalid", "launcher_resource_unavailable", "launcher_limits_unavailable", "launcher_exec_failed"].includes(enforcement.result?.code)) launcherFailure = enforcement.result.code;
  } catch {}
  const pidPreserved = enforcement?.limits === true && enforcement.pid === reference.pid;
  const osLimitsEnforced = reference.reason === null && pidPreserved;
  const referenceRuntime = reference.code === 0 && reference.reason === null && launcherIdentityStable && osLimitsEnforced && lines.length === 2 && lines[1] === "reference-executed";
  const referenceFailure = reference.reason || launcherFailure || (!launcherIdentityStable ? "launcher_identity_changed" : null) || (referenceRuntime ? null : "execution_failed");
  const unsupportedHostReasons = [!linuxX64 && "linux_x64_required", (!procReadable || !procFdReadable || !childProcReadable) && "proc_unavailable",
    !installedPython && "installed_python_unavailable", !referenceRuntime && (referenceFailure || "reference_execution_unavailable")].filter(Boolean);
  return {
    probe: "managed-node", ok: unsupportedHostReasons.length === 0,
    linuxX64, node: process.version, python3: system.code === 0 && system.reason === null,
    installedPython, bundledPython, runtimeLayout, runtimeLayoutFailure, installedPythonFailure: installed.reason || (installedPython ? null : "execution_failed"),
    prlimit, procReadable, procFdReadable, childProcReadable, referenceRuntime, osLimitsEnforced, pidPreserved,
    referenceExecution: referenceRuntime, referenceFailure,
    pythonFailure: system.reason || (system.code === 0 ? null : "execution_failed"),
    osLimitMechanism: "python-setrlimit-before-exec", launcher: launcher || null, launcherIdentityStable, unsupportedHostReasons,
    productionActivate: "HOLD", activation: false, notProduction: true, wholeHostSandbox: false,
    privatePythonWebServer: false, referenceProfileRetained: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectProbe();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 2;
}
