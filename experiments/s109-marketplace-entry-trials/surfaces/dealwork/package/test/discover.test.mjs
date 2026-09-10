import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(__dirname, '..', 'bin', 'discover.mjs');

test('fixture discovery emits local bid drafts without posting', () => {
  const r = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.equal(j.live, false);
  assert.ok(j.matched >= 1);
  assert.ok(j.bidDrafts.length >= 1);
  assert.equal(j.bidDrafts[0].willNotPost, true);
  assert.match(j.bidDrafts[0].proposedOffer.paidDeltaVsFreeDiy, /packaged acceptance/i);
});
