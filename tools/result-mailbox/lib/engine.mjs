import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "./digest.mjs";
import { refuse } from "./errors.mjs";
import {
  ENGINE_TIMEOUT_MS,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_PACKAGE,
  USEFUL_JOBS_PURCHASE_AUTHORITY,
  USEFUL_JOBS_ROOT_NAME,
  USEFUL_JOBS_VERSION,
} from "./pins.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function cacheRoot() {
  return join(tmpdir(), `sds-result-mailbox-${USEFUL_JOBS_ARCHIVE_SHA256.slice(0, 16)}`);
}

export function kitPath(root = cacheRoot()) {
  return join(root, USEFUL_JOBS_ROOT_NAME);
}

export function ensureUsefulJobsKit() {
  const dest = cacheRoot();
  const kit = kitPath(dest);
  const ready = join(dest, ".ready");
  const cli = join(kit, USEFUL_JOBS_CLI);
  if (existsSync(ready) && existsSync(cli)) return kit;

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (existsSync(ready) && existsSync(cli)) return kit;
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (existsSync(cli)) return kit;
    throw refuse("engine-extract-timeout", "timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!existsSync(cli)) {
      const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
      if (buf.length !== USEFUL_JOBS_ARCHIVE_BYTES) {
        throw refuse(
          "engine-archive-size",
          `useful-jobs archive size ${buf.length} != ${USEFUL_JOBS_ARCHIVE_BYTES}`,
        );
      }
      const digest = sha256Bytes(buf);
      if (digest !== USEFUL_JOBS_ARCHIVE_SHA256) {
        throw refuse(
          "engine-archive-digest",
          `useful-jobs archive sha256 ${digest} != ${USEFUL_JOBS_ARCHIVE_SHA256}`,
        );
      }
      const tar = spawnSync("tar", ["-xzf", USEFUL_JOBS_ARCHIVE_PATH, "-C", dest], {
        encoding: "utf8",
      });
      if (tar.status !== 0) {
        throw refuse("engine-extract-failed", tar.stderr || "tar extract failed");
      }
    }
    writeFileSync(ready, `${USEFUL_JOBS_ARCHIVE_SHA256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function engineProvenance(kit = ensureUsefulJobsKit()) {
  const pkg = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
  return {
    package: pkg.name || USEFUL_JOBS_PACKAGE,
    version: pkg.version || USEFUL_JOBS_VERSION,
    cli: USEFUL_JOBS_CLI,
    archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
    archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
    kitRoot: kit,
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

export function runEngineJob(
  jobId,
  { files = {}, example = false, outDir, timeoutMs = ENGINE_TIMEOUT_MS } = {},
) {
  const kit = ensureUsefulJobsKit();
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

  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: kit,
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: parseEngineJson(result.stdout),
    kit,
    cli,
    args,
    provenance: engineProvenance(kit),
  };
}

export function catalogJob(jobId, kit = ensureUsefulJobsKit()) {
  const catalog = JSON.parse(readFileSync(join(kit, "catalog.json"), "utf8"));
  const job = (catalog.jobs || []).find((j) => j.id === jobId);
  if (!job) throw refuse("unknown-job", `unknown useful-job ${jobId}`);
  return job;
}
