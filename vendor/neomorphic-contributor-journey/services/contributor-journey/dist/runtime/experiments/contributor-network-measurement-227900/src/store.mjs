import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_BYTES, fail, validatePolicy } from "./contract.mjs";
import { emptyState, ingest, readback, validateState } from "./ingest.mjs";
import { project } from "./project.mjs";

export async function readJson(file, { privateFile = false } = {}) {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BYTES) fail("file_bound");
    if (privateFile && (info.mode & 0o777) !== 0o600) fail("private_file_required");
    const bytes = await handle.readFile();
    if (bytes.length > MAX_BYTES) fail("file_bound");
    try { return JSON.parse(bytes.toString("utf8")); } catch { fail("invalid_json"); }
  } finally { await handle?.close(); }
}
export class FileStore {
  constructor(directory, policy) {
    validatePolicy(policy);
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, "projection.json");
    this.lock = path.join(this.directory, ".writer-lock");
    this.policy = structuredClone(policy);
  }
  async checkDirectory(create = false) {
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || (info.mode & 0o777) !== 0o700 || await realpath(this.directory) !== this.directory) fail("private_directory_required");
  }
  async load() {
    await this.checkDirectory();
    try { return validateState(await readJson(this.file, { privateFile: true }), this.policy); }
    catch (error) { if (error.code === "ENOENT") return emptyState(); throw error; }
  }
  async ingest(batch) {
    await this.checkDirectory(true);
    try { await mkdir(this.lock, { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") fail("store_busy"); throw error; }
    const temporary = path.join(this.directory, `.projection-${randomUUID()}.tmp`);
    try {
      const applied = ingest(await this.load(), batch, this.policy);
      // An exact replay has no write side effect.
      if (applied.receipt.inserted) {
        const bytes = JSON.stringify(applied.state);
        if (Buffer.byteLength(bytes) > MAX_BYTES) fail("file_bound");
        const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, this.file);
        const directoryHandle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      }
      return applied.receipt;
    } finally {
      await rm(temporary, { force: true });
      await rm(this.lock, { recursive: true });
    }
  }
  async query(query) { return project(await this.load(), query, this.policy); }
  async readback(reference) { return readback(await this.load(), reference); }
}
