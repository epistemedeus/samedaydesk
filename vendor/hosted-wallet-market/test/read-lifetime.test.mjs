import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import test from 'node:test';
import pg from 'pg';
import {boundedReview} from '../src/bounded-review.mjs';
import {readEntitledOutcome} from '../src/retained-outcome.mjs';
import {openHostedMarket} from '../src/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const vendor = path.join(root, 'vendor/hosted-wallet-market');
const PREFIX = '/api/neomorphic-contributor-journey';
const TENANT = 'root1208-life';
const DEST = `0x${'ab'.repeat(20)}`;
const SOURCE = `0x${'cd'.repeat(20)}`;
const FEE = `0x${'22'.repeat(20)}`;
const RAIL = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAID_BODY = 'SYNTHETIC-PAUSED-MAKE-REFUSAL-root1208';
const OWED_BODY = 'SYNTHETIC-ACCEPTED-UNPAID-root1208';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const originalQuery = pg.Client.prototype.query;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function textOf(args) {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first.text === 'string') return first.text;
  return '';
}
function padTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}
function hexBlock(blockNumber) {
  return `0x${BigInt(blockNumber).toString(16)}`;
}
async function waitFor(predicate, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(15);
  }
  assert.fail(`timed out after ${ms}ms`);
}
function listenStub(receipts, blocks) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; }
      const method = body.method;
      let result = null;
      if (method === 'eth_chainId') result = '0x2105';
      else if (method === 'eth_blockNumber') result = hexBlock('52733000');
      else if (method === 'eth_call') result = `0x${(6).toString(16).padStart(64, '0')}`;
      else if (method === 'eth_getTransactionReceipt') result = receipts.get(String(body.params?.[0] || '').toLowerCase()) || null;
      else if (method === 'eth_getTransactionByHash') {
        const found = receipts.get(String(body.params?.[0] || '').toLowerCase());
        result = found ? {hash: body.params[0], blockHash: found.blockHash, blockNumber: found.blockNumber, from: found.from} : null;
      } else if (method === 'eth_getBlockByNumber') {
        const key = String(body.params?.[0] || '').toLowerCase();
        if (key === 'finalized') result = {number: hexBlock('52733000'), hash: `0x${'ff'.repeat(32)}`, timestamp: '0x1'};
        else {
          const timestamp = blocks.get(key) || blocks.get(BigInt(key).toString());
          const found = [...receipts.values()].find(item => item.blockNumber === key);
          result = timestamp && found ? {number: key, hash: found.blockHash, timestamp} : null;
        }
      } else {
        res.end(JSON.stringify({jsonrpc: '2.0', id: body.id ?? 1, error: {code: -32601, message: 'refused'}}));
        return;
      }
      res.end(JSON.stringify({jsonrpc: '2.0', id: body.id ?? 1, result}));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`})));
}
function openRequest(origin, ca, method, route, {body, key, cookie, proof, authorization, timeout = 20000} = {}) {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const headers = {connection: 'close', 'x-ae-wire-version': 'c0-1'};
  if (key) headers['idempotency-key'] = key;
  if (cookie) headers.cookie = cookie;
  if (proof) headers['x-account-operation-proof'] = proof;
  if (authorization) headers.authorization = authorization;
  if (data) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(data.length);
  }
  let req;
  const done = new Promise((resolve, reject) => {
    req = https.request(`${origin}${route}`, {method, ca, headers, rejectUnauthorized: true, timeout}, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let parsed = null;
        try { parsed = JSON.parse(text || 'null'); } catch { parsed = {raw: text.slice(0, 200)}; }
        resolve({status: incoming.statusCode, body: parsed, headers: incoming.headers, at: Date.now()});
      });
      incoming.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
  req.end(data ?? undefined);
  return {req, done};
}
function cookieFrom(headers) {
  const value = headers['set-cookie'];
  const first = Array.isArray(value) ? value[0] : value;
  return String(first || '').split(';')[0];
}
function reviewPath(taskId, reservationId) {
  return `${PREFIX}/v1/review?taskId=${encodeURIComponent(taskId)}&reservationId=${encodeURIComponent(reservationId)}`;
}

test('review deadlines outside 1..10000 are refused', () => {
  for (const timeoutMs of [0, -1, 1.5, 10001, Number.NaN, 3000.2]) {
    assert.throws(() => boundedReview({timeoutMs}), /review_deadline_refused/);
  }
  assert.equal(boundedReview({timeoutMs: 1}).status().timeoutMs, 1);
  assert.equal(boundedReview({timeoutMs: 10000}).status().timeoutMs, 10000);
  assert.equal(boundedReview().status().capacity, 1);
  assert.equal(boundedReview().status().active, 0);
  assert.equal(boundedReview().status().drained, true);
});

test('one slot stays busy until the uncooperative read drains', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const review = boundedReview({timeoutMs: 40});
  const pending = review.read(async () => {
    await gate;
    return {paid: true};
  }, reason => reason);
  assert.equal(await pending, 'timeout');
  assert.equal(review.status().active, 1);
  assert.equal(review.status().cancelRequested, true);
  assert.equal(review.status().drained, false);
  assert.equal(review.status().outcome, 'timeout');
  assert.equal(await review.read(async () => 'second', reason => reason), 'busy');
  assert.equal(review.status().active, 1);
  release();
  for (let i = 0; i < 50 && review.status().active; i += 1) await sleep(10);
  assert.equal(review.status().active, 0);
  assert.equal(review.status().drained, true);
  assert.equal(await review.read(async () => 'third', reason => reason), 'third');
  assert.equal(review.status().active, 0);
});

test('parent cancellation refuses the read without taking the slot early', async () => {
  const parent = new AbortController();
  parent.abort();
  let ran = false;
  const idle = boundedReview({timeoutMs: 1000});
  const skipped = await idle.read(() => { ran = true; return 'paid'; }, reason => reason, parent.signal);
  assert.equal(skipped, 'cancelled');
  assert.equal(ran, false);
  assert.equal(idle.status().active, 0);

  const during = new AbortController();
  const live = boundedReview({timeoutMs: 5000});
  let aborted = false;
  const pending = live.read(async signal => {
    await sleep(180);
    aborted = signal.aborted;
    return {paid: true};
  }, reason => reason, during.signal);
  await sleep(30);
  assert.equal(live.status().active, 1);
  during.abort();
  assert.equal(await pending, 'cancelled');
  await sleep(220);
  assert.equal(aborted, true);
  assert.equal(live.status().active, 0);
  assert.equal(live.status().outcome, 'cancelled');
  assert.equal(live.status().drained, true);
});

test('a closed read lifetime refuses queries that have not entered', async () => {
  const {bindReadLifetime} = await import('../src/bounded-review.mjs');
  let calls = 0;
  let release;
  const entered = new Promise(resolve => { release = resolve; });
  const life = bindReadLifetime({
    query() {
      calls += 1;
      return entered;
    },
  });
  const inflight = life.client.query('SELECT 1');
  let quiesced = false;
  const waiting = life.quiesce().then(() => { quiesced = true; });
  await sleep(30);
  assert.equal(quiesced, false);
  assert.equal(life.closed, true);
  assert.throws(() => life.client.query('SELECT 2'), error => error.codeName === 'read_cancelled');
  assert.equal(calls, 1);
  release({rows: []});
  await inflight;
  await waiting;
  assert.equal(quiesced, true);
  assert.throws(() => life.client.query('SELECT 3'), error => error.codeName === 'read_cancelled');
  assert.equal(calls, 1);
  assert.throws(() => life.client.query('SELECT 4', () => {}), error => error.codeName === 'read_cancelled');
  assert.throws(() => bindReadLifetime(null), /read_client_required/);
});

test('abort before the entitled read issues no sql', async () => {
  const requests = [
    {aborted: true, headers: {cookie: '__Host-neo_contributor=nope'}, socket: {destroyed: false, on() {}, off() {}}, on() {}, off() {}},
    {aborted: false, headers: {cookie: '__Host-neo_contributor=nope'}, socket: {destroyed: true, on() {}, off() {}}, on() {}, off() {}},
  ];
  for (const req of requests) {
    let calls = 0;
    const client = {query() { calls += 1; return Promise.resolve({rows: []}); }};
    await assert.rejects(() => readEntitledOutcome(client, req, {
      taskId: 'task_root1208paid0001',
      reservationId: 'rsv_root1208paid0001',
      nowMs: () => Date.now(),
    }), error => error.codeName === 'read_cancelled');
    assert.equal(calls, 0);
  }
});

test('configured adapter keeps a nested binding query inside the open transaction', {timeout: 180000}, async () => {
  const savedMachine = process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
  delete process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
  const events = [];
  const probe = {mode: 'idle', releaseHold: null};
  function wrapRelease(client) {
    const release = client.release;
    if (typeof release !== 'function' || client.__root1208Release === release) return;
    client.__root1208Release = release;
    client.release = function (...args) {
      client.__root1208Released = true;
      return release.apply(this, args);
    };
  }
  pg.Client.prototype.query = function (...args) {
    wrapRelease(this);
    const text = textOf(args);
    if (/^\s*BEGIN\b/i.test(text)) {
      this.__root1208Released = false;
      this.__root1208Committed = false;
    }
    if (/^\s*COMMIT\b/i.test(text)) this.__root1208Committed = true;
    if (probe.mode === 'delay-enroll' && /consumer_enrollment/i.test(text)) {
      probe.mode = 'idle';
      const client = this;
      events.push({kind: 'enroll-delay-started', at: Date.now()});
      return (async () => {
        await sleep(3500);
        events.push({
          kind: 'enroll-sent',
          at: Date.now(),
          released: client.__root1208Released === true,
          committed: client.__root1208Committed === true,
        });
        return originalQuery.apply(client, args);
      })();
    }
    if (probe.mode === 'hold-session' && /journey_account_sessions/i.test(text)) {
      probe.mode = 'idle';
      const client = this;
      events.push({kind: 'session-held', at: Date.now()});
      return (async () => {
        await new Promise(resolve => { probe.releaseHold = resolve; });
        events.push({
          kind: 'session-resumed',
          released: client.__root1208Released === true,
          committed: client.__root1208Committed === true,
        });
        return originalQuery.apply(client, args);
      })();
    }
    if (/consumer_enrollment/i.test(text)) {
      events.push({
        kind: 'enroll',
        at: Date.now(),
        released: this.__root1208Released === true,
        committed: this.__root1208Committed === true,
      });
    }
    return originalQuery.apply(this, args);
  };

  const {startCluster} = await import(pathToFileURL(path.join(root, 'server/scripts/root404-pg-cluster.mjs')).href);
  const {applyAdditiveSchema, applyServingSchema} = await import(pathToFileURL(path.join(vendor, 'src/migrate.mjs')).href);
  const {seedStaging} = await import(pathToFileURL(path.join(vendor, 'src/seed.mjs')).href);
  const {loadDeploymentProfile} = await import(pathToFileURL(path.join(vendor, 'src/profile.mjs')).href);
  const {writeStagingCerts} = await import(pathToFileURL(path.join(vendor, 'src/tls.mjs')).href);
  const debt = await import(pathToFileURL(path.join(vendor, 'src/native-debt.mjs')).href);
  const discharge = await import(pathToFileURL(path.join(vendor, 'src/native-obligation-discharge.mjs')).href);
  const {digest: canonicalDigest} = await import(pathToFileURL(path.join(vendor, 'src/canonical.mjs')).href);
  const {nativeEnvelope} = await import(pathToFileURL(path.join(vendor, 'src/retained-award-validate.mjs')).href);
  const paidTerms = `sha256:${sha256('root1208-paid-terms')}`;
  const owedTerms = `sha256:${sha256('root1208-owed-terms')}`;
  const paidBytes = Buffer.from(PAID_BODY);
  const owedBytes = Buffer.from(OWED_BODY);
  const paid = {taskId: 'task_root1208paid0001', reservationId: 'rsv_root1208paid0001', obligationId: 'obl_root1208paid0001'};
  const owed = {taskId: 'task_root1208owed0001', reservationId: 'rsv_root1208owed0001', obligationId: 'obl_root1208owed0001'};
  const work = await mkdtemp(path.join(tmpdir(), 'root1208-life-'));
  const registryRoot = path.join(work, 'registry');
  mkdirSync(registryRoot, {recursive: true, mode: 0o700});
  chmodSync(registryRoot, 0o700);
  const receipts = new Map();
  const blocks = new Map();
  const cluster = await startCluster();
  const admin = new pg.Client({connectionString: cluster.connectionString, connectionTimeoutMillis: 10000});
  admin.on('error', () => {});
  let stub;
  let httpsServer;
  let market;
  const ownerToken = `ew_${randomBytes(18).toString('base64url')}`;
  const releaseHeld = () => {
    const finish = probe.releaseHold;
    probe.releaseHold = null;
    if (finish) finish();
  };
  async function drain(ms = 8000) {
    const deadline = Date.now() + ms;
    let status = market.reviewReceivingStatus();
    while (Date.now() < deadline) {
      status = market.reviewReceivingStatus();
      if (status.review.active === 0 && status.fulfillment.active === 0 && status.review.drained && status.fulfillment.drained) return status;
      await sleep(40);
    }
    return status;
  }
  try {
    await admin.connect();
    await applyServingSchema(admin, {repo: root});
    await applyAdditiveSchema(admin);
    await seedStaging(admin);
    stub = await listenStub(receipts, blocks);
    const tls = writeStagingCerts(path.join(work, 'tls'));
    const profileInput = {
      mode: 'private', label: 'STAGING', chain: 'eip155:8453', payments: 'off', publicReads: '0',
      fundedTasks: 'off', humanAssets: 'off', tls: 'files', tenant: TENANT, earnedSchema: 'cj227_earned_work',
      schemaName: 'hosted_wallet_market', listenHost: '127.0.0.1', databaseUrl: cluster.connectionString,
      rpcUrl: stub.url, feeRecipient: FEE, settlementToken: RAIL, cert: tls.cert, key: tls.key,
      dischargeRegistry: registryRoot, replayKey: randomBytes(32).toString('hex'), ownerToken, sdsRoot: root,
      readAcceptedSource: async () => null,
    };
    market = await openHostedMarket(profileInput);
    httpsServer = https.createServer({key: tls.key, cert: tls.cert}, (req, res) => {
      Promise.resolve(market.handle(req, res, () => {
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(204);
          res.end();
        }
      })).catch(error => {
        if (!res.headersSent && !res.destroyed) {
          res.writeHead(500, {'content-type': 'application/json'});
          res.end(JSON.stringify({ok: false, code: 'test_layer_failed', message: String(error?.message || error).slice(0, 180)}));
        }
      });
    });
    httpsServer.on('clientError', () => {});
    await new Promise((resolve, reject) => httpsServer.once('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${httpsServer.address().port}`;
    const ask = (method, route, options) => openRequest(origin, tls.ca, method, route, options).done;
    const proof = randomBytes(32).toString('base64url');
    const signup = await ask('POST', `${PREFIX}/v1/account/signup`, {
      body: {password: `pw-${randomBytes(18).toString('base64url')}`, displayName: 'LifeReq', role: 'requester'},
      key: 'root1208signup01', proof,
    });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const cookie = cookieFrom(signup.headers);
    const accountId = signup.body.value.account.accountId;
    const otherProof = randomBytes(32).toString('base64url');
    const other = await ask('POST', `${PREFIX}/v1/account/signup`, {
      body: {password: `pw-${randomBytes(18).toString('base64url')}`, displayName: 'LifeOther', role: 'contributor'},
      key: 'root1208signup02', proof: otherProof,
    });
    assert.equal(other.status, 200, JSON.stringify(other.body));
    const otherCookie = cookieFrom(other.headers);
    const stamp = new Date('2026-10-14T08:19:30.261Z');
    async function insertWork(spec, evidence, amount) {
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_tasks (
          id, title, summary, provenance, lifecycle, funding_state, payout_state,
          current_terms_version, terms_revision, schema_version, correction_max_revisions,
          budget_amount, budget_asset, budget_network, created_at, updated_at
        ) VALUES ($1, $2, 'Synthetic lifetime fixture.', 'test', 'accepted', 'reserved', 'owed', $3, 1, 1, 1, $4, 'USDC', 'eip155:8453', $5, $5)`,
        [spec.taskId, spec.taskId, spec.terms, amount, stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_terms (
          task_id, version, terms_revision, schema_version, summary, reward_amount,
          reward_asset, reward_network, claim_ttl_seconds, max_artifact_bytes, allowed_media_types, slot_limit, created_at
        ) VALUES ($1, $2, 1, 1, 'Synthetic terms.', $3, 'USDC', 'eip155:8453', 7200, 16384, ARRAY['text/plain']::text[], 1, $4)`,
        [spec.taskId, spec.terms, amount, stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_contributor_tokens (
          id, public_id, token_hash, payout_destination, task_scope, provenance, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'test', $6)`,
        [spec.tokenId, spec.publicId, sha256(spec.tokenId), DEST, spec.taskId, stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_reservations (
          id, task_id, terms_version, contributor_public_id, contributor_token_id, status, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'completed', $6, $6)`,
        [spec.reservationId, spec.taskId, spec.terms, spec.publicId, spec.tokenId, stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_submissions (
          id, task_id, reservation_id, terms_version, artifact_ref, artifact_digest_sha256,
          artifact_media_type, artifact_bytes, evidence_bytes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'text/plain', $7, $8, $9)`,
        [spec.submissionId, spec.taskId, spec.reservationId, spec.terms, spec.artifactRef, sha256(evidence), evidence.length, evidence, stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_verdicts (
          id, task_id, reservation_id, submission_id, terms_version, artifact_digest_sha256,
          verifier_version, outcome, reasons, ordinal, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'root1208', 'pass', $7::jsonb, 1, $8)`,
        [spec.verdictId, spec.taskId, spec.reservationId, spec.submissionId, spec.terms, sha256(evidence), JSON.stringify({outcome: 'pass'}), stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_obligations (
          id, task_id, reservation_id, submission_id, contributor_public_id, payout_destination,
          reward_amount, reward_asset, reward_network, payout_state, terms_version, idempotency_key, adapter, verdict_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USDC', 'eip155:8453', 'owed', $8, $9, 'root1208', $10, $11)`,
        [spec.obligationId, spec.taskId, spec.reservationId, spec.submissionId, spec.publicId, DEST, amount, spec.terms, spec.idempotencyKey, spec.verdictId, stamp],
      );
    }
    await insertWork({...paid, terms: paidTerms, tokenId: 'tok_root1208paid0001', publicId: 'pub_root1208paid0001', submissionId: 'sub_root1208paid0001', verdictId: 'ver_root1208paid0001', artifactRef: 'synthetic:paid', idempotencyKey: 'root1208-paid'}, paidBytes, '0.120000');
    await insertWork({...owed, terms: owedTerms, tokenId: 'tok_root1208owed0001', publicId: 'pub_root1208owed0001', submissionId: 'sub_root1208owed0001', verdictId: 'ver_root1208owed0001', artifactRef: 'synthetic:owed', idempotencyKey: 'root1208-owed'}, owedBytes, '0.080000');
    const expiry = new Date(Date.now() + 3600000);
    for (const spec of [[paid.taskId, paidTerms], [owed.taskId, owedTerms]]) {
      await admin.query(
        `INSERT INTO hosted_wallet_market.quotes (
          task_id, requester_account_id, fee_recipient, economics, terms_version,
          authorization_expiry, refund_expiry, funding_wire, funded, observations, created_at
        ) VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $5, 'unfunded', false, '[]'::jsonb, $6)`,
        [spec[0], accountId, FEE, spec[1], expiry, stamp],
      );
    }
    await admin.query(
      `INSERT INTO hosted_wallet_market.delivery
        (reservation_id, task_id, evidence_hash, raw_sha256, business_status, body_bytes, created_at)
       VALUES ($1, $2, $3, $3, 'refused', $4, $5)`,
      [paid.reservationId, paid.taskId, sha256(paidBytes), paidBytes.length, stamp],
    );
    const txHash = `0x${'11'.repeat(32)}`;
    const blockHash = `0x${'22'.repeat(32)}`;
    const blockTimestamp = '2026-10-17T14:49:29.000Z';
    const intent = {
      obligationId: paid.obligationId, reservationId: paid.reservationId, taskId: paid.taskId,
      claimId: paid.reservationId, submissionId: 'sub_root1208paid0001', verdictId: 'ver_root1208paid0001',
      termsVersion: paidTerms, artifactDigestSha256: sha256(paidBytes), roundId: 'round-root1208',
      network: 'eip155:8453', token: RAIL, amountAtomic: '120000', source: SOURCE, recipient: DEST,
    };
    const receipt = discharge.buildDischargeReceipt({
      authorityClass: 'root_received', intent,
      canonical: {status: 'success', exactTransferVerified: true, logIndex: 7, transactionHash: txHash, blockHash, blockNumber: '42', blockTimestamp, knownFeeWei: '0'},
    });
    discharge.claimTransferExclusive(registryRoot, {
      schema: discharge.TRANSFER_SCHEMA, kind: 'external_discharge_only', ...nativeEnvelope(intent, 'root_received'),
      transactionHash: receipt.transactionHash, logIndex: receipt.logIndex, receiptId: receipt.receiptId,
      importContractSha256: receipt.importContractSha256, kernelPaid: false, kernelTransfer: null, noAutomaticReplay: true,
    });
    discharge.writeExclusiveJson(discharge.obligationDischargePath(registryRoot, paid.obligationId), receipt);
    const authoritySha = canonicalDigest(JSON.parse(readFileSync(discharge.obligationDischargePath(registryRoot, paid.obligationId), 'utf8')));
    receipts.set(txHash, {
      status: '0x1', transactionHash: txHash, blockHash, blockNumber: hexBlock('42'), from: SOURCE,
      logs: [{
        address: RAIL, logIndex: '0x7', topics: [TRANSFER_TOPIC, padTopic(SOURCE), padTopic(DEST)],
        data: `0x${(120000n).toString(16).padStart(64, '0')}`,
        transactionHash: txHash, blockHash, blockNumber: hexBlock('42'), removed: false,
      }],
    });
    const unix = `0x${BigInt(Math.floor(Date.parse(blockTimestamp) / 1000)).toString(16)}`;
    blocks.set(hexBlock('42'), unix);
    blocks.set('42', unix);
    const next = debt.createInstalledDebtConsumer({
      profile: loadDeploymentProfile(profileInput), sdsRoot: root, registryRoot, readAcceptedSource: async () => null,
      authorityPrincipalId: sha256(ownerToken),
    }).expectedBinding();
    const predecessor = sha256('enrolled-predecessor-root1208-life');
    assert.notEqual(predecessor, next.source_sha256);
    await admin.query(
      `INSERT INTO hosted_wallet_market.consumer_enrollment (
        id, source_sha256, import_contract_sha256, consumer_contract_sha256, tenant, network, token,
        host_source_sha256, earned_schema, rpc_endpoint_sha256, registry_sha256, profile_sha256,
        rpc_origin_sha256, profile_chain, created_at
      ) VALUES (TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [predecessor, next.import_contract_sha256, next.consumer_contract_sha256, next.tenant, next.network, next.token,
        next.host_source_sha256, next.earned_schema, next.rpc_endpoint_sha256, next.registry_sha256, next.profile_sha256,
        next.rpc_origin_sha256, next.profile_chain, stamp],
    );
    await admin.query(`INSERT INTO cj227_earned_work.earned_work_idempotency
      (scope,task_id,key,request_hash,status_code,response_json,principal_id,created_at)
      VALUES ('hosted-wallet-market','','fixture-original-enroll',$1,200,$2::jsonb,$3,$4)`, [
      canonicalDigest({method: 'POST', route: `${PREFIX}/v1/native-debt/enroll`, body: {}}),
      JSON.stringify({value: {schema: 'pilot.root71.native-debt.enrollment.v1', state: 'enrolled', qualified: true,
        sourceSha256: predecessor, hostSourceSha256: next.host_source_sha256, importContractSha256: next.import_contract_sha256,
        consumerContractSha256: next.consumer_contract_sha256, tenant: next.tenant, network: next.network, token: next.token,
        rpcOriginSha256: next.rpc_origin_sha256, rpcEndpointSha256: next.rpc_endpoint_sha256, profileChain: next.profile_chain,
        profileSha256: next.profile_sha256, boundConsumer: 'hosted_wallet_market.native_debt_dispositions'}}),
      sha256(ownerToken), stamp]);
    await admin.query(
      `INSERT INTO hosted_wallet_market.native_debt_dispositions (
        obligation_id, obligation_family, tenant, reservation_id, claim_id, submission_id, verdict_id,
        artifact_digest_sha256, task_id, terms_version, network, token, recipient, transaction_hash,
        log_index, block_number, block_hash, block_timestamp, consumer_contract_sha256, authority_receipt_sha256,
        request_sha256, amount_atomic, receipt_id, received_at, import_contract_sha256, import_state, disposition,
        kernel_paid, kernel_transfer, native_paid_observation, transfer_initiated, payout_state, observed_source, created_at
      ) VALUES (
        $1, 'earned', $2, $3, $3, 'sub_root1208paid0001', 'ver_root1208paid0001', $4, $5, $6, 'eip155:8453', $7, $8,
        $9, 7, '42', $10, $11, $12, $13, $14, '120000', $15, $11, $16, 'bound', 'external_discharge_allocated',
        TRUE, $9, TRUE, FALSE, 'owed', $17, $11
      )`,
      [paid.obligationId, TENANT, paid.reservationId, sha256(paidBytes), paid.taskId, paidTerms, RAIL, DEST,
        txHash, blockHash, stamp, next.consumer_contract_sha256, authoritySha, sha256('request'), receipt.receiptId, debt.IMPORT_CONTRACT_SHA256, SOURCE],
    );
    const paidReview = reviewPath(paid.taskId, paid.reservationId);
    const stale = await ask('GET', paidReview, {cookie});
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, 'stale_evidence');
    const enrolled = await ask('POST', `${PREFIX}/v1/native-debt/enroll`, {
      body: {}, key: 'root1208enroll01', authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(enrolled.status, 200, JSON.stringify(enrolled.body));
    assert.equal(enrolled.body.value.qualified, true);
    const entitled = await ask('GET', paidReview, {cookie});
    assert.equal(entitled.status, 200, JSON.stringify(entitled.body));
    assert.equal(entitled.body.value.entitled.disposition.projection, 'native_paid');
    assert.equal(entitled.body.value.entitled.fulfillment.paid, true);
    assert.equal(entitled.body.value.fulfillment.paid, true);
    assert.equal(entitled.body.value.entitled.disposition.payoutState, 'owed');
    assert.equal(entitled.body.value.entitled.businessStatus, 'refused');
    assert.equal(entitled.body.value.entitled.artifact.body, PAID_BODY);
    const owedRead = await ask('GET', reviewPath(owed.taskId, owed.reservationId), {cookie});
    assert.equal(owedRead.status, 200, JSON.stringify(owedRead.body));
    assert.equal(owedRead.body.value.entitled.disposition.projection, 'owed');
    assert.equal(owedRead.body.value.entitled.disposition.payable, true);
    assert.equal(owedRead.body.value.entitled.fulfillment.paid, false);
    const missing = await ask('GET', paidReview, {});
    assert.equal(missing.status, 401, JSON.stringify(missing.body));
    assert.equal(missing.body.code, 'unauthenticated');
    const forged = await ask('GET', paidReview, {cookie: '__Host-neo_contributor=forged-token'});
    assert.equal(forged.status, 401, JSON.stringify(forged.body));
    assert.equal(forged.body.code, 'unauthenticated');
    const stranger = await ask('GET', paidReview, {cookie: otherCookie});
    assert.equal(stranger.status, 404, JSON.stringify(stranger.body));
    assert.equal(stranger.body.code, 'not_found');
    const mismatch = await ask('GET', reviewPath(owed.taskId, paid.reservationId), {cookie});
    assert.equal(mismatch.status, 409, JSON.stringify(mismatch.body));
    assert.equal(mismatch.body.code, 'mismatch');
    await assert.rejects(
      admin.query(
        `UPDATE hosted_wallet_market.native_debt_dispositions SET authority_receipt_sha256 = $2 WHERE obligation_id = $1`,
        [paid.obligationId, sha256('root1208-tampered-authority')],
      ),
      error => error.code === 'P0001' && /disposition_immutable/.test(error.message),
    );
    const dischargePath = discharge.obligationDischargePath(registryRoot, paid.obligationId);
    const dischargeBytes = readFileSync(dischargePath);
    try {
      const shifted = JSON.parse(dischargeBytes.toString());
      shifted.amountAtomic = '1';
      writeFileSync(dischargePath, JSON.stringify(shifted));
      const tampered = await ask('GET', paidReview, {cookie});
      assert.equal(tampered.status, 409, JSON.stringify(tampered.body));
      assert.equal(tampered.body.code, 'stale_evidence');
    } finally {
      writeFileSync(dischargePath, dischargeBytes);
    }
    const restored = await ask('GET', paidReview, {cookie});
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.value.entitled.fulfillment.paid, true);

    events.length = 0;
    probe.mode = 'delay-enroll';
    const delayedOpen = openRequest(origin, tls.ca, 'GET', paidReview, {cookie, timeout: 20000});
    await waitFor(() => events.some(event => event.kind === 'enroll-delay-started'), 8000);
    const anchor = events.find(event => event.kind === 'enroll-delay-started').at;
    const busyStarted = Date.now();
    const busy = await ask('GET', paidReview, {cookie, timeout: 5000});
    const busyMs = Date.now() - busyStarted;
    assert.equal(busy.status, 503, JSON.stringify(busy.body));
    assert.equal(busy.body.code, 'review_receiving_unavailable');
    assert.ok(busyMs < 1000, `busy response took ${busyMs}ms`);
    await sleep(Math.max(0, anchor + 3100 - Date.now()));
    const mid = market.reviewReceivingStatus();
    const delayed = await delayedOpen.done;
    await waitFor(() => events.some(event => event.kind === 'enroll-sent'), 8000);
    const sent = events.find(event => event.kind === 'enroll-sent');
    assert.equal(delayed.status, 200, JSON.stringify(delayed.body));
    assert.equal(delayed.body.value.entitled.disposition.projection, 'unknown');
    assert.equal(delayed.body.value.fulfillment.paid, false);
    assert.equal(delayed.body.value.entitled.disposition.holdReason, 'fulfillment_unavailable');
    assert.equal(sent.released, false, `binding query used a released client mid=${JSON.stringify(mid)} sent=${JSON.stringify(sent)} responseAt=${delayed.at}`);
    assert.equal(sent.committed, false, `binding query used a committed client mid=${JSON.stringify(mid)} sent=${JSON.stringify(sent)} responseAt=${delayed.at}`);
    assert.ok(delayed.at >= sent.at, `outer read returned before the binding query was sent responseAt=${delayed.at} sentAt=${sent.at}`);
    assert.equal(mid.fulfillment.active, 1, JSON.stringify(mid));
    assert.equal(mid.fulfillment.cancelRequested, true, JSON.stringify(mid));
    assert.equal(mid.fulfillment.drained, false, JSON.stringify(mid));
    assert.equal(mid.review.active, 1, JSON.stringify(mid));
    assert.equal(mid.review.cancelRequested, false, JSON.stringify(mid));
    const afterDelay = await drain();
    assert.equal(afterDelay.review.active, 0, JSON.stringify(afterDelay));
    assert.equal(afterDelay.fulfillment.active, 0, JSON.stringify(afterDelay));
    const recovered = await ask('GET', paidReview, {cookie});
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    assert.equal(recovered.body.value.entitled.disposition.projection, 'native_paid');
    assert.equal(recovered.body.value.fulfillment.paid, true);

    events.length = 0;
    probe.mode = 'hold-session';
    const hanging = openRequest(origin, tls.ca, 'GET', paidReview, {cookie, timeout: 20000});
    const settled = hanging.done.then(
      value => value,
      error => ({status: 0, body: {error: String(error?.message || error)}, at: Date.now()}),
    );
    await waitFor(() => events.some(event => event.kind === 'session-held'), 8000);
    hanging.req.destroy();
    await sleep(150);
    releaseHeld();
    const disconnected = await settled;
    assert.notEqual(disconnected.status, 200, JSON.stringify(disconnected.body));
    assert.equal(disconnected.body?.value?.fulfillment?.paid, undefined);
    assert.equal(events.some(event => event.kind === 'enroll' || event.kind === 'enroll-sent'), false, JSON.stringify(events));
    const afterDisconnect = await drain();
    assert.equal(afterDisconnect.review.active, 0, JSON.stringify(afterDisconnect));
    assert.equal(afterDisconnect.fulfillment.active, 0, JSON.stringify(afterDisconnect));
    const afterDisconnectPaid = await ask('GET', paidReview, {cookie});
    assert.equal(afterDisconnectPaid.status, 200, JSON.stringify(afterDisconnectPaid.body));
    assert.equal(afterDisconnectPaid.body.value.fulfillment.paid, true);

    const gate = boundedReview({timeoutMs: 40});
    let late = 0;
    const rawQuery = admin.query.bind(admin);
    admin.query = function (...args) {
      if (textOf(args).includes('late_binding')) late += 1;
      return rawQuery(...args);
    };
    try {
      await admin.query('BEGIN READ ONLY');
      await admin.query('SET LOCAL search_path TO cj227_earned_work');
      await admin.query("SET LOCAL statement_timeout = '2500ms'");
      const directReq = {
        headers: {cookie},
        aborted: false,
        socket: {destroyed: false, on() {}, off() {}},
        on() {}, off() {},
      };
      const direct = await readEntitledOutcome(admin, directReq, {
        taskId: paid.taskId,
        reservationId: paid.reservationId,
        nowMs: () => Date.now(),
        registryRoot,
        rpcUrl: stub.url,
        readAcceptedSource: async () => null,
        fulfillmentReceiving: gate,
        assertBound: async tx => {
          await sleep(120);
          await tx.query('SELECT 1 AS late_binding');
        },
      });
      assert.equal(direct.entitled.disposition.projection, 'unknown');
      assert.equal(direct.fulfillment.paid, false);
      await sleep(200);
      assert.equal(late, 0);
      assert.equal(gate.status().active, 0);
      assert.equal(gate.status().drained, true);
      await admin.query('COMMIT');
    } finally {
      admin.query = rawQuery;
      await admin.query('ROLLBACK').catch(() => {});
    }

    const {bindReadLifetime} = await import(pathToFileURL(path.join(vendor, 'src/bounded-review.mjs')).href);
    await admin.query('BEGIN READ ONLY');
    await admin.query("SET LOCAL statement_timeout = '2500ms'");
    const slept = bindReadLifetime(admin);
    const startedSleep = Date.now();
    const slow = slept.client.query('SELECT pg_sleep(0.25) AS slept');
    await slept.quiesce();
    assert.ok(Date.now() - startedSleep >= 200);
    const slowResult = await slow;
    assert.equal(slowResult.rows.length, 1);
    assert.throws(() => slept.client.query('SELECT 1'), error => error.codeName === 'read_cancelled');
    await admin.query('ROLLBACK');

    await admin.query('BEGIN READ ONLY');
    await admin.query("SET LOCAL statement_timeout = '200ms'");
    const timed = bindReadLifetime(admin);
    await assert.rejects(timed.client.query('SELECT pg_sleep(2)'));
    await timed.quiesce();
    await admin.query('ROLLBACK');

    const pool = new pg.Pool({connectionString: cluster.connectionString, max: 2, connectionTimeoutMillis: 10000});
    pool.on('error', () => {});
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query('BEGIN');
      const fenced = bindReadLifetime(first);
      await fenced.client.query('SELECT 1');
      await fenced.quiesce();
      await first.query('COMMIT');
      first.release();
      await second.query('BEGIN');
      await second.query("SELECT set_config('root1208.borrower', 'other', true)");
      let touched = 0;
      const firstQuery = first.query.bind(first);
      first.query = (...args) => { touched += 1; return firstQuery(...args); };
      assert.throws(() => fenced.client.query('SELECT 1 AS after_release'), error => error.codeName === 'read_cancelled');
      assert.equal(touched, 0);
      const borrower = await second.query("SELECT current_setting('root1208.borrower', true) AS v");
      assert.equal(borrower.rows[0].v, 'other');
      await second.query('ROLLBACK');
    } finally {
      second.release();
      await pool.end();
    }
  } finally {
    probe.mode = 'idle';
    releaseHeld();
    if (market) await drain(10000).catch(() => {});
    if (httpsServer) await new Promise(resolve => httpsServer.close(resolve));
    if (market) await market.close().catch(() => {});
    if (stub) await new Promise(resolve => stub.server.close(resolve));
    await admin.end().catch(() => {});
    await cluster.stop().catch(() => {});
    await rm(work, {recursive: true, force: true});
    pg.Client.prototype.query = originalQuery;
    if (savedMachine === undefined) delete process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
    else process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE = savedMachine;
  }
});
