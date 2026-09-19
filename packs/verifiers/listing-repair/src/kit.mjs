import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PINS } from "./constants.mjs";

export function packRoot(metaUrl = import.meta.url) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function repoRootFromPack(packDir) {
  return resolve(packDir, "../../..");
}

export function kitArchiveCandidates(repoRoot) {
  return [join(repoRoot, PINS.forAgentsPath), join(repoRoot, PINS.kitPath)];
}

export function findKitArchive(repoRoot) {
  for (const p of kitArchiveCandidates(repoRoot)) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function hashFile(filePath) {
  const buf = readFileSync(filePath);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

export function repoRelativePath(absPath, repoRoot) {
  const a = resolve(absPath);
  const r = resolve(repoRoot);
  if (a === r) return ".";
  const prefix = r.endsWith("/") ? r : `${r}/`;
  if (a.startsWith(prefix)) return a.slice(prefix.length);
  return absPath;
}

export function pinKitArchive(archivePath, { repoRoot = null } = {}) {
  const { bytes, sha256 } = hashFile(archivePath);
  const path = repoRoot ? repoRelativePath(archivePath, repoRoot) : archivePath;
  return {
    ok: bytes === PINS.archiveBytes && sha256 === PINS.archiveSha256,
    path,
    bytes,
    sha256,
    expectedBytes: PINS.archiveBytes,
    expectedSha256: PINS.archiveSha256,
    purchaseAuthority: false,
    republishKit: false,
  };
}
