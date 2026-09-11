import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Bytes } from "./digest.mjs";
import {
  PR50_ARCHIVE_BYTES,
  PR50_ARCHIVE_PATH,
  PR50_ARCHIVE_SHA256,
  PR50_CLI,
  PR50_ROOT_NAME,
  PR51_ARCHIVE_BYTES,
  PR51_ARCHIVE_PATH,
  PR51_ARCHIVE_SHA256,
  PR51_CLI,
  PR51_ROOT_NAME,
} from "./pins.mjs";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function extractArchive({ archivePath, bytes, sha256, rootName, cachePrefix, cliRel }) {
  const dest = join(tmpdir(), `${cachePrefix}-${sha256.slice(0, 16)}`);
  const kit = join(dest, rootName);
  const ready = join(dest, ".ready");
  const cli = join(kit, cliRel);
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
    throw new Error(`timeout waiting for ${rootName} archive extract`);
  }

  try {
    if (!existsSync(cli)) {
      const buf = readFileSync(archivePath);
      if (buf.length !== bytes) {
        throw new Error(`${rootName} archive size ${buf.length} != ${bytes}`);
      }
      const digest = sha256Bytes(buf);
      if (digest !== sha256) {
        throw new Error(`${rootName} archive sha256 ${digest} != ${sha256}`);
      }
      const tar = spawnSync("tar", ["-xzf", archivePath, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) throw new Error(tar.stderr || "tar extract failed");
    }
    writeFileSync(ready, `${sha256}\n`);
    return kit;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function ensurePr50Kit() {
  return extractArchive({
    archivePath: PR50_ARCHIVE_PATH,
    bytes: PR50_ARCHIVE_BYTES,
    sha256: PR50_ARCHIVE_SHA256,
    rootName: PR50_ROOT_NAME,
    cachePrefix: "sds-cer-pr50",
    cliRel: PR50_CLI,
  });
}

export function ensurePr51Kit() {
  return extractArchive({
    archivePath: PR51_ARCHIVE_PATH,
    bytes: PR51_ARCHIVE_BYTES,
    sha256: PR51_ARCHIVE_SHA256,
    rootName: PR51_ROOT_NAME,
    cachePrefix: "sds-cer-pr51",
    cliRel: PR51_CLI,
  });
}

export function parseEngineJson(stdout) {
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

export function runPr50Job({ artifactId, inputPath, clock, timeoutMs = 120_000 } = {}) {
  const kit = ensurePr50Kit();
  const cli = join(kit, PR50_CLI);
  const args = ["run", artifactId, "--in", inputPath, "--clock", clock, "--mode", "import"];
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
  };
}
