import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_LIB, PINS_LIB, BROKEN_DIR } from "./paths.mjs";

export async function loadEngine() {
  return import(ENGINE_LIB);
}

export async function loadPins() {
  return import(PINS_LIB);
}

export async function loadWrapper() {
  const { WRAPPER_LIB } = await import("./paths.mjs");
  return import(WRAPPER_LIB);
}

export function wipeKitCache(cacheRootPath) {
  rmSync(cacheRootPath, { recursive: true, force: true });
}

export async function extractKit() {
  const { ensureUsefulJobsKit, cacheRoot, kitPath } = await loadEngine();
  const kit = ensureUsefulJobsKit();
  return { kit, cacheRoot: cacheRoot(), kitPath: kitPath() };
}

export async function replaceKitCli(sourceName) {
  const { USEFUL_JOBS_CLI } = await loadPins();
  const { kit } = await extractKit();
  const dest = join(kit, USEFUL_JOBS_CLI);
  const src = join(BROKEN_DIR, sourceName);
  writeFileSync(dest, readFileSync(src));
  chmodSync(dest, 0o755);
  return dest;
}

export async function replaceAppCli(jobId, sourceName) {
  const { kit } = await extractKit();
  const dest = join(kit, "apps", jobId, "cli.mjs");
  writeFileSync(dest, readFileSync(join(BROKEN_DIR, sourceName)));
  chmodSync(dest, 0o755);
  return dest;
}

export async function makeCliADirectory() {
  const { USEFUL_JOBS_CLI } = await loadPins();
  const { kit } = await extractKit();
  const dest = join(kit, USEFUL_JOBS_CLI);
  rmSync(dest, { force: true });
  mkdirSync(dest);
  return dest;
}

export async function deleteCliKeepReady() {
  const { USEFUL_JOBS_CLI } = await loadPins();
  const { kit } = await extractKit();
  const dest = join(kit, USEFUL_JOBS_CLI);
  rmSync(dest, { force: true });
  return dest;
}

export async function makeCachePathAFile() {
  const { cacheRoot } = await loadEngine();
  const dest = cacheRoot();
  wipeKitCache(dest);
  writeFileSync(dest, "not-a-directory\n");
  return dest;
}

export async function copyRefusedEvidence(destFile) {
  const { kit } = await extractKit();
  const src = join(kit, "samples/evidence/refused.json");
  copyFileSync(src, destFile);
  return destFile;
}

export function killPidFile(pidFile) {
  if (!pidFile || !existsSync(pidFile)) return [];
  const killed = [];
  for (const line of readFileSync(pidFile, "utf8").split("\n")) {
    const pid = Number(line.trim());
    if (!Number.isInteger(pid) || pid <= 1) continue;
    try {
      process.kill(pid, "SIGKILL");
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}

export function killIsolateProcesses(isolate) {
  if (!isolate) return [];
  const r = spawnSync("pgrep", ["-f", isolate], { encoding: "utf8" });
  const killed = [];
  for (const line of String(r.stdout || "").split("\n")) {
    const pid = Number(line.trim());
    if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}
