import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeSync, fsyncSync, unlinkSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const LOCK_RETRIES = 80;
const LOCK_RETRY_MS = 25;
const STALE_LOCK_MS = 120_000;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function sleepMs(ms) {
  Atomics.wait(sleepCell, 0, 0, ms);
}

export function withFileLock(lockPath, fn) {
  const release = acquireFileLock(lockPath);
  try {
    return fn();
  } finally {
    release();
  }
}

function acquireFileLock(lockPath) {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      const token = randomUUID();
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          const owner = JSON.parse(readFileSync(lockPath, "utf8"));
          if (owner?.pid === process.pid && owner?.token === token) {
            unlinkSync(lockPath);
          }
        } catch {
          /* ignore */
        }
      };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        /* retry */
      }
      sleepMs(LOCK_RETRY_MS);
    }
  }
  const lockErr = new Error("outbox_lock_timeout");
  lockErr.code = "outbox_lock_timeout";
  throw lockErr;
}

export function exists(path) {
  return existsSync(path);
}
