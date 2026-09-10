import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(__dirname, '..', 'bin', 'checklist.mjs');
const descriptor = path.join(__dirname, '..', 'offer-descriptor.json');

test('offer descriptor validates offline', () => {
  const r = spawnSync(process.execPath, [bin, descriptor], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.equal(j.publicListingSupported, false);
});

test('tampered descriptor fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's109-agensi-bad-'));
  for (const name of [
    'offer-descriptor.json',
    'offer-descriptor.schema.json',
    'listing-checklist.json',
    'access-handoff.json',
  ]) {
    fs.copyFileSync(path.join(__dirname, '..', name), path.join(dir, name));
  }
  const bad = path.join(dir, 'offer-descriptor.json');
  const d = JSON.parse(fs.readFileSync(bad, 'utf8'));
  d.skillRecipePin = 'wrong-pin';
  fs.writeFileSync(bad, JSON.stringify(d));
  const r = spawnSync(process.execPath, [bin, bad], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});
