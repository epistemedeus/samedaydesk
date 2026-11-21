// Child entry for one lsnode-shaped plaintext pipe. The parent supplies the socket.
// No qualification is loaded and no account, token, or body is logged.
// /admitted calls the writer directly. It is not the installation GET handler.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import express from 'express';
import {mountContributorManagedDesk} from '../../lib/contributor-managed-mount.js';
import {createContributorIngress} from '../../lib/contributor-native-ingress.js';
import {mountHostedWalletMarketAdapter} from '../../lib/hosted-wallet-market-mount.js';
import {createResponseCompletion, deliverJsonResponse} from '../../../vendor/hosted-wallet-market/src/response-completion.mjs';

const PREFIX = '/api/neomorphic-contributor-journey';
const marker = 'UNIQUE_BODY_MARKER';

function managedEnv(enabled) {
  return {
    CONTRIBUTOR_DESK_MANAGED_ENABLED: enabled,
    CONTRIBUTOR_JOURNEY_MODE: 'live',
    CONTRIBUTOR_JOURNEY_INSTALLED: '1',
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0',
    CONTRIBUTOR_JOURNEY_TRUST_PROXY: '0',
    CONTRIBUTOR_JOURNEY_ORIGIN: 'https://desk.invalid',
    CONTRIBUTOR_DESK_INGRESS_MODE: 'litespeed-https-only',
    CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: '[]',
    CONTRIBUTOR_DESK_ASSETS_ENABLED: '0',
    CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: 'a'.repeat(40),
  };
}

export async function start() {
  const socketPath = process.env.ROOT1156_SOCK;
  if (!socketPath || !socketPath.startsWith('/tmp/')) throw new Error('unix socket required');
  const loaderSha256 = createHash('sha256').update(readFileSync(process.argv[1])).digest('hex');
  const logs = [];
  const completion = createResponseCompletion(16, line => logs.push(line), {expiresAt: new Date(Date.now() + 60000).toISOString()});
  const ingress = createContributorIngress({CONTRIBUTOR_JOURNEY_MODE: 'disabled'});
  const readyDesk = mountContributorManagedDesk(express(), {env: managedEnv('1')});
  const directDesk = mountContributorManagedDesk(express(), {env: {
    CONTRIBUTOR_DESK_MANAGED_ENABLED: '0',
    CONTRIBUTOR_JOURNEY_MODE: 'disabled',
  }});
  const state = {entered: 0, admitted: null, second: null, destroyed: null, fallthrough: null};
  const app = express();
  app.disable('x-powered-by');
  const market = mountHostedWalletMarketAdapter(app, {
    mode: 'private', label: 'PRIVATE', chain: 'eip155:9', payments: 'off', publicReads: '0',
    fundedTasks: 'off', humanAssets: 'off', tls: 'verified-edge', origin: 'https://wallet.internal.example',
    tenant: 'private-mount', earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market',
    listenHost: '127.0.0.1', databaseUrl: 'postgresql://ae14_j1@10.0.0.8:5432/private_wallet?sslmode=verify-full',
    rpcUrl: 'https://rpc.internal.example:8545', env: {},
    adapter: {async mountHostedWalletMarket(target) {
      target.use((_req, res) => {
        state.entered += 1;
        deliverJsonResponse(res, 200, {ok: true, value: {marker: 'MARKET_ENTERED'}}, {}, completion);
      });
      return {close: async () => {}};
    }},
    ingress: (req, res, next) => readyDesk.guardRequest(req, res, next),
  });
  app.use('/plain-off', (req, res) => {
    if (req.socket?.encrypted) return deliverJsonResponse(res, 500, {ok: false, code: 'encrypted_bypass'}, {}, null);
    return directDesk.guardRequest(req, res, () => { state.entered += 1; });
  });
  app.use('/admitted', async (req, res) => {
    const admitted = ingress.litespeedRequest(req, loaderSha256);
    state.admitted = admitted;
    if (!admitted) {
      res.status(426).json({error: {code: 'qualified_unix_edge_required'}, admitted: false});
      return;
    }
    const mode = new URL(req.originalUrl || req.url, 'https://127.0.0.1').searchParams.get('case') || 'success';
    const body = {ok: true, value: {schema: 'pilot.funded-installed-source.v1', marker, case: mode}};
    if (mode === 'delayed') await new Promise(resolveDelay => setTimeout(resolveDelay, 40));
    if (mode === 'busy') return deliverJsonResponse(res, 503, {ok: false, code: 'installation_receiving_unavailable'}, {}, completion);
    if (mode === 'error') return deliverJsonResponse(res, 500, {ok: false, code: 'storage_failed'}, {}, completion);
    if (mode === 'twice') {
      deliverJsonResponse(res, 200, body, {}, completion);
      state.second = deliverJsonResponse(res, 500, {ok: false, code: 'second_end'}, {}, completion);
      res.on('error', error => { state.fallthrough = error.code; });
      res.end('FALLTHROUGH_MARKER');
      return;
    }
    if (mode === 'destroy') {
      res.destroy();
      state.destroyed = deliverJsonResponse(res, 200, {ok: true, value: {marker: 'DESTROYED_BODY'}}, {}, completion);
      return;
    }
    if (mode === 'off') return deliverJsonResponse(res, 200, body, {}, createResponseCompletion(0, line => logs.push(line)));
    return deliverJsonResponse(res, 200, body, {}, completion);
  });
  app.get('/report', (_req, res) => {
    const payload = Buffer.from(JSON.stringify({entered: state.entered, admitted: state.admitted, second: state.second, destroyed: state.destroyed, fallthrough: state.fallthrough, budget: completion.budget(), logs}));
    res.writeHead(200, {'content-type': 'application/json; charset=utf-8', 'content-length': String(payload.length), 'cache-control': 'no-store'});
    res.end(payload);
  });
  const server = createServer(app);
  if (!readyDesk.bindListener(server) || !ingress.bindListener(server)) throw new Error('listener bind refused');
  await market.opened;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolveListen);
  });
  process.stdout.write(`READY ${socketPath}\n`);
}
