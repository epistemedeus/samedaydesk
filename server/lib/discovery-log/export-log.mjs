// Bounded reader for one allowlisted daily discovery file.
// The hosted route is the export. This module does not authenticate and does not
// accept a caller-supplied directory from HTTP. app.js remains the only writer.
// Each page stays within the byte and line caps. A cursor continues a large valid day.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { MAX_BYTES, MAX_LINE, MAX_LINES, decodeCursor, encodeCursor, hashFileRange, projectRecord, resolveDailyFile } from "./bounds.mjs";

function readAt(file, offset, length) {
  const fd = fs.openSync(file, "r");
  try {
    const chunk = Buffer.alloc(length);
    const got = length === 0 ? 0 : fs.readSync(fd, chunk, 0, length, offset);
    return chunk.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

function precedingByteIsNewline(file, offset) {
  return readAt(file, offset, 1)[0] === 0x0a;
}

function prefixWatermark(file, offset) {
  const length = Math.min(MAX_LINE, offset);
  const bytes = readAt(file, offset - length, length);
  if (bytes.length !== length) throw new Error("discovery_export_cursor_refused");
  return createHash("sha256").update(bytes).digest("hex");
}

function takeLines(chunk, fileContinuesPastChunk) {
  const lines = [];
  let start = 0;
  let consumed = 0;
  for (let index = 0; index <= chunk.length; index += 1) {
    const atEnd = index === chunk.length;
    const newline = !atEnd && chunk[index] === 0x0a;
    if (!atEnd && !newline) continue;
    if (atEnd && start === chunk.length) break;
    if (atEnd && fileContinuesPastChunk) throw new Error("discovery_export_unbounded");
    const lineBuf = chunk.subarray(start, newline ? index : chunk.length);
    if (lineBuf.length + 1 > MAX_LINE) throw new Error("discovery_export_unbounded");
    if (lines.length === MAX_LINES) return { lines, consumed, more: true };
    lines.push(lineBuf.toString("utf8"));
    if (newline) {
      consumed = index + 1;
      start = index + 1;
    } else {
      consumed = chunk.length;
      start = chunk.length;
    }
  }
  return { lines, consumed, more: fileContinuesPastChunk };
}

export function readDiscoveryPage({ dir, date, cursor = null }) {
  const located = resolveDailyFile(dir, date);
  let offset = 0;
  if (cursor !== null && cursor !== undefined && cursor !== "") {
    const decoded = decodeCursor(cursor, date);
    offset = decoded.offset;
    if (offset > located.size) throw new Error("discovery_export_cursor_refused");
    if (offset > 0 && !precedingByteIsNewline(located.file, offset - 1)) throw new Error("discovery_export_cursor_refused");
    if (offset > 0 && prefixWatermark(located.file, offset) !== decoded.watermark) throw new Error("discovery_export_cursor_refused");
  }
  if (offset === located.size) {
    const marked = hashFileRange(located.file, located.size);
    return { lines: [], nextCursor: null, complete: true, offset, watermark: marked.watermark, bytes: marked.bytes };
  }
  const remaining = located.size - offset;
  const fileContinuesPastChunk = remaining > MAX_BYTES;
  const chunk = readAt(located.file, offset, Math.min(MAX_BYTES, remaining));
  let body = chunk;
  if (fileContinuesPastChunk) {
    const newline = chunk.lastIndexOf(0x0a);
    if (newline < 0) throw new Error("discovery_export_unbounded");
    body = chunk.subarray(0, newline + 1);
  }
  const taken = takeLines(body, false);
  if (taken.more && taken.consumed === 0) throw new Error("discovery_export_unbounded");
  const projected = [];
  for (const line of taken.lines) {
    if (!line) throw new Error("discovery_export_record_refused");
    let record;
    try { record = JSON.parse(line); } catch { throw new Error("discovery_export_record_refused"); }
    projected.push(projectRecord(record, date, line));
  }
  const more = taken.more || fileContinuesPastChunk;
  const next = offset + taken.consumed;
  if (more && (next <= offset || next > located.size)) throw new Error("discovery_export_unbounded");
  const finished = !more;
  const marked = finished ? hashFileRange(located.file, located.size) : null;
  return {
    lines: projected,
    nextCursor: more ? encodeCursor(date, next, prefixWatermark(located.file, next)) : null,
    complete: finished,
    offset: next,
    watermark: marked ? marked.watermark : null,
    bytes: marked ? marked.bytes : null,
  };
}

export function exportDiscoveryLog({ dir, date, cursor = null }) {
  return readDiscoveryPage({ dir, date, cursor });
}
