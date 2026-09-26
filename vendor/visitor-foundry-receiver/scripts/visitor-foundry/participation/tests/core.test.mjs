import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ENVELOPE, assessVF01, negotiate, decline, conditionFromHttp, jsonBoundary, httpBoundary, toolBoundary, buildReproducer, semanticIdentity } from '../src/index.mjs';
import { bounded } from '../src/safe.mjs';
import { createSnapshot } from '../../capabilities/src/index.mjs';
import { preflightHost, deskHost, tasks, disclosure, negotiation, preflightTemplate, demonstrations } from '../examples/hosts.mjs';
const sentinel = 'PRIVATE_VF05_SENTINEL_9c3e';
const noLeak = value => assert.ok(!JSON.stringify(value).includes(sentinel));

test('real maintained assets: genuine miss, qualified hit, and different later consumer needs', () => {
  const a = preflightHost(), b = deskHost();
  const original = a.invoke(tasks.preflight.original);
  assert.equal(original.response.body.status, 'unknown'); assert.equal(original.participation.status, 'genuine-miss');
  assert.equal(original.assessment.gap.schema, 'neomorphic.foundry.gap.v1');
  assert.equal(a.invoke(tasks.preflight.later).participation.status, 'known-hit');
  assert.equal(a.invoke(tasks.preflight.later).response.body.status, tasks.preflight.later.expected);
  assert.equal(b.invoke(tasks.desk.original).output.result.claimable, false);
  assert.equal(b.invoke(tasks.desk.original).output.participation.status, 'genuine-miss');
  assert.equal(b.invoke(tasks.desk.later).output.result.claimable, true);
  const measured = demonstrations(); assert.equal(measured.artifacts.length, 2); assert.equal(measured.cost, null);
  assert.ok(measured.sharing.preflight.projectedBytes > measured.sharing.desk.projectedBytes);
});
test('ordinary cold discovery is usable with no grant, config, negotiation or contribution', () => {
  const r = spawnSync(process.execPath, [new URL('../cli.mjs', import.meta.url).pathname, 'discovery'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); const x = JSON.parse(r.stdout);
  assert.equal(x.discovery, '/api/lab/capabilities.json'); assert.equal(x.contributionRequired, false);
  assert.equal(x.mode, 'ordinary-discovery-only');
});
test('unknown or unsupported versions return original service objects without traversal', () => {
  const original = { get secret() { throw Error(sentinel); } };
  const host = { disclosure };
  assert.equal(jsonBoundary(original, {}, host), original);
  assert.equal(toolBoundary(original, { accepts: ['other.v99'] }, host), original);
  assert.equal(httpBoundary(original, {}, host).response, original);
});
test('negotiated adapters preserve exact original response/error reference, decline does too', () => {
  const original = new Error(sentinel, { cause: { deep: { credential: sentinel } } });
  const host = { disclosure, condition: 'temporary-outage' };
  const json = jsonBoundary(original, negotiation, host), tool = toolBoundary(original, negotiation, host);
  assert.equal(json.original, original); assert.equal(tool.result, original); assert.equal(decline(original).original, original);
  noLeak(json.participation); noLeak(tool.participation); noLeak(decline(original).participation);
});
for (const [http, expected] of [[401, 'auth-failure'], [403, 'auth-failure'], [429, 'quota-pressure'], [503, 'temporary-outage'], [404, 'unknown'], [200, 'unknown']]) {
  test(`HTTP ${http} has distinct supplied condition ${expected}, never inferred demand`, () => {
    const assessment = preflightHost().invoke(tasks.preflight.original).assessment;
    const e = negotiate(negotiation, { assessment, condition: conditionFromHttp(http), disclosure });
    assert.equal(e.status, expected); assert.deepEqual(e.modes, []);
  });
}
test('forged serialized resolver status cannot create an offer', () => {
  const e = negotiate(negotiation, { assessment: { status: 'genuine-miss' }, condition: 'resolved', disclosure });
  assert.equal(e.status, 'unknown'); assert.deepEqual(e.modes, []);
});
test('incomplete coverage never becomes a genuine gap even if known candidates fail', () => {
  const host = preflightHost();
  const snapshot = createSnapshot({ versions: host.snapshot.versions, observations: host.snapshot.observations, mutations: [], coverage: { ...host.snapshot.coverage, complete: false } });
  const assessment = host.assess({ range: '~22.1', nodeVersion: '22.22.2' }, 'task:incomplete', null, snapshot);
  assert.equal(assessment.status, 'incomplete-coverage'); assert.equal(assessment.gap, null);
  assert.deepEqual(negotiate(negotiation, { assessment, condition: 'resolved', disclosure }).modes, []);
});
test('unknown admission remains unknown, not a contribution trigger', () => {
  const host = preflightHost();
  const assessment = assessVF01({ snapshot: host.snapshot, permission: { provenance: 'synthetic', authorizationRef: 'fixture:unknown' }, request: { schema: 'neomorphic.foundry.capability-request.v1', taskId: 'task:unknown', outcome: 'node-engine-compatibility', input: { range: '>=22', nodeVersion: '22.22.2' }, output: null, capabilityId: null, environment: { nodeMajor: 22 } }, options: { now: host.options.now }, gap: { gapId: 'gap:unknown', reproducer: { ref: 'fixture:synthetic', permission: 'synthetic' }, funding: { kind: 'voluntary', ref: null } } });
  assert.equal(assessment.status, 'unknown');
});
test('rights, funding, actionability and unknown cost stay distinct; funded does not downgrade to voluntary', () => {
  const assessment = preflightHost().invoke(tasks.preflight.original).assessment;
  const e = negotiate(negotiation, { assessment, condition: 'resolved', disclosure });
  assert.equal(e.actionability, 'not-actionable'); assert.equal(e.cost, null); assert.equal(e.costKnown, false); assert.equal(e.modes.length, 4);
  for (const patch of [{ rights: { status: 'unknown', ref: null } }, { rights: { status: 'denied', ref: 'source:denied' } }, { funding: { kind: 'funded', ref: 'funding:external-authority' } }, { funding: { kind: 'unknown', ref: null } }]) {
    const p = negotiate(negotiation, { assessment, condition: 'resolved', disclosure: { ...disclosure, ...patch } }); assert.deepEqual(p.modes, []);
    for (const key of Object.keys(patch)) assert.deepEqual(p[key], patch[key]);
  }
  assert.throws(() => negotiate(negotiation, { disclosure: { ...disclosure, cost: { units: 0.1, currency: 'USD' } } }));
  assert.throws(() => negotiate(negotiation, { disclosure: { ...disclosure, termsVersion: 1 } }));
});
test('four optional time budgets and machine-selected subset are deterministic', () => {
  const context = { assessment: preflightHost().invoke(tasks.preflight.original).assessment, condition: 'resolved', disclosure };
  for (const [budgetSeconds, count] of [[0, 0], [15, 1], [60, 2], [300, 3], [900, 4]]) assert.equal(negotiate({ accepts: [ENVELOPE], budgetSeconds }, context).modes.length, count);
  assert.deepEqual(negotiate({ accepts: [ENVELOPE], budgetSeconds: 900, modes: ['counterexample'] }, context).modes, ['counterexample']);
});
test('metadata scope is chosen before inputs: cyclic, getter-bearing, secret-bearing input never touched', () => {
  const input = { private: sentinel }; input.loop = input;
  Object.defineProperty(input, 'range', { enumerable: true, get() { throw new Error(sentinel); } });
  const a = buildReproducer({ template: preflightTemplate, input });
  const b = buildReproducer({ template: preflightTemplate, input: null });
  assert.deepEqual(a, b); noLeak(a);
  const identity = p => semanticIdentity({ tenantId: 'tenant:a', identityKey: 'a'.repeat(32), proposal: p });
  assert.equal(identity(a), identity(b)); noLeak(identity(a));
});
test('allowlists drop unlisted nested values without getters; provenance is explicit', () => {
  const input = { range: '~22.1', nodeVersion: '22.22.2', private: { sentinel } };
  Object.defineProperty(input, 'ignored', { enumerable: true, get() { throw Error(sentinel); } });
  const make = provenance => buildReproducer({ template: preflightTemplate, input, sharing: { scope: 'reproducer', provenance, authorizationRef: 'permission:fixture' } });
  for (const p of ['synthetic', 'authorized']) { const r = make(p); assert.equal(r.provenance, p); assert.deepEqual(Object.keys(r.fields), ['range', 'nodeVersion']); noLeak(r); }
  assert.throws(() => make('inferred'));
  assert.throws(() => buildReproducer({ template: preflightTemplate, input, sharing: { scope: 'reproducer' } }));
});
test('nested declarative object and bounded array reproducer', () => {
  const template = { id: 'template:nested', fields: { rows: { type: 'array', maxItems: 2, items: { type: 'object', fields: { ok: { type: 'boolean', maxLength: 1 } } } } } };
  const sharing = { scope: 'reproducer', provenance: 'synthetic', authorizationRef: 'fixture:nested' };
  const r = buildReproducer({ template, sharing, input: { rows: [{ ok: false, secret: sentinel }] } });
  assert.deepEqual(r.fields, { rows: [{ ok: false }] }); noLeak(r);
  assert.throws(() => buildReproducer({ template, sharing, input: { rows: Array(3).fill({ ok: true }) } }));
});
test('semantic equality is stable across object key order, distinct across tenant/key/proposal', () => {
  const key = 'k'.repeat(32), p = { a: 1, b: { c: 2 } };
  const identity = (tenantId, proposal = p, identityKey = key) => semanticIdentity({ tenantId, identityKey, proposal });
  assert.equal(identity('tenant:a'), identity('tenant:a', { b: { c: 2 }, a: 1 }));
  assert.notEqual(identity('tenant:a'), identity('tenant:b')); assert.notEqual(identity('tenant:a'), identity('tenant:a', { a: 2 }));
  assert.notEqual(identity('tenant:a'), identity('tenant:a', p, 'b'.repeat(32)));
});
for (const hostile of [JSON.parse('{"__proto__":{"private":"hidden"}}'), { toJSON() { throw Error(sentinel); } }, new Error(sentinel), new Date(), Object.create({ secret: sentinel }), { a: 'x'.repeat(33000) }, Array(3000).fill(1)]) {
  test('hostile supplied context is rejected by static bounded diagnostics', () => { assert.throws(() => bounded(hostile), error => { noLeak({ code: error.code, message: error.message }); return true; }); });
}
test('getters, cyclic/deep/sparse payloads do not stringify secret-bearing exceptions', () => {
  const getter = {}; Object.defineProperty(getter, 'x', { get() { throw Error(sentinel); }, enumerable: true });
  const cyclic = {}; cyclic.x = cyclic;
  let deep = {}; for (let i = 0; i < 40; i++) deep = { x: deep };
  for (const x of [getter, cyclic, deep, Array(3)]) assert.throws(() => bounded(x), error => { noLeak(error); noLeak(error.message); return true; });
});
test('optional negotiation failures do not break original service access', () => {
  const original = { status: 404, body: 'ordinary missing resource' };
  assert.equal(jsonBoundary(original, {}, {}), original);
  assert.equal(jsonBoundary(original, { accepts: [ENVELOPE] }, { disclosure: null }), original);
  assert.equal(toolBoundary(original, { accepts: ['x'.repeat(9000)] }, { disclosure }), original);
  assert.equal(httpBoundary(original, { accepts: [ENVELOPE] }, { disclosure: null }).response, original);
});
test('resolver requires an explicit typed permission assertion and matching reproducer provenance', () => {
  const host = preflightHost();
  assert.throws(() => assessVF01({ snapshot: host.snapshot }), /permission_required/);
  assert.throws(() => assessVF01({ permission: { provenance: 'synthetic', authorizationRef: 'fixture:test' }, gap: { reproducer: { permission: 'authorized' } } }), /permission_mismatch/);
});
test('HTTP body stays unconsumed and CLI stdout/stderr/exit code stay untouched', async () => {
  const { cliBoundary } = await import('../src/index.mjs');
  const response = new Response('original stream', { status: 404, headers: { 'x-original': 'kept' } });
  const wrapped = httpBoundary(response, negotiation, { disclosure, condition: 'unknown' });
  assert.equal(wrapped.response, response); assert.equal(response.bodyUsed, false); assert.equal(await response.text(), 'original stream');
  const original = { stdout: Buffer.from('original bytes'), stderr: Buffer.from('original error'), exitCode: 7 };
  const cli = cliBoundary(original, negotiation, { disclosure, condition: 'unknown' });
  assert.equal(cli.original, original); assert.equal(cli.original.exitCode, 7); assert.equal(cli.original.stdout, original.stdout);
});

test('decline preserves disclosure and exact terms in the same complete v1 envelope', () => {
  const e = preflightHost().invoke(tasks.preflight.original).participation;
  const declined = decline('original result', e);
  assert.equal(declined.original, 'original result'); assert.equal(declined.participation.status, 'declined');
  for (const k of ['actionability', 'rights', 'funding', 'cost', 'termsVersion']) assert.deepEqual(declined.participation[k], e[k]);
  assert.deepEqual(declined.participation.modes, []);
});
