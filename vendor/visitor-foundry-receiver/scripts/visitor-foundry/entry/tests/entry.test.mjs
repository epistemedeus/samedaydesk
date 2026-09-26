import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { boot, db, cli, counts, http, register, attempt, refused, random, settings, url } from './helpers.mjs';
import { BASE, SCHEMA } from '../src/contract.mjs';
import { PostgresStore } from '../../../../services/correspondence/dist/store/postgres.js';
import { EntryStore } from '../src/store.mjs';
const evidence = new URL('../evidence/acceptance.json', import.meta.url);
const receipt = { kind: 'owner_qa', externalAdoption: false, identityIndependence: 'unknown', tests: [], capacity: [] };
const record = name => { receipt.tests.push(name); writeFileSync(evidence, JSON.stringify(receipt, null, 2) + '\n'); };

async function fixture(t, name, options) {
  const schema = `vf10_${name}`;
  let host = await boot(schema, options); const database = await db(schema);
  t.after(async () => { await host.stop(); await database.close(); });
  return { get host() { return host; }, database, schema,
    async restart(opts = {}) { const port = Number(new URL(host.baseUrl).port); await host.stop(); host = await boot(schema, { ...options, ...opts, port }); return host; } };
}

test('cold CLI persists proof before HTTP, uses actual correspondence, restarts and resumes without transcript', async t => {
  const f = await fixture(t, 'cold'); const base = f.host.baseUrl;
  const descriptor = await cli(['describe', base]);
  assert.equal(descriptor.status, 200); assert.equal(descriptor.body.profile.identityProofRequired, false);
  assert.deepEqual(descriptor.body.profile.excludedAuthority, ['owner', 'execution', 'funding', 'verification', 'shared_source', 'publication']);
  assert.equal((await http(base, BASE)).cache, 'no-store');
  const dir = join(process.env.VF10_TEST_SCRATCH, 'cold-client');
  await cli(['prepare', base, dir, descriptor.body.profile.profileId, descriptor.body.profile.termsHash]);
  assert.equal((await counts(f.database)).charged, 0);
  const proof = readFileSync(join(dir, 'registration.secret'), 'utf8').trim();
  const result = await cli(['register', dir]); assert.equal(result.status, 200);
  assert.equal(result.body.receiver.state, 'disabled'); assert.equal(result.body.status, 'ready');
  const textFile = join(process.env.VF10_TEST_SCRATCH, 'synthetic.txt');
  writeFileSync(textFile, 'Synthetic private checkpoint: resume the original compatibility task.');
  const event = await cli(['checkpoint', dir, textFile]); assert.equal(event.sequence, 1);
  const repeated = await cli(['checkpoint', dir, textFile]); assert.equal(repeated.replayed, true);
  await f.restart();
  const resumed = await cli(['resume', dir]); assert.equal(resumed.eventCount, 1); assert.equal(resumed.eventIds[0], event.eventId);
  const recovered = await cli(['reconcile', dir]); assert.equal(recovered.body.projectId, result.body.projectId);
  const publicFiles = ['attempt.json', 'continuation.json', 'event-intent.json'];
  const publicState = publicFiles.map(n => readFileSync(join(dir, n), 'utf8')).join('');
  assert.ok(!publicState.includes(proof) && !/neo_(wtr|rdr|own)_/.test(publicState));
  for (const name of readdirSync(dir)) assert.equal(statSync(join(dir, name)).mode & 0o077, 0);
  const rows = JSON.stringify((await f.database.query(`SELECT row_to_json(r) r FROM correspondence_vf10_registrations r`)).rows);
  assert.ok(!rows.includes(proof) && !/neo_(wtr|rdr|own)_/.test(rows));
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  receipt.coldJourney = { coldEntryCalls: 2, entryOverheadBeyondExistingOperation: 2,
    returningReadCalls: 1, explicitRecoveryCalls: 1,
    secretFreePersistedBytes: Buffer.byteLength(publicState), privateSecretFileBytes: statSync(join(dir, 'registration.secret')).size,
    secretFreeFiles: publicFiles, serverRestarted: true, independentCliProcesses: 8, prefix: '/api/correspondence' };
  record('cold_prepare_register_real_event_restart_resume');
});

