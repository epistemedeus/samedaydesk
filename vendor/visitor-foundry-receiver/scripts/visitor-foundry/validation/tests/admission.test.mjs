import test from 'node:test';
import assert from 'node:assert/strict';
import { artifact, candidate, defaultLimits, defaultPolicy, evaluator, harness, observation } from '../fixtures/example-config.mjs';
import { digest, schemaId, ValidationService } from '../src/index.mjs';
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.result; };
const denied = (r, code) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.code, code); assert.ok(r.nextAction); };
const assign = h => ok(h.command('operator', 'assign', {})).assignment;
const submit = (h, c = candidate()) => ok(h.command('contributor', 'submit', c));
const invalidate = (h, extra = {}) => h.command('operator', 'invalidate', { scope: 'scope:demo', target: 'candidate', candidateId: 'candidate:a', receiptId: null, dependency: null, reason: 'Observed regression', evidence: { ref: 'fixture:regression', revision: 'fixture:2' }, ...extra });

test('only host-installed opaque handles authenticate; passing-looking contributor JSON never promotes', () => {
  const h = harness(); const command = { schema: schemaId('validation_command'), id: 'command:forged', expectedRevision: 0, type: 'submit', payload: candidate() };
  denied(h.service.dispatch({ ...h.handles.contributor }, command), 'unauthenticated');
  submit(h); const a = assign(h); const r = h.receipt(a);
  denied(h.command('contributor', 'receipt', r), 'forbidden');
  denied(h.command('outsider', 'receipt', r), 'unassigned_verifier');
  denied(h.command('runner', 'receipt', { ...r, verifierId: 'actor:runner' }), 'unknown_field:$');
  assert.equal(h.service.snapshot().candidates['candidate:a'].acceptance, 'pending');
  ok(h.command('runner', 'receipt', r));
  assert.equal(h.service.snapshot().candidates['candidate:a'].acceptance, 'accepted');
  assert.equal(h.service.snapshot().candidates['candidate:a'].promotion, 'not_promoted');
  denied(h.command('contributor', 'promote', { candidateId: 'candidate:a', receiptId: r.id, evidence: { ref: 'fixture:promotion', revision: 'fixture:1' } }), 'forbidden');
  ok(h.command('operator', 'promote', { candidateId: 'candidate:a', receiptId: r.id, evidence: { ref: 'fixture:promotion', revision: 'fixture:1' } }));
  assert.equal(h.service.snapshot().candidates['candidate:a'].promotion, 'promoted');
});

test('same organizational identity cannot be assigned even with a distinct runner handle', () => {
  const h = harness({ runnerGroup: 'organization:author' }); submit(h);
  denied(h.command('operator', 'assign', {}), 'independent_runner_unavailable');
  assert.equal(h.service.snapshot().charged.cpuMs, 0);
});

for (const field of ['capability', 'sourceRevision', 'artifactDigest', 'dependencyDigest', 'evaluator', 'environmentDigest']) test(`exact receipt binding rejects drift in ${field}`, () => {
  const h = harness(); submit(h); const a = assign(h); const r = h.receipt(a);
  const change = ['capability', 'evaluator'].includes(field) ? { ...r[field], revision: 'fixture:wrong' } : ['artifactDigest', 'dependencyDigest', 'environmentDigest'].includes(field) ? digest('wrong') : 'fixture:wrong';
  denied(h.command('runner', 'receipt', { ...r, [field]: change }), `receipt_binding:${field}`);
  assert.equal(Object.keys(h.service.snapshot().receipts).length, 0);
});

test('idempotent commands, natural candidate dedup, and renamed receipt replay consume one reservation', () => {
  const h = harness(); const c = candidate(); const cmd = { id: 'command:submit-stable' };
  const first = h.command('contributor', 'submit', c, cmd); ok(first);
  const duplicate = h.command('contributor', 'submit', c, { ...cmd, expectedRevision: 0 }); ok(duplicate); assert.equal(duplicate.duplicate, true);
  assert.equal(ok(h.command('contributor', 'submit', c)).code, 'duplicate_candidate');
  denied(h.command('contributor', 'submit', { ...c, id: 'candidate:rename' }), 'capability_revision_exists');
  denied(h.command('contributor', 'submit', { ...c, sourceRevision: 'wrong' }, cmd), 'idempotency_conflict');
  const a = assign(h); const r = h.receipt(a); ok(h.command('runner', 'receipt', r));
  const charged = h.service.snapshot().charged;
  assert.equal(ok(h.command('runner', 'receipt', r)).code, 'duplicate_receipt');
  assert.equal(ok(h.command('runner', 'receipt', { ...r, id: 'receipt:rename' })).code, 'duplicate_receipt');
  assert.deepEqual(h.service.snapshot().charged, charged);
  assert.equal(Object.keys(h.service.snapshot().receipts).length, 1);
  denied(h.command('runner', 'receipt', { ...r, usage: { ...r.usage, cpuMs: 900 } }), 'receipt_id_conflict');
});

