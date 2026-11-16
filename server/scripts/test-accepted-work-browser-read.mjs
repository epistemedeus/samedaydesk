import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer, request} from 'node:http';
import test from 'node:test';
import express from 'express';
import {createContributorEdgeGuard} from '../lib/contributor-managed-mount.js';
import {createContributorIngress} from '../lib/contributor-native-ingress.js';
import {mountHostedWalletMarketAdapter} from '../lib/hosted-wallet-market-mount.js';

const own = 'https://samedaydesk.example';
const other = 'https://neomorphic.example';
const prefix = '/api/neomorphic-contributor-journey/v1';
const list = prefix + '/market/accepted-work';
const item = list + '/market-' + 'b'.repeat(64);

// Real Express/HTTP mount and selected listener. The public producer is a
// fixture; the existing DB acceptance tests own publication and consent.
async function harness(t, flag) {
  const env = {
    CONTRIBUTOR_JOURNEY_MODE: 'live',
    CONTRIBUTOR_JOURNEY_INSTALLED: '1',
    CONTRIBUTOR_JOURNEY_ORIGIN: own,
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: '1',
    CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF: 'review_browser_transport_test',
    CONTRIBUTOR_JOURNEY_PUBLIC_ACCEPTED_WORK_BROWSER_READS: flag,
    CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: '["127.0.0.1"]',
  };
  const app = express();
  const edge = createContributorIngress(env);
  const guard = createContributorEdgeGuard(env, edge);
  const seen = [];
  let published = true;
  let withdrawn = false;
  const mount = mountHostedWalletMarketAdapter(app, {
    env, ingress: guard, mode: 'private', label: 'PRIVATE', chain: 'eip155:9',
    payments: 'off', publicReads: '0', fundedTasks: 'off', humanAssets: 'off', tls: 'verified-edge',
    origin: own, tenant: 'public-browser-test', earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market',
    listenHost: '127.0.0.1', databaseUrl: 'postgresql://ae14_j1@10.0.0.8/private_wallet?sslmode=verify-full',
    rpcUrl: 'https://rpc.internal.example:8545',
    adapter: {
      async mountHostedWalletMarket(target) {
        target.use((req, res, next) => {
          seen.push({path: req.path, origin: req.headers.origin});
          if (published && req.method === 'GET' && [list, item, item + '/artifact'].includes(req.path)) {
            if (withdrawn && req.path !== list) return res.status(404).json({ok: false, code: 'not_found'});
            return res.json({ok: true, value: req.path === list ? (withdrawn ? [] : ['consented']) : 'consented'});
          }
          return next();
        });
        return {async close() {}};
      },
    },
  });
  app.use(guard, (_req, res) => res.status(418).json({code: 'other_consumer'}));
  const server = createServer(app);
  t.after(async () => {
    edge.close();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await mount.close();
  });
  assert.equal(edge.bindListener(server), true);
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const read = (path, {method = 'GET', headers = {}} = {}) => new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1', port: server.address().port, method, path,
      headers: {host: 'samedaydesk.example', 'x-forwarded-proto': 'https', ...headers},
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: raw ? JSON.parse(raw) : null}));
    });
    req.on('error', reject);
    req.end();
  });
  return {read, seen, withdraw: () => { withdrawn = true; }, unpublish: () => { published = false; }};
}

test('anonymous cross-origin GET reads only the three public routes after the trusted ingress', async t => {
  const {read, seen, withdraw, unpublish} = await harness(t, '1');
  for (const path of [list + '?limit=1', item, item + '/artifact']) {
    const result = await read(path, {headers: {origin: other}});
    assert.equal(result.status, 200);
    assert.equal(result.headers['access-control-allow-origin'], '*');
    assert.equal(result.headers.vary, 'Origin');
    assert.equal(result.headers['access-control-allow-credentials'], undefined);
    assert.equal(seen.at(-1).origin, other);
  }
  const local = await read(list, {headers: {origin: 'http://127.0.0.1:4100'}});
  assert.equal(local.headers['access-control-allow-origin'], '*');
  for (const headers of [{}, {origin: own, cookie: 'same_origin=fixture'}]) {
    const direct = await read(list, {headers});
    assert.equal(direct.status, 200);
    assert.equal(direct.headers['access-control-allow-origin'], undefined);
  }

  withdraw();
  const revoked = await read(item + '/artifact', {headers: {origin: other}});
  assert.equal(revoked.status, 404);
  assert.equal(revoked.headers['access-control-allow-origin'], '*');
  assert.deepEqual(revoked.body, {ok: false, code: 'not_found'});
  unpublish();
  const disabled = await read(list, {headers: {origin: other}});
  assert.deepEqual(disabled.body, {ok: false, code: 'not_found'});
  assert.equal(disabled.headers['access-control-allow-origin'], undefined);
});

test('same guard refuses other routes, mutations, credentials and untrusted transport', async t => {
  const {read, seen} = await harness(t, '1');
  const foreign = {origin: other};
  for (const path of [prefix + '/market/profile', prefix + '/account/session', list + '/',
    list + '/market-short', item + '/private', list + '/%2e']) {
    const result = await read(path, {headers: foreign});
    assert.equal(result.status, 403, path);
    assert.equal(result.headers['access-control-allow-origin'], undefined, path);
  }
  for (const method of ['POST', 'HEAD', 'OPTIONS']) {
    const result = await read(list, {method, headers: {...foreign, 'access-control-request-method': 'GET'}});
    assert.equal(result.status, 403, method);
    assert.equal(result.headers['access-control-allow-origin'], undefined, method);
  }
  for (const headers of [{...foreign, cookie: 'session=fixture'}, {...foreign, authorization: 'Bearer fixture'},
    {...foreign, 'proxy-authorization': 'Basic fixture'}, {origin: 'null'}, {origin: 'http://external.example'},
    {origin: [other, other]}, {origin: other + '/path'}]) {
    const result = await read(list, {headers});
    assert.equal(result.status, 403, JSON.stringify(headers));
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await read(list, {headers: {...foreign, host: 'wrong.example'}})).status, 421);
  assert.equal((await read(list, {headers: {...foreign, 'x-forwarded-proto': 'http'}})).status, 400);
  assert.deepEqual(seen, []);
});

test('transport opt-in is off by default', async t => {
  const {read, seen} = await harness(t);
  const foreign = await read(list, {headers: {origin: other}});
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers['access-control-allow-origin'], undefined);
  assert.deepEqual(seen, []);
  assert.equal((await read(list)).status, 200);
});
