import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.mjs";

export const REPLAY_BIN = join(PACKAGE_ROOT, "bin/replay.mjs");

export function tmpOut(prefix = "m09-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function spawnReplay(args, { timeoutMs = 60_000 } = {}) {
  const spawned = spawnSync(process.execPath, [REPLAY_BIN, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: PACKAGE_ROOT,
  });
  let body = null;
  const stdout = spawned.stdout.trim();
  if (stdout.startsWith("{")) {
    try {
      body = JSON.parse(stdout);
    } catch {
      body = null;
    }
  }
  let errBody = null;
  const stderr = spawned.stderr.trim();
  const brace = stderr.indexOf("{");
  if (brace >= 0) {
    try {
      errBody = JSON.parse(stderr.slice(brace).split("\n")[0]);
    } catch {
      errBody = null;
    }
  }
  return {
    exitCode: spawned.status ?? 1,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    body,
    errBody,
    signal: spawned.signal,
    error: spawned.error ? spawned.error.message : null,
  };
}

export function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write(chunk) { stdout.push(chunk); } },
    stderr: { write(chunk) { stderr.push(chunk); } },
    text() { return stdout.join(""); },
    err() { return stderr.join(""); },
  };
}
