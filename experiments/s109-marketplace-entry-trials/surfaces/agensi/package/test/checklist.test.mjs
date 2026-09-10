import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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
  const bad = path.join(__dirname, 'bad-descriptor.json');
  fs.writeFileSync(
    bad,
    JSON.stringify({
      surface: 'agensi',
      cashBoundaryUsd: 0,
      willNotListFromWorker: true,
      skillRecipePin: 'wrong-pin',
      paidDeliverable: 'x',
      freeAlternative: 'y',
      rootHandoff: { cloudflareAccessUrl: 'https://www.agensi.dev/sell', steps: ['a', 'b', 'c'] },
      payoutClaimsVerified: { status: 'blocked-by-access' },
    }),
  );
  const r = spawnSync(process.execPath, [bin, bad], { encoding: 'utf8' });
  fs.unlinkSync(bad);
  assert.notEqual(r.status, 0);
});
