import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'consumer-out');

function ensureConsume() {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/run-consumer-clis.mjs')], {
    encoding: 'utf8',
    cwd: root,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
}

test('consumer consume gate file passes all four gates', () => {
  ensureConsume();
  const gate = JSON.parse(fs.readFileSync(path.join(out, 'gate.json'), 'utf8'));
  assert.equal(gate.owningRepo, 'epistemedeus/samedaydesk');
  assert.equal(gate.cashUsd, 0);
  assert.equal(gate.ok, true);
  assert.equal(gate.gates.openapiNoFalseUnchanged, true);
  assert.equal(gate.gates.pricingNoCrossUnitOrMissingAsFieldChange, true);
  assert.equal(gate.gates.csvNoSilentDuplicateOverwrite, true);
  assert.equal(gate.gates.rssExposesMissingIdAndDateAmbiguity, true);
});

test('consumer summaries are focused and non-paid', () => {
  ensureConsume();
  for (const name of ['openapi', 'pricing', 'csv', 'rss']) {
    const s = JSON.parse(fs.readFileSync(path.join(out, `${name}.summary.json`), 'utf8'));
    assert.equal(s.paidValueClaim, false);
  }
  const openapi = JSON.parse(fs.readFileSync(path.join(out, 'openapi.summary.json'), 'utf8'));
  assert.equal(openapi.unchangedCount, 0);
  assert.ok(openapi.changedFields.includes('security'));
  assert.ok(openapi.changedFields.includes('responses'));
  const csv = JSON.parse(fs.readFileSync(path.join(out, 'csv.summary.json'), 'utf8'));
  assert.equal(csv.rowDriftMode, 'duplicate-keys-blocked');
  const pricing = JSON.parse(fs.readFileSync(path.join(out, 'pricing.summary.json'), 'utf8'));
  assert.equal(pricing.fieldChangeCount, 0);
  assert.ok(pricing.conflictingReasons.includes('missing-cell'));
  assert.ok(pricing.conflictingReasons.includes('cross-unit-incomparable'));
  const rss = JSON.parse(fs.readFileSync(path.join(out, 'rss.summary.json'), 'utf8'));
  assert.ok(rss.uncertaintyCodes.includes('missing-item-id'));
  assert.ok(rss.uncertaintyCodes.includes('date-ambiguity'));
});
