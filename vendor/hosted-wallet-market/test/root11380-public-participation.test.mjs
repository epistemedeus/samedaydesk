import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {voluntaryMarket} from '../src/voluntary-market.mjs';
import {createClosureAdmission, authorizeMachineMutation} from '../src/machine-closure-admission.mjs';
import {publicDiscoveryEventId, recordPublicDiscovery} from '../src/machine-public-read.mjs';
import {createMountedPublicLimiter} from '../src/public-route-limit.mjs';
import {RequesterMarket} from '../runtime/agent-economy-market/src/market.mjs';
import {usefulEvidence} from '../examples/participation-canary.mjs';
import {PRODUCTION_ASSETS, BASE_USDC, COMMERCE_PAYMENTS_PIN, requireThat, digest} from '../runtime/agent-economy-foundation/dist/index.js';
import {coldReceipt, coldRequest, checkedColdResult} from '../runtime/agent-economy-market/src/cold-receipt.mjs';

const PREFIX = '/api/neomorphic-contributor-journey';
const sourceSha = 'a'.repeat(64);
const hostSha = 'b'.repeat(64);
const evidenceDigest = digest(usefulEvidence());

function codeOf(error) {
  return error?.code || error?.codeName || error?.message;
}

function memoryStore() {
  const tasks = new Map();
  const consumers = new Set();
  const voluntaryConsumers = new Map();
  const interests = new Set();
  const measures = new Map();
  const consumerInserts = [];
  let tail = Promise.resolve();
  let lastRequest = null;
  const client = {query: (sql, args) => query(sql, args)};
  function exclusive(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  }
  function taskKey(tenant, id) { return tenant + '|' + id; }
  function must(tenant, id) {
    const row = tasks.get(taskKey(tenant, id));
    requireThat(row, 'forbidden');
    return row;
  }
  async function query(sql, args) {
    const text = sql.replaceAll(/\s+/g, ' ').trim();
    if (text.includes('UPDATE') && text.includes('ae14_market_tasks') && text.includes('SET voluntary')) {
      must(args[0], args[1]).voluntary = JSON.parse(args[2]);
      return {rows: []};
    }
    if (text.includes('ae14_market_voluntary_consumers')) {
      const key = `${args[0]}|${args[1]}|${args[2] ?? ''}`;
      if (text.startsWith('SELECT')) {
        const row = voluntaryConsumers.get(`${args[0]}|${args[1]}|${args[2]}`);
        return {rows: row ? [row] : []};
      }
      if (text.startsWith('DELETE')) {
        for (const existing of [...voluntaryConsumers.keys()]) if (existing.startsWith(`${args[0]}|${args[1]}|`)) voluntaryConsumers.delete(existing);
        return {rows: []};
      }
      if (text.startsWith('INSERT')) {
        const id = `${args[0]}|${args[1]}|${args[2]}`;
        if (!voluntaryConsumers.has(id)) voluntaryConsumers.set(id, {
          terms_digest: args[3], artifact_digest: args[4], granted_revision: args[5], operation_id: args[6],
        });
        return {rows: []};
      }
    }
    if (text.includes('ae14_market_consumers')) {
      if (text.startsWith('SELECT')) {
        return {rows: consumers.has(`${args[0]}|${args[1]}|${args[2]}`) ? [{ok: 1}] : []};
      }
      if (text.startsWith('DELETE')) throw new Error('retained consumer grants must not be deleted');
      if (text.startsWith('INSERT')) {
        const row = must(args[0], args[1]);
        consumerInserts.push({taskId: args[1], actorId: args[2], voluntary: row.voluntary ?? null});
        consumers.add(`${args[0]}|${args[1]}|${args[2]}`);
        return {rows: []};
      }
    }
    if (text.includes('ae14_market_interests') && text.startsWith('SELECT')) {
      return {rows: interests.has(`${args[0]}|${args[1]}|${args[2]}`) ? [{ok: 1}] : []};
    }
    throw new Error('unhandled sql ' + text);
  }
  return {
    tasks, consumers, voluntaryConsumers, interests, consumerInserts, measures,
    assets: PRODUCTION_ASSETS, schema: 'earned', pool: client,
    get lastRequest() { return lastRequest; },
    table(name) { return `"earned"."ae14_market_${name}"`; },
    async task(tenant, id) { return structuredClone(must(tenant, id)); },
    async read(tenant, id) {
      if (id !== 'quote-paid') return null;
      return {quote: {quoteId: id, requesterId: 'requester-1', contributorId: 'contributor-1', canonicalTaskId: 'canon-paid', tenantId: tenant}};
    },
    async hasFunding() { return false; },
    async measure(tenant, taskId, kind, eventId, actorId, payload) {
      const key = [tenant, taskId, kind, eventId].join('|');
      const prior = measures.get(key);
      if (prior) requireThat(prior.actorId === actorId && digest(prior.payload) === digest(payload), 'measurement_conflict');
      else measures.set(key, {actorId, payload});
      return payload;
    },
    async locked(tenant, id, fn) { return exclusive(async () => fn(await this.task(tenant, id), client)); },
    async coldMutation({origin, actor, action, input, operationId}, effect) {
      return exclusive(async () => {
        const request = coldRequest(origin, actor, action, input, operationId);
        lastRequest = request;
        return coldReceipt(request, await effect(client));
      });
    },
  };
}

