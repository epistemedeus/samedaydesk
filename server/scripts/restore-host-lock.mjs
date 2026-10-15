#!/usr/bin/env node
// Hostinger root `npm install` rewrites one lock byte: the linked
// machine-gateway entry is refreshed from package.json 0.1.2 while the
// committed host lock, and both contributor manifests, still record 0.1.1.
// Repair that byte only when the result is the pinned host lock. Any other
// drift is a named refusal. The contributor verifier stays unchanged.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HOST_LOCK_SHA256 = '4f2660d59ec4bb6697a01c591b5d20b918927ff8de0b8dc6316d04fc319389e7';
const MARKER = '"server/vendor/machine-gateway"';
const NEXT = '\n    "vendor/agent-payment-integrity"';
const RECORDED = '"version": "0.1.1"';
const REFRESHED = '"version": "0.1.2"';

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function restoreHostLockBytes(bytes) {
  if (sha256(bytes) === HOST_LOCK_SHA256) return { status: 'retained', bytes };
  const text = Buffer.from(bytes).toString('utf8');
  const marker = text.indexOf(MARKER);
  const windowEnd = marker < 0 ? -1 : text.indexOf(NEXT, marker);
  if (marker < 0 || windowEnd < 0) throw coded('host_lock_drift_refused');
  const window = text.slice(marker, windowEnd);
  if (window.split(REFRESHED).length !== 2 || window.includes(RECORDED)) throw coded('host_lock_drift_refused');
  const repaired = Buffer.from(text.slice(0, marker) + window.replace(REFRESHED, RECORDED) + text.slice(windowEnd), 'utf8');
  if (sha256(repaired) !== HOST_LOCK_SHA256) throw coded('host_lock_repair_refused');
  return { status: 'restored', bytes: repaired };
}

export function restoreHostLockFile(root) {
  const lockPath = path.join(root, 'package-lock.json');
  const current = readFileSync(lockPath);
  const result = restoreHostLockBytes(current);
  if (result.status === 'restored') writeFileSync(lockPath, result.bytes);
  return result.status;
}

function fail(error) {
  const known = new Set(['host_lock_drift_refused', 'host_lock_repair_refused']);
  process.stderr.write(`${known.has(error?.code) ? error.code : 'host_lock_restore_failed'}\n`);
  process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const status = restoreHostLockFile(fileURLToPath(new URL('../../', import.meta.url)));
    process.stdout.write(status === 'retained' ? 'host lock retained\n' : 'host lock restored\n');
  } catch (error) {
    fail(error);
  }
}
