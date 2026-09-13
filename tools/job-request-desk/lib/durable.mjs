import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const bytesDigest = value => createHash('sha256').update(value).digest('hex');
export const fault = (code, message = code) => Object.assign(new Error(message), { code });

export function readDocument(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw fault('corrupt-record', `Unreadable durable record: ${path}`); }
}

// Publish a complete immutable document exactly once, even across OS processes.
// A killed writer can leave a hidden temporary file; it cannot expose a partial record.
export function createDocument(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(tmp, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  try {
    try { linkSync(tmp, path); } catch (err) { if (err.code === 'EEXIST') return false; throw err; }
    const dir = openSync(dirname(path), 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
    return true;
  } finally { unlinkSync(tmp); }
}

export function putImmutable(path, value) {
  if (!createDocument(path, value) && digest(readDocument(path)) !== digest(value)) throw fault('record-conflict', `Immutable record conflict: ${path}`);
  return value;
}
