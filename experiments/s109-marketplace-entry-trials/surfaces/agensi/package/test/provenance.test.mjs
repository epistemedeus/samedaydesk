import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareProvenance } from '../bin/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(__dirname, '..');
const freeDir = path.resolve(pkg, 'fixtures/free');
const paidDir = path.resolve(pkg, 'fixtures/paid');
const PIN = 'epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666';

test('provenance: packaging delta is paid-only overlay; no proprietary claim', () => {
  const r = compareProvenance({ freeDir, paidDir, skillRecipePin: PIN });
  assert.equal(r.cashBoundaryUsd, 0);
  assert.equal(r.claimsProprietaryOwnershipOfFreeRecipes, false);
  assert.equal(r.exclusivityClaim, false);
  assert.equal(r.listingPerformed, false);
  assert.equal(r.mcpPaidUnlockPerformed, false);
  assert.deepEqual(r.packagingDeltaFiles, ['ACCEPTANCE.md', 'DELIVERY.md']);
  assert.deepEqual(r.identicalSample, ['SKILL.md']);
  assert.equal(r.counts.modified, 0);
  assert.equal(r.counts.paidOnly, 2);
  assert.equal(r.counts.freeOnly, 1);
  assert.equal(r.officialHosts.auth, 'https://www.agensi.io/auth');
  assert.equal(r.officialHosts.sell, 'https://www.agensi.io/sell');
  assert.equal(r.officialHosts.mcp, 'https://mcp.agensi.io/mcp');
  assert.equal(r.unrelatedHostDoNotEnter.host, 'https://www.agensi.dev');
});

test('provenance.mjs CLI exits 0 on S121 fixtures', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(pkg, 'bin/provenance.mjs'), '--freeDir', freeDir, '--paidDir', paidDir, '--skillRecipePin', PIN],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.claimsProprietaryOwnershipOfFreeRecipes, false);
  assert.deepEqual(j.packagingDeltaFiles, ['ACCEPTANCE.md', 'DELIVERY.md']);
});
