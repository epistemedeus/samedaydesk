#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runBounded } from "./bounded-child.mjs";

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
  const script = [
    "import importlib.metadata, resource, wasmtime as w",
    "assert importlib.metadata.version('wasmtime') == '49.0.0'",
    "assert resource.getrlimit(resource.RLIMIT_AS) == (536870912,536870912)",
    "assert resource.getrlimit(resource.RLIMIT_CPU) == (2,2)",
    "assert resource.getrlimit(resource.RLIMIT_STACK) == (8388608,8388608)",
    "assert resource.getrlimit(resource.RLIMIT_FSIZE) == (1048576,1048576)",
    "assert resource.getrlimit(resource.RLIMIT_NOFILE) == (32,32)",
    "assert resource.getrlimit(resource.RLIMIT_CORE) == (0,0)",
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
  const reference = await runBounded(prlimitPath, [
    "--as=536870912:536870912", "--cpu=2:2", "--stack=8388608:8388608",
    "--fsize=1048576:1048576", "--nofile=32:32", "--core=0:0", "--", referencePython, "-I", "-B", "-c", script,
  ], { env: { LANG: "C", LC_ALL: "C" }, timeoutMs, capture: true, stdoutLimit: 128,
    onSpawn(pid) { try { const stat = readFileSync(`/proc/${pid}/stat`, "utf8"); childProcReadable = /^[0-9]+$/.test(stat.slice(stat.lastIndexOf(") ")+2).split(" ")[19]); } catch {} } });
  const referenceRuntime = reference.code === 0 && reference.reason === null && reference.stdout === "reference-executed\n";
  return {
    probe: "managed-node", ok: linuxX64 && procReadable && procFdReadable && childProcReadable && prlimit && referenceRuntime,
    linuxX64, node: process.version, python3: system.code === 0 && system.reason === null,
    prlimit, procReadable, procFdReadable, childProcReadable, referenceRuntime, osLimitsEnforced: referenceRuntime,
    referenceExecution: referenceRuntime, referenceFailure: reference.reason || (referenceRuntime ? null : "execution_failed"),
    pythonFailure: system.reason || (system.code === 0 ? null : "execution_failed"),
    osLimitMechanism: prlimit ? "prlimit-before-exec" : "unavailable",
    productionActivate: "HOLD", activation: false, notProduction: true, wholeHostSandbox: false,
    privatePythonWebServer: false, referenceProfileRetained: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectProbe();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 2;
}
