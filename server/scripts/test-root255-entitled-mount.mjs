import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {createRequire} from 'node:module';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import test from 'node:test';
import {ARTIFACT_ENTRY, isWalletRequest, resolveHostedWalletMarketEntry, mountHostedWalletMarketAdapter} from '../lib/hosted-wallet-market-mount.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = path.join(root, 'vendor/hosted-wallet-market');
const require = createRequire(pathToFileURL(path.join(vendor, 'package.json')));
const pg = require('pg');
const PREFIX = '/api/neomorphic-contributor-journey';
const BASE = '3d360fb7818835f9832893f60d3aeb9b98b9ffea';
const TENANT = 'root255-mount';
const DEST = `0x${'ab'.repeat(20)}`;
const SOURCE = `0x${'cd'.repeat(20)}`;
const FEE = `0x${'22'.repeat(20)}`;
const RAIL = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAID_BODY = 'SYNTHETIC-PAUSED-MAKE-REFUSAL-root255';
const OWED_BODY = 'SYNTHETIC-ACCEPTED-UNPAID-root255';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function git(args) {
  return spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
}
function padTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}
function hexBlock(blockNumber) {
  return `0x${BigInt(blockNumber).toString(16)}`;
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
function request(origin, ca, method, route, {body, key, cookie, proof, wire = true, authorization} = {}) {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const headers = {connection: 'close'};
  if (wire) headers['x-ae-wire-version'] = 'c0-1';
  if (key) headers['idempotency-key'] = key;
  if (cookie) headers.cookie = cookie;
  if (proof) headers['x-account-operation-proof'] = proof;
  if (authorization) headers.authorization = authorization;
  if (data) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(data.length);
  }
  return new Promise((resolve, reject) => {
    const req = https.request(`${origin}${route}`, {method, ca, headers, rejectUnauthorized: true, timeout: 20000}, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let parsed = null;
        try { parsed = JSON.parse(text || 'null'); } catch { parsed = {raw: text.slice(0, 200)}; }
        resolve({status: incoming.statusCode, body: parsed, headers: incoming.headers});
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(data ?? undefined);
  });
}
function oneHeader(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

test('cold import stays inside the artifact and non-vendor bytes stay at 3d360fb7', async () => {
  const file = resolveHostedWalletMarketEntry(root, undefined);
  assert.equal(file, path.join(root, ARTIFACT_ENTRY));
  assert.equal(path.relative(root, file).startsWith('..'), false);
  const pilotEntry = '/home/ubuntu/root239-cli-control-20261018/heavy-work/root239/tools/root71-hosted-wallet-market/src/server.mjs';
  assert.throws(() => resolveHostedWalletMarketEntry(root, pilotEntry), error => error.codeName === 'integration_pending');
  assert.equal(isWalletRequest({url: `${PREFIX}/v1/review?taskId=t&reservationId=r`, headers: {}}), false);
  assert.equal(isWalletRequest({url: `${PREFIX}/v1/review?taskId=t&reservationId=r`, headers: {'x-ae-wire-version': 'c0-1'}}), true);
  assert.equal(isWalletRequest({url: `${PREFIX}/v1/native-debt/enrollment`, headers: {}}), true);
  const loaded = await import(pathToFileURL(file).href);
  assert.equal(typeof loaded.mountHostedWalletMarket, 'function');
  assert.equal(file.includes(`${path.sep}vendor${path.sep}hosted-wallet-market${path.sep}`), true);
  assert.equal(file.includes(`${path.sep}root239${path.sep}`), false);
  const tracked = git(['diff', '--name-only', BASE]).stdout.split('\n').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean);
  const names = [...tracked, ...untracked];
  const allowed = name => name.startsWith('vendor/hosted-wallet-market/')
    || name === 'server/foundry/activation/private-control-pin.json'
    || name === 'server/scripts/test-root255-entitled-mount.mjs';
  assert.deepEqual(names.filter(name => !allowed(name)), []);
  const basePin = JSON.parse(git(['show', `${BASE}:server/foundry/activation/private-control-pin.json`]).stdout);
  const pin = JSON.parse(readFileSync(path.join(root, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  assert.deepEqual(pin.schema, basePin.schema);
  assert.deepEqual(pin.base, basePin.base);
  assert.deepEqual(pin.receivedCallerClosures, basePin.receivedCallerClosures);
  for (const [name, digest] of Object.entries(basePin.files)) {
    if (name.startsWith('vendor/hosted-wallet-market/')) continue;
    assert.equal(pin.files[name], digest, name);
  }
  assert.equal(git(['diff', '--exit-code', '--', 'vendor/hosted-wallet-market/ENTRY.md']).status, 0);
  assert.equal(git(['diff', '--exit-code', '--', 'client', 'server/app.js', 'server/lib/hosted-wallet-market-mount.js', 'vendor/neomorphic-contributor-journey']).status, 0);
});

test('mounted entitled read keeps no-header fallthrough, paid and owed, and succession rollback', async () => {
  const clusterPath = process.env.ROOT255_PG_CLUSTER;
  assert.equal(typeof clusterPath, 'string', 'ROOT255_PG_CLUSTER');
  assert.equal(path.isAbsolute(clusterPath), true);
  const {startCluster} = await import(pathToFileURL(clusterPath).href);
  const {
    applyAdditiveSchema, applyServingSchema,
  } = await import(pathToFileURL(path.join(vendor, 'src/migrate.mjs')).href);
  const {seedStaging} = await import(pathToFileURL(path.join(vendor, 'src/seed.mjs')).href);
  const {loadDeploymentProfile} = await import(pathToFileURL(path.join(vendor, 'src/profile.mjs')).href);
  const {writeStagingCerts} = await import(pathToFileURL(path.join(vendor, 'src/tls.mjs')).href);
  const debt = await import(pathToFileURL(path.join(vendor, 'src/native-debt.mjs')).href);
  const discharge = await import(pathToFileURL(path.join(vendor, 'src/native-obligation-discharge.mjs')).href);
  const {digest: canonicalDigest} = await import(pathToFileURL(path.join(vendor, 'src/canonical.mjs')).href);
  const {nativeEnvelope} = await import(pathToFileURL(path.join(vendor, 'src/retained-award-validate.mjs')).href);
  const paidTerms = `sha256:${sha256('root255-paid-terms')}`;
  const owedTerms = `sha256:${sha256('root255-owed-terms')}`;
  const paidBytes = Buffer.from(PAID_BODY);
  const owedBytes = Buffer.from(OWED_BODY);
  const paid = {taskId: 'task_root255paid0001', reservationId: 'rsv_root255paid0001', obligationId: 'obl_root255paid0001'};
  const owed = {taskId: 'task_root255owed0001', reservationId: 'rsv_root255owed0001', obligationId: 'obl_root255owed0001'};
  const work = await mkdtemp(path.join(tmpdir(), 'root255-mount-'));
  const registryRoot = path.join(work, 'registry');
  mkdirSync(registryRoot, {recursive: true, mode: 0o700});
  chmodSync(registryRoot, 0o700);
  const receipts = new Map();
  const blocks = new Map();
  const cluster = await startCluster();
  const admin = new pg.Client({connectionString: cluster.connectionString, connectionTimeoutMillis: 10000});
  let stub;
  let httpsServer;
  let mounted;
  const ownerToken = `ew_${randomBytes(18).toString('base64url')}`;
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
      dischargeRegistry: registryRoot, replayKey: randomBytes(32).toString('hex'), ownerToken,
      readAcceptedSource: async () => null,
    };
    const app = {layers: [], use(fn) { this.layers.push(fn); }, set() {}};
    mounted = mountHostedWalletMarketAdapter(app, profileInput);
    await mounted.opened;
    assert.equal(app.layers.length, 1);
    httpsServer = https.createServer({key: tls.key, cert: tls.cert}, (req, res) => {
      const layer = app.layers[0];
      Promise.resolve(layer(req, res, () => {
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(204);
          res.end();
        }
      })).catch(error => {
        if (!res.headersSent) {
          res.writeHead(500, {'content-type': 'application/json'});
          res.end(JSON.stringify({ok: false, code: 'test_layer_failed', message: String(error?.message || error).slice(0, 180)}));
        }
      });
    });
    await new Promise((resolve, reject) => httpsServer.once('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${httpsServer.address().port}`;
    const proof = randomBytes(32).toString('base64url');
    const signup = await request(origin, tls.ca, 'POST', `${PREFIX}/v1/account/signup`, {
      body: {password: `pw-${randomBytes(18).toString('base64url')}`, displayName: 'MountReq', role: 'requester'},
      key: 'root255signup01', proof,
    });
    assert.equal(signup.status, 200, JSON.stringify(signup.body));
    const cookie = String(oneHeader(signup.headers, 'set-cookie') || '').split(';')[0];
    const accountId = signup.body.value.account.accountId;
    const stamp = new Date('2026-10-14T08:19:30.261Z');
    async function insertWork(spec, evidence, amount) {
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_tasks (
          id, title, summary, provenance, lifecycle, funding_state, payout_state,
          current_terms_version, terms_revision, schema_version, correction_max_revisions,
          budget_amount, budget_asset, budget_network, created_at, updated_at
        ) VALUES ($1, $2, 'Synthetic mounted fixture.', 'test', 'accepted', 'reserved', 'owed', $3, 1, 1, 1, $4, 'USDC', 'eip155:8453', $5, $5)`,
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
        ) VALUES ($1, $2, $3, $4, $5, $6, 'root255', 'pass', $7::jsonb, 1, $8)`,
        [spec.verdictId, spec.taskId, spec.reservationId, spec.submissionId, spec.terms, sha256(evidence), JSON.stringify({outcome: 'pass'}), stamp],
      );
      await admin.query(
        `INSERT INTO cj227_earned_work.earned_work_obligations (
          id, task_id, reservation_id, submission_id, contributor_public_id, payout_destination,
          reward_amount, reward_asset, reward_network, payout_state, terms_version, idempotency_key, adapter, verdict_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USDC', 'eip155:8453', 'owed', $8, $9, 'root255', $10, $11)`,
        [spec.obligationId, spec.taskId, spec.reservationId, spec.submissionId, spec.publicId, DEST, amount, spec.terms, spec.idempotencyKey, spec.verdictId, stamp],
      );
    }
    await insertWork({...paid, terms: paidTerms, tokenId: 'tok_root255paid0001', publicId: 'pub_root255paid0001', submissionId: 'sub_root255paid0001', verdictId: 'ver_root255paid0001', artifactRef: 'synthetic:paid', idempotencyKey: 'root255-paid'}, paidBytes, '0.120000');
    await insertWork({...owed, terms: owedTerms, tokenId: 'tok_root255owed0001', publicId: 'pub_root255owed0001', submissionId: 'sub_root255owed0001', verdictId: 'ver_root255owed0001', artifactRef: 'synthetic:owed', idempotencyKey: 'root255-owed'}, owedBytes, '0.080000');
    const expiry = new Date(Date.now() + 3600000);
    for (const spec of [
      [paid.taskId, paidTerms],
      [owed.taskId, owedTerms],
    ]) {
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
      claimId: paid.reservationId, submissionId: 'sub_root255paid0001', verdictId: 'ver_root255paid0001',
      termsVersion: paidTerms, artifactDigestSha256: sha256(paidBytes), roundId: 'round-root255',
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
    }).expectedBinding();
    const predecessor = sha256('enrolled-predecessor-root255-mount');
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
    // Synthetic predecessor enrollment includes its original authenticated
    // operation, just as the real old artifact records in the cold handoff test.
    await admin.query(`INSERT INTO cj227_earned_work.earned_work_idempotency
      (scope,task_id,key,request_hash,status_code,response_json,principal_id,created_at)
      VALUES ('hosted-wallet-market','','fixture-original-enroll',$1,200,$2::jsonb,$3,$4)`,[
      canonicalDigest({method:'POST',route:`${PREFIX}/v1/native-debt/enroll`,body:{}}),
      JSON.stringify({value:{schema:'pilot.root71.native-debt.enrollment.v1',state:'enrolled',qualified:true,
        sourceSha256:predecessor,hostSourceSha256:next.host_source_sha256,importContractSha256:next.import_contract_sha256,
        consumerContractSha256:next.consumer_contract_sha256,tenant:next.tenant,network:next.network,token:next.token,
        rpcOriginSha256:next.rpc_origin_sha256,rpcEndpointSha256:next.rpc_endpoint_sha256,profileChain:next.profile_chain,
        profileSha256:next.profile_sha256,boundConsumer:'hosted_wallet_market.native_debt_dispositions'}}),
      sha256(ownerToken),stamp]);
    await admin.query(
      `INSERT INTO hosted_wallet_market.native_debt_dispositions (
        obligation_id, obligation_family, tenant, reservation_id, claim_id, submission_id, verdict_id,
        artifact_digest_sha256, task_id, terms_version, network, token, recipient, transaction_hash,
        log_index, block_number, block_hash, block_timestamp, consumer_contract_sha256, authority_receipt_sha256,
        request_sha256, amount_atomic, receipt_id, received_at, import_contract_sha256, import_state, disposition,
        kernel_paid, kernel_transfer, native_paid_observation, transfer_initiated, payout_state, observed_source, created_at
      ) VALUES (
        $1, 'earned', $2, $3, $3, 'sub_root255paid0001', 'ver_root255paid0001', $4, $5, $6, 'eip155:8453', $7, $8,
        $9, 7, '42', $10, $11, $12, $13, $14, '120000', $15, $11, $16, 'bound', 'external_discharge_allocated',
        TRUE, $9, TRUE, FALSE, 'owed', $17, $11
      )`,
      [paid.obligationId, TENANT, paid.reservationId, sha256(paidBytes), paid.taskId, paidTerms, RAIL, DEST,
        txHash, blockHash, stamp, next.consumer_contract_sha256, authoritySha, sha256('request'), receipt.receiptId, debt.IMPORT_CONTRACT_SHA256, SOURCE],
    );
    async function counts() {
      const dispositions = await admin.query('SELECT count(*)::int AS n FROM hosted_wallet_market.native_debt_dispositions');
      const obligations = await admin.query("SELECT id, payout_state FROM cj227_earned_work.earned_work_obligations ORDER BY id");
      const accounts = await admin.query('SELECT count(*)::int AS n FROM cj227_earned_work.journey_accounts');
      return {dispositions: dispositions.rows[0].n, obligations: obligations.rows, accounts: accounts.rows[0].n};
    }
    const before = await counts();
    const review = `${PREFIX}/v1/review?taskId=${encodeURIComponent(paid.taskId)}&reservationId=${encodeURIComponent(paid.reservationId)}`;
    const noHeader = await request(origin, tls.ca, 'GET', review, {cookie, wire: false});
    assert.equal(noHeader.status, 204, JSON.stringify(noHeader.body));
    assert.equal(JSON.stringify(noHeader.body).includes(PAID_BODY), false);
    const held = await request(origin, tls.ca, 'GET', review, {cookie});
    assert.equal(held.status, 409, JSON.stringify(held.body));
    assert.equal(held.body.code, 'stale_evidence');
    const thin = await request(origin, tls.ca, 'GET', `${PREFIX}/v1/review?reservationId=${paid.reservationId}`, {cookie});
    assert.equal(thin.status, 200, JSON.stringify(thin.body));
    assert.equal(thin.body.value.fulfillment.paid, false);
    assert.equal(JSON.stringify(thin.body).includes(PAID_BODY), false);
    const upgraded = await request(origin, tls.ca, 'POST', `${PREFIX}/v1/native-debt/enroll`, {
      body: {}, key: 'root255enroll01', authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(upgraded.status, 200, JSON.stringify(upgraded.body));
    assert.equal(upgraded.body.value.qualified, true);
    assert.equal(upgraded.body.value.sourceSha256, predecessor);
    const entitled = await request(origin, tls.ca, 'GET', review, {cookie});
    assert.equal(entitled.status, 200, JSON.stringify(entitled.body));
    assert.equal(entitled.body.value.entitled.artifact.body, PAID_BODY);
    assert.equal(entitled.body.value.entitled.fulfillment.paid, true);
    assert.equal(entitled.body.value.entitled.disposition.projection, 'native_paid');
    assert.equal(entitled.body.value.entitled.disposition.payoutState, 'owed');
    assert.equal(entitled.body.value.entitled.businessStatus, 'refused');
    assert.equal(entitled.body.value.entitled.usefulOutcome, null);
    const owedRead = await request(origin, tls.ca, 'GET', `${PREFIX}/v1/review?taskId=${encodeURIComponent(owed.taskId)}&reservationId=${encodeURIComponent(owed.reservationId)}`, {cookie});
    assert.equal(owedRead.status, 200, JSON.stringify(owedRead.body));
    assert.equal(owedRead.body.value.entitled.artifact.body, OWED_BODY);
    assert.equal(owedRead.body.value.entitled.disposition.projection, 'owed');
    assert.equal(owedRead.body.value.entitled.disposition.payable, true);
    assert.equal(owedRead.body.value.entitled.fulfillment.paid, false);
    assert.deepEqual(await counts(), before);
    await admin.query('DROP TABLE hosted_wallet_market.source_succession');
    const afterDrop = await request(origin, tls.ca, 'GET', review, {cookie});
    assert.equal(afterDrop.status, 409, JSON.stringify(afterDrop.body));
    assert.equal(afterDrop.body.code, 'stale_evidence');
    const still = await counts();
    assert.equal(still.dispositions, 1);
    assert.deepEqual(still.obligations, before.obligations);
    assert.equal(still.accounts, before.accounts);
    const enrollment = await admin.query('SELECT source_sha256 FROM hosted_wallet_market.consumer_enrollment');
    assert.equal(enrollment.rows[0].source_sha256, predecessor);
    await applyAdditiveSchema(admin);
    const empty = await admin.query('SELECT count(*)::int AS n FROM hosted_wallet_market.source_succession');
    assert.equal(empty.rows[0].n, 0);
    const again = await request(origin, tls.ca, 'POST', `${PREFIX}/v1/native-debt/enroll`, {
      body: {}, key: 'root255enroll02', authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.value.sourceSha256, predecessor);
    const restored = await request(origin, tls.ca, 'GET', review, {cookie});
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.value.entitled.fulfillment.paid, true);
    assert.equal(restored.body.value.entitled.artifact.body, PAID_BODY);
    assert.deepEqual(await counts(), before);
    const caller = await request(origin, tls.ca, 'POST', `${PREFIX}/v1/native-debt/enroll`, {
      body: {sourceSha256: predecessor}, key: 'root255enroll03', authorization: `Bearer ${ownerToken}`,
    });
    assert.equal(caller.status, 400, JSON.stringify(caller.body));
    assert.equal(caller.body.code, 'body_refused');
  } finally {
    if (httpsServer) await new Promise(resolve => httpsServer.close(resolve));
    if (mounted) await mounted.close();
    if (stub) await new Promise(resolve => stub.server.close(resolve));
    await admin.end().catch(() => {});
    await cluster.stop();
    await rm(work, {recursive: true, force: true});
  }
});
