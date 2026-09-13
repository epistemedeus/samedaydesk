import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { replayRefuse } from './args.mjs';
import { sha256Bytes } from './digest.mjs';

export function inspectInputs(inputs, allowedKeys) {
  const entries = {};
  for (const [key, file] of Object.entries(inputs)) {
    if (!allowedKeys.includes(key) || typeof file !== 'string' || !file) {
      throw replayRefuse('unsupported-input', 'Replay accepts only this job\'s file inputs', { key });
    }
    const sourcePath = resolve(file);
    const st = statSync(sourcePath);
    if (!st.isFile() || st.size > 8 * 1024 * 1024) {
      throw replayRefuse('invalid-input-file', 'Replay input must be a regular file up to 8 MiB', { key });
    }
    const bytes = readFileSync(sourcePath);
    if (bytes.length > 8 * 1024 * 1024) throw replayRefuse('input-too-large', 'Input grew beyond byte limit');
    entries[key] = { sourcePath, bytes, sha256: sha256Bytes(bytes) };
  }
  return entries;
}

export function freezeInputs(entries, destDir) {
  mkdirSync(destDir, { recursive: false });
  const files = {}, hashes = {};
  for (const [key, entry] of Object.entries(entries)) {
    const target = join(destDir, key + extname(entry.sourcePath));
    writeFileSync(target, entry.bytes, { flag: 'wx', mode: 0o444 });
    files[key] = target;
    hashes[key] = { sha256: entry.sha256, bytes: entry.bytes.length };
  }
  return { files, hashes };
}
