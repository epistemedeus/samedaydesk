import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const REPO_ROOT = join(MODULE_ROOT, "../..");

export const FILE_MAX_BYTES = 8 * 1024 * 1024;
export const SCHEMA = "samedaydesk.job-artifact-export.manifest.v1";
export const TERMS_SCHEMA = "samedaydesk.job-artifact-export.terms.v1";
export const JSONL_SCHEMA = "samedaydesk.job-artifact-export.file.v1";
export const SCHEMA_VERSION = 1;

export const HASH_TERMS_PIN = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const HASH_TERMS_REPO = "epistemedeus/neomorphic-io";
export const HASH_TERMS_PR = 54;
export const HASH_TERMS_GOLDEN = "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";

export const USEFUL_JOBS_PACKAGE = "useful-jobs";
export const USEFUL_JOBS_VERSION = "1.0.0";
export const USEFUL_JOBS_NODE = ">=22";
export const USEFUL_JOBS_ARCHIVE_SHA256 =
  "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
export const USEFUL_JOBS_ARCHIVE_BYTES = 2_522_418;
export const USEFUL_JOBS_SOURCE_COMMIT = "0e473974554de9bfdba90676b6d3d710c10a2671";
export const USEFUL_JOBS_ARCHIVE_FREEZE = "318130daaf19490e2f8af7c23131b42fe20e6cde";

export const DEFAULT_CATALOG_REL = "client/public/for-agents/useful-jobs/catalog.json";
export const DEFAULT_KIT_REL = "client/src/data/usefulJobsKit.json";
export const DEFAULT_ARCHIVE_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const DEFAULT_ARCHIVE_SHA_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json";

export const RESERVED_EXPORT_NAMES = new Set(["manifest.json", "files.jsonl", "job-artifacts.zip"]);

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Prefixed(value) {
  return `sha256:${sha256Hex(value)}`;
}

export function isSha256Prefixed(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

export function prefixSha256(hexOrPrefixed) {
  if (typeof hexOrPrefixed !== "string") return null;
  if (isSha256Prefixed(hexOrPrefixed)) return hexOrPrefixed;
  if (/^[0-9a-f]{64}$/.test(hexOrPrefixed)) return `sha256:${hexOrPrefixed}`;
  return null;
}

export function catalogPath(root = REPO_ROOT) {
  return join(root, DEFAULT_CATALOG_REL);
}

export function kitPath(root = REPO_ROOT) {
  return join(root, DEFAULT_KIT_REL);
}

export function archivePath(root = REPO_ROOT) {
  return join(root, DEFAULT_ARCHIVE_REL);
}

export function loadKitPin(root = REPO_ROOT) {
  const kitFile = kitPath(root);
  const shaFile = join(root, DEFAULT_ARCHIVE_SHA_REL);
  let kit = null;
  if (existsSync(kitFile)) kit = JSON.parse(readFileSync(kitFile, "utf8"));
  let shaDoc = null;
  if (existsSync(shaFile)) shaDoc = JSON.parse(readFileSync(shaFile, "utf8"));
  const bare =
    kit?.sha256 ||
    shaDoc?.sha256 ||
    USEFUL_JOBS_ARCHIVE_SHA256;
  return {
    package: kit?.packageId || USEFUL_JOBS_PACKAGE,
    version: kit?.version || shaDoc?.name?.replace(/^useful-jobs-/, "") || USEFUL_JOBS_VERSION,
    node: kit?.node || shaDoc?.node || USEFUL_JOBS_NODE,
    archiveSha256: prefixSha256(bare),
    bytes: kit?.bytes || shaDoc?.bytes || USEFUL_JOBS_ARCHIVE_BYTES,
    sourceCommit: kit?.sourceCommit || shaDoc?.sourceCommit || USEFUL_JOBS_SOURCE_COMMIT,
    archiveFreeze: kit?.archiveFreeze || shaDoc?.archiveFreeze || USEFUL_JOBS_ARCHIVE_FREEZE,
  };
}

export function verifyArchiveFile(file, expectedBareHex = USEFUL_JOBS_ARCHIVE_SHA256) {
  if (!existsSync(file)) return { ok: false, code: "missing-archive", message: "useful-jobs archive is not at the pinned path" };
  const bytes = readFileSync(file);
  const size = bytes.length;
  if (size !== USEFUL_JOBS_ARCHIVE_BYTES) {
    return {
      ok: false,
      code: "archive-size-mismatch",
      message: `archive bytes ${size} != ${USEFUL_JOBS_ARCHIVE_BYTES}`,
    };
  }
  const actual = sha256Hex(bytes);
  const expected = String(expectedBareHex || "").replace(/^sha256:/, "");
  if (actual !== expected) {
    return {
      ok: false,
      code: "archive-sha-mismatch",
      message: "useful-jobs archive sha256 does not match the pinned kit",
      actual: prefixSha256(actual),
      expected: prefixSha256(expected),
    };
  }
  return { ok: true, sha256: prefixSha256(actual), bytes: size };
}

export function bindArchiveIdentity({ archiveFile, claimedSha256 = null, expectedBareHex = USEFUL_JOBS_ARCHIVE_SHA256 } = {}) {
  const verified = verifyArchiveFile(archiveFile, expectedBareHex);
  if (!verified.ok) return verified;
  if (claimedSha256 != null && claimedSha256 !== "") {
    const claimed = prefixSha256(claimedSha256);
    if (!claimed) {
      return {
        ok: false,
        code: "invalid-archive-sha256",
        message: "archive sha256 must be 64 hex, optionally sha256-prefixed",
      };
    }
    if (claimed !== verified.sha256) {
      return {
        ok: false,
        code: "archive-identity-override",
        message: "caller archive sha256 does not match the archive bytes consumed",
        claimed,
        actual: verified.sha256,
      };
    }
  }
  return verified;
}

export function zipSidecarPath(zipPath) {
  return `${zipPath}.sha256`;
}

export function writeZipSidecar(zipPath, digest) {
  writeFileSync(zipSidecarPath(zipPath), `${digest}\n`);
}

export function readZipSidecar(zipPath) {
  const path = zipSidecarPath(zipPath);
  if (!existsSync(path)) return null;
  return prefixSha256(readFileSync(path, "utf8").trim());
}
