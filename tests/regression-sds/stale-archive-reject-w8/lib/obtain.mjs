import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { OBTAIN_ARCHIVE_REL, REPO_ROOT } from "./root.mjs";
import { spawnEnv } from "./spawn-env.mjs";

function confineRepoPath(rel) {
  const abs = resolve(REPO_ROOT, rel);
  const root = resolve(REPO_ROOT);
  if (abs !== root && !abs.startsWith(`${root}/`)) {
    const err = new Error(`obtain --from escapes repo: ${rel}`);
    err.code = "PATH_ESCAPE";
    throw err;
  }
  return abs;
}

function parseBody(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return { parseError: true, stdout };
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: true, stdout: text };
  }
}

/**
 * Spawn the committed obtain-archive gate against a real tarball.
 * Product refuse uses process.exit(0) with ok:false, refused:true.
 */
export function runObtainArchive({
  fromRel,
  expectedSha256,
  expectedBytes,
  destName = "dest.tar.gz",
} = {}) {
  if (!fromRel) {
    return {
      ok: false,
      refused: true,
      code: "missing-from",
      childExit: 2,
      destExists: false,
    };
  }
  if (/^https?:\/\//i.test(fromRel)) {
    return {
      ok: false,
      refused: true,
      code: "LIVE_REFUSE",
      message: "obtain probe refuses HTTP(S) --from",
      childExit: 2,
      destExists: false,
    };
  }

  const fromAbs = confineRepoPath(fromRel);
  const bin = join(REPO_ROOT, OBTAIN_ARCHIVE_REL);
  const work = mkdtempSync(join(tmpdir(), "sds-stale-archive-w8-"));
  const dest = join(work, destName);

  try {
    const r = spawnSync(
      process.execPath,
      [
        bin,
        "--from",
        fromAbs,
        "--expected-sha256",
        String(expectedSha256).toLowerCase(),
        "--expected-bytes",
        String(expectedBytes),
        "--dest",
        dest,
      ],
      {
        encoding: "utf8",
        cwd: REPO_ROOT,
        env: spawnEnv(),
        timeout: 30_000,
      },
    );
    const body = parseBody(r.stdout);
    return {
      ok: body.ok === true,
      refused: body.refused === true || body.ok === false,
      code: body.code || (body.ok === true ? null : "obtain-failed"),
      message: body.message || null,
      sha256: body.sha256 || null,
      bytes: body.bytes || null,
      extracted: body.extracted === true,
      executed: body.executed === true,
      childExit: r.status ?? 1,
      destExists: existsSync(dest),
      stdout: body.parseError ? r.stdout : undefined,
      stderr: r.stderr || "",
      fromRel,
      fromAbs,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function probeObtain(probe, current) {
  try {
    const expected =
      probe.expected === "current" || probe.expected == null
        ? { sha256: current.sha256, bytes: current.bytes }
        : {
            sha256: probe.expectedSha256 || current.sha256,
            bytes: probe.expectedBytes ?? current.bytes,
          };
    return runObtainArchive({
      fromRel: probe.fromRel,
      expectedSha256: expected.sha256,
      expectedBytes: expected.bytes,
    });
  } catch (error) {
    return {
      ok: false,
      refused: false,
      code: error.code || "obtain-failed",
      message: error.message,
      childExit: 2,
      destExists: false,
    };
  }
}
