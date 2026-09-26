import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS, createVersion, createSnapshot, validateRequest, validateObservation, resolve, refOf, hash,
  adaptS04, adaptPackage, adaptPreflight } from '../src/index.mjs';
import { safeData } from '../src/contracts.mjs';
import { createSeedCatalog } from '../../../scale-lab/capability-market/src/catalog.mjs';
import { version, request, observation, mutation, snapshot, options, NOW, ENV, source, rights, packageFixture } from '../examples/fixtures.mjs';
import { runHoldouts } from '../examples/holdouts.mjs';

test('malformed JSON-like inputs reject prototypes, accessors, cycles, symbols and non-finite values', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const getter = Object.defineProperty({}, 'x', { get() { throw new Error('MUST_NOT_EXECUTE'); }, enumerable: true });
  const symbolic = { [Symbol('x')]: 'bad' };
  for (const raw of [cyclic, getter, symbolic, new Date(), Infinity, NaN, undefined, () => {}, 4n,
    JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: 'bad' }, Object.create({ inherited: 'bad' }), new Array(2)])
    assert.throws(() => safeData(raw), error => error.code === 'INVALID_INPUT');
  assert.equal({}.polluted, undefined);
});
test('JSON nesting and record-count bounds reject adversarial payloads', () => {
  let raw = {}; for (let i = 0; i < 40; i++) raw = { nested: raw };
  assert.throws(() => safeData(raw), { code: 'LIMIT_EXCEEDED' });
  const v = version(); assert.throws(() => snapshot(Array(5001).fill(v)), { code: 'LIMIT_EXCEEDED' });
});
test('missing fields and unsupported schemas do not normalize into hits', () => {
  for (const change of [{ schema: 'neomorphic.foundry.capability-request.v2' }, { taskId: 'unqualified' }, { environment: { nodeMajor: null } },
    { output: { type: 'object', properties: {}, required: ['undeclared'] } }, { output: { type: 'array', maxItems: -1 } },
    { output: { type: 'object', properties: {}, required: [], additionalProperties: true } }])
    assert.throws(() => validateRequest({ ...request(), ...change }));
  const missing = request(); delete missing.input; assert.throws(() => validateRequest(missing));
});
test('invalid dates, negative lifetimes and malformed evidence cannot be admitted', () => {
  const v = version();
  for (const change of [{ observedAt: '2026-02-30T12:00:00Z' }, { observedAt: '2026-09-26T12:00:00+00:00' },
    { expiresAt: '2026-09-24T12:00:00.000Z' }, { verdict: 'passed-looking' }, { id: 'not-namespaced' },
    { scope: { outcome: 'normalize', environment: ENV, inputDigest: 'sha256:not-a-digest' } }])
    assert.throws(() => validateObservation(observation(v, change)));
  assert.throws(() => snapshot([v], [observation(v, { scope: { outcome: 'normalize', environment: {}, inputDigest: null } })]), /bind every/);
});
test('invalid source and unsupported input semantics are rejected instead of loosened', () => {
  for (const change of [{ source: { ...source, revision: 'main' } }, { source: { ...source, path: '../outside' } },
    { input: { type: 'object', required: [], properties: { a: { type: 'string', pattern: '^yes$' } } } },
    { input: { type: 'array', items: { type: 'made-up-type' } } },
    { input: { type: 'string', enum: [123] } }]) assert.throws(() => version(change));
});
test('unknown correction target, replacement reuse, content mismatch and forks are rejected', () => {
  const v = version(), obs = observation(v);
  assert.throws(() => snapshot([v], [obs], [mutation('fixture:absent', 'retract-observation')]), { code: 'TARGET_MISMATCH' });
  const forged = observation(v, { target: { ...refOf(v), contentId: `sha256:${'0'.repeat(64)}` } });
  assert.throws(() => snapshot([v], [forged]), { code: 'TARGET_MISMATCH' });
  assert.throws(() => snapshot([v], [obs], [mutation(obs.id, 'retract-observation'), mutation(obs.id, 'retract-observation', { id: 'mutation:fork' })]), { code: 'REVISION_CONFLICT' });
});
test('correction cycles are rejected even at identical timestamps', () => {
  const v = version(), a = observation(v, { id: 'fixture:a', observedAt: NOW }), b = observation(v, { id: 'fixture:b', observedAt: NOW });
  assert.throws(() => snapshot([v], [a, b], [mutation(a.id, 'correct-observation', { replacementId: b.id }), mutation(b.id, 'correct-observation', { id: 'mutation:two', replacementId: a.id })]), { code: 'CORRECTION_CYCLE' });
});
test('unadmitted negative cannot poison a compatible result', () => {
  const v = version(), positive = observation(v), negative = observation(v, { id: 'fixture:hostile-negative', verdict: 'incompatible' });
  const s = snapshot([v], [positive, negative]);
  const result = resolve(s, request(), { now: NOW, policy: { policyRef: 'policy:trusted', admittedObservationIds: [positive.id] } });
  assert.equal(result.status, 'compatible'); assert.equal(result.candidates[0].evidence.find(e => e.id === negative.id).state, 'unadmitted');
});
test('dependency pin change requires fresh parent evidence and preserves old parent', () => {
  const d1 = version({ capabilityId: 'fixture:dep' }), d2 = version({ capabilityId: 'fixture:dep', version: '2' });
  const p1 = version({ dependencies: [refOf(d1)] }), p2 = version({ version: '2', dependencies: [refOf(d2)] });
  const s = snapshot([d1, d2, p1, p2], [observation(p1)]);
  const result = resolve(s, request(), options(s));
  assert.equal(result.candidates.find(c => c.target.contentId === p1.contentId).status, 'compatible');
  assert.equal(result.candidates.find(c => c.target.contentId === p2.contentId).status, 'unknown');
});
test('S04 adapter preserves original unfunded/historical/demo/actionable disclosures and stale quotes', () => {
  const catalog = createSeedCatalog();
  for (const fundingKind of ['voluntary', 'unfunded-request', 'funded']) {
    const raw = { ...catalog[0], fundingKind, actionability: 'actionable', historical: true };
    const a = adaptS04(raw, { source, rights, now: NOW });
    assert.deepEqual(a.version.provenance.original, raw); assert.equal(a.version.provenance.funding, fundingKind);
    assert.equal(a.version.provenance.classification, 'historical'); assert.equal(a.version.provenance.actionability, 'not-actionable');
    assert.equal(a.disclosure.funded, false); assert.equal(a.disclosure.advertised.price.stale, true); assert.deepEqual(a.observations, []);
  }
  const live = adaptS04({ ...catalog[0], actionability: 'actionable' }, { source, rights, now: NOW });
  assert.equal(live.version.provenance.funding, 'unknown'); assert.equal(live.version.provenance.actionability, 'actionable');
  const demo = adaptS04(catalog.find(c => c.demo), { source, rights, now: NOW }); assert.equal(demo.version.provenance.classification, 'demo');
});
test('S04 version identity is clock independent; diagnostics reuse original input checks', () => {
  const raw = createSeedCatalog()[0];
  const a = adaptS04(raw, { source, rights, now: NOW, inputs: { urls: 'wrong-type' } });
  const b = adaptS04(raw, { source, rights, now: '2026-09-09T12:00:00.000Z' });
  assert.equal(a.version.contentId, b.version.contentId); assert.equal(a.inputCheck.ok, false);
  assert.equal(a.disclosure.advertised.price.stale, true); assert.equal(b.disclosure.advertised.price.stale, false);
});
test('malformed/deceptive S04 records and unsupported constraints are refused', () => {
  const raw = createSeedCatalog()[0];
  assert.throws(() => adaptS04({ ...raw, reviews: ['fake'] }, { source, rights, now: NOW }), { code: 'ADAPTER_REJECTED' });
  assert.throws(() => adaptS04({ ...raw, inputRequirements: { required: [], properties: { x: { type: 'string', pattern: 'unsafe' } } } }, { source, rights, now: NOW }), /unsupported/);
});
test('preflight content binding and claimed accepted/executed flags never create admissible evidence', () => {
  const v = version(), report = { advertised: true, binding: { status: 'content_bound', executionVerified: true }, accepted: true,
    costReport: { dryRun: true, comparisons: [{ quoteId: 'quote:one', amountAtomic: '200000', currency: 'USDC', unit: 'job' }] }, testProposal: 'throw new Error("not executable")' };
  const adapted = adaptPreflight(report, { target: refOf(v), receiptRef: 'receipt:claim' });
  assert.deepEqual(adapted.original, report); assert.deepEqual(adapted.observations, []);
  assert.equal(adapted.trust.lanes.contentBound, 'content_bound'); assert.notEqual(adapted.trust.lanes.executed, 'executed');
  assert.notEqual(adapted.trust.lanes.accepted, 'accepted'); assert.equal(adapted.costs.actualSpend, null);
});
test('package identity reuses npm coordinate plus full source pin; manifest scripts stay data', () => {
  const f = packageFixture(); assert.equal(f.capability.capabilityId, 'npm:s180-capability-consumer-kit');
  assert.match(f.capability.version, /0\.1\.0\+git\.[a-f0-9]{40}/); assert.equal(f.capability.rights.license, 'MIT');
  assert.equal(f.capability.provenance.classification, 'demo');
  assert.equal(f.capability.provenance.original.manifest.scripts.test, 'node --test --test-concurrency=1 tests/*.test.mjs');
});
test('frozen synthetic holdouts report measured tasks and unknown costs without independence claims', () => {
  const a = runHoldouts({ measure: false }), b = runHoldouts({ measure: false });
  assert.deepEqual(a, b); assert.equal(a.laterTasks, 6); assert.equal(a.baselineSuccesses, 4); assert.equal(a.reuseSuccesses, 6);
  assert.equal(a.additionalSuccessfulTasks, 2);
  for (const obs of a.observations) { assert.notEqual(obs.taskId, obs.priorTaskId); assert.equal(obs.independence, 'not-independent'); assert.equal(obs.reuse.cost, null); assert.equal(obs.adaptation.effortMs, null); }
});

test('a sparse array decorated to match its length is still rejected', () => {
  const value = ['safe']; value.length = 2; value.extra = 'not-an-array-element';
  assert.throws(() => safeData(value), /sparse or decorated/);
});

test('preflight cost shape and fractional money fail closed without running proposals', () => {
  const target = refOf(version());
  for (const costReport of [{ comparisons: {} }, { comparisons: [null] }, { comparisons: [{ amountAtomic: 0.2, currency: 'USDC' }] }, { comparisons: [{ amountAtomic: '100' }] }])
    assert.throws(() => adaptPreflight({ costReport }, { target, receiptRef: 'receipt:malformed' }), { code: 'INVALID_INPUT' });
});
test('many input type failures remain bounded without argument-list overflow', () => {
  const v = version({ input: { type: 'array', items: { type: 'integer' } } }), s = snapshot([v], [observation(v)]);
  const result = resolve(s, request({ input: Array(10000).fill('malformed') }), options(s));
  assert.equal(result.status, 'known-incompatible'); assert.ok(result.candidates[0].reasons.length <= 130);
});