function harness() {
  const store = memoryStore();
  const bytes = Buffer.from(JSON.stringify(usefulEvidence()));
  const members = new Map([
    ['requester-1', 'requester'],
    ['contributor-1', 'contributor'],
    ['later-1', 'requester'],
    ['paid-consumer', 'requester'],
  ]);
  const market = new RequesterMarket({
    store,
    kernel: {async getTask(id) {
      requireThat(id === 'canon-paid', 'forbidden');
      return {submissionEvidenceBytes: bytes, submission: {artifact: {digestSha256: createHash('sha256').update(bytes).digest('hex')}}};
    }},
    accounts: {},
    authenticate: async req => ({tenantId: req.tenantId, actorId: req.actorId}),
    members: {resolve: async (tenantId, actorId) => {
      const role = members.get(actorId);
      return role ? {tenantId, actorId, role} : null;
    }},
    money: {qualification: 'unavailable', authorityId: 'unqualified', protocol: COMMERCE_PAYMENTS_PIN,
      readProof: async () => { throw new Error('machine_authority_required'); }},
    assets: PRODUCTION_ASSETS, asset: BASE_USDC,
    feeRecipient: '0x' + '11'.repeat(20), fundingTarget: '0x' + '22'.repeat(20),
    settlementAuthorityId: 'machine-requester-review-v1', coldOrigin: 'https://market.example.test',
    now: () => new Date('2026-10-27T00:00:00.000Z'),
  });
  const capability = {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: sourceSha, hostSha256: hostSha,
    origin: 'https://market.example.test'};
  const voluntary = voluntaryMarket({market, capability});
  const tenantId = 'tenant-a';
  const binding = {sourceSha256: sourceSha, hostSha256: hostSha};
  const spec = {title: 'Vector', summary: 'Synthetic reusable vector.', criteria: ['preserve-mapping'], payableKinds: ['usable']};
  let sequence = 0;
  const operationId = () => `root11380-op-${++sequence}`;
  const as = actorId => ({tenantId, actorId});
  function seed(taskId, requesterId = 'requester-1') {
    store.tasks.set(tenantId + '|' + taskId, {
      tenant_id: tenantId, id: taskId, requester_id: requesterId, spec, request_digest: 'c'.repeat(64),
      version: 0, current_quote: null, selected_quote: null, voluntary: null,
    });
    store.interests.add(`${tenantId}|${taskId}|contributor-1`);
    return taskId;
  }
  async function offer(taskId) {
    return voluntary.invoke(as('requester-1'), 'offerVoluntary', {taskId, contributorId: 'contributor-1', authorizedToRequest: true,
      rights: {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'Synthetic'}, ...binding}, operationId());
  }
  async function accept(taskId) {
    let state = await offer(taskId);
    state = await voluntary.invoke(as('contributor-1'), 'assentVoluntary', {taskId, termsDigest: state.termsDigest,
      expectedRevision: state.revision, ...binding, authorizedToShare: true, spec}, operationId());
    state = await voluntary.invoke(as('contributor-1'), 'deliverVoluntary', {taskId, termsDigest: state.termsDigest,
      expectedRevision: state.revision, ...binding, evidence: usefulEvidence()}, operationId());
    state = await voluntary.invoke(as('requester-1'), 'reviewVoluntary', {taskId, termsDigest: state.termsDigest,
      expectedRevision: state.revision, ...binding, artifactDigest: evidenceDigest, accepted: true, exportAuthorized: true,
      reason: 'Synthetic acceptance'}, operationId());
    return state;
  }
  async function exported(taskId, actorId = 'later-1') {
    try {
      const value = await voluntary.invoke(as(actorId), 'exportVoluntary', {taskId});
      return {ok: true, relationship: value.relationship, state: value.state, evidence: value.evidence};
    } catch (error) {
      return {ok: false, code: codeOf(error)};
    }
  }
  return {store, market, voluntary, seed, offer, accept, exported, as, operationId, tenantId, binding, spec, capability};
}

