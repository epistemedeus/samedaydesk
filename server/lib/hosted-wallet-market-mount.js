import {pathToFileURL} from 'node:url';

const PREFIX = '/api/neomorphic-contributor-journey';
const PUBLIC_CHAINS = new Set(['eip155:1', 'eip155:8453', 'eip155:84532']);
const LABEL = /^[A-Z][A-Z0-9_-]{1,32}$/;
const TENANT = /^[a-z][a-z0-9_-]{2,63}$/;
const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
const QUERY_KEYS = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'application_name']);

function refuse(code) {
  throw Object.assign(new Error(code), {codeName: code});
}

function publicCode(error) {
  const named = error?.codeName;
  if (typeof named === 'string' && /^[a-z0-9_]+$/.test(named)) return named;
  return 'integration_pending';
}

function send(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function configured(options, env) {
  const pick = (field, key) => (options[field] !== undefined ? options[field] : env[key]);
  return {
    mode: pick('mode', 'HOSTED_WALLET_MARKET_MODE'),
    label: pick('label', 'HOSTED_WALLET_MARKET_LABEL'),
    chain: pick('chain', 'HOSTED_WALLET_MARKET_CHAIN'),
    payments: pick('payments', 'HOSTED_WALLET_MARKET_PAYMENTS'),
    publicReads: pick('publicReads', 'HOSTED_WALLET_MARKET_PUBLIC_READS'),
    fundedTasks: pick('fundedTasks', 'HOSTED_WALLET_MARKET_FUNDED_TASKS'),
    humanAssets: pick('humanAssets', 'HOSTED_WALLET_MARKET_HUMAN_ASSETS'),
    tls: pick('tls', 'HOSTED_WALLET_MARKET_TLS'),
    origin: pick('origin', 'HOSTED_WALLET_MARKET_ORIGIN'),
    tenant: pick('tenant', 'HOSTED_WALLET_MARKET_TENANT'),
    earnedSchema: pick('earnedSchema', 'HOSTED_WALLET_MARKET_EARNED_SCHEMA'),
    schemaName: pick('schemaName', 'HOSTED_WALLET_MARKET_SCHEMA'),
    listenHost: pick('listenHost', 'HOSTED_WALLET_MARKET_LISTEN_HOST') || '127.0.0.1',
    databaseUrl: options.databaseUrl !== undefined ? options.databaseUrl : env.DATABASE_URL,
    rpcUrl: options.rpcUrl !== undefined ? options.rpcUrl : env.HOSTED_WALLET_MARKET_RPC,
    cert: options.cert,
    key: options.key,
    contract: options.contract,
    now: options.now,
  };
}

/**
 * Startup refusal for a set mode. The adapter repeats this check. Values are
 * not stored and the database URL is not logged.
 */
export function assertHostedWalletMarketConfig(input) {
  if (input.mode !== 'private') refuse('mode_refused');
  if (!LABEL.test(input.label || '')) refuse('label_refused');
  if (typeof input.chain !== 'string' || !/^eip155:[0-9]+$/.test(input.chain) || PUBLIC_CHAINS.has(input.chain)) refuse('chain_refused');
  if (input.payments !== 'off') refuse('payments_refused');
  if (input.publicReads !== '0') refuse('public_reads_refused');
  if (input.fundedTasks !== 'off') refuse('funded_tasks_refused');
  if (input.humanAssets !== 'off') refuse('human_assets_refused');
  if (input.tls !== 'files' && input.tls !== 'verified-edge') refuse('tls_refused');
  if (input.tls === 'verified-edge') {
    let origin;
    try { origin = new URL(input.origin || ''); }
    catch { refuse('tls_refused'); }
    if (origin.protocol !== 'https:' || origin.origin !== input.origin || origin.username || origin.password) refuse('tls_refused');
  }
  if (input.tls === 'files' && (!input.cert || !input.key)) refuse('tls_refused');
  if (!TENANT.test(input.tenant || '')) refuse('tenant_refused');
  if (!IDENT.test(input.earnedSchema || '') || input.earnedSchema === 'public' || input.earnedSchema.startsWith('pg_')) refuse('schema_refused');
  if (input.schemaName !== 'hosted_wallet_market') refuse('schema_refused');
  if (input.listenHost === '0.0.0.0' || input.listenHost === '::' || String(input.listenHost).includes('/')) refuse('listen_refused');
  let url;
  try { url = new URL(input.databaseUrl || ''); }
  catch { refuse('database_refused'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.hash) refuse('database_refused');
  if ([...url.searchParams.keys()].some(key => !QUERY_KEYS.has(key))) refuse('database_refused');
  if (url.searchParams.get('sslmode') !== 'verify-full') refuse('database_refused');
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(name)) refuse('database_refused');
  let rpc;
  try { rpc = new URL(input.rpcUrl || ''); }
  catch { refuse('chain_url_refused'); }
  if (!['http:', 'https:'].includes(rpc.protocol) || !rpc.hostname || rpc.username || rpc.password || rpc.hash) refuse('chain_url_refused');
  return input;
}

async function openAdapter(adapter, entry, input) {
  let loaded = adapter;
  if (!loaded) {
    if (typeof entry !== 'string' || !entry.startsWith('/') || entry.includes('://')) refuse('integration_pending');
    loaded = await import(pathToFileURL(entry).href);
  }
  if (typeof loaded.mountHostedWalletMarket !== 'function') refuse('integration_pending');
  let layer;
  const market = await loaded.mountHostedWalletMarket({use(fn) { layer = fn; }}, input);
  if (typeof layer !== 'function' || !market || typeof market.close !== 'function') refuse('integration_pending');
  return {layer, close: market.close.bind(market)};
}

/**
 * Mode unset registers nothing. Invalid config throws. A missing adapter entry
 * answers 503 on the packed-client prefix and does not fall through.
 */
export function mountHostedWalletMarketAdapter(app, options = {}) {
  if (!app || typeof app.use !== 'function') refuse('mount_required');
  const env = options.env || process.env;
  const mode = options.mode !== undefined ? options.mode : env.HOSTED_WALLET_MARKET_MODE;
  if (mode === undefined || mode === '') return {mounted: false, status: 'disabled', async close() {}};
  const input = assertHostedWalletMarketConfig(configured(options, env));
  const adapter = options.adapter || null;
  const entry = options.entry !== undefined ? options.entry : env.HOSTED_WALLET_MARKET_ENTRY;
  if (!adapter && !entry) {
    app.use((req, res, next) => {
      const path = String(req.originalUrl || req.url || '').split('?')[0];
      if (!path.startsWith(PREFIX)) return next();
      send(res, 503, {ok: false, code: 'integration_pending'});
    });
    return {mounted: false, status: 'integration_pending', async close() {}};
  }
  const pending = openAdapter(adapter, entry, input);
  pending.catch(() => {});
  app.use((req, res, next) => {
    const path = String(req.originalUrl || req.url || '').split('?')[0];
    if (!path.startsWith(PREFIX)) return next();
    return pending.then(
      market => Promise.resolve(market.layer(req, res, next)).catch(error => send(res, 503, {ok: false, code: publicCode(error)})),
      error => send(res, 503, {ok: false, code: publicCode(error)}),
    );
  });
  return {
    mounted: true,
    status: 'opening',
    opened: pending,
    async close() {
      const market = await pending.catch(() => null);
      if (market) await market.close();
    },
  };
}
