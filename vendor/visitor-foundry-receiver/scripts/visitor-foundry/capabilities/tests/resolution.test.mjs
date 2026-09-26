import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersion, appendSnapshot, readSnapshot, resolve, resolvePage, listVersions, createGap, dependencyImpact,
  refOf, hash, versionKey, createSnapshot } from '../src/index.mjs';
import { version, request, observation, mutation, snapshot, options, ENV, NOW, BEFORE, AFTER, demo } from '../examples/fixtures.mjs';
const add = (s, changes) => appendSnapshot(s, { ...changes, expectedSnapshotId: s.snapshotId });
const one = (s, req = request()) => resolve(s, req, options(s));
const graph = () => { const v = version(); return { v, s: snapshot([v], [observation(v)]) }; };

test('immutable content identity, deep freeze and snapshot round-trip', () => {
  const { v, s } = graph(); assert.throws(() => { v.rights.status = 'denied'; }, TypeError);
  const tampered = structuredClone(v); tampered.input.required = [];
  assert.throws(() => snapshot([tampered]), { code: 'CONTENT_MISMATCH' });
  assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(s))), s);
  const raw = structuredClone(s); raw.coverage.complete = false;
  assert.throws(() => readSnapshot(raw), { code: 'CONTENT_MISMATCH' });
});
test('stable deduplication and immutable identity conflict fail closed', () => {
  const { v, s } = graph(); assert.equal(snapshot([v, v], [...s.observations, ...s.observations]).snapshotId, s.snapshotId);
  const altered = version({ outcomes: ['changed'] });
  assert.throws(() => snapshot([v, altered]), { code: 'IDENTITY_CONFLICT' });
  assert.throws(() => add(s, { observations: [observation(v, { verdict: 'incompatible' })] }), { code: 'IDENTITY_CONFLICT' });
});
test('append requires compare-and-swap and idempotent retry retains identity', () => {
  const { v, s } = graph(); assert.equal(add(s, { versions: [v] }).snapshotId, s.snapshotId);
  assert.throws(() => appendSnapshot(s, { expectedSnapshotId: 'sha256:stale' }), { code: 'REVISION_CONFLICT' });
});
test('compatible requires admitted observation; contributor claims cannot supply policy', () => {
  const { s } = graph(); assert.equal(one(s).status, 'compatible');
  assert.equal(resolve(s, request(), { now: NOW }).status, 'unknown');
  assert.throws(() => one(s, { ...request(), policy: options(s).policy }), /unknown fields/);
  assert.equal(one(s).boundaries.invocation, false);
});
test('unknown environment is distinct from unsupported environment', () => {
  const { s } = graph(); assert.equal(one(s, request({ environment: {} })).status, 'unknown');
  assert.equal(one(s, request({ environment: { ...ENV, nodeMajor: 18 } })).status, 'known-incompatible');
  assert.equal(one(s, request({ environment: { ...ENV, platform: 'darwin' } })).status, 'unknown');
});
test('a genuine miss requires complete declared scope; unknown cannot create gap', () => {
  const s = snapshot([]); assert.equal(one(s, request({ outcome: 'genuine-gap' })).status, 'missing');
  assert.equal(one(s, request({ outcome: 'outside-scope' })).status, 'unknown');
  assert.equal(one(snapshot([], [], [], { complete: false })).status, 'unknown');
  assert.throws(() => createGap(s, request({ outcome: 'outside-scope' }), options(s), { gapId: 'gap:test', reproducer: { ref: 'fixture:repro', permission: 'synthetic' }, funding: { kind: 'voluntary', ref: null } }), { code: 'NOT_A_GAP' });
});
test('gap carries resolver pin and cleared reference without caller private inputs', () => {
  const s = snapshot([]), req = request({ input: { secret: 'NEVER_EXPORT_THIS' } });
  const gap = createGap(s, req, options(s), { gapId: 'gap:one', reproducer: { ref: 'fixture:sanitized', permission: 'authorized' }, funding: { kind: 'unfunded-request', ref: null } });
  assert.equal(gap.resolver.snapshotId, s.snapshotId); assert.doesNotMatch(JSON.stringify(gap), /NEVER_EXPORT_THIS/);
  assert.equal(gap.funding.kind, 'unfunded-request');
});
test('typed applicability validates nested arrays, objects, boolean, integer, null, enums and zero maxItems', () => {
  const v = version({ input: { type: 'object', required: ['flag', 'count', 'nil', 'items'], properties: {
    flag: { type: 'boolean' }, count: { type: 'integer' }, nil: { type: 'null' }, items: { type: 'array', maxItems: 0, items: { type: 'string' } } } } });
  const s = snapshot([v], [observation(v)]);
  assert.equal(one(s, request({ input: { flag: false, count: 0, nil: null, items: [] } })).status, 'compatible');
  for (const input of [{ flag: 'false', count: 0, nil: null, items: [] }, { flag: false, count: 0.5, nil: null, items: [] }, { flag: false, count: 0, nil: null, items: ['one'] }, {}])
    assert.equal(one(s, request({ input })).status, 'known-incompatible');
});
test('required output guarantee mismatch cannot be a hit', () => {
  const { s } = graph(); const output = { type: 'object', required: ['other'], properties: { other: { type: 'string' } } };
  assert.equal(one(s, request({ output })).status, 'known-incompatible');
});
test('negative is scoped to exact version, environment, outcome and input digest', () => {
  const { v } = graph(); const other = version({ version: 'synthetic-2' });
  const neg = observation(v, { verdict: 'incompatible', scope: { outcome: 'normalize', environment: ENV, inputDigest: hash({ value: 'bad' }) } });
  const s = snapshot([v, other], [neg, observation(other, { id: 'fixture:other' })]);
  const result = one(s, request({ input: { value: 'bad' } }));
  assert.equal(result.candidates.find(c => c.target.version === v.version).status, 'known-incompatible');
  assert.equal(result.selected.version, other.version);
  assert.equal(one(s).candidates.find(c => c.target.version === v.version).status, 'unknown');
  assert.equal(one(s, request({ input: { value: 'bad' }, environment: { ...ENV, platform: 'darwin' } })).candidates[0].status, 'unknown');
});
test('conflict stays unknown regardless observation order; no latest-wins voting', () => {
  const { v } = graph(), pos = observation(v), neg = observation(v, { id: 'fixture:negative', verdict: 'incompatible' });
  const a = snapshot([v], [pos, neg]), b = snapshot([v], [neg, pos]);
  assert.equal(one(a).status, 'unknown'); assert.deepEqual(one(a), one(b));
  assert.ok(one(a).candidates[0].reasons.includes('conflicting_evidence'));
});
test('expiry boundary and future evidence remain auditable and do not cause incompatibility', () => {
  const { v } = graph(); const s = snapshot([v], [observation(v, { expiresAt: NOW }), observation(v, { id: 'fixture:future', observedAt: AFTER, expiresAt: null })]);
  const r = one(s); assert.equal(r.status, 'unknown'); assert.deepEqual(r.candidates[0].evidence.map(e => e.state).sort(), ['expired', 'future']);
});
test('correction and retraction preserve history and unrelated version', () => {
  const { v } = graph(), v2 = version({ version: 'synthetic-2' });
  const neg = observation(v, { verdict: 'incompatible' }), replacement = observation(v, { id: 'fixture:replacement', observedAt: NOW });
  const s = snapshot([v, v2], [neg, replacement, observation(v2, { id: 'fixture:v2' })], [mutation(neg.id, 'correct-observation', { replacementId: replacement.id })]);
  const r = one(s); assert.ok(r.candidates.every(c => c.status === 'compatible'));
  assert.equal(r.candidates[0].evidence.find(e => e.id === neg.id).state, 'corrected');
  assert.equal(resolve(s, request(), { ...options(s), now: BEFORE }).candidates[0].status, 'known-incompatible');
  const retracted = add(s, { mutations: [mutation(replacement.id, 'retract-observation', { id: 'mutation:retract' })] });
  assert.equal(one(retracted).candidates[0].status, 'unknown'); assert.equal(one(retracted).candidates[1].status, 'compatible');
});
test('correction cannot widen version, scope, dates or use revision forks', () => {
  const { v } = graph(), neg = observation(v, { verdict: 'incompatible' });
  const replacement = observation(v, { id: 'fixture:replacement', observedAt: NOW, scope: { outcome: 'normalize', environment: { ...ENV, platform: 'darwin' }, inputDigest: null } });
  assert.throws(() => snapshot([v], [neg, replacement], [mutation(neg.id, 'correct-observation', { replacementId: replacement.id })]), { code: 'TARGET_MISMATCH' });
  assert.throws(() => snapshot([v], [neg], [mutation(neg.id, 'retract-observation', { revision: 2 })]), { code: 'REVISION_CONFLICT' });
});
test('revoked dependency propagates transitively, leaves other dependency pins usable', () => {
  const d1 = version({ capabilityId: 'fixture:dep' }), d2 = version({ capabilityId: 'fixture:dep', version: '2' });
  const parent = version({ dependencies: [refOf(d1)] }), other = version({ version: '2', dependencies: [refOf(d2)] });
  const top = version({ capabilityId: 'fixture:top', dependencies: [refOf(parent)] });
  const observations = [parent, other, top].map((v, i) => observation(v, { id: `fixture:o${i}` }));
  const s = snapshot([d1, d2, parent, other, top], observations, [mutation(d1, 'revoke-version')]);
  const r = one(s), byKey = new Map(r.candidates.map(c => [versionKey(c.target), c]));
  assert.equal(byKey.get(versionKey(parent)).status, 'known-incompatible'); assert.equal(byKey.get(versionKey(top)).status, 'known-incompatible');
  assert.equal(byKey.get(versionKey(other)).status, 'compatible');
  const impact = dependencyImpact(s, refOf(d1)); assert.deepEqual(new Set(impact.impacted.map(versionKey)), new Set([parent, top].map(versionKey))); assert.equal(impact.unaffectedCount, 2);
});
test('missing dependency is unknown and mismatched dependency digest is rejected', () => {
  const d = version({ capabilityId: 'fixture:dep' }), v = version({ dependencies: [refOf(d)] });
  assert.equal(one(snapshot([v], [observation(v)])).status, 'unknown');
  const other = version({ capabilityId: d.capabilityId, outcomes: ['changed'] });
  assert.throws(() => snapshot([v, other]), { code: 'TARGET_MISMATCH' });
});
test('deprecation is exact version and terminal revocation cannot be silently restored', () => {
  const { v } = graph(), v2 = version({ version: '2' });
  const s = snapshot([v, v2], [observation(v), observation(v2, { id: 'fixture:v2' })], [mutation(v, 'deprecate-version')]);
  const result = one(s); assert.equal(result.candidates.find(c => c.target.version === v.version).status, 'known-incompatible'); assert.equal(result.selected.version, '2');
  assert.throws(() => snapshot([v], [], [mutation(v, 'revoke-version'), mutation(v, 'deprecate-version', { id: 'mutation:two', revision: 2, previousId: 'mutation:one' })]), /terminal/);
});
test('rights uncertainty does not become evidence-based permission', () => {
  for (const [rightsStatus, expected] of [['unknown', 'unknown'], ['denied', 'known-incompatible']]) {
    const v = version({ rights: { status: rightsStatus, license: null, ref: 'rights:test' } });
    assert.equal(one(snapshot([v], [observation(v)])).status, expected);
  }
});
test('deterministic multipage resolution deduplicates and selection is independent of page size/order', () => {
  const versions = Array.from({ length: 137 }, (_, i) => version({ version: `v${String(i).padStart(3, '0')}` }));
  const obs = versions.map((v, i) => observation(v, { id: `fixture:o${i}` }));
  const a = snapshot([...versions, versions[4]], [...obs, obs[4]]), b = snapshot([...versions].reverse(), [...obs].reverse());
  assert.equal(a.snapshotId, b.snapshotId); const full = one(a);
  for (const limit of [1, 7, 100]) {
    let cursor = null; const candidates = [];
    do { const page = resolvePage(b, request(), { ...options(b), cursor, limit });
      assert.equal(page.resolutionId, full.resolutionId); assert.deepEqual(page.selected, full.selected); candidates.push(...page.candidates); cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(candidates, full.candidates);
  }
});
test('cursor binds snapshot, query, clock and admission policy; malformed cursors fail', () => {
  const { v } = graph(), v2 = version({ version: '2' }); const s = snapshot([v, v2], [observation(v)]);
  const page = resolvePage(s, request(), { ...options(s), limit: 1 });
  for (const changes of [{ now: AFTER }, { policy: { policyRef: 'policy:empty', admittedObservationIds: [] } }])
    assert.throws(() => resolvePage(s, request(), { ...options(s), ...changes, cursor: page.nextCursor }), { code: 'STALE_CURSOR' });
  assert.throws(() => resolvePage(s, request({ input: { value: 'changed' } }), { ...options(s), cursor: page.nextCursor }), { code: 'STALE_CURSOR' });
  assert.throws(() => resolvePage(s, request(), { ...options(s), cursor: '../../hostile' }), { code: 'INVALID_CURSOR' });
  const changed = add(s, { observations: [observation(v2, { id: 'fixture:v2' })] });
  assert.throws(() => resolvePage(changed, request(), { ...options(changed), cursor: page.nextCursor }), { code: 'STALE_CURSOR' });
  for (const limit of [0, 101, NaN, 1.5, -1]) assert.throws(() => listVersions(s, { limit }));
});
test('list pages are bounded and empty pages never pretend catalog completeness', () => {
  const { s } = graph(); assert.equal(listVersions(s, { outcome: 'absent' }).total, 0);
  assert.equal(listVersions(s, { limit: 1 }).items.length, 1);
});
test('executable acceptance journey preserves fixture and stale-price distinctions', () => {
  const d = demo(); assert.equal(d.compatibleReuse.status, 'compatible'); assert.equal(d.genuineMiss.status, 'missing');
  assert.equal(d.unknownEnvironment.status, 'unknown');
  assert.equal(d.conflictingEvidence.candidates.find(c => c.target.version === 'synthetic-1').status, 'unknown');
  assert.equal(d.expiredEvidence.status, 'compatible'); assert.equal(d.correctedEvidence.status, 'compatible');
  assert.equal(d.revokedDependency.candidates.find(c => c.target.version === 'synthetic-1').status, 'known-incompatible');
  assert.equal(d.revokedDependency.selected.version, 'synthetic-2');
  assert.equal(d.adapters.s04.version.provenance.classification, 'demo'); assert.equal(d.adapters.s04.disclosure.advertised.price.stale, true);
});

test('shared dependency DAG keeps diagnostic expansion bounded and propagates invalidation', () => {
  const leaf = version({ capabilityId: 'fixture:leaf' }), versions = [leaf]; let previous = [leaf];
  for (let level = 0; level < 24; level++) {
    const next = ['a', 'b'].map(suffix => version({ capabilityId: `fixture:level-${level}-${suffix}`, dependencies: previous.map(refOf) }));
    versions.push(...next); previous = next;
  }
  const s = snapshot(versions, previous.map((v, i) => observation(v, { id: `fixture:top-${i}` })), [mutation(leaf, 'revoke-version')]);
  const r = one(s, request({ capabilityId: previous[0].capabilityId }));
  assert.equal(r.status, 'known-incompatible'); assert.ok(r.candidates[0].reasons.length <= 18);
  assert.ok(JSON.stringify(r).length < 30000);
});
test('incomplete catalog cannot export a genuine gap even when known candidates fail', () => {
  const v = version(), s = snapshot([v], [], [], { complete: false });
  assert.throws(() => createGap(s, request({ input: {} }), options(s), { gapId: 'gap:partial', reproducer: { ref: 'fixture:repro', permission: 'synthetic' }, funding: { kind: 'voluntary', ref: null } }), { code: 'NOT_A_GAP' });
});

test('new scoped dependency negative requires later composition replay without invalidating other pins', () => {
  const d1 = version({ capabilityId: 'fixture:dep' }), d2 = version({ capabilityId: 'fixture:dep', version: '2' });
  const p1 = version({ dependencies: [refOf(d1)] }), p2 = version({ version: '2', dependencies: [refOf(d2)] });
  const negative = observation(d1, { id: 'fixture:dep-negative', verdict: 'incompatible', observedAt: NOW, expiresAt: null,
    scope: { outcome: 'normalize', environment: ENV, inputDigest: hash({ value: 'scoped-dependency-input' }) } });
  const s = snapshot([d1, d2, p1, p2], [negative, observation(p1), observation(p2, { id: 'fixture:p2' })]);
  const result = one(s);
  assert.equal(result.candidates.find(c => c.target.contentId === p1.contentId).status, 'unknown');
  assert.equal(result.candidates.find(c => c.target.contentId === p2.contentId).status, 'compatible');
  const replay = observation(p1, { id: 'fixture:replayed-composition', observedAt: AFTER, expiresAt: null });
  const rechecked = add(s, { observations: [replay] });
  const after = resolve(rechecked, request(), { ...options(rechecked), now: AFTER });
  assert.equal(after.candidates.find(c => c.target.contentId === p1.contentId).status, 'compatible');
});
test('dependency expiry/retraction propagates unknown and never borrows unrelated environment evidence', () => {
  const dep = version({ capabilityId: 'fixture:dep' }), parent = version({ dependencies: [refOf(dep)] });
  const depObs = observation(dep, { id: 'fixture:dep', expiresAt: NOW });
  const s = snapshot([dep, parent], [depObs, observation(parent)]);
  assert.equal(one(s).candidates.find(c => c.target.capabilityId === parent.capabilityId).status, 'unknown');
  const retracted = snapshot([dep, parent], [observation(dep, { id: 'fixture:dep' }), observation(parent)], [mutation(depObs.id, 'retract-observation')]);
  assert.equal(one(retracted).candidates.find(c => c.target.capabilityId === parent.capabilityId).status, 'unknown');
  const otherEnv = snapshot([dep, parent], [observation(dep, { id: 'fixture:other-env', verdict: 'incompatible', observedAt: NOW,
    scope: { outcome: 'normalize', environment: { ...ENV, platform: 'darwin' }, inputDigest: null } }), observation(parent)]);
  assert.equal(one(otherEnv).candidates.find(c => c.target.capabilityId === parent.capabilityId).status, 'compatible');
});

test('verification target binds exact artifact contract and keeps test proposals inert', async () => {
  const { verificationTarget } = await import('../src/index.mjs');
  const { s, v } = graph(), target = verificationTarget(s, refOf(v));
  assert.equal(target.admissionRequired, true); assert.equal(target.proposedTestsExecutable, false);
  assert.deepEqual(target.dependencies, v.dependencies); assert.equal(target.snapshotId, s.snapshotId);
  assert.throws(() => verificationTarget(s, { ...refOf(v), contentId: `sha256:${'0'.repeat(64)}` }), { code: 'TARGET_MISMATCH' });
});

test('expiry of already corrected dependency evidence cannot stale a later composition replay', () => {
  const dep = version({ capabilityId: 'fixture:dep' }), parent = version({ dependencies: [refOf(dep)] });
  const old = observation(dep, { id: 'fixture:old-dep', expiresAt: AFTER });
  const corrected = observation(dep, { id: 'fixture:corrected-dep', observedAt: NOW, expiresAt: null });
  const parentReplay = observation(parent, { observedAt: '2026-09-26T12:00:01.000Z', expiresAt: null });
  const s = snapshot([dep, parent], [old, corrected, parentReplay], [mutation(old.id, 'correct-observation', { replacementId: corrected.id })]);
  const result = resolve(s, request({ capabilityId: parent.capabilityId }), { ...options(s), now: AFTER });
  assert.equal(result.status, 'compatible');
});