test('legacy pre-grant before offer does not authorize a later voluntary export', async () => {
  const h = harness();
  h.seed('pre-grant');
  assert.deepEqual(await h.market.grantConsumer(h.as('requester-1'), {taskId: 'pre-grant', consumerId: 'later-1'}), {granted: true});
  await h.accept('pre-grant');
  assert.deepEqual(await h.exported('pre-grant'), {ok: false, code: 'forbidden'});
  assert.equal(h.store.voluntaryConsumers.size, 0);
  assert.equal(h.store.consumers.has('tenant-a|pre-grant|later-1'), true);
  assert.equal(h.store.consumerInserts.every(row => row.voluntary == null), true);
});

test('legacy grant after offer and after acceptance creates no voluntary entitlement', async () => {
  const offered = harness();
  offered.seed('offered');
  await offered.offer('offered');
  await assert.rejects(offered.market.grantConsumer(offered.as('requester-1'), {taskId: 'offered', consumerId: 'later-1'}),
    error => error.code === 'voluntary_consumer_refused');
  assert.equal(offered.store.consumers.size, 0);
  assert.deepEqual(await offered.exported('offered'), {ok: false, code: 'forbidden'});

  const accepted = harness();
  accepted.seed('accepted');
  await accepted.accept('accepted');
  await assert.rejects(accepted.market.grantConsumer(accepted.as('requester-1'), {taskId: 'accepted', consumerId: 'later-1'}),
    error => error.code === 'voluntary_consumer_refused');
  assert.equal(accepted.store.consumers.size, 0);
  assert.equal(accepted.store.voluntaryConsumers.size, 0);
  assert.deepEqual(await accepted.exported('accepted'), {ok: false, code: 'forbidden'});
});

test('no ordering of a concurrent legacy grant and offer produces voluntary export authority', async () => {
  const h = harness();
  h.seed('race');
  const [grant, offer] = await Promise.allSettled([
    h.market.grantConsumer(h.as('requester-1'), {taskId: 'race', consumerId: 'later-1'}),
    h.offer('race'),
  ]);
  assert.equal(offer.status, 'fulfilled');
  if (grant.status === 'rejected') assert.equal(grant.reason.code, 'voluntary_consumer_refused');
  else assert.deepEqual(grant.value, {granted: true});
  assert.equal(h.store.consumerInserts.every(row => row.voluntary == null), true);
  let state = offer.value;
  state = await h.voluntary.invoke(h.as('contributor-1'), 'assentVoluntary', {taskId: 'race', termsDigest: state.termsDigest,
    expectedRevision: state.revision, sourceSha256: sourceSha, hostSha256: hostSha, authorizedToShare: true, spec: h.spec}, h.operationId());
  state = await h.voluntary.invoke(h.as('contributor-1'), 'deliverVoluntary', {taskId: 'race', termsDigest: state.termsDigest,
    expectedRevision: state.revision, sourceSha256: sourceSha, hostSha256: hostSha, evidence: usefulEvidence()}, h.operationId());
  await h.voluntary.invoke(h.as('requester-1'), 'reviewVoluntary', {taskId: 'race', termsDigest: state.termsDigest,
    expectedRevision: state.revision, sourceSha256: sourceSha, hostSha256: hostSha, artifactDigest: evidenceDigest,
    accepted: true, exportAuthorized: true, reason: 'Synthetic acceptance'}, h.operationId());
  assert.equal(h.store.voluntaryConsumers.size, 0);
  assert.deepEqual(await h.exported('race'), {ok: false, code: 'forbidden'});
});

