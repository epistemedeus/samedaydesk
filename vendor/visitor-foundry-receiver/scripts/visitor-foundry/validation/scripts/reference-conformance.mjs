// Optional integration check against the exact, read-only pinned source checkouts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { attachEvidenceJoin, digest, projectReuse } from '../src/index.mjs';
import { harness, observation } from '../fixtures/example-config.mjs';
import { parseTaskObservation } from '../../../../inputs/pilot-task-memory-20260909/src/index.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const pilot = resolve(process.argv[2] ?? `${root}.local/pilot`);
const sds = resolve(process.argv[3] ?? `${root}.local/samedaydesk`);
const pins = { pilot: '4f5f631ec32d4738e8dee4cc5964ce4b5ecb55a6', samedaydesk: '8c7968360d64cc36f3b89486e01293c6553927cc' };
for (const [path, pin] of [[pilot, pins.pilot], [sds, pins.samedaydesk]]) {
  const p = spawnSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }); assert.equal(p.status, 0); assert.equal(p.stdout.trim(), pin);
  const clean = spawnSync('git', ['-C', path, 'status', '--porcelain'], { encoding: 'utf8' }); assert.equal(clean.status, 0); assert.equal(clean.stdout.trim(), '');
}
const moduleAt = path => import(pathToFileURL(path).href);
const fixtureAt = path => JSON.parse(readFileSync(path, 'utf8'));
const joinRoot = `${pilot}/tools/ops/three-site-settlement-join`;
const { joinThreeSite } = await moduleAt(`${joinRoot}/src/join.mjs`);
const h = harness(); h.accept(); h.advance(60000); assert.equal(h.command('beneficiary', 'observe', observation()).ok, true);
const joins = [];
for (const name of ['merchant-owner-qa', 'merchant-classified', 'skip-counted-as-pass']) {
  const result = joinThreeSite(fixtureAt(`${joinRoot}/fixtures/${name}.json`));
  const attached = attachEvidenceJoin(projectReuse(h.service.snapshot()), result);
  assert.deepEqual(attached.originalJoin, result); assert.equal(attached.accountingModified, false);
  assert.equal(result.claims.settledPayment, false); assert.equal(result.claims.organicRepeatDemand, false);
  if (name === 'skip-counted-as-pass') assert.equal(result.decision, 'reject');
  joins.push({ name, decision: result.decision, originalJoinDigest: attached.originalJoinDigest, accountingUnchanged: true });
}
const { exportReuse, previewReuse } = await moduleAt(`${sds}/tools/result-reuse/src/export.mjs`);
const input = fixtureAt(`${sds}/tools/result-reuse/fixtures/accepted-extract-batch.json`);
const options = { taskId: 'task-cold-sds', subject: 'cold-result', sequence: 1, clock: '2026-09-26T12:00:00.000Z' };
assert.equal(exportReuse(input, options).ok, false);
const exported = exportReuse(input, { ...options, optIn: true }); assert.equal(exported.ok, true);
assert.equal(exported.evidenceKind, 'user_selected_unverified'); assert.equal(exported.publicSafeCertified, false); assert.equal(exported.incomplete, true);
assert.equal(exported.observation.execute, false); assert.equal(parseTaskObservation(exported.observation).ok, true);
assert.equal(previewReuse(input, options).mode, 'preview');
const { costForRecipe } = await moduleAt(`${sds}/tools/recurring-job-recipes/lib/cost.mjs`);
const { inspectPaymentAuthority } = await moduleAt(`${sds}/tools/recurring-job-recipes/lib/payment-guard.mjs`);
assert.equal(costForRecipe('source-change-alert').primary.kind, 'costs_unknown');
assert.equal(inspectPaymentAuthority({ payment: { attempted: true } }, { replayPayment: true }).code, 'payment_replay_blocked');
const files = [
  [pilot, 'tools/ops/three-site-settlement-join/src/join.mjs'],
  [pilot, 'tools/ops/three-site-settlement-join/src/records.mjs'],
  [pilot, 'experiments/commons-20260909/task-memory-contract/src/types.ts'],
  [sds, 'tools/result-reuse/src/export.mjs'],
  [sds, 'tools/recurring-job-recipes/lib/cost.mjs'],
];
console.log(JSON.stringify({ provenance: 'owner_controlled_source_conformance', pins, joins, sds: { optInRequired: true, exportedEvidenceKind: exported.evidenceKind, incompletePreserved: true, taskMemoryContractValid: true, costsUnknown: true, paymentReplayBlocked: true, observationDigest: digest(exported.observation) }, sourceHashes: files.map(([base, path]) => ({ repo: base === pilot ? 'pilot' : 'samedaydesk', path, sha256: createHash('sha256').update(readFileSync(`${base}/${path}`)).digest('hex') })) }, null, 2));