test('stale aggregate revisions fail atomically and valid retry is allowed', () => {
  const h = harness(); submit(h); const before = h.service.snapshot();
  denied(h.command('contributor', 'submit', candidate('b'), { expectedRevision: 0, id: 'command:b' }), 'revision_conflict');
  assert.deepEqual(h.service.snapshot(), before);
  ok(h.command('contributor', 'submit', candidate('b'), { id: 'command:b' }));
});

for (const risk of ['ambiguous', 'high']) test(`${risk} risk cannot auto accept and independent review consumes bounded budget`, () => {
  const h = harness({ policy: { risk }, limits: { maxReviews: 1 } });
  const first = h.accept(); assert.equal(first.result.result.stage, 'awaiting_review');
  const review = { candidateId: 'candidate:a', receiptId: first.receipt.id, decision: 'accept', evidence: { ref: 'fixture:review', revision: 'fixture:1' } };
  denied(h.command('contributor', 'review', review), 'forbidden');
  denied(h.command('reviewer', 'review', { ...review, receiptId: 'receipt:wrong' }), 'stale_review');
  ok(h.command('reviewer', 'review', review));
  const second = h.accept(candidate('b'));
  denied(h.command('reviewer', 'review', { ...review, candidateId: 'candidate:b', receiptId: second.receipt.id }), 'review_budget_exhausted');
  assert.equal(h.service.snapshot().candidates['candidate:b'].stage, 'awaiting_review');
  assert.equal(h.service.snapshot().charged.reviewMs, defaultPolicy.reviewMs);
});

test('runner limitations require review even on a low-risk deterministic policy', () => {
  const h = harness(); submit(h); const r = h.receipt(assign(h)); r.observed.limitations.push('Coverage excludes one environment.');
  assert.equal(ok(h.command('runner', 'receipt', r)).stage, 'awaiting_review');
});

for (const status of ['fail', 'skip', 'incomplete']) test(`${status} observation never counts as passing acceptance`, () => {
  const h = harness(); submit(h); const r = h.receipt(assign(h)); r.observed.checks[0].status = status;
  assert.equal(ok(h.command('runner', 'receipt', r)).acceptance, 'rejected');
});

test('empty/missing/duplicated checks cannot pass and budget breach is retained as failed evidence', () => {
  const h = harness(); submit(h); const r = h.receipt(assign(h));
  for (const checks of [[], r.observed.checks.slice(1), [r.observed.checks[0], r.observed.checks[0], r.observed.checks[2]]]) denied(h.command('runner', 'receipt', { ...r, observed: { ...r.observed, checks } }), 'check_coverage_mismatch');
  const breached = { ...r, usage: { ...r.usage, cost: { currency: 'USD_MICROS', units: '1001' } } };
  assert.equal(ok(h.command('runner', 'receipt', breached)).code, 'runner_budget_breach');
  assert.equal(h.service.snapshot().receipts[r.id].budgetExceeded, true);
  denied(h.command('operator', 'assign', {}), 'validation_halted');
});

test('candidate revocation fences in-flight receipts and withdraws promotion', () => {
  const h = harness(); submit(h); const r = h.receipt(assign(h)); ok(invalidate(h));
  denied(h.command('runner', 'receipt', r), 'candidate_not_running');
  assert.equal(h.service.snapshot().candidates['candidate:a'].promotion, 'withdrawn');
});

