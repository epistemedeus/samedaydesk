/** SPDX-License-Identifier: MIT
 * Caller-owned continuation file. Mode 0600. Not argv, stdout, or a server grant.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  constants,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { ContinuationError, recovery } from "./errors.mjs";

export const CONTINUATION_SCHEMA = "ein.activation-continuation.v1";
export const MAX_CONTINUATION_BYTES = 64 * 1024;

export function customerKeyHash(key) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function hashesEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function permissionError(message) {
  return new ContinuationError({
    code: "continuation_permissions",
    message,
    recovery: recovery(
      "fix_file_mode",
      "Keep the continuation file as a regular owner-only file (mode 0600), not a symlink or a group-readable copy.",
    ),
  });
}

export function readContinuation(file) {
  const absolute = resolve(file);
  let fd;
  try {
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.size > MAX_CONTINUATION_BYTES || (stats.mode & 0o077) !== 0) {
      throw permissionError("continuation file must be a small owner-only regular file");
    }
    if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
      throw permissionError("continuation file is not owned by this user");
    }
    const bytes = Buffer.alloc(stats.size);
    const size = readSync(fd, bytes, 0, bytes.length, 0);
    const parsed = JSON.parse(bytes.subarray(0, size).toString("utf8"));
    if (!parsed || parsed.schema !== CONTINUATION_SCHEMA) {
      throw new ContinuationError({
        code: "unsupported_continuation",
        message: "continuation file schema is not ein.activation-continuation.v1",
        recovery: recovery("stop", "Do not convert this file into another task. Start a new file for a new task."),
      });
    }
    return parsed;
  } catch (error) {
    if (error instanceof ContinuationError) throw error;
    if (error && error.code === "ENOENT") return null;
    if (error && (error.code === "ELOOP" || error.code === "EPERM")) {
      throw permissionError("continuation path is a symlink or cannot be opened without following links");
    }
    throw new ContinuationError({
      code: "continuation_unreadable",
      message: "continuation file could not be read",
      recovery: recovery("fix_file_mode", "Point EIN_CONTINUATION_FILE at the owner-only JSON file for this task."),
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function writeContinuation(file, record) {
  const absolute = resolve(file);
  const body = JSON.stringify(record);
  if (Buffer.byteLength(body, "utf8") > MAX_CONTINUATION_BYTES) {
    throw new ContinuationError({
      code: "body_limit",
      message: "continuation record exceeds 64 KiB",
      recovery: recovery("stop", "Do not store documents, secrets, or logs in the continuation file."),
    });
  }
  mkdirSync(dirname(absolute), { recursive: true });
  const tmp = `${absolute}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    writeFileSync(fd, body);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(tmp);
    throw error;
  }
  closeSync(fd);
  chmodSync(tmp, 0o600);
  try {
    renameSync(tmp, absolute);
  } catch (error) {
    unlinkSync(tmp);
    throw error;
  }
  chmodSync(absolute, 0o600);
  const directory = openSync(dirname(absolute), constants.O_RDONLY);
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
  const stats = lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    throw permissionError("continuation file was not stored as mode 0600");
  }
  return absolute;
}
