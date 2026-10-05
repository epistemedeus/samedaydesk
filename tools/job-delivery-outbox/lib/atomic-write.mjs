import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join, basename } from "node:path";

export function atomicWriteJson(filePath, data) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let fd = null;
  try {
    fd = openSync(tmp, "w", 0o600);
    writeSync(fd, payload);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmp, filePath);
    try {
      const dirFd = openSync(dir, "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      /* directory fsync is best-effort */
    }
    return true;
  } catch (err) {
    if (fd != null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    const wrapped = new Error(`atomic-write-failed: ${err.message}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

export function digestJson(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
