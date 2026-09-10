import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fee = path.join(__dirname, '..', 'bin', 'fee-worksheet.mjs');
const validate = path.join(__dirname, '..', 'bin', 'validate-manifest.mjs');
const manifest = path.join(__dirname, '..', 'grexal.json');

test('fee worksheet matches docs at $0.10 and micro $0.05', () => {
  const a = JSON.parse(spawnSync(process.execPath, [fee, '0.10'], { encoding: 'utf8' }).stdout);
  assert.equal(a.platformFeeUsd, 0.02);
  assert.equal(a.sellerEarningsUsd, 0.08);
  const b = JSON.parse(spawnSync(process.execPath, [fee, '0.05'], { encoding: 'utf8' }).stdout);
  assert.equal(b.platformFeeUsd, 0.015);
  assert.equal(b.sellerEarningsUsd, 0.035);
});

test('manifest validates offline', () => {
  const r = spawnSync(process.execPath, [validate, manifest], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true);
});