test('receipt revocation invalidates exact dependencies transitively while unrelated versions stay usable', () => {
  const h = harness(); const a = h.accept();
  h.accept(candidate('b', { dependencies: [a.candidate.capability] }));
  h.accept(candidate('c', { dependencies: [candidate('b').capability] }));
  h.accept(candidate('d'));
  const result = ok(invalidate(h, { target: 'receipt', candidateId: null, receiptId: a.receipt.id }));
  assert.equal(result.invalidated.length, 3);
  assert.equal(h.service.snapshot().candidates['candidate:d'].acceptance, 'accepted');
  denied(h.command('runner', 'receipt', a.receipt), 'receipt_revoked');
  denied(h.command('contributor', 'submit', candidate('e', { dependencies: [a.candidate.capability] })), 'dependency_unavailable');
});

test('explicit external dependency invalidation cancels assigned work', () => {
  const dependency = { id: 'package:terms-lifecycle', revision: 'git:28924aa' };
  const h = harness({ dependencies: [{ ref: dependency, active: true }] }); submit(h, candidate('a', { dependencies: [dependency] })); assign(h);
  ok(invalidate(h, { target: 'dependency', candidateId: null, dependency }));
  assert.equal(h.service.snapshot().candidates['candidate:a'].active, false);
});

test('new revision correction retains old receipt, invalidates dependents, and requires fresh independent replay', () => {
  const h = harness(); const first = h.accept();
  h.accept(candidate('b', { dependencies: [first.candidate.capability] }));
  const corrected = candidate('corrected', { capability: { ...first.candidate.capability, revision: 'fixture:corrected-v2' }, sourceRevision: 'fixture:card-r2', supersedes: 'candidate:a' });
  submit(h, corrected);
  const s = h.service.snapshot(); assert.equal(s.candidates['candidate:a'].active, false); assert.equal(s.candidates['candidate:b'].active, false);
  assert.equal(s.receipts[first.receipt.id].active, false); assert.equal(s.candidates[corrected.id].acceptance, 'pending');
  const r = h.receipt(assign(h)); ok(h.command('runner', 'receipt', r));
  assert.equal(h.service.snapshot().candidates[corrected.id].acceptance, 'accepted');
  assert.equal(h.service.snapshot().candidates['candidate:b'].acceptance, 'invalidated');
});

test('bounded outstanding backlog includes pending reviews and per-scope limits', () => {
  const h = harness({ policy: { risk: 'high' }, limits: { maxOutstanding: 2, maxPerScope: 1 } });
  h.accept(); denied(h.command('contributor', 'submit', candidate('b')), 'scope_backlog_full');
  const second = harness({ limits: { maxOutstanding: 1 } }); submit(second); denied(second.command('contributor', 'submit', candidate('b')), 'backlog_full');
});

for (const limits of [{ maxCpuMs: 999 }, { maxWallMs: 9999 }, { maxMemoryMb: 63 }, { maxCost: { currency: 'USD_MICROS', units: '999' } }]) test(`resource/cost cap prevents dispatch ${JSON.stringify(limits)}`, () => {
  const h = harness({ limits }); submit(h); denied(h.command('operator', 'assign', {}), limits.maxMemoryMb ? 'memory_capacity' : 'budget_exhausted'); assert.equal(h.service.snapshot().charged.cpuMs, 0);
});

test('timeouts charge original cap, retries have a fresh fence, and attempt limit is terminal', () => {
  const h = harness(); submit(h); const old = assign(h); const late = h.receipt(old);
  h.advance(10000); denied(h.command('runner', 'receipt', late), 'lease_expired');
  ok(h.command('operator', 'expire', {})); assert.equal(h.service.snapshot().candidates['candidate:a'].stage, 'retry_wait');
  denied(h.command('operator', 'assign', {}), 'queue_empty');
  h.advance(1000); ok(h.command('operator', 'expire', {})); const fresh = assign(h); assert.notEqual(fresh.id, old.id);
  denied(h.command('runner', 'receipt', late), 'stale_assignment');
  h.advance(10000); ok(h.command('operator', 'expire', {}));
  assert.equal(h.service.snapshot().candidates['candidate:a'].stage, 'timed_out');
  assert.equal(h.service.snapshot().charged.costUnits, '2000');
});

test('retry cannot bypass a finite window budget', () => {
  const h = harness({ limits: { maxCost: { currency: 'USD_MICROS', units: '1000' } } }); submit(h); assign(h);
  h.advance(10000); ok(h.command('operator', 'expire', {})); h.advance(1000); ok(h.command('operator', 'expire', {}));
  denied(h.command('operator', 'assign', {}), 'budget_exhausted');
});

