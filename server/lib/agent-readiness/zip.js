// Small ZIP reader/writer for Fix Pack downloads. No extra dependency.
import { deflateRawSync, inflateRawSync } from "node:zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export function strToU8(text) {
  return new TextEncoder().encode(String(text));
}

export function strFromU8(bytes) {
  return new TextDecoder().decode(bytes);
}

export function zipSync(files) {
  const names = Object.keys(files);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(files[name]);
    const comp = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localRec = Buffer.concat([local, nameBuf, comp]);
    locals.push(localRec);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localRec.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, centralBuf, end]));
}

export function unzipSync(bytes) {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  const start = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= start; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 8);
  let ptr = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtra = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const raw = method === 0 ? comp : inflateRawSync(comp);
    out[name] = new Uint8Array(raw);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
