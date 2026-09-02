import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LOCK_RETRIES = 80;
const LOCK_RETRY_MS = 25;
const STALE_LOCK_MS = 120_000;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function sleepMs(ms) {
  Atomics.wait(sleepCell, 0, 0, ms);
}

export function withWalLock(lockPath, fn) {
  const release = acquireFileLock(lockPath);
  try {
    return fn();
  } finally {
    release();
  }
}

function acquireFileLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      const token = crypto.randomUUID();
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      return () => {
        try {
          const owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          if (owner?.pid === process.pid && owner?.token === token) {
            fs.unlinkSync(lockPath);
          }
        } catch {
          /* ignore */
        }
      };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        /* retry */
      }
      sleepMs(LOCK_RETRY_MS);
    }
  }
  const lockErr = new Error("pulse_wal_lock_timeout");
  lockErr.code = "pulse_wal_lock_timeout";
  throw lockErr;
}