test('only grantVoluntary produces a later export and the exact operation receipt', async () => {
  const h = harness();
  h.seed('granted');
  h.seed('later-task', 'later-1');
  let state = await h.accept('granted');
  const party = await h.exported('granted', 'requester-1');
  assert.equal(party.ok, true);
  assert.equal(party.relationship, 'task_party');
  const operationId = h.operationId();
  const granted = await h.voluntary.invoke(h.as('requester-1'), 'grantVoluntary', {taskId: 'granted', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, consumerId: 'later-1'}, operationId);
  assert.equal(checkedColdResult(h.store.lastRequest, granted).receipt.operationId, operationId);
  assert.equal(granted.receipt.schema, 'pilot.machine-market.cold-mutation-receipt.v1');
  assert.equal(granted.receipt.action, 'grantVoluntary');
  const row = h.store.voluntaryConsumers.get('tenant-a|granted|later-1');
  assert.equal(row.operation_id, operationId);
  assert.equal(row.terms_digest, state.termsDigest);
  assert.equal(row.artifact_digest, evidenceDigest);
  assert.equal(row.granted_revision, state.revision);
  assert.equal(h.store.consumers.has('tenant-a|granted|later-1'), false);
  const exported = await h.exported('granted');
  assert.equal(exported.ok, true);
  assert.equal(exported.relationship, 'authorized_later_consumer');
  assert.deepEqual(exported.evidence, usefulEvidence());
  const used = await h.voluntary.invoke(h.as('later-1'), 'useVoluntary', {taskId: 'granted', laterTaskId: 'later-task',
    artifactDigest: evidenceDigest, decision: 'Reuse the authorized vector'}, h.operationId());
  assert.equal(used.paidWork, false);
  assert.equal(used.state, 'accepted');
});

test('withdrawal deletes voluntary grants and does not mutate retained grants', async () => {
  const h = harness();
  h.seed('paid');
  h.store.tasks.get('tenant-a|paid').current_quote = 'quote-paid';
  h.seed('withdrawn');
  await h.market.grantConsumer(h.as('requester-1'), {taskId: 'paid', consumerId: 'paid-consumer'});
  h.store.consumers.add('tenant-a|withdrawn|later-1');
  let state = await h.accept('withdrawn');
  state = await h.voluntary.invoke(h.as('requester-1'), 'grantVoluntary', {taskId: 'withdrawn', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, consumerId: 'later-1'}, h.operationId());
  assert.equal(h.store.voluntaryConsumers.has('tenant-a|withdrawn|later-1'), true);
  const before = [...h.store.consumers].sort();
  await h.voluntary.invoke(h.as('requester-1'), 'withdrawVoluntary', {taskId: 'withdrawn', termsDigest: state.termsDigest,
    expectedRevision: state.revision, reason: 'Stop serving'}, h.operationId());
  assert.deepEqual([...h.store.consumers].sort(), before);
  assert.equal(h.store.voluntaryConsumers.size, 0);
  assert.deepEqual(await h.exported('withdrawn'), {ok: false, code: 'voluntary_withdrawn'});
  const retained = await h.market.retained(h.as('paid-consumer'), {taskId: 'paid'});
  assert.equal(retained.evidence.kind, 'usable');
});

test('quoted retained-artifact grant behavior stays on the consumer table', async () => {
  const h = harness();
  h.seed('paid');
  h.store.tasks.get('tenant-a|paid').current_quote = 'quote-paid';
  assert.deepEqual(await h.market.grantConsumer(h.as('requester-1'), {taskId: 'paid', consumerId: 'paid-consumer'}), {granted: true});
  assert.equal(h.store.voluntaryConsumers.size, 0);
  assert.equal(h.store.consumerInserts.length, 1);
  assert.equal(h.store.consumerInserts[0].voluntary, null);
  const retained = await h.market.retained(h.as('paid-consumer'), {taskId: 'paid'});
  assert.deepEqual(retained.evidence, usefulEvidence());
  await assert.rejects(h.market.retained(h.as('later-1'), {taskId: 'paid'}), error => error.code === 'forbidden');
});

test('admission scans once and fails closed only on explicit invalidation or recheck', async () => {
  let pinned = 'pinned-source';
  const admission = createClosureAdmission({
    expectedSource: 'pinned-source', expectedHost: 'pinned-host',
    verify() { return {sourceSha256: pinned, hostSha256: 'pinned-host'}; },
  });
  assert.equal(typeof admission.startCadence, 'undefined');
  await admission.admit();
  for (let i = 0; i < 6; i++) assert.equal(admission.current().sourceSha256, 'pinned-source');
  assert.equal(admission.scans(), 1);
  pinned = 'pinned-source-changed';
  assert.equal(admission.current().sourceSha256, 'pinned-source');
  assert.equal(admission.scans(), 1);
  admission.invalidate();
  assert.throws(() => admission.current(), error => error.codeName === 'machine_profile_refused');
  assert.equal(admission.scans(), 1);
  await assert.rejects(admission.recheck(), error => error.codeName === 'machine_profile_refused');
  assert.equal(admission.scans(), 2);
  assert.throws(() => admission.current(), error => error.codeName === 'machine_profile_refused');
  pinned = 'pinned-source';
  assert.equal((await admission.recheck()).sourceSha256, 'pinned-source');
  assert.equal(admission.scans(), 3);
});

