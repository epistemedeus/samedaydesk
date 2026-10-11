import { closeSync, constants, fstatSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Hex, stableStringify } from "../recurring-job-recipes/lib/hash.mjs";

export { sha256Hex, stableStringify };
export const MAX_BYTES = 1024 * 1024;
export class EvidenceError extends Error {
  constructor(code, outcome = "insufficient_coverage") { super(code); this.code = code; this.outcome = outcome; }
}
export function requireEvidence(condition, code, outcome) {
  if (!condition) throw new EvidenceError(code, outcome);
}
export function validTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
export function seal(document) {
  const { integritySha256: _ignored, ...body } = document;
  return { ...body, integritySha256: sha256Hex(stableStringify(body)) };
}
export function verifySeal(document, code = "input_integrity_mismatch") {
  requireEvidence(document && typeof document === "object" && !Array.isArray(document), code);
  requireEvidence(document.integritySha256 === seal(document).integritySha256, code);
  return document;
}
export function readJson(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    requireEvidence(stat.isFile() && stat.size <= MAX_BYTES, "input_not_bounded_regular_file");
    const bytes = readFileSync(fd);
    requireEvidence(bytes.length <= MAX_BYTES, "input_too_large");
    return { document: JSON.parse(bytes.toString("utf8")), sha256: sha256Hex(bytes) };
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    throw new EvidenceError(error.code === "ENOENT" ? "input_missing" : "input_unreadable_or_invalid");
  } finally { if (fd !== undefined) closeSync(fd); }
}
// A link publishes a fully written inode without replacing any prior file.
export function writeImmutable(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  const text = `${stableStringify(document)}\n`;
  requireEvidence(Buffer.byteLength(text) <= MAX_BYTES, "artifact_too_large", "error");
  const temporary = join(dirname(path), `.writing-${randomUUID()}`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, text); fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, path);
    const parent = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(parent); } finally { closeSync(parent); }
  } catch (error) {
    if (error.code === "EEXIST") throw new EvidenceError("artifact_exists", "uncertain_state");
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch { /* An unfinished inode never replaces a prior. */ }
  }
  return { path, sha256: sha256Hex(text), bytes: Buffer.byteLength(text) };
}
