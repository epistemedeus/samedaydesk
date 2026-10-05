#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const python = fileURLToPath(new URL(
  "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime/bin/python",
  import.meta.url,
));
const embed = fileURLToPath(new URL("./wasmtime49-embed/bin/foundry-wasmtime49", import.meta.url));

function spawnCollected(command, args, { env, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: env || { PATH: process.env.PATH || "", LANG: "C", LC_ALL: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (buf) => { stdout = (stdout + buf).slice(-4000); });
    child.once("error", () => resolve({ code: null, stdout }));
    child.once("exit", (code) => resolve({ code, stdout }));
    if (input == null) child.stdin.end();
    else child.stdin.end(input);
  });
}

async function flag(file, mode) {
  try {
    await access(file, mode);
    return true;
  } catch {
    return false;
  }
}

export async function collectProbe() {
  const linuxX64 = process.platform === "linux" && process.arch === "x64";
  const procReadable = await readFile("/proc/self/stat", "utf8").then(() => true).catch(() => false);
  const prlimit = await flag("/usr/bin/prlimit", constants.X_OK);
  const python3 = (await spawnCollected("python3", ["-c", "import sys; raise SystemExit(0 if sys.version_info[0]==3 else 1)"])).code === 0;
  const embedProbeRun = await spawnCollected(embed, ["--probe"], { env: { LANG: "C", LC_ALL: "C" } });
  let embedProbe = false;
  try {
    const body = JSON.parse(embedProbeRun.stdout);
    embedProbe = body.ok === true && body.version === "49.0.0" && body.runtime === "wasmtime-capi" && body.wasi === false;
  } catch {
    embedProbe = false;
  }
  const limitsRun = await spawnCollected(embed, [
    "--as=536870912", "--cpu=2", "--stack=8388608", "--fsize=1048576", "--nofile=32",
  ], { env: { LANG: "C", LC_ALL: "C" }, input: "" });
  let embedLimits = false;
  let embedLimitCode = null;
  try {
    const line = limitsRun.stdout.trim().split("\n").pop();
    const body = JSON.parse(line);
    embedLimitCode = body.result?.code || null;
    embedLimits = body.result?.status === "error" && embedLimitCode === "request_size";
  } catch {
    embedLimits = false;
  }
  const reference = await spawnCollected(python, ["-I", "-c", "import importlib.metadata; raise SystemExit(0 if importlib.metadata.version('wasmtime')=='49.0.0' else 1)"]);
  const referenceRuntime = reference.code === 0;
  const referenceRoute = linuxX64 && procReadable && prlimit && referenceRuntime;
  const embedRoute = linuxX64 && procReadable && embedProbe && embedLimits;
  return {
    probe: "managed-node",
    ok: referenceRoute || embedRoute,
    linuxX64,
    node: process.version,
    python3,
    prlimit,
    procReadable,
    referenceRuntime,
    embedProbe,
    embedLimits,
    embedLimitCode,
    osLimitMechanism: prlimit ? "prlimit-then-setrlimit" : (embedLimits ? "setrlimit-after-exec" : "unavailable"),
    productionActivate: "HOLD",
    activation: false,
    notProduction: true,
    wholeHostSandbox: false,
    privatePythonWebServer: false,
    referenceProfileRetained: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectProbe();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
