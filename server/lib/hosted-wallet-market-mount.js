import {realpathSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import pg from 'pg';

const PREFIX = '/api/neomorphic-contributor-journey';
// Existing contributor browser/session/review routes retain their consumer.
// The maintained client sends this wire header on every request.
export const isWalletRequest = req => {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  return path.startsWith(PREFIX + '/v1/core/tasks') || path.startsWith(PREFIX + '/v1/market/') || path.startsWith(PREFIX + '/v1/native-debt') ||
    (path.startsWith(PREFIX + '/') && typeof req.headers?.['x-ae-wire-version'] === 'string');
};
const PUBLIC_CHAINS = new Set(['eip155:1', 'eip155:8453', 'eip155:84532']);
const LABEL = /^[A-Z][A-Z0-9_-]{1,32}$/;
const TENANT = /^[a-z][a-z0-9_-]{2,63}$/;
const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
const QUERY_KEYS = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'application_name']);

// Runtime path inside this SDS tree. Cold receiving imports this file.
// An absolute Pilot checkout or provider build directory is not an entry.
export const ARTIFACT_ENTRY = 'vendor/hosted-wallet-market/src/server.mjs';

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
    databaseUrl: options.databaseUrl !== undefined ? options.databaseUrl : env.CONTRIBUTOR_JOURNEY_DATABASE_URL ?? env.DATABASE_URL,
    rpcUrl: options.rpcUrl !== undefined ? options.rpcUrl : env.HOSTED_WALLET_MARKET_RPC,
    cert: options.cert,
    key: options.key,
    contract: options.contract,
    now: options.now,
    dischargeRegistry: options.dischargeRegistry ?? env.HOSTED_WALLET_MARKET_DISCHARGE_REGISTRY,
    feeRecipient: options.feeRecipient ?? env.HOSTED_WALLET_MARKET_FEE_RECIPIENT,
    settlementToken: options.settlementToken ?? env.HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN,
    replayKey: options.replayKey ?? env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
    readAcceptedSource: options.readAcceptedSource,
    machineProfile: options.machineProfile ?? env.HOSTED_WALLET_MARKET_MACHINE_PROFILE,
    machineAuthority: options.machineAuthority ?? env.HOSTED_WALLET_MARKET_MACHINE_AUTHORITY_MODULE,
    ownerToken: options.ownerToken ?? env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN ?? env.EARNED_WORK_OWNER_TOKEN,
  };
}

/**
 * Startup refusal for a set mode. The adapter repeats this check. Values are
 * not stored and the database URL is not logged.
 */
