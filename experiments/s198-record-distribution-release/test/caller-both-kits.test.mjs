/**
 * S198: two caller-authored inputs + changed-input repeat for both kits.
 * Uses owning trees (S189 record-repeat CLI, S185 distribution-repair CLI).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const RR = path.join(ROOT, 'experiments/s176-record-repeat-package');
const DR = path.join(ROOT, 'experiments/s185-distribution-repair-package');
const RR_CLI = path.join(RR, 'bin/record-repeat.mjs');
const DR_CLI = path.join(DR, 'bin/distribution-repair.mjs');

function run(cli, args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parse(stdout) {
  return JSON.parse(String(stdout).trim());
}

function inner(out) {
  return out.report?.report || out.report || {};
}

test('record-repeat: two caller pairs and a changed-input repeat', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's198-rr-'));
  const aBefore = path.join(tmp, 'a-before.json');
  const aAfter = path.join(tmp, 'a-after.json');
  fs.writeFileSync(
    aBefore,
    `${JSON.stringify({ rows: [{ field: 'grok-4.6-input', value: 3.0, unit: 'USD/1M-tokens' }] })}\n`,
  );
  fs.writeFileSync(
    aAfter,
    `${JSON.stringify({ rows: [{ field: 'grok-4.6-input', value: 4.0, unit: 'USD/1M-tokens' }] })}\n`,
  );
  const ra = parse(
    run(RR_CLI, ['run', '--family', 'pricing-row-unit', '--before', aBefore, '--after', aAfter], tmp).stdout,
  );
  assert.equal(ra.ok, true);
  const delta = (inner(ra).fieldChanges || []).find((c) => c.fieldKey === 'grok-4.6-input');
  assert.equal(delta.beforeValue, 3);
  assert.equal(delta.afterValue, 4);

  const bBefore = path.join(tmp, 'b-before.csv');
  const bAfter = path.join(tmp, 'b-after.csv');
  fs.writeFileSync(bBefore, 'id,name\n1,old\n2,keep\n');
  fs.writeFileSync(bAfter, 'id,name\n1,new\n2,keep\n');
  const rb = parse(
    run(RR_CLI, ['run', '--family', 'csv-keyed-drift', '--before', bBefore, '--after', bAfter, '--key', 'id'], tmp)
      .stdout,
  );
  assert.equal(rb.ok, true);
  const drift = inner(rb).rowDrift;
  assert.equal(drift.changedCount, 1);

  const next = path.join(tmp, 'next.json');
  const first = parse(
    run(
      RR_CLI,
      ['run', '--family', 'pricing-row-unit', '--before', aBefore, '--after', aAfter, '--write-next-run', next],
      tmp,
    ).stdout,
  );
  assert.ok(first.nextRun?.path);
  const aAfter2 = path.join(tmp, 'a-after-2.json');
  fs.writeFileSync(
    aAfter2,
    `${JSON.stringify({ rows: [{ field: 'grok-4.6-input', value: 5.0, unit: 'USD/1M-tokens' }] })}\n`,
  );
  const replay = parse(
    run(RR_CLI, ['run', '--from-next-run', next, '--after', 'a-after-2.json'], tmp).stdout,
  );
  assert.equal(replay.ok, true);
  const d2 = (inner(replay).fieldChanges || []).find((c) => c.fieldKey === 'grok-4.6-input');
  assert.equal(d2.afterValue, 5);
  assert.notEqual(d2.afterValue, delta.afterValue);
  assert.equal(replay.currentInputs.after.observedAt, 'unknown');
});

test('distribution-repair: two caller snapshots and a docs-route repeat', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's198-dr-'));
  const clock = '2026-09-10T20:15:00.000Z';
  const alpha = path.join(DR, 'examples/caller/alpha.json');
  const beta = path.join(DR, 'examples/caller/beta.json');
  const aPath = path.join(tmp, 'operator-alpha.json');
  const bPath = path.join(tmp, 'operator-beta.json');
  fs.copyFileSync(alpha, aPath);
  fs.copyFileSync(beta, bPath);
  const ra = parse(run(DR_CLI, ['diagnose', aPath, '--clock', clock], tmp).stdout);
  const rb = parse(run(DR_CLI, ['diagnose', bPath, '--clock', clock], tmp).stdout);
  assert.equal(ra.status, 'diagnosed');
  assert.equal(rb.status, 'diagnosed');
  assert.equal(ra.repair.beforeAfter.routeKey, '/docs');
  assert.equal(rb.repair.beforeAfter.routeKey, '/api/v1');
  assert.equal(ra.productionAcquisition, false);

  const first = parse(
    run(DR_CLI, ['diagnose', path.join(DR, 'examples/next-run/input.json'), '--clock', clock], tmp).stdout,
  );
  const second = parse(
    run(
      DR_CLI,
      ['diagnose', path.join(DR, 'examples/next-run/input-after-docs-fix.json'), '--clock', '2026-09-10T21:00:00.000Z'],
      tmp,
    ).stdout,
  );
  const d1 = first.feed.repairRecommendations.find((r) => r.routeKey === '/docs');
  const d2 = second.feed.repairRecommendations.find((r) => r.routeKey === '/docs');
  assert.equal(d1.delta, 'redirected');
  assert.equal(d2.delta, 'unchanged');
});