test('concurrent first admission performs one verification', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered = 0;
  const admission = createClosureAdmission({
    expectedSource: 's', expectedHost: 'h',
    async verify() { entered += 1; await gate; return {sourceSha256: 's', hostSha256: 'h'}; },
  });
  const pending = Promise.all([admission.admit(), admission.admit(), admission.admit()]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(entered, 1);
  release();
  await pending;
  assert.equal(entered, 1);
  assert.equal(admission.scans(), 1);
  assert.equal(admission.current().hostSha256, 'h');
});

test('unauthenticated and csrf rejection happen before a closure scan', async () => {
  const admission = createClosureAdmission({
    expectedSource: 's', expectedHost: 'h',
    verify() { throw new Error('scan must not run'); },
  });
  const reject = (code, http = 409) => { throw Object.assign(new Error(code), {code, codeName: code, http}); };
  const input = {taskId: 'task-1'};
  await assert.rejects(authorizeMachineMutation({
    authenticate: async () => { throw Object.assign(new Error('unauthenticated'), {codeName: 'unauthenticated', http: 401}); },
    admission, req: {}, input, refuse: reject,
  }), error => error.codeName === 'unauthenticated');
  await assert.rejects(authorizeMachineMutation({
    authenticate: async () => { throw Object.assign(new Error('csrf_required'), {codeName: 'csrf_required', http: 401}); },
    admission, req: {}, input, refuse: reject,
  }), error => error.codeName === 'csrf_required');
  assert.equal(admission.scans(), 0);
});

test('identical discovery requests stay within one task, UTC day and source bucket', async () => {
  const store = {measures: new Map(), async measure(tenant, taskId, kind, eventId, actorId, payload) {
    const key = [tenant, taskId, kind, eventId].join('|');
    const prior = this.measures.get(key);
    if (prior) requireThat(prior.actorId === actorId && digest(prior.payload) === digest(payload), 'measurement_conflict');
    else this.measures.set(key, {actorId, payload});
    return payload;
  }};
  const rows = [{id: 'market-task'}, {id: 'market-other'}];
  const payload = {verification: 'server_observed', source: 'source-hash', operation: 'anonymous-page-read', acquisition: 'unknown', uniquePrincipal: null};
  const day = Date.parse('2026-10-27T15:04:00.000Z');
  for (let i = 0; i < 40; i++) await recordPublicDiscovery(store, {tenant: 'tenant-a', rows, sourceSha256: 'source-hash', nowMs: day, payload});
  assert.equal(store.measures.size, 2);
  assert.equal(publicDiscoveryEventId('market-task', 'source-hash', day), publicDiscoveryEventId('market-task', 'source-hash', Date.parse('2026-10-27T23:59:59.000Z')));
  await recordPublicDiscovery(store, {tenant: 'tenant-a', rows: [rows[0]], sourceSha256: 'source-hash', nowMs: Date.parse('2026-10-28T00:00:00.000Z'), payload});
  await recordPublicDiscovery(store, {tenant: 'tenant-a', rows: [rows[0]], sourceSha256: 'next-source', nowMs: day,
    payload: {...payload, source: 'next-source'}});
  assert.equal(store.measures.size, 4);
});

test('mounted public reads fail at the exact prefix limit', () => {
  let clock = 1_000;
  const admit = createMountedPublicLimiter({perMinute: 2, capacity: 2, now: () => clock});
  const request = (address, forwarded) => ({socket: {remoteAddress: address}, headers: forwarded ? {'x-forwarded-for': forwarded} : {}});
  const profile = PREFIX + '/v1/market/profile';
  const discover = PREFIX + '/v1/market/discover';
  assert.equal(admit(PREFIX, profile, 'GET', request('10.0.0.1')).status, 200);
  assert.equal(admit(PREFIX, discover, 'GET', request('10.0.0.1', '8.8.8.8')).status, 200);
  const blocked = admit(PREFIX, profile, 'GET', request('10.0.0.1', '9.9.9.9'));
  assert.deepEqual(blocked, {applies: true, status: 429, code: 'public_rate_limited'});
  assert.equal(admit(PREFIX, PREFIX + '/v1/market/post', 'POST', request('10.0.0.1')).applies, false);
  assert.equal(admit(PREFIX, '/other/v1/market/profile', 'GET', request('10.0.0.2')).applies, false);
  assert.equal(admit(PREFIX, PREFIX + '-extra/v1/market/profile', 'GET', request('10.0.0.9')).applies, false);
  assert.equal(admit(PREFIX, discover, 'GET', request('10.0.0.2')).status, 200);
  assert.equal(admit(PREFIX, discover, 'GET', request('10.0.0.3')).status, 429);
  clock = 61_001;
  assert.equal(admit(PREFIX, profile, 'GET', request('10.0.0.1')).status, 200);
});

