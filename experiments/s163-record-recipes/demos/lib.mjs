import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const S134 = path.resolve(ROOT, '../s134-record-jobs');

export function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    maxBuffer: 20 * 1024 * 1024,
  });
  return r;
}

export function parseCliJson(stdout) {
  const text = String(stdout || '').trim();
  // CLIs may print a single JSON object
  return JSON.parse(text);
}

export function s134Module(name) {
  return path.join(S134, 'modules', name, 'cli.mjs');
}

export { ROOT, S134 };