test('proof, exact request/profile/terms binding; anonymous browse/decline; public authority cannot be chosen', async t => {
  const f = await fixture(t, 'binding'), base = f.host.baseUrl;
  const descriptor = (await http(base, BASE)).body, a = attempt(descriptor);
  const first = await register(base, a); assert.equal(first.status, 200);
  refused(await http(base, `${BASE}/reconcile`, { body: a.body }), 401, 'registration_proof_required');
  refused(await register(base, { ...a, proof: random() }), 401, 'registration_proof_mismatch');
  refused(await register(base, { ...a, body: { ...a.body, requestId: random() } }), 409, 'attempt_binding_mismatch');
  refused(await register(base, { ...a, body: { ...a.body, profileId: 'vf10:foreign' } }), 409, 'attempt_binding_mismatch');
  refused(await register(base, { ...a, body: { ...a.body, termsHash: `sha256:${'0'.repeat(64)}` } }), 409, 'attempt_binding_mismatch');
  const fresh = attempt(descriptor);
  refused(await register(base, { ...fresh, body: { ...fresh.body, profileId: 'vf10:foreign' } }), 409, 'profile_terms_mismatch');
  refused(await register(base, { ...fresh, body: { ...fresh.body, termsHash: `sha256:${'0'.repeat(64)}` } }), 409, 'profile_terms_mismatch');
  for (const [key, value] of Object.entries({ role: 'owner', projectId: first.body.projectId, evaluator: 'self', funding: 1, maxEnrollments: 999, alias: 'person2' }))
    refused(await register(base, { ...fresh, body: { ...fresh.body, [key]: value } }), 400, 'invalid_input');
  assert.equal((await http(base, '/v1/projects', { body: { title: 'bad', summary: 'anonymous' } })).status, 401);
  assert.equal((await http(base, `${BASE}/decline`, { body: {} })).body.nextAction, 'continue_original');
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  record('proof_request_terms_profile_authority_decline');
});

test('same-attempt concurrency produces one charged scope and exact tokens', async t => {
  const f = await fixture(t, 'same'); const a = attempt((await http(f.host.baseUrl, BASE)).body);
  const responses = await Promise.all(Array.from({ length: 32 }, () => register(f.host.baseUrl, a)));
  for (const r of responses) assert.equal(r.status, 200);
  assert.equal(new Set(responses.map(r => JSON.stringify(r.body))).size, 1);
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  record('32_concurrent_identical_attempts');
});

for (const fault of ['createProject', 'createGrant', 'reply']) test(`lost ${fault} commit acknowledgment reconciles after process death`, async t => {
  const f = await fixture(t, fault.toLowerCase(), { fault });
  const a = attempt((await http(f.host.baseUrl, BASE)).body);
  await assert.rejects(register(f.host.baseUrl, a)); await f.host.exited;
  const partial = await counts(f.database); assert.equal(partial.charged, 1); assert.equal(partial.projects, 1);
  // Project recovery deliberately outlives base service's 24-hour bootstrap window.
  await f.database.query("UPDATE correspondence_idempotency SET created_at=clock_timestamp()-interval '2 days' WHERE scope='project_create'");
  await f.restart({ fault: '' });
  const r = await register(f.host.baseUrl, a, 'reconcile'); assert.equal(r.status, 200);
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  assert.equal((await register(f.host.baseUrl, a)).body.projectId, r.body.projectId);
  record(`restart_recovery_after_${fault}`);
});

