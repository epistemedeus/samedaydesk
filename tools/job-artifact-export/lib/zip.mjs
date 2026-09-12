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
  const bad = message => { throw refuse('invalid-zip', message); };
  if (buf.length < 22 || buf.length > 64 * 1024 * 1024) bad('Zip size outside bounds');
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt16LE(eocd + 4) || buf.readUInt16LE(eocd + 6) ||
      buf.readUInt16LE(eocd + 8) !== count || count < 1 || count > 256 ||
      centralOffset + centralSize !== eocd) bad('Invalid central directory');
  const entries = [], names = new Set();
  let cursor = centralOffset, nextLocal = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > eocd || buf.readUInt32LE(cursor) !== 0x02014b50) bad('Missing central header');
    const flags = buf.readUInt16LE(cursor + 8);
    const method = buf.readUInt16LE(cursor + 10);
    const crc = buf.readUInt32LE(cursor + 16);
    const size = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const attributes = buf.readUInt32LE(cursor + 38);
    const local = buf.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLen + extraLen + commentLen;
    if (end > eocd || flags !== 0x800 || method !== 0 || extraLen ||
        buf.readUInt16LE(cursor + 34) || buf.readUInt32LE(cursor + 20) !== size ||
        ((attributes >>> 16) & 0o170000) && ((attributes >>> 16) & 0o170000) !== 0o100000 ||
        (attributes & 0x10)) bad('Unsupported zip member type or encoding');
    const nameBytes = buf.subarray(cursor + 46, cursor + 46 + nameLen);
    const name = nameBytes.toString('utf8');
    assertSafeZipName(name);
    if (!Buffer.from(name).equals(nameBytes) || name.endsWith('/') || name.includes(':') || names.has(name)) bad('Invalid or duplicate path');
    names.add(name);
    if (local !== nextLocal || local + 30 > centralOffset || buf.readUInt32LE(local) !== 0x04034b50) bad('Overlapping or hidden local member');
    const localNameLen = buf.readUInt16LE(local + 26);
    const localExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    if (start + size > centralOffset || localExtraLen || localNameLen !== nameLen ||
        !buf.subarray(local + 30, local + 30 + localNameLen).equals(nameBytes) ||
        buf.readUInt16LE(local + 6) !== flags || buf.readUInt16LE(local + 8) !== method ||
        buf.readUInt32LE(local + 14) !== crc || buf.readUInt32LE(local + 18) !== size ||
        buf.readUInt32LE(local + 22) !== size) bad('Local and central headers disagree');
    const data = buf.subarray(start, start + size);
    if ((crc32(data) >>> 0) !== crc) bad('CRC mismatch');
    entries.push({ name, data: Buffer.from(data), bytes: size });
    nextLocal = start + size;
    cursor = end;
  }
  if (cursor !== eocd || nextLocal !== centralOffset) bad('Unaccounted zip bytes');
  return { entries, bytes: buf.length };
}
