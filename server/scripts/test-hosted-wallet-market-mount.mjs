import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {mountHostedWalletMarketAdapter} from '../lib/hosted-wallet-market-mount.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = '/api/neomorphic-contributor-journey';

function fakeApp() {
  const layers = [];
  return {layers, use(fn) { layers.push(fn); }, set() {}};
}

function valid(overrides = {}) {
  return {
    mode: 'private',
    label: 'PRIVATE',
    chain: 'eip155:9',
    payments: 'off',
    publicReads: '0',
    fundedTasks: 'off',
    humanAssets: 'off',
    tls: 'verified-edge',
    origin: 'https://wallet.internal.example',
    tenant: 'private-mount',
    earnedSchema: 'cj227_earned_work',
    schemaName: 'hosted_wallet_market',
    listenHost: '127.0.0.1',
    databaseUrl: 'postgresql://ae14_j1@10.0.0.8:5432/private_wallet?sslmode=verify-full',
    rpcUrl: 'https://rpc.internal.example:8545',
    env: {},
    ...overrides,
  };
}

function dispatch(app, url) {
  return new Promise(resolve => {
    const req = {url, originalUrl: url, method: 'GET', headers: {}};
    const res = {
      statusCode: 0,
      headersSent: false,
      writableEnded: false,
      body: '',
      writeHead(status) {
        this.statusCode = status;
        this.headersSent = true;
      },
      end(payload) {
        this.body = payload ? String(payload) : '';
        this.writableEnded = true;
        resolve(this);
      },
    };
    let index = 0;
    const next = () => {
      const layer = app.layers[index++];
      if (!layer) {
        res.statusCode = 204;
        resolve(res);
        return undefined;
      }
      try {
        const out = layer(req, res, next);
        if (out && typeof out.then === 'function') {
          out.catch(error => {
            res.statusCode = 500;
            res.body = String(error?.message || error);
            resolve(res);
          });
        }
        return out;
      } catch (error) {
        res.statusCode = 500;
        res.body = String(error?.message || error);
        resolve(res);
        return undefined;
      }
    };
    next();
  });
}

test('app.js registers the hosted market before the contributor journey', () => {
  const source = readFileSync(join(root, 'server/app.js'), 'utf8');
  const market = source.indexOf('mountHostedWalletMarketAdapter');
  const journey = source.indexOf('mountContributorManagedDesk(app');
  assert.equal(market > 0, true);
  assert.equal(journey > market, true);
  assert.equal(source.includes('options.hostedWalletMarket'), true);
});

test('unset mode registers nothing', () => {
  const app = fakeApp();
  const disabled = mountHostedWalletMarketAdapter(app, {env: {HOSTED_WALLET_MARKET_PAYMENTS: 'on'}});
  assert.equal(disabled.mounted, false);
  assert.equal(disabled.status, 'disabled');
  assert.equal(app.layers.length, 0);
});

test('invalid config refuses before the adapter is called', () => {
  const app = fakeApp();
  let called = false;
  const adapter = {mountHostedWalletMarket() { called = true; }};
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({mode: 'live', adapter})), error => error.codeName === 'mode_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({payments: 'on', adapter})), error => error.codeName === 'payments_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({chain: 'eip155:1', adapter})), error => error.codeName === 'chain_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({chain: 'eip155:8453', adapter})), error => error.codeName === 'chain_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({chain: 'eip155:84532', adapter})), error => error.codeName === 'chain_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({databaseUrl: 'postgresql://ae14_j1@10.0.0.8/private_wallet', adapter})), error => error.codeName === 'database_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({fundedTasks: 'on', adapter})), error => error.codeName === 'funded_tasks_refused');
  assert.throws(() => mountHostedWalletMarketAdapter(app, valid({humanAssets: 'on', adapter})), error => error.codeName === 'human_assets_refused');
  assert.equal(called, false);
  assert.equal(app.layers.length, 0);
});

test('a valid profile with no entry is integration_pending and does not fall through', async () => {
  const app = fakeApp();
  const pending = mountHostedWalletMarketAdapter(app, valid());
  assert.equal(pending.status, 'integration_pending');
  const hit = await dispatch(app, `${PREFIX}/healthz`);
  assert.equal(hit.statusCode, 503);
  assert.equal(JSON.parse(hit.body).code, 'integration_pending');
  const outside = await dispatch(app, '/outside');
  assert.equal(outside.statusCode, 204);
});

test('a supplied adapter receives the prefix and other paths fall through', async () => {
  const app = fakeApp();
  let seen;
  const adapter = {
    async mountHostedWalletMarket(target, options) {
      seen = options;
      target.use((req, res, next) => {
        const path = String(req.originalUrl || req.url || '').split('?')[0];
        if (!path.startsWith(PREFIX)) return next();
        if (path === `${PREFIX}/healthz`) {
          res.writeHead(200);
          res.end(JSON.stringify({ok: true, label: options.label}));
          return undefined;
        }
        return next();
      });
      return {async close() {}};
    },
  };
  const mounted = mountHostedWalletMarketAdapter(app, valid({adapter}));
  assert.equal(mounted.mounted, true);
  assert.equal(typeof mounted.opened?.then, 'function');
  await mounted.opened;
  const health = await dispatch(app, `${PREFIX}/healthz`);
  assert.equal(health.statusCode, 200);
  assert.equal(JSON.parse(health.body).label, 'PRIVATE');
  assert.equal(seen.payments, 'off');
  assert.equal(seen.chain, 'eip155:9');
  assert.equal(seen.databaseUrl.includes('10.0.0.8'), true);
  const missed = await dispatch(app, `${PREFIX}/v1/status`);
  assert.equal(missed.statusCode, 204);
  const outside = await dispatch(app, '/outside');
  assert.equal(outside.statusCode, 204);
  await mounted.close();
});

test('opened surfaces adapter startup refusal', async () => {
  const app = fakeApp();
  const adapter = {
    async mountHostedWalletMarket() {
      throw Object.assign(new Error('guard_unsealed'), {codeName: 'guard_unsealed'});
    },
  };
  const mounted = mountHostedWalletMarketAdapter(app, valid({adapter}));
  await assert.rejects(mounted.opened, error => error.codeName === 'guard_unsealed');
  const hit = await dispatch(app, `${PREFIX}/healthz`);
  assert.equal(hit.statusCode, 503);
  assert.equal(JSON.parse(hit.body).code, 'guard_unsealed');
  await mounted.close();
});
