import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hashRequest, sha256Bytes } from "./hash-terms.mjs";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_FREEZE,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CATALOG_PATH,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_PACKAGE,
  USEFUL_JOBS_PURCHASE_AUTHORITY,
  USEFUL_JOBS_SOURCE_COMMIT,
  USEFUL_JOBS_VERSION,
} from "./pins.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";

export function loadPublicCatalog(catalogPath = USEFUL_JOBS_CATALOG_PATH) {
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

export function getCatalogJob(jobId, catalog = loadPublicCatalog()) {
  const job = (catalog.jobs || []).find((item) => item.id === jobId);
  if (!job) {
    const err = new Error(`unknown job ${jobId}`);
    err.code = "unknown_job";
    throw err;
  }
  return job;
}

export function engineProvenance() {
  return {
    package: USEFUL_JOBS_PACKAGE,
    version: USEFUL_JOBS_VERSION,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
    cli: "node bin/useful-jobs.mjs run <id>",
    archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
    archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    sourceCommit: USEFUL_JOBS_SOURCE_COMMIT,
    archiveFreeze: USEFUL_JOBS_ARCHIVE_FREEZE,
  };
}

function parseEngineJson(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function measureOutputs(outDir, outputNames) {
  const names = Array.isArray(outputNames) ? outputNames : [];
  const outputs = [];
  let outputBytes = 0;
  for (const name of names) {
    const filePath = join(outDir, name);
    const present = existsSync(filePath);
    let bytes = 0;
    let sha256 = null;
    if (present) {
      const st = statSync(filePath);
      if (st.isFile()) {
        const buf = readFileSync(filePath);
        bytes = buf.length;
        sha256 = sha256Bytes(buf);
        outputBytes += bytes;
      }
    }
    outputs.push({ name, present, bytes, sha256 });
  }
  const usableOutput =
    names.length > 0 && outputs.every((item) => item.present && item.bytes > 0 && item.sha256);
  const outputsDigest = hashRequest(
    outputs.map((item) => ({ name: item.name, bytes: item.bytes, sha256: item.sha256 })),
  );
  return { outputs, outputBytes, outputsDigest, usableOutput };
}

export function producedThisRun(before, after) {
  if (!after?.outputs?.length) return false;
  return after.outputs.every((item, index) => {
    if (!item.present || !item.sha256) return false;
    const prev = before?.outputs?.[index];
    return !prev?.sha256 || prev.sha256 !== item.sha256;
  });
}

/** Compatibility adapter over the same current core, without an archive runner. */
export function createEngineAdapter() {
  return { async run() { throw Object.assign(new Error('Use runLabelledJob or measureRequest for durable bound execution'), { code: 'unbound-execution-refused' }); } };
}
export const defaultEngineAdapter = createEngineAdapter();
