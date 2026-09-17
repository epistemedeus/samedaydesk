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

export function pinKitArchive(archivePath) {
  const { bytes, sha256 } = hashFile(archivePath);
  return {
    ok: bytes === PINS.archiveBytes && sha256 === PINS.archiveSha256,
    path: archivePath,
    bytes,
    sha256,
    expectedBytes: PINS.archiveBytes,
    expectedSha256: PINS.archiveSha256,
    purchaseAuthority: false,
    republishKit: false,
  };
}