test('real reader/writer roles, private messages, foreign project denial and bounded event rows', async t => {
  const f = await fixture(t, 'isolation'), base = f.host.baseUrl;
  const d = (await http(base, BASE)).body;
  const a = (await register(base, attempt(d))).body, b = (await register(base, attempt(d))).body;
  const pa = `/v1/projects/${a.projectId}`, pb = `/v1/projects/${b.projectId}`;
  assert.equal((await http(base, `${pa}/events`, { body: { kind: 'request', text: 'private synthetic reproducer A' }, token: a.grants.reader.token })).status, 403);
  assert.equal((await http(base, `${pa}/events`, { body: { kind: 'resolved', expectedVersion: 1 }, token: a.grants.writer.token })).status, 403);
  assert.equal((await http(base, `${pa}/grants`, { body: { role: 'writer' }, token: a.grants.writer.token })).status, 403);
  for (const path of [pb, `${pb}/events`]) assert.equal((await http(base, path, { token: a.grants.writer.token })).status, 404);
  assert.equal((await http(base, `${pb}/events`, { body: { kind: 'request', text: 'bad' }, token: a.grants.writer.token })).status, 404);
  const key = random(); const event = { kind: 'request', text: 'private synthetic reproducer A' };
  assert.equal((await http(base, `${pa}/events`, { body: event, key, token: a.grants.writer.token })).status, 201);
  assert.equal((await http(base, `${pb}/events`, { token: b.grants.reader.token })).body.events.length, 0);
  assert.equal((await http(base, `${pa}/events`, { token: a.grants.reader.token })).body.events[0].text, event.text);
  const results = await Promise.all(Array.from({ length: 32 }, () => http(base, `${pa}/events`, { body: event, token: a.grants.writer.token })));
  assert.equal(results.filter(r => r.status === 201).length, 2);
  assert.ok(results.every(r => [201, 409].includes(r.status)));
  assert.equal((await http(base, `${pa}/events`, { body: event, key, token: a.grants.writer.token })).status, 200);
  const count = (await f.database.query('SELECT count(*)::int n FROM correspondence_events WHERE project_id=$1', [a.projectId])).rows[0].n;
  assert.equal(count, settings.maxEvents);
  const idem = (await f.database.query("SELECT count(*)::int n FROM correspondence_idempotency WHERE project_id=$1 AND scope='event_create'", [a.projectId])).rows[0].n;
  assert.equal(idem, settings.maxEvents);
  assert.equal((await f.database.query('SELECT count(*)::int n FROM correspondence_vf10_event_reservations WHERE project_id=$1', [a.projectId])).rows[0].n, settings.maxEvents);
  for (const extension of ['work-cells', 'foundry/invoke']) refused(await http(base, `${pa}/${extension}`, { body: {}, token: a.grants.writer.token }), 403, 'entry_scope_excludes_receiver');
  record('actual_store_roles_private_projects_and_event_budget');
});

