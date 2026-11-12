// Test helper: verify a pinned pack tgz and read its members without any
// dependency (node:zlib plus a ustar walk). Used by the capability-compat
// install test. Nothing here installs or runs package code.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export class PackRefused extends Error {
  constructor(code, evidence) { super(code); this.code = code; this.evidence = evidence; }
}

// Refuses before any install: a null or malformed pin never matches.
export function verifyPackArchive(entry, bytes) {
  if (typeof entry?.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new PackRefused("pack_unpinned", { name: entry?.name ?? null });
  const actual = sha256(bytes);
  if (actual !== entry.sha256) throw new PackRefused("pack_sha_mismatch", { name: entry.name, expected: entry.sha256, actual });
  if (Number.isInteger(entry.size) && bytes.length !== entry.size) throw new PackRefused("pack_size_mismatch", { name: entry.name, expected: entry.size, actual: bytes.length });
  return { name: entry.name, version: entry.version, sha256: actual, size: bytes.length };
}

export function tgzMembers(bytes) {
  const tar = gunzipSync(bytes);
  const members = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString("latin1").replace(/\0.*$/s, "");
    const size = parseInt(text(124, 12).trim() || "0", 8);
    const type = text(156, 1) || "0";
    const prefix = text(345, 155);
    const name = prefix ? `${prefix}/${text(0, 100)}` : text(0, 100);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === "0") members.set(name, Buffer.from(body));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return members;
}
