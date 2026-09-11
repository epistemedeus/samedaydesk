import { crc32 } from "node:zlib";
import { posix } from "node:path";
import { refuse } from "./refuse.mjs";

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

/**
 * Deterministic ZIP (stored, no extra fields). Local runtime unzip verifies it.
 */
export function buildStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data) >>> 0;
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(localHeader);
    centrals.push(central);
    offset += localHeader.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function assertSafeZipName(name) {
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.includes("..")) {
    throw refuse("invalid-zip", "zip member path is refused", { path: name || null });
  }
  const normalized = posix.normalize(name);
  if (normalized !== name || posix.isAbsolute(normalized) || normalized.startsWith("../") || normalized === "..") {
    throw refuse("invalid-zip", "zip member path is refused", { path: name });
  }
}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLen = buf.readUInt16LE(i + 20);
    if (i + 22 + commentLen === buf.length) return i;
  }
  throw refuse("invalid-zip", "zip end-of-central-directory not found");
}

export function parseStoredZip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 22) throw refuse("invalid-zip", "zip is too small");
  const eocd = findEocd(buf);
  const diskEntries = buf.readUInt16LE(eocd + 8);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  if (diskEntries !== totalEntries) throw refuse("invalid-zip", "multi-disk zip is refused");
  if (totalEntries === 0xffff) throw refuse("invalid-zip", "zip64 is refused");
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > eocd) throw refuse("invalid-zip", "central directory overruns zip");
  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw refuse("invalid-zip", "central directory signature missing");
    }
    const method = buf.readUInt16LE(cursor + 10);
    const crc = buf.readUInt32LE(cursor + 16);
    const compSize = buf.readUInt32LE(cursor + 20);
    const uncompSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    assertSafeZipName(name);
    if (method !== 0) throw refuse("invalid-zip", `zip member ${name} is not stored`, { name, method });
    if (compSize !== uncompSize) throw refuse("invalid-zip", `zip member ${name} size mismatch`, { name });
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw refuse("invalid-zip", `local header missing for ${name}`, { name });
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(dataStart, dataStart + uncompSize);
    if (data.length !== uncompSize) throw refuse("invalid-zip", `truncated member ${name}`, { name });
    if ((crc32(data) >>> 0) !== crc) throw refuse("invalid-zip", `crc mismatch for ${name}`, { name });
    entries.push({ name, data: Buffer.from(data), bytes: uncompSize });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  if (cursor !== centralOffset + centralSize) throw refuse("invalid-zip", "central directory size mismatch");
  return { entries, bytes: buf.length };
}
