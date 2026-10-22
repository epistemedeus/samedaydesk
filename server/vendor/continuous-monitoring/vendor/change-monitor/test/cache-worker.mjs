import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { acquireReleaseGate } from "../src/runtime/acquire-release-gate.mjs";

const cacheDir = process.argv[2];
const source = process.argv[3];
const readyFile = process.argv[4];
const goFile = process.argv[5];

if (readyFile) {
  writeFileSync(readyFile, "ready\n");
  const started = Date.now();
  while (!existsSync(goFile)) {
    if (Date.now() - started > 15000) throw new Error("second process did not start");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

const options = { cacheDir };
if (source !== "cache-only") options.bytes = readFileSync(source);
const gate = await acquireReleaseGate(options);
let behavior = "none";
try {
  const result = gate.evaluateRelease({});
  behavior = result && result.executed === "tampered-cache" ? "tampered" : "returned";
} catch (error) {
  behavior = error && error.name === "DomainError" ? "domain-error" : `error:${error && error.name}`;
}
const modulePath = gate.identity.modulePath;
const evaluatePath = path.join(path.dirname(modulePath), "evaluate.mjs");
const moduleBytes = readFileSync(modulePath);
const evaluateBytes = readFileSync(evaluatePath);
process.stdout.write(`${JSON.stringify({
  sha256: gate.identity.sha256,
  acquiredFrom: gate.identity.acquiredFrom,
  moduleResolved: gate.identity.moduleResolved,
  executableBound: gate.identity.executableBound,
  extraction: gate.identity.extraction,
  modulePath,
  moduleSha256: gate.identity.moduleSha256,
  moduleIno: statSync(modulePath).ino,
  evaluatePath,
  evaluateSha256: createHash("sha256").update(evaluateBytes).digest("hex"),
  treeSha256: gate.identity.treeSha256,
  behavior,
  executedFlag: globalThis.__CHANGE_MONITOR_EXECUTED_SOURCE || null,
  moduleBytes: moduleBytes.length,
  evaluateBytes: evaluateBytes.length,
})}\n`);