test('socket address buckets ignore forged forwarded headers and keep separate addresses apart', () => {
  const admit = createMountedPublicLimiter({perMinute: 1, capacity: 4, now: () => 5_000});
  const request = (address, forwarded) => ({socket: {remoteAddress: address}, headers: {'x-forwarded-for': forwarded}});
  const profile = PREFIX + '/v1/market/profile';
  assert.equal(admit(PREFIX, profile, 'GET', request('10.9.0.1', '203.0.113.5')).status, 200);
  assert.equal(admit(PREFIX, profile, 'GET', request('10.9.0.1', '203.0.113.9')).status, 429);
  assert.equal(admit(PREFIX, profile, 'GET', request('10.9.0.2', '203.0.113.9')).status, 200);
  assert.equal(admit(PREFIX, profile, 'POST', request('10.9.0.1', '203.0.113.5')).applies, false);
});

test('selected contributor receives the canonical spec and a one-byte mismatch cannot assent', async () => {
  const h = harness();
  h.seed('spec');
  const offered = await h.offer('spec');
  const viewed = await h.voluntary.invoke(h.as('contributor-1'), 'readVoluntary', {taskId: 'spec'});
  assert.deepEqual(viewed.spec, h.spec);
  assert.equal(digest(viewed.spec), viewed.terms.specDigest);
  assert.equal(viewed.terms.requesterId, 'requester-1');
  assert.equal(viewed.terms.contributorId, 'contributor-1');
  await assert.rejects(h.voluntary.invoke(h.as('later-1'), 'readVoluntary', {taskId: 'spec'}), error => codeOf(error) === 'forbidden');
  const tampered = {...h.spec, title: h.spec.title + 'x'};
  await assert.rejects(h.voluntary.invoke(h.as('contributor-1'), 'assentVoluntary', {taskId: 'spec', termsDigest: offered.termsDigest,
    expectedRevision: offered.revision, ...h.binding, authorizedToShare: true, spec: tampered}, h.operationId()),
    error => codeOf(error) === 'voluntary_terms_changed');
  const bound = await h.voluntary.invoke(h.as('contributor-1'), 'assentVoluntary', {taskId: 'spec', termsDigest: offered.termsDigest,
    expectedRevision: offered.revision, ...h.binding, authorizedToShare: true, spec: viewed.spec}, h.operationId());
  assert.equal(bound.state, 'assigned');
  assert.equal(h.store.tasks.get('tenant-a|spec').voluntary.inspectedSpecDigest, viewed.terms.specDigest);
});

test('delivery is one-shot and a rejected artifact is not exported or corrected', async () => {
  const h = harness();
  h.seed('once');
  let state = await h.offer('once');
  state = await h.voluntary.invoke(h.as('contributor-1'), 'assentVoluntary', {taskId: 'once', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, authorizedToShare: true, spec: h.spec}, h.operationId());
  state = await h.voluntary.invoke(h.as('contributor-1'), 'deliverVoluntary', {taskId: 'once', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, evidence: usefulEvidence()}, h.operationId());
  await assert.rejects(h.voluntary.invoke(h.as('contributor-1'), 'deliverVoluntary', {taskId: 'once', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, evidence: usefulEvidence()}, h.operationId()),
    error => codeOf(error) === 'voluntary_assignment_required');
  state = await h.voluntary.invoke(h.as('requester-1'), 'reviewVoluntary', {taskId: 'once', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, artifactDigest: evidenceDigest, accepted: false, exportAuthorized: false,
    reason: 'Not the requested mapping'}, h.operationId());
  assert.equal(state.state, 'rejected');
  assert.deepEqual(await h.exported('once', 'requester-1'), {ok: false, code: 'voluntary_export_not_authorized'});
  await assert.rejects(h.voluntary.invoke(h.as('requester-1'), 'reviewVoluntary', {taskId: 'once', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, artifactDigest: evidenceDigest, accepted: true, exportAuthorized: true,
    reason: 'Second decision'}, h.operationId()), error => codeOf(error) === 'artifact_changed');
  assert.equal(h.voluntary.descriptor.delivery, 'one-shot');
  assert.equal(h.voluntary.descriptor.revision, 'optimistic-concurrency-counter');
});

