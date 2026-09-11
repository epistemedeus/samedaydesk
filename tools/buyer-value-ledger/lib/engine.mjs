import { existsSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
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
    if (present) {
      bytes = statSync(filePath).size;
      outputBytes += bytes;
    }
    outputs.push({ name, present, bytes });
  }
  const usableOutput = names.length > 0 && outputs.every((item) => item.present && item.bytes > 0);
  return { outputs, outputBytes, usableOutput };
}

/**
 * Spawn the published useful-jobs CLI. Injectable for later sibling bindings.
 */
export function createEngineAdapter({ ensureKit = ensureUsefulJobsKit, spawn = spawnSync } = {}) {
  return {
    async run(jobId, { files = {}, example = false, outDir, timeoutMs = 120_000, kitOptions = {} } = {}) {
      const ensured = ensureKit(kitOptions);
      const kit = ensured.kit;
      const cli = join(kit, USEFUL_JOBS_CLI);
      const args = ["run", jobId];
      if (example) args.push("--example");
      else {
        for (const [key, filePath] of Object.entries(files)) {
          if (!filePath) continue;
          args.push(`--${key}`, filePath);
        }
      }
      if (outDir) args.push("--out-dir", outDir);

      const started = process.hrtime.bigint();
      const result = spawn(process.execPath, [cli, ...args], {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        cwd: kit,
      });
      const ended = process.hrtime.bigint();
      const durationMs = Math.max(0, Number(ended - started) / 1e6);

      return {
        status: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        json: parseEngineJson(result.stdout),
        error: result.error || null,
        kit,
        kitSource: ensured.kitSource,
        cli,
        args,
        durationMs,
        startedAt: new Date(Date.now() - durationMs).toISOString(),
        endedAt: new Date().toISOString(),
      };
    },
  };
}

export const defaultEngineAdapter = createEngineAdapter();
