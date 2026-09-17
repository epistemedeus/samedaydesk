import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

export function defaultRoot() {
  return join(LIB_DIR, "../../..");
}

export function resolveRoot(explicit) {
  return explicit || defaultRoot();
}

export function verifyDir(root) {
  return join(root, "tools/verify");
}

export function artifactsDir(root) {
  return join(root, "tools/verify/artifacts");
}

export function ensureArtifactsDir(root) {
  const dir = artifactsDir(root);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function fileBytes(path) {
  return statSync(path).size;
}

export function hasNodeModules(root) {
  return existsSync(join(root, "node_modules", "express"));
}

export function hasClientDist(root) {
  return existsSync(join(root, "client/dist/index.html"));
}

export function kitPath(root, { publicTwin = false, version = "1.4.7" } = {}) {
  const name = `useful-jobs-${version}.tar.gz`;
  if (publicTwin) return join(root, "client/public/for-agents/useful-jobs", name);
  return join(root, "client/public/kit", name);
}

export function obtainArchiveBin(root) {
  return join(root, "experiments/s260-useful-jobs-public-integration/bin/obtain-archive.mjs");
}

export function serverEntry(root) {
  return join(root, "server/index.js");
}

export function usefulJobsKitJson(root) {
  return join(root, "client/src/data/usefulJobsKit.json");
}
