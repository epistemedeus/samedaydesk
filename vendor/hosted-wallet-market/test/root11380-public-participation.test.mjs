import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
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
      expectedRevision: state.revision, ...binding, authorizedToShare: true}, operationId());
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
  return {store, market, voluntary, seed, offer, accept, exported, as, operationId, tenantId, binding};
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
    expectedRevision: state.revision, sourceSha256: sourceSha, hostSha256: hostSha, authorizedToShare: true}, h.operationId());
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

test('admission scans the closure once and fails closed after a pinned byte changes', async () => {
  let pinned = 'pinned-source';
  const queued = [];
  const admission = createClosureAdmission({
    expectedSource: 'pinned-source', expectedHost: 'pinned-host', cadenceMs: 5000,
    verify() { return {sourceSha256: pinned, hostSha256: 'pinned-host'}; },
    schedule(fn, ms) { const handle = {unref() {}}; queued.push({fn, ms}); return handle; },
  });
  await admission.admit();
  for (let i = 0; i < 6; i++) assert.equal(admission.current().sourceSha256, 'pinned-source');
  assert.equal(admission.scans(), 1);
  admission.startCadence();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].ms, 5000);
  pinned = 'pinned-source-changed';
  await queued[0].fn();
  assert.equal(admission.scans(), 2);
  assert.throws(() => admission.current(), error => error.codeName === 'machine_profile_refused');
  assert.equal(admission.scans(), 2);
  assert.equal(queued.length, 1);
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
  assert.match(machine, /const account=await authorizeMachineMutation/);
  assert.match(server, /admitMountedPublicRead\(PREFIX, url\.pathname, req\.method, req\)/);
  assert.match(server, /decision\.status === 429/);
});