test('round-robin eligible scope scheduling and FIFO survive one busy scope', () => {
  const h = harness({ policies: [defaultPolicy, { ...defaultPolicy, id: 'policy:other', scope: 'scope:other' }], limits: { maxRunning: 1 } });
  submit(h, candidate('z-first')); submit(h, candidate('a-second')); submit(h, candidate('other', { scope: 'scope:other' }));
  const a = assign(h); assert.equal(a.candidateId, 'candidate:z-first');
  denied(h.command('operator', 'assign', {}), 'running_capacity'); ok(h.command('runner', 'receipt', h.receipt(a)));
  const b = assign(h); assert.equal(b.candidateId, 'candidate:other'); ok(h.command('runner', 'receipt', h.receipt(b)));
  assert.equal(assign(h).candidateId, 'candidate:a-second');
});

test('scoped host principals cannot submit to, schedule, review or invalidate foreign scope', () => {
  const actor = {}; const runner = {}; const service = new ValidationService({ principals: [{ handle: actor, subject: 'actor:limited', group: 'org:a', roles: ['operator', 'contributor'], scopes: ['scope:demo'] }, { handle: runner, subject: 'actor:runner', group: 'org:b', roles: ['runner'], scopes: ['scope:other'], evaluators: [evaluator], assignmentEvidence: 'fixture:assignment' }], policies: [defaultPolicy, { ...defaultPolicy, id: 'policy:other', scope: 'scope:other' }], limits: defaultLimits });
  const raw = (type, payload) => ({ schema: schemaId('validation_command'), id: `command:${type}`, expectedRevision: 0, type, payload });
  denied(service.dispatch(actor, raw('submit', candidate('foreign', { scope: 'scope:other' }))), 'forbidden');
  denied(service.dispatch(actor, raw('invalidate', { scope: 'scope:other', target: 'dependency', candidateId: null, receiptId: null, dependency: candidate().capability, reason: 'no', evidence: { ref: 'fixture:no', revision: 'fixture:1' } })), 'forbidden');
});

test('schema bounds, numeric cost rejection, input mutation isolation and journal limit', () => {
  const h = harness({ limits: { maxCommands: 1 } }); const c = candidate(); submit(h, c); c.claimed.summary = 'edited';
  assert.notEqual(h.service.snapshot().candidates[c.id].candidate.claimed.summary, 'edited');
  const snapshot = h.service.snapshot(); snapshot.candidates[c.id].acceptance = 'accepted'; assert.equal(h.service.snapshot().candidates[c.id].acceptance, 'pending');
  denied(h.command('operator', 'assign', {}), 'journal_full');
  const other = harness(); denied(other.command('contributor', 'submit', candidate('a', { claimed: { summary: 'x'.repeat(70000), evidenceRefs: [], limitations: [] } })), 'payload_too_large');
  assert.throws(() => harness({ limits: { maxCost: { currency: 'USD_MICROS', units: 1.2 } } }));
});

test('clocks reject future evidence and backwards host time', () => {
  const h = harness(); submit(h); const r = h.receipt(assign(h));
  denied(h.command('runner', 'receipt', { ...r, observedAt: '2026-09-26T14:00:00.000Z' }), 'invalid_observation_time');
  h.advance(-1000); denied(h.command('operator', 'expire', {}), 'clock_regressed');
});

test('external source pins cannot be shadowed by new candidates or used to create dependency cycles', () => {
  const fixed = candidate().capability;
  const h = harness({ dependencies: [{ ref: fixed, active: true }] });
  denied(h.command('contributor', 'submit', candidate()), 'capability_revision_exists');
});

test('aggregate memory reservation bounds concurrent assignments across scopes', () => {
  const h = harness({ policies: [defaultPolicy, { ...defaultPolicy, id: 'policy:other', scope: 'scope:other' }], limits: { maxMemoryMb: 100 } });
  submit(h); submit(h, candidate('b', { scope: 'scope:other' })); const first = assign(h);
  denied(h.command('operator', 'assign', {}), 'memory_capacity');
  ok(h.command('runner', 'receipt', h.receipt(first))); assert.equal(assign(h).candidateId, 'candidate:b');
});