test('corrupted commitments fail closed and a successor source cannot revive export', async () => {
  const h = harness();
  h.seed('kept');
  const state = await h.accept('kept');
  const row = h.store.tasks.get('tenant-a|kept');
  const originalTerms = structuredClone(row.voluntary.terms);
  const originalSpec = structuredClone(row.spec);
  const originalArtifact = structuredClone(row.voluntary.artifact);
  row.voluntary.terms = {...originalTerms, rights: {...originalTerms.rights, attribution: 'changed-preimage'}};
  await assert.rejects(h.voluntary.invoke(h.as('requester-1'), 'readVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'voluntary_terms_changed');
  row.voluntary.terms = originalTerms;
  row.spec = {...originalSpec, summary: 'changed spec'};
  await assert.rejects(h.voluntary.invoke(h.as('contributor-1'), 'exportVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'voluntary_terms_changed');
  row.spec = originalSpec;
  row.voluntary.artifact = {...originalArtifact, evidence: {...usefulEvidence(), nextDecision: 'tampered'}};
  await assert.rejects(h.voluntary.invoke(h.as('requester-1'), 'grantVoluntary', {taskId: 'kept', termsDigest: state.termsDigest,
    expectedRevision: state.revision, ...h.binding, consumerId: 'later-1'}, h.operationId()),
    error => codeOf(error) === 'retained_evidence_required');
  row.voluntary.artifact = originalArtifact;
  row.requester_id = 'stranger';
  await assert.rejects(h.voluntary.invoke(h.as('requester-1'), 'readVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'forbidden');
  row.requester_id = 'requester-1';
  const successor = voluntaryMarket({market: h.market, capability: {...h.capability, sourceSha256: 'd'.repeat(64)}});
  await assert.rejects(successor.invoke(h.as('requester-1'), 'readVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'voluntary_source_changed');
  await assert.rejects(successor.invoke(h.as('requester-1'), 'exportVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'voluntary_source_changed');
  const withdrawn = await successor.invoke(h.as('requester-1'), 'withdrawVoluntary', {taskId: 'kept', termsDigest: state.termsDigest,
    expectedRevision: state.revision, reason: 'Stop under an incompatible source'}, h.operationId());
  assert.equal(withdrawn.state, 'withdrawn');
  const after = await successor.invoke(h.as('requester-1'), 'readVoluntary', {taskId: 'kept'});
  assert.equal(after.evidence, null);
  assert.equal(after.state, 'withdrawn');
  const disabled = voluntaryMarket({market: h.market, capability: {...h.capability, participation: 'absent'}});
  const before = structuredClone(h.store.tasks.get('tenant-a|kept'));
  await assert.rejects(disabled.invoke(h.as('requester-1'), 'readVoluntary', {taskId: 'kept'}), error => codeOf(error) === 'voluntary_unavailable');
  assert.deepEqual(h.store.tasks.get('tenant-a|kept'), before);
});

test('migration and mounted routes keep the two amendments', () => {
  const root = new URL('../', import.meta.url);
  const sql = readFileSync(new URL('runtime/agent-economy-market/migrations/001-market.sql', root), 'utf8');
  const voluntary = readFileSync(new URL('src/voluntary-market.mjs', root), 'utf8');
  const market = readFileSync(new URL('runtime/agent-economy-market/src/market.mjs', root), 'utf8');
  const machine = readFileSync(new URL('src/machine-market.mjs', root), 'utf8');
  const server = readFileSync(new URL('src/server.mjs', root), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS __SCHEMA__\.ae14_market_consumers \(\s*tenant_id text NOT NULL, task_id text NOT NULL, actor_id text NOT NULL,/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS __SCHEMA__\.ae14_market_voluntary_consumers \([\s\S]*terms_digest text NOT NULL, artifact_digest text NOT NULL,\s*granted_revision integer NOT NULL, operation_id text NOT NULL,\s*PRIMARY KEY\(tenant_id,task_id,actor_id\)/);
  assert.equal(voluntary.includes("table('consumers')"), false);
  assert.match(voluntary, /table\('voluntary_consumers'\)/);
  assert.match(market, /voluntary_consumer_refused/);
  assert.match(market, /store\.locked\(a\.tenantId,key\(input\.taskId\)/);
  const discover = machine.slice(machine.indexOf('async function discover'), machine.indexOf('function publicProfile'));
  const profile = machine.slice(machine.indexOf('function publicProfile'), machine.indexOf('return {invoke'));
  assert.equal(discover.includes('randomBytes'), false);
  assert.equal(discover.includes('installedSourceSha256'), false);
  assert.match(discover, /admission\.current\(\)/);
  assert.match(discover, /recordPublicDiscovery/);
  assert.equal(profile.includes('installedSourceSha256'), false);
  assert.match(profile, /admission\.current\(\)/);
  assert.match(machine, /await admission\.admit\(\)/);
  assert.equal(machine.includes('startCadence'), false);
  assert.equal(machine.includes('cadenceMs'), false);
  assert.match(machine, /const account=await authorizeMachineMutation/);
  assert.match(server, /admitMountedPublicRead\(PREFIX, url\.pathname, req\.method, req\)/);
  assert.match(server, /decision\.status === 429/);
});

test('mutated client, descriptor, and source pins refuse before a secret file exists', () => {
  const client = fileURLToPath(new URL('../client/cold-requester-0.3.0.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'root11440-acquire-'));
  const run = (file, args) => {
    try {
      return {status: 0, body: JSON.parse(execFileSync(process.execPath, [file, ...args], {encoding: 'utf8', timeout: 10000}))};
    } catch (error) {
      return {status: error.status ?? 1, body: JSON.parse(error.stdout || '{}')};
    }
  };
  try {
    const secret = join(dir, 'role.json');
    const missing = run(client, ['signup', '--origin', 'https://127.0.0.1:9', '--secret-file', secret, '--display-name', 'Nope', '--role', 'requester']);
    assert.equal(missing.status, 1);
    assert.equal(missing.body.code, 'acquisition_required');
    assert.equal(existsSync(secret), false);
    const original = readFileSync(client);
    const source = {repository: 'epistemedeus/samedaydesk', commit: '20deaedc0e7afcc0b68f0988672dbb1f889660db', path: 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs'};
    const base = {schema: 'neomorphic.machine-participation.acquisition.v1', version: '0.3.0', bytes: original.length,
      sha256: createHash('sha256').update(original).digest('hex'), source,
      requiredProfile: {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: 'a'.repeat(64), hostSha256: 'b'.repeat(64)}};
    const writeDescriptor = value => {
      const path = join(dir, 'descriptor-' + createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 8) + '.json');
      writeFileSync(path, JSON.stringify(value));
      return path;
    };
    const pins = path => ['acquire', '--origin', 'https://127.0.0.1:9', '--descriptor', path,
      '--descriptor-sha256', createHash('sha256').update(readFileSync(path)).digest('hex'),
      '--source-repository', source.repository, '--source-commit', source.commit, '--source-path', source.path];
    const flippedDescriptor = Buffer.from(JSON.stringify(base));
    flippedDescriptor[10] ^= 1;
    const flippedPath = join(dir, 'flipped-descriptor.json');
    writeFileSync(flippedPath, flippedDescriptor);
    const descriptorMismatch = run(client, ['acquire', '--origin', 'https://127.0.0.1:9', '--descriptor', flippedPath,
      '--descriptor-sha256', 'ab'.repeat(32), '--source-repository', source.repository, '--source-commit', source.commit, '--source-path', source.path]);
    assert.equal(descriptorMismatch.body.code, 'acquisition_descriptor_mismatch');
    const mutantPath = join(dir, 'cold-requester-0.3.0.mjs');
    const mutant = Buffer.from(original);
    const comment = mutant.indexOf('HTTPS client');
    mutant[comment] ^= 1;
    writeFileSync(mutantPath, mutant);
    const mutatedClient = run(mutantPath, pins(writeDescriptor(base)));
    assert.equal(mutatedClient.body.code, 'acquisition_client_mismatch');
    for (const [field, value] of [['repository', 'example/other'], ['commit', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], ['path', 'client/other.mjs']]) {
      const wrong = structuredClone(base);
      wrong.source = {...source, [field]: value};
      const refused = run(client, pins(writeDescriptor(wrong)));
      assert.equal(refused.body.code, 'acquisition_source_mismatch', field);
    }
    assert.equal(existsSync(secret), false);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
