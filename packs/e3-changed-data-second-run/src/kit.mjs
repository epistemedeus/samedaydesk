import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fail } from "./failures.mjs";
import { archiveMetaPath, archivePath, findRepoRoot } from "./paths.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function loadArchiveMeta(repoRoot = findRepoRoot()) {
  if (!repoRoot) {
    throw new Error("committed useful-jobs archive not found");
  }
  const meta = JSON.parse(readFileSync(archiveMetaPath(repoRoot), "utf8"));
  if (!meta?.sha256 || !meta?.bytes || !meta?.name) {
    throw new Error("committed useful-jobs archive meta missing sha256/bytes/name");
  }
  return meta;
}

/**
 * Extract the committed public useful-jobs archive into a temp cache.
 * Spawn the packaged CLI as a black-box; do not import engines.
 */
export function extractCommittedKit(repoRoot = findRepoRoot()) {
  if (!repoRoot) {
    return fail("kit_unavailable", "existing committed useful-jobs archive not found");
  }
  const meta = loadArchiveMeta(repoRoot);
  const archive = archivePath(repoRoot);
  if (!existsSync(archive)) {
    return fail("kit_unavailable", `missing ${archive}`);
  }

  const dest = join(tmpdir(), `e3-useful-jobs-${meta.sha256.slice(0, 16)}`);
  const kit = join(dest, meta.name);
  const cli = join(kit, "bin/useful-jobs.mjs");
  const ready = join(dest, ".ready");
  if (existsSync(ready) && existsSync(cli)) {
    return { ok: true, kit, cli, meta, repoRoot };
  }

  mkdirSync(dest, { recursive: true });
  const lockPath = join(dest, ".extracting");
  let gotLock = false;
  for (let i = 0; i < 120; i += 1) {
    if (existsSync(ready) && existsSync(cli)) {
      return { ok: true, kit, cli, meta, repoRoot };
    }
    try {
      mkdirSync(lockPath);
      gotLock = true;
      break;
    } catch {
      sleep(250);
    }
  }
  if (!gotLock) {
    if (existsSync(ready) && existsSync(cli)) {
      return { ok: true, kit, cli, meta, repoRoot };
    }
    return fail("kit_unavailable", "timeout waiting for useful-jobs archive extract");
  }

  try {
    if (!(existsSync(ready) && existsSync(cli))) {
      if (existsSync(kit)) rmSync(kit, { recursive: true, force: true });
      rmSync(ready, { force: true });
      const buf = readFileSync(archive);
      if (buf.length !== meta.bytes) {
        return fail("kit_unavailable", `useful-jobs archive size ${buf.length} != ${meta.bytes}`);
      }
      const digest = sha256(buf);
      if (digest !== meta.sha256) {
        return fail("kit_unavailable", `useful-jobs archive sha256 ${digest} != ${meta.sha256}`);
      }
      const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { encoding: "utf8" });
      if (tar.status !== 0) {
        return fail("kit_unavailable", tar.stderr || "tar extract failed");
      }
      if (!existsSync(cli)) {
        return fail("kit_unavailable", "useful-jobs extract missing CLI");
      }
      writeFileSync(ready, `${meta.sha256}\n`);
    }
    return { ok: true, kit, cli, meta, repoRoot };
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function runPageChangeJob({ cli, jobPath, outDir, timeoutMs = 120_000 }) {
  const argv = ["run", "page-change-offline-job", "--job", jobPath, "--out-dir", outDir];
  const proc = spawnSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd: dirname(dirname(cli)),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env },
  });
  return { proc, argv };
}


