#!/usr/bin/env node
/**
 * Child process so W5_M01_ENGINE_ROOTS cannot leak into other tests.
 * Prints one JSON object describing runEngineForD01 timeout fields.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { d01Module } from "../lib/kit.mjs";
import { killIsolate, pidAlive } from "../lib/process.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hangSrc = join(here, "../fixtures/hang.mjs");
const isolate = mkdtempSync(join(tmpdir(), "w5-d16-final-m01hang-"));
const engineRoot = join(isolate, "lockfile-pin-delta");
mkdirSync(join(engineRoot, "bin"), { recursive: true });
const hangBin = join(engineRoot, "bin/lockfile-delta.mjs");
writeFileSync(hangBin, readFileSync(hangSrc));
chmodSync(hangBin, 0o755);
const pidFile = join(isolate, "hang.pid");
const outDir = mkdtempSync(join(isolate, "out-"));
process.env.W5_M01_ENGINE_ROOTS = JSON.stringify({ "lockfile-pin-delta": engineRoot });
process.env.D16_FINAL_PIDFILE = pidFile;

const before = process.argv[2];
const after = process.argv[3];
const adapterUrl = pathToFileURL(d01Module("experiments/wave5/m01/lib/d01-adapter.mjs")).href;
const contractUrl = pathToFileURL(d01Module("server/paid-useful-jobs/lib/contract.mjs")).href;
const { runEngineForD01 } = await import(adapterUrl);
const { classifyTransport } = await import(contractUrl);

const started = Date.now();
const engine = runEngineForD01("lockfile-pin-delta", {
  files: { before, after },
  outDir,
  timeoutMs: 600,
});
const elapsedMs = Date.now() - started;
const transport = classifyTransport({ engine, timeout: Boolean(engine.timedOut) });
const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
const aliveAfterReturn = pidAlive(pid);
const killed = killIsolate(isolate);
process.stdout.write(
  `${JSON.stringify({
    elapsedMs,
    status: engine.status,
    timedOut: engine.timedOut,
    signal: engine.signal,
    json: engine.json,
    transport,
    pid,
    aliveAfterReturn,
    killed,
    isolate,
  })}\n`,
);
process.exit(0);
