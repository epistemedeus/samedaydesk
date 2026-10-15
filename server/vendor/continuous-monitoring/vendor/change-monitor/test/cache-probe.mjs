#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, "cache-worker.mjs");
const archiveArg = process.argv[2];
const PIN = "f14eac0c4c10bba3f3d8b2e89d6eed1a87f47077bb06a7c70f96409ced9d7bef";
const TAMPER = `globalThis.__CHANGE_MONITOR_EXECUTED_SOURCE = "tampered-cache";
export const RECEIPT_SCHEMA = "release-gate.receipt.v1";
export function evaluateRelease() {
  return { executed: "tampered-cache", launched: true, accepted: true };
}
`;

if (!archiveArg) {
  process.stderr.write("usage: cache-probe.mjs <release-gate-0.1.4.tgz>\n");
  process.exit(1);
}

const archive = path.resolve(archiveArg);
const archiveBytes = readFileSync(archive);
const archiveSha = createHash("sha256").update(archiveBytes).digest("hex");
if (archiveSha !== PIN) {
  process.stderr.write("probe archive is not Release Gate 0.1.4\n");
  process.exit(1);
}

function memberBytes(name) {
  return execFileSync("tar", ["-xOf", archive, name], { maxBuffer: 1024 * 1024 });
}

const indexBytes = memberBytes("package/src/index.mjs");
const evaluateBytes = memberBytes("package/src/evaluate.mjs");
const indexSha = createHash("sha256").update(indexBytes).digest("hex");
const evaluateSha = createHash("sha256").update(evaluateBytes).digest("hex");
let treeSha = null;

function fail(message, detail) {
  process.stderr.write(`${message}\n`);
  if (detail) process.stderr.write(`${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}\n`);
  process.exit(1);
}