test('finite expiry, authorized renewal in same rows, revocation and workspace deadline', async t => {
  const f = await fixture(t, 'renew'), base = f.host.baseUrl;
  const a = attempt((await http(base, BASE)).body), r = (await register(base, a)).body;
  await f.database.query("UPDATE correspondence_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND role!='owner'", [r.projectId]);
  assert.equal((await http(base, `/v1/projects/${r.projectId}`, { token: r.grants.writer.token })).status, 401);
  refused(await register(base, a, 'reconcile'), 401, 'grant_expired');
  const renewed = await register(base, a, 'renew'); assert.equal(renewed.status, 200); assert.equal(renewed.body.grants.writer.token, r.grants.writer.token);
  assert.equal((await http(base, `/v1/projects/${r.projectId}`, { token: r.grants.writer.token })).status, 200);
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  const actual = new PostgresStore(url, { schema: f.schema, poolMax: 1 }); t.after(() => actual.close());
  const grantId = (await f.database.query("SELECT id FROM correspondence_grants WHERE project_id=$1 AND role='writer'", [r.projectId])).rows[0].id;
  await actual.revokeGrant(r.projectId, grantId);
  assert.equal((await http(base, `/v1/projects/${r.projectId}`, { token: r.grants.writer.token })).status, 401);
  refused(await register(base, a, 'renew'), 403, 'registration_revoked');
  const b = attempt((await http(base, BASE)).body); const rb = await register(base, b);
  await f.database.query("UPDATE correspondence_vf10_registrations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [rb.body.registrationId]);
  refused(await register(base, b, 'renew'), 410, 'workspace_expired');
  record('expiry_same_scope_renewal_revocation_deadline');
});

test('unknown receiving commit is not retried, readback reconciles without granting runtime authority', async t => {
  const f = await fixture(t, 'receiver', { receiver: true, fault: 'receiver' });
  const a = attempt((await http(f.host.baseUrl, BASE)).body);
  await assert.rejects(register(f.host.baseUrl, a)); await f.host.exited;
  await f.restart({ fault: '' });
  const pending = await register(f.host.baseUrl, a, 'reconcile'); assert.equal(pending.status, 202); assert.equal(pending.body.receiver.state, 'pending');
  assert.deepEqual((await f.database.query('SELECT receiver_started,receiver_state FROM correspondence_vf10_registrations')).rows[0], { receiver_started: true, receiver_state: 'pending' });
  assert.equal((await f.database.query('SELECT calls FROM vf10_fixture_receiving')).rows[0].calls, 1);
  await f.database.query("UPDATE vf10_fixture_receiving SET state='unknown'");
  const unknown = await register(f.host.baseUrl, a, 'reconcile'); assert.equal(unknown.status, 202); assert.equal(unknown.body.receiver.state, 'unknown');
  await f.database.query("UPDATE vf10_fixture_receiving SET state='ready'");
  const ready = await register(f.host.baseUrl, a, 'reconcile'); assert.equal(ready.status, 200); assert.equal(ready.body.receiver.state, 'ready');
  assert.equal((await f.database.query('SELECT calls FROM vf10_fixture_receiving')).rows[0].calls, 1);
  refused(await http(f.host.baseUrl, `/v1/projects/${ready.body.projectId}/foundry/invoke`, { token: ready.body.grants.writer.token, body: {} }), 403, 'entry_scope_excludes_receiver');
  assert.deepEqual(await counts(f.database), { registrations: 1, projects: 1, grants: 3, charged: 1 });
  record('durable_internal_receiver_fixture_pending_unknown_readback_no_repeat');
});

test('finite installed budget cannot reset on aliases/new secrets/new keys or configuration change', async t => {
  const f = await fixture(t, 'budget', { profile: { ...settings, maxEnrollments: 2 } }), base = f.host.baseUrl;
  const d = (await http(base, BASE)).body, a = attempt(d), b = attempt(d);
  assert.equal((await register(base, a)).status, 200); assert.equal((await register(base, b)).status, 200);
  refused(await register(base, attempt(d)), 409, 'enrollment_exhausted');
  refused(await register(base, { ...a, body: { ...a.body, requestId: random() } }), 409, 'attempt_binding_mismatch');
  assert.equal((await register(base, a, 'renew')).status, 200);
  await f.restart(); refused(await register(base, attempt(d)), 409, 'enrollment_exhausted');
  const desc = (await http(base, BASE)).body; assert.equal(desc.availability, 'exhausted'); assert.equal(desc.nextAction, 'continue_original');
  const actual = new PostgresStore(url, { schema: f.schema, poolMax: 1 });
  const entry = new EntryStore({ databaseUrl: url, schema: f.schema, correspondence: actual, poolMax: 1 });
  try {
    await assert.rejects(entry.install({ ...settings, id: 'vf10:rotated-alias', maxEnrollments: 3 }), e => e.code === 'immutable_installation');
    await entry.migrate(); await entry.install({ ...settings, maxEnrollments: 2 });
  } finally { await entry.close(); await actual.close(); }
  assert.deepEqual(await counts(f.database), { registrations: 2, projects: 2, grants: 6, charged: 2 });
  record('global_exhaustion_aliases_secret_rotation_immutable_installation');
});

for (const offered of [1, 8, 32, 128]) test(`bounded owner-QA load: ${offered} independent offered HTTP clients`, async t => {
  const budget = Math.min(offered, 32);
  const f = await fixture(t, `load_${offered}`, { profile: { ...settings, maxEnrollments: budget } });
  const descriptor = (await http(f.host.baseUrl, BASE)).body;
  const attempts = Array.from({ length: offered }, () => attempt(descriptor));
  const start = performance.now(); const results = await Promise.all(attempts.map(a => register(f.host.baseUrl, a)));
  const elapsed = performance.now() - start;
  let reconciliationCalls = 0;
  for (let i = 0; i < results.length; i++) {
    assert.ok([200, 409, 503].includes(results[i].status));
    if (results[i].status === 503) { reconciliationCalls++; const r = await register(f.host.baseUrl, attempts[i], 'reconcile'); assert.ok([200, 409].includes(r.status)); }
  }
  const actual = await counts(f.database); assert.equal(actual.charged, budget); assert.equal(actual.projects, budget); assert.equal(actual.grants, budget * 3);
  const metrics = await f.host.metrics(); assert.ok(metrics.peakActive <= 2 && metrics.peakPending <= 128);
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  receipt.capacity.push({ offeredClients: offered, offeredHttpConcurrency: offered, finiteEnrollmentBudget: budget,
    elapsedMs: Math.round(elapsed), p95Ms: Math.round(times[Math.ceil(times.length * .95) - 1]),
    statuses: Object.fromEntries([200, 409, 503].map(s => [s, results.filter(r => r.status === s).length])),
    reconciliationCalls, jsonRequestBytes: results.reduce((s, r) => s + r.requestBytes, 0),
    jsonResponseBytes: results.reduce((s, r) => s + r.responseBytes, 0), actualRows: actual,
    ...metrics, correspondencePoolMax: 1, entryPoolMax: 2 });
  record(`capacity_${offered}`);
});

test('event capacity remains charged across both sides of an unknown correspondence commit', async t => {
  const f = await fixture(t, 'event_unknown', { profile: { ...settings, maxEvents: 1 } });
  const a = attempt((await http(f.host.baseUrl, BASE)).body), r = (await register(f.host.baseUrl, a)).body;
  const actual = new PostgresStore(url, { schema: f.schema, poolMax: 1 });
  const entry = new EntryStore({ databaseUrl: url, schema: f.schema, correspondence: actual, poolMax: 1 });
  t.after(async () => { await entry.close(); await actual.close(); });
  const original = actual.createEvent.bind(actual);
  const input = { projectId: r.projectId, kind: 'request', text: 'synthetic uncertain mutation', idempotencyKey: random(), requestHash: random() };
  actual.createEvent = async () => { throw new Error('fixture interruption before base mutation'); };
  await assert.rejects(entry.boundedCorrespondence().createEvent(input));
  assert.equal((await f.database.query('SELECT count(*)::int n FROM correspondence_events')).rows[0].n, 0);
  await assert.rejects(entry.boundedCorrespondence().createEvent({ ...input, idempotencyKey: random() }), e => e.code === 'visitor_workspace_limit');
  actual.createEvent = async x => { await original(x); throw new Error('fixture lost base commit reply'); };
  await assert.rejects(entry.boundedCorrespondence().createEvent(input));
  assert.equal((await f.database.query('SELECT count(*)::int n FROM correspondence_events')).rows[0].n, 1);
  actual.createEvent = original;
  assert.equal((await entry.boundedCorrespondence().createEvent(input)).replayed, true);
  assert.equal((await f.database.query('SELECT count(*)::int n FROM correspondence_vf10_event_reservations')).rows[0].n, 1);
  record('event_reservation_before_unknown_mutation_and_exact_recovery');
});

test('malformed/oversized public requests return typed refusal without echo', async t => {
  const f = await fixture(t, 'bad_json');
  for (const [body, status] of [['{broken', 400], [JSON.stringify({ text: 'x'.repeat(40000) }), 413]]) {
    const r = await fetch(`${f.host.baseUrl}${BASE}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(r.status, status); const x = await r.json(); assert.ok(x.error.nextAction); assert.ok(!JSON.stringify(x).includes('broken'));
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await counts(f.database)).charged, 0); record('typed_parser_and_body_limit_refusals');
});

test('unresponsive receiver returns bounded partial state; future readback never repeats begin', async t => {
  const f = await fixture(t, 'receiver_hang', { receiver: true, fault: 'receiver_hang' });
  const a = attempt((await http(f.host.baseUrl, BASE)).body);
  const r = await register(f.host.baseUrl, a); assert.equal(r.status, 202); assert.ok(r.ms < 4000);
  assert.equal(r.body.receiver.state, 'pending');
  await f.restart({ fault: '' });
  assert.equal((await register(f.host.baseUrl, a, 'reconcile')).status, 202);
  assert.equal((await f.database.query('SELECT calls FROM vf10_fixture_receiving')).rows[0].calls, 1);
  record('receiver_timeout_bounds_wait_without_repeating_unknown_mutation');
});

test('two independent server processes share one enrollment budget and recovery binding', async t => {
  const f = await fixture(t, 'two_servers', { profile: { ...settings, maxEnrollments: 8 } });
  const second = await boot(f.schema, { profile: { ...settings, maxEnrollments: 8 } }); t.after(() => second.stop());
  const d = (await http(f.host.baseUrl, BASE)).body, a = attempt(d);
  const rs = await Promise.all(Array.from({ length: 16 }, (_, i) => register(i % 2 ? f.host.baseUrl : second.baseUrl, a)));
  assert.ok(rs.every(r => r.status === 200)); assert.equal(new Set(rs.map(r => r.body.grants.writer.token)).size, 1);
  const remaining = await Promise.all(Array.from({ length: 32 }, (_, i) => register(i % 2 ? f.host.baseUrl : second.baseUrl, attempt(d))));
  assert.equal(remaining.filter(r => r.status === 200).length, 7);
  assert.equal(remaining.filter(r => r.status === 409).length, 25);
  assert.deepEqual(await counts(f.database), { registrations: 8, projects: 8, grants: 24, charged: 8 });
  record('two_server_processes_one_budget_one_recovery_scope');
});

test('real optional VF02 router cannot widen visitor scope through path casing', async t => {
  const f = await fixture(t, 'extension_scope', { withCells: true }), base = f.host.baseUrl;
  const r = (await register(base, attempt((await http(base, BASE)).body))).body;
  for (const route of [`/v1/projects/${r.projectId}/work-cells`, `/V1/PROJECTS/${r.projectId}/WORK-CELLS`])
    refused(await http(base, route, { body: {}, token: r.grants.writer.token }), 403, 'entry_scope_excludes_receiver');
  const owner = await http(base, '/v1/projects', { token: 'vf10-disposable-administrator-only-fixture', body: { title: 'Existing tenant', summary: 'No public entry enrollment' } });
  assert.equal(owner.status, 201);
  const invalid = await http(base, `/v1/projects/${owner.body.project.id}/WORK-CELLS`, { token: owner.body.ownerToken, body: {} });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, 'invalid_input');
  assert.equal((await f.database.query('SELECT count(*)::int n FROM correspondence_vf02_work_cells')).rows[0].n, 0);
  record('actual_vf02_router_retains_entry_scope_case_insensitively');
});
