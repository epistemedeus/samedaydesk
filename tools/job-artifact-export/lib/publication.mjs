import { closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { refuse } from './refuse.mjs';

export function assertUnlinkedPath(path) {
  let cursor = resolve(path);
  for (;;) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw refuse('symlink-refused', 'Path contains a symbolic link');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function assertVacant(out) {
  assertUnlinkedPath(out);
  try {
    if (!lstatSync(out).isDirectory() || readdirSync(out).length) {
      throw refuse('destination-exists', 'Destination must be absent or an empty directory');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function syncDir(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function publishFiles(out, entries, validate = () => {}) {
  assertVacant(out);
  mkdirSync(dirname(out), { recursive: true });
  const stage = mkdtempSync(join(dirname(out), `.${basename(out)}.stage-`));
  try {
    for (const entry of entries) {
      const path = join(stage, entry.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, entry.data, { flag: 'wx', mode: 0o600, flush: true });
      syncDir(dirname(path));
    }
    const result = validate(stage);
    syncDir(stage);
    assertVacant(out);
    renameSync(stage, out);
    syncDir(dirname(out));
    return result;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