function runWorker(cacheDir, mode, barrier) {
  const args = [worker, cacheDir, mode === "bytes" ? archive : "cache-only"];
  if (barrier) args.push(barrier.ready, barrier.go);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, NODE_PATH: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function accept(name, child, cacheDir) {
  if (!child || child.status !== 0) fail(`${name} process failed`, child);
  let body;
  try {
    body = JSON.parse(child.stdout);
  } catch {
    fail(`${name} did not print identity`, child);
  }
  const moduleReal = realpathSync(body.modulePath);
  const cacheReal = realpathSync(cacheDir);
  if (!moduleReal.startsWith(`${cacheReal}${path.sep}`)) fail(`${name} executed outside its cache`, body);
  if (body.sha256 !== PIN) fail(`${name} reported a different archive`, body);
  if (body.behavior !== "domain-error" || body.executedFlag !== null) fail(`${name} executed a cached substitute`, body);
  if (body.executableBound !== true || body.moduleResolved !== true) fail(`${name} was not bound to the archive`, body);
  if (body.moduleSha256 !== indexSha || body.evaluateSha256 !== evaluateSha) fail(`${name} module hash diverged`, body);
  const consumedIndex = readFileSync(body.modulePath);
  const consumedEvaluate = readFileSync(body.evaluatePath);
  if (!consumedIndex.equals(indexBytes) || !consumedEvaluate.equals(evaluateBytes)) {
    fail(`${name} consumed bytes that are not the archive members`, body);
  }
  if (lstatSync(moduleReal).isSymbolicLink() || !moduleReal.endsWith(`${path.sep}package${path.sep}src${path.sep}index.mjs`)) {
    fail(`${name} module path is not the archived file`, body);
  }
  if (treeSha == null) treeSha = body.treeSha256;
  else if (body.treeSha256 !== treeSha) fail(`${name} tree digest diverged`, body);
  return body;
}

function waitFor(file) {
  const started = Date.now();
  while (!existsSync(file)) {
    if (Date.now() - started > 15000) fail(`timed out waiting for ${file}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

const coldDir = mkdtempSync(path.join(tmpdir(), "cm-cache-cold-"));
const cold = accept("cold", await runWorker(coldDir, "bytes"), coldDir);
if (cold.acquiredFrom !== "supplied-bytes" || cold.extraction !== "published") fail("cold extraction was not published", cold);
if (!cold.modulePath.includes(`${path.sep}bound${path.sep}`)) fail("cold module is not content-addressed", cold);

const warm = accept("warm", await runWorker(coldDir, "cache-only"), coldDir);
if (warm.acquiredFrom !== "verified-cache" || warm.extraction !== "reused") fail("warm cache was not reused", warm);
if (warm.modulePath !== cold.modulePath || warm.moduleIno !== cold.moduleIno) fail("warm cache replaced a usable extraction", { cold, warm });

const tamperDir = mkdtempSync(path.join(tmpdir(), "cm-cache-tamper-"));
const tamperBase = accept("tamper-setup", await runWorker(tamperDir, "bytes"), tamperDir);
writeFileSync(tamperBase.modulePath, TAMPER);
writeFileSync(tamperBase.evaluatePath, TAMPER);
const tampered = accept("tampered", await runWorker(tamperDir, "cache-only"), tamperDir);
if (readFileSync(tamperBase.modulePath, "utf8") !== TAMPER) fail("tampered extraction was deleted");
if (tampered.modulePath === tamperBase.modulePath || tampered.extraction !== "private") fail("tampered tree was executed", tampered);
if (!tampered.modulePath.includes(`${path.sep}.staging${path.sep}`)) fail("tamper recovery did not stay on a private tree", tampered);

const linkDir = mkdtempSync(path.join(tmpdir(), "cm-cache-link-"));
const linkBase = accept("symlink-setup", await runWorker(linkDir, "bytes"), linkDir);
const outside = path.join(linkDir, "outside-gate.mjs");
writeFileSync(outside, TAMPER);
rmSync(linkBase.modulePath);
symlinkSync(outside, linkBase.modulePath);
const linked = accept("symlink", await runWorker(linkDir, "cache-only"), linkDir);
if (!lstatSync(linkBase.modulePath).isSymbolicLink()) fail("symlink cache entry was removed");
if (realpathSync(linked.modulePath) === realpathSync(outside)) fail("symlink target was executed", linked);
if (linked.extraction !== "private") fail("symlink cache was treated as usable", linked);

const partialDir = mkdtempSync(path.join(tmpdir(), "cm-cache-partial-"));
const partialBase = accept("partial-setup", await runWorker(partialDir, "bytes"), partialDir);
const srcDir = path.dirname(partialBase.modulePath);
rmSync(srcDir, { recursive: true, force: true });
mkdirSync(srcDir, { recursive: true });
const partialIndex = path.join(srcDir, "index.mjs");
writeFileSync(partialIndex, TAMPER);
const partial = accept("partial", await runWorker(partialDir, "cache-only"), partialDir);
if (readFileSync(partialIndex, "utf8") !== TAMPER) fail("partial extraction was deleted");
if (partial.modulePath === partialIndex || partial.extraction !== "private") fail("partial tree was executed", partial);

const legacyDir = mkdtempSync(path.join(tmpdir(), "cm-cache-legacy-"));
const legacyUnpack = path.join(legacyDir, "unpack");
mkdirSync(legacyUnpack, { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", legacyUnpack], { stdio: "ignore" });
writeFileSync(path.join(legacyDir, "release-gate-0.1.4.tgz"), archiveBytes);
const legacyIndex = path.join(legacyUnpack, "package/src/index.mjs");
const legacyIno = statSync(legacyIndex).ino;
const legacy = accept("legacy", await runWorker(legacyDir, "cache-only"), legacyDir);
if (statSync(legacyIndex).ino !== legacyIno) fail("usable legacy unpack was replaced");
if (realpathSync(legacy.modulePath) !== realpathSync(legacyIndex)) fail("legacy unpack was not the executed tree", legacy);
if (existsSync(path.join(legacyDir, "bound"))) fail("legacy cache was published a second time");
if (legacy.acquiredFrom !== "verified-cache" || legacy.extraction !== "reused") fail("legacy cache was not reused", legacy);

const raceDir = mkdtempSync(path.join(tmpdir(), "cm-cache-race-"));
const foreign = path.join(raceDir, "foreign-live");
mkdirSync(foreign, { recursive: true });
writeFileSync(path.join(foreign, "KEEP"), "live-extraction\n");
const readyA = path.join(raceDir, "ready-a");
const readyB = path.join(raceDir, "ready-b");
const go = path.join(raceDir, "go");
const first = runWorker(raceDir, "bytes", { ready: readyA, go });
const second = runWorker(raceDir, "bytes", { ready: readyB, go });
waitFor(readyA);
waitFor(readyB);
writeFileSync(go, "go\n");
const concurrentA = accept("concurrent-a", await first, raceDir);
const concurrentB = accept("concurrent-b", await second, raceDir);
if (concurrentA.moduleSha256 !== concurrentB.moduleSha256) fail("concurrent readers diverged", { concurrentA, concurrentB });
if (readFileSync(path.join(foreign, "KEEP"), "utf8") !== "live-extraction\n") fail("a concurrent acquire deleted another extraction");
if (!existsSync(concurrentA.modulePath) || !existsSync(concurrentB.modulePath)) fail("a concurrent acquire deleted a live module");

process.stdout.write(`${JSON.stringify({
  ok: true,
  archiveSha256: archiveSha,
  indexSha256: indexSha,
  evaluateSha256: evaluateSha,
  treeSha256: treeSha,
  seededFailure: {
    name: "edited-cache-module",
    rejected: true,
    sameExports: ["RECEIPT_SCHEMA", "evaluateRelease"],
  },
  cases: {
    cold: { extraction: cold.extraction, acquiredFrom: cold.acquiredFrom, moduleSha256: cold.moduleSha256 },
    warm: { extraction: warm.extraction, acquiredFrom: warm.acquiredFrom, moduleIno: warm.moduleIno },
    tampered: { extraction: tampered.extraction, behavior: tampered.behavior, executedFlag: tampered.executedFlag },
    symlink: { extraction: linked.extraction, behavior: linked.behavior },
    partial: { extraction: partial.extraction, behavior: partial.behavior },
    legacy: { extraction: legacy.extraction, acquiredFrom: legacy.acquiredFrom },
    concurrentA: { extraction: concurrentA.extraction, moduleSha256: concurrentA.moduleSha256 },
    concurrentB: { extraction: concurrentB.extraction, moduleSha256: concurrentB.moduleSha256 },
  },
}, null, 2)}\n`);