export function assertHostedWalletMarketConfig(input) {
  if (input.mode !== 'private') refuse('mode_refused');
  if (!LABEL.test(input.label || '')) refuse('label_refused');
  if (input.payments !== 'off') refuse('payments_refused');
  if (typeof input.chain !== 'string' || !/^eip155:[0-9]+$/.test(input.chain)) refuse('chain_refused');
  if (input.chain === 'eip155:1' || (PUBLIC_CHAINS.has(input.chain) && input.chain !== 'eip155:8453' && input.chain !== 'eip155:84532')) refuse('chain_refused');
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

/**
 * Unset entry is the packaged adapter. A set entry must be a relative path
 * inside this installation. Absolute paths and URLs are refused.
 */
export function resolveHostedWalletMarketEntry(sdsRoot, entry) {
  const root = resolve(sdsRoot);
  if (entry === undefined || entry === null || entry === '') entry = ARTIFACT_ENTRY;
  if (typeof entry !== 'string' || entry.startsWith('/') || entry.includes('://') || entry.includes('\\') || entry.split('/').includes('..')) {
    refuse('integration_pending');
  }
  const resolved = resolve(root, entry);
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || rel.startsWith('/')) refuse('integration_pending');
  try {
    const actual=relative(realpathSync(root),realpathSync(resolved));
    if(actual.startsWith('..')||actual.startsWith('/')) refuse('integration_pending');
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  return resolved;
}

async function openAdapter(adapter, entry, input, sdsRoot) {
  let loaded = adapter;
  if (!loaded) {
    const file = resolveHostedWalletMarketEntry(sdsRoot, entry);
    loaded = await import(pathToFileURL(file).href);
  }
  if (typeof loaded.mountHostedWalletMarket !== 'function') refuse('integration_pending');
  let layer;
  const market = await loaded.mountHostedWalletMarket({use(fn) { layer = fn; }}, {...input, sdsRoot});
  if (typeof layer !== 'function' || !market || typeof market.close !== 'function') refuse('integration_pending');
  return {layer, canonicalReceiving: market.canonicalReceiving, close: market.close.bind(market)};
}

/** Root CLI read-only counterpart of the installed mount. It cannot migrate,
 * enroll, import, sign, or select another package. The configured consumer must
 * already be bound; failure is retained as an unavailable proof, never paid. */
export async function openRootNativeDebtReceiving(env,readAcceptedSource) {
  if(!env.HOSTED_WALLET_MARKET_MODE)return null;
  const input=assertHostedWalletMarketConfig(configured({},env));
  const sdsRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  const member=name=>pathToFileURL(resolve(sdsRoot,'vendor/hosted-wallet-market/src',name)).href;
  const [{loadDeploymentProfile},{loadOwnerAuthority},{createInstalledDebtConsumer},{createCanonicalReceiving}]=await Promise.all([
    import(member('profile.mjs')),import(member('owner-authority.mjs')),import(member('native-debt.mjs')),import(member('canonical-receiving.mjs'))]);
  const profile=loadDeploymentProfile(input),authority=await loadOwnerAuthority(sdsRoot,{ownerToken:input.ownerToken});
  const pool=new pg.Pool({connectionString:input.databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:5000,idleTimeoutMillis:1000,allowExitOnIdle:true});
  pool.on('error',()=>{});
  const withReadClient=async fn=>{
    const client=await pool.connect();
    try{await client.query('BEGIN READ ONLY');await client.query(`SET LOCAL search_path TO ${profile.earnedSchema}`);
      const value=await fn(client);await client.query('COMMIT');return value;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  };
  const consumer=createInstalledDebtConsumer({profile,sdsRoot,registryRoot:input.dischargeRegistry,
    authorityPrincipalId:authority.principalId,readAcceptedSource});
  return {canonicalReceiving:createCanonicalReceiving({consumer,withReadClient,registryRoot:input.dischargeRegistry,rpcUrl:profile.rpcUrl,readAcceptedSource}),
    readNativeDebt:obligationId=>withReadClient(tx=>consumer.readNativeDebt(tx,obligationId)),close:()=>pool.end()};
}

/**
 * Mode unset registers nothing. Invalid config throws. The packaged adapter is
 * the entry when HOSTED_WALLET_MARKET_ENTRY is unset. A rejected open answers
 * 503 on the packed-client prefix and does not call next().
 * sdsRoot is this installation. Substituting another tree edits this pinned file.
 */
export function mountHostedWalletMarketAdapter(app, options = {}) {
  if (!app || typeof app.use !== 'function') refuse('mount_required');
  const env = options.env || process.env;
  const mode = options.mode !== undefined ? options.mode : env.HOSTED_WALLET_MARKET_MODE;
  if (mode === undefined || mode === '') return {mounted: false, status: 'disabled', async close() {}};
  const input = assertHostedWalletMarketConfig(configured(options, env));
  const adapter = options.adapter || null;
  const entry = options.entry !== undefined ? options.entry : env.HOSTED_WALLET_MARKET_ENTRY;
  const sdsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (!adapter) resolveHostedWalletMarketEntry(sdsRoot, entry);
  const pending = openAdapter(adapter, entry, input, sdsRoot);
  pending.catch(() => {});
  app.use((req, res, next) => {
    if (!isWalletRequest(req)) return next();
    const enter = () => pending.then(
      market => Promise.resolve(market.layer(req, res, next)).catch(error => send(res, 503, {ok: false, code: publicCode(error)})),
      error => send(res, 503, {ok: false, code: publicCode(error)}),
    );
    if (req.socket?.encrypted) return enter();
    if (typeof options.ingress === 'function') return options.ingress(req, res, enter);
    return send(res, 426, {ok: false, code: 'https_edge_required'});
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
