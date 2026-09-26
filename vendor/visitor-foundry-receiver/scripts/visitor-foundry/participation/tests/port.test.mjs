import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticipationSession, continuationHint, vf04Port } from '../src/index.mjs';
import { vf02Port } from '../src/vf02-port.mjs';
import { ParticipationError, schema } from '../src/safe.mjs';
const hash = `sha256:${'a'.repeat(64)}`;
const ref = { uri: 'https://artifacts.invalid/pinned/source', digest: hash };
const binding = { origin: 'https://host.invalid', tenantId: 'project_a', grantFingerprint: hash };
const key = 'per-tenant-host-identity-key-value-32';
const body = { proposalRef: ref, resolverRef: ref, reproducerRef: ref, fundingKind: 'voluntary' };
function fixture() {
  const calls = [];
  const host = {};
  for (const op of ['create', 'claim', 'checkpoint', 'submit']) host[op] = async x => {
    calls.push({ op, x }); return { schema: schema('participation-receipt'), requestId: x.requestId, operation: op, termsVersion: x.termsVersion, cellId: x.cellId ?? 'cell:test', revision: (x.body.expectedRevision ?? 0) + 1, replayed: false };
  };
  host.read = async x => { calls.push({ op: 'read', x }); return { cellId: x.cellId, revision: 1 }; };
  const port = vf04Port(host);
  const session = new ParticipationSession({ identityKey: key, binding, port, currentTerms: async () => hash });
  const prepare = (patch = {}) => session.prepare({ mode: 'report-gap', operation: 'create', termsVersion: hash, body, consent: true, ...patch });
  return { calls, host, port, session, prepare };
}
test('VF04 narrow contract runs create/claim/checkpoint/submit with unchanged exact references', async () => {
  const { calls, session, prepare } = fixture();
  const commands = [prepare(), prepare({ mode: 'maintain-cell', operation: 'claim', cellId: 'cell:test', body: { expectedRevision: 1, ttlSeconds: 60, voluntaryOptIn: true } }),
    prepare({ mode: 'counterexample', operation: 'checkpoint', cellId: 'cell:test', body: { expectedRevision: 2, fence: 1, checkpointRef: ref } }),
    prepare({ mode: 'adapt-artifact', operation: 'submit', cellId: 'cell:test', body: { expectedRevision: 3, fence: 1, contributionRef: ref } })];
  for (const command of commands) { assert.equal((await session.execute(command)).status, 'committed'); assert.deepEqual(calls.at(-1).x.body, command.body); }
  assert.deepEqual(calls.map(c => c.op), ['create', 'claim', 'checkpoint', 'submit']);
});
test('no auto submit: prepare/decline do not send, consent is required, funded command is rejected', () => {
  const f = fixture(); f.prepare(); assert.equal(f.calls.length, 0);
  assert.throws(() => f.prepare({ consent: false }), /explicit_consent_required/);
  assert.throws(() => f.prepare({ body: { ...body, fundingKind: 'funded' } }));
  assert.throws(() => f.prepare({ operation: 'submit', cellId: 'cell:a', body: {} }), /mode_mismatch/);
});
test('lost acknowledgement remains unknown, same exact request is replayed after a fresh session', async () => {
  const f = fixture(); const original = f.host.create; let lost = true;
  f.host.create = async x => { const receipt = await original(x); if (lost) { lost = false; throw Error('PRIVATE_SENTINEL nested auth cause'); } return { ...receipt, replayed: true }; };
  const intent = f.prepare();
  const unknown = await f.session.execute(intent); assert.equal(unknown.status, 'unknown-outcome');
  const cold = new ParticipationSession({ identityKey: key, binding, port: f.port, currentTerms: async () => hash });
  const result = await cold.reconcile(JSON.parse(JSON.stringify(intent)));
  assert.equal(result.status, 'committed'); assert.equal(result.receipt.replayed, true);
  assert.deepEqual(f.calls[0].x, f.calls[1].x); assert.ok(!JSON.stringify(unknown).includes('PRIVATE_SENTINEL'));
});
test('changed tenant, origin, grant, key or command cannot replay a sealed intent; zero HTTP', async () => {
  const f = fixture(), intent = f.prepare();
  for (const changed of [{ ...binding, tenantId: 'project_b' }, { ...binding, origin: 'https://evil.invalid' }, { ...binding, grantFingerprint: `sha256:${'b'.repeat(64)}` }]) {
    const other = new ParticipationSession({ identityKey: key, binding: changed, port: f.port, currentTerms: async () => hash });
    await assert.rejects(other.reconcile(intent), /intent_binding_mismatch/);
  }
  const other = new ParticipationSession({ identityKey: 'different-key-'.repeat(4), binding, port: f.port, currentTerms: async () => hash });
  await assert.rejects(other.execute(intent), /intent_binding_mismatch/);
  await assert.rejects(f.session.execute({ ...intent, body: { ...body, fundingKind: 'unfunded-request' } }), /intent_binding_mismatch/);
  assert.equal(f.calls.length, 0);
});
test('stale terms are separate from stale revision/grant/fence and never dispatch', async () => {
  const f = fixture(), intent = f.prepare();
  const changed = new ParticipationSession({ identityKey: key, binding, port: f.port, currentTerms: async () => `sha256:${'b'.repeat(64)}` });
  assert.equal((await changed.execute(intent)).status, 'stale-terms'); assert.equal(f.calls.length, 0);
  for (const code of ['stale-revision', 'stale-grant', 'stale-fence', 'auth-failure', 'quota-pressure']) {
    f.host.create = async () => { throw new ParticipationError(code); }; assert.equal((await f.session.execute(intent)).status, code);
  }
});
test('public hint resumes by authenticated read only and cannot smuggle a command', async () => {
  const f = fixture(); assert.equal((await f.session.resume(continuationHint('cell:private'))).status, 'read');
  assert.deepEqual(f.calls.map(x => x.op), ['read']);
  await assert.rejects(f.session.resume({ ...continuationHint('cell:private'), command: 'submit' }));
  await assert.rejects(f.session.execute(continuationHint('cell:private')));
  assert.equal(f.calls.length, 1);
});
test('server URLs and test proposals are data, no automatic followup execution', async () => {
  const f = fixture(), intent = f.prepare(); const original = f.host.create;
  f.host.create = async x => ({ ...await original(x), nextUrl: 'https://evil.invalid/?secret=value', testProposal: '$(touch /tmp/never-run)' });
  assert.equal((await f.session.execute(intent)).status, 'committed'); assert.equal(f.calls.length, 1);
});
test('VF04 wrong request/terms/operation/target or empty success is unknown outcome', async () => {
  for (const patch of [{ requestId: 'wrong' }, { termsVersion: `sha256:${'b'.repeat(64)}` }, { operation: 'submit' }, { revision: 0 }, { replayed: 'yes' }]) {
    const f = fixture(), original = f.host.create; f.host.create = async x => ({ ...await original(x), ...patch });
    assert.equal((await f.session.execute(f.prepare())).status, 'unknown-outcome');
  }
  const f = fixture(); f.host.create = async () => null;
  assert.equal((await f.session.execute(f.prepare())).status, 'unknown-outcome');
});
const command = { schema: 'neomorphic.foundry.work-cell-command.v1', action: 'create', expectedRevision: 0, gap: { schema: 'neomorphic.foundry.work-cell-gap.v1', id: 'gap:test', contentId: hash, resolverSnapshot: ref, reproducer: ref, permission: 'synthetic', fundingKind: 'voluntary' }, workScope: 'scope:one' };
test('VF02 transport permits only bound origin, correct schema and fixed routes', async () => {
  assert.throws(() => vf02Port({ baseUrl: 'http://example.com', projectId: 'a', token: 'token' }));
  assert.throws(() => vf02Port({ baseUrl: 'https://example.com?private=value', projectId: 'a', token: 'token' }));
  let seen;
  const port = vf02Port({ baseUrl: 'http://127.0.0.1:9999', projectId: 'a', token: 'private-token', fetch: async (url, options) => { seen = { url, options }; return new Response('{}', { status: 401 }); } });
  await assert.rejects(port.create({ requestId: `vf05_${'a'.repeat(64)}`, body: command }), /auth-failure/);
  assert.equal(seen.options.redirect, 'manual'); assert.equal(seen.url, 'http://127.0.0.1:9999/v1/projects/a/work-cells');
  assert.ok(!seen.url.includes('private-token')); assert.throws(() => port.validate('create', { ...command, payment: true }));
});
for (const kind of ['empty', 'redirect', 'hostile', 'oversized', 'wrong-cell', 'timeout']) {
  test(`VF02 ${kind} response stays bounded and unknown after mutation`, async () => {
    const fetch = async () => {
      if (kind === 'timeout') return new Promise(() => {});
      if (kind === 'empty') return new Response('', { status: 201 });
      if (kind === 'redirect') return new Response('{}', { status: 307, headers: { location: 'https://evil.invalid' } });
      if (kind === 'hostile') return new Response('{"__proto__":{"x":1}}', { status: 201 });
      if (kind === 'oversized') return new Response('x'.repeat(150000), { status: 201 });
      return new Response(JSON.stringify({ receipt: { schema: 'neomorphic.foundry.work-cell-receipt.v1', cell: { projectId: 'foreign' } } }), { status: 201 });
    };
    const port = vf02Port({ baseUrl: 'https://host.invalid', projectId: 'a', token: 'token', fetch, timeoutMs: 25 });
    await assert.rejects(port.create({ requestId: `vf05_${'a'.repeat(64)}`, body: command }), /unknown-outcome/);
  });
}
