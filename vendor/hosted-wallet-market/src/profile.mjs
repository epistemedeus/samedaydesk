import {acceptProfileChain} from './chain.mjs';

const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
const TENANT = /^[a-z][a-z0-9_-]{2,63}$/;
const LABEL = /^[A-Z][A-Z0-9_-]{1,32}$/;
const QUERY_KEYS = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'application_name']);

function refuse(code) {
  throw Object.assign(new Error(code), {codeName: code});
}

export function assertIdent(value, code = 'schema_refused') {
  if (typeof value !== 'string' || !IDENT.test(value) || value === 'public' || value.startsWith('pg_')) refuse(code);
  return value;
}

function databaseOf(raw) {
  let url;
  try { url = new URL(raw); }
  catch { refuse('database_refused'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.hash) refuse('database_refused');
  if ([...url.searchParams.keys()].some(key => !QUERY_KEYS.has(key))) refuse('database_refused');
  if (url.searchParams.get('sslmode') !== 'verify-full') refuse('database_refused');
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(name)) refuse('database_refused');
  return {url, host: url.hostname, name};
}

/**
 * Deployment profile. Host, database, and chain come from the caller.
 * Invalid profiles are refused. Nothing here is staging-only.
 */
export function loadDeploymentProfile(input = {}, {listen = false} = {}) {
  if (input.mode !== 'private') refuse('mode_refused');
  if (!LABEL.test(input.label || '')) refuse('label_refused');
  const accepted = acceptProfileChain(input.chain);
  const chain = accepted.chain;
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
  if (listen && (input.tls !== 'files' || !input.cert || !input.key)) refuse('tls_refused');
  if (!TENANT.test(input.tenant || '')) refuse('tenant_refused');
  const database = databaseOf(input.databaseUrl);
  const earnedSchema = assertIdent(input.earnedSchema);
  if (input.schemaName !== 'hosted_wallet_market') refuse('schema_refused');
  const listenHost = input.listenHost || '127.0.0.1';
  if (listenHost === '0.0.0.0' || listenHost === '::' || listenHost.includes('/') || !listenHost.trim()) refuse('listen_refused');
  if (listen && !input.rpcUrl) refuse('chain_url_refused');
  const feeRecipient = boundAddress(input.feeRecipient, 'fee_recipient_refused');
  const settlementToken = boundAddress(input.settlementToken, 'settlement_token_refused');
  return {
    mode: 'private',
    label: input.label,
    chain,
    publicChain: accepted.publicChain,
    payments: 'off',
    publicReads: '0',
    fundedTasks: 'off',
    humanAssets: 'off',
    tls: input.tls,
    origin: input.tls === 'verified-edge' ? input.origin : undefined,
    tenant: input.tenant,
    databaseUrl: input.databaseUrl,
    host: database.host,
    databaseName: database.name,
    earnedSchema,
    schemaName: 'hosted_wallet_market',
    listenHost,
    rpcUrl: input.rpcUrl,
    cert: input.cert,
    key: input.key,
    feeRecipient,
    settlementToken,
  };
}

function boundAddress(value, code) {
  if (typeof value !== 'string' || !/^0x[a-f0-9]{40}$/.test(value)) refuse(code);
  return value;
}

export const ADDITIVE_ENV_KEYS = Object.freeze([
  'HOSTED_WALLET_MARKET_MODE',
  'HOSTED_WALLET_MARKET_LABEL',
  'HOSTED_WALLET_MARKET_CHAIN',
  'HOSTED_WALLET_MARKET_SCHEMA',
  'HOSTED_WALLET_MARKET_EARNED_SCHEMA',
  'HOSTED_WALLET_MARKET_PAYMENTS',
  'HOSTED_WALLET_MARKET_PUBLIC_READS',
  'HOSTED_WALLET_MARKET_FUNDED_TASKS',
  'HOSTED_WALLET_MARKET_HUMAN_ASSETS',
  'HOSTED_WALLET_MARKET_TLS',
  'HOSTED_WALLET_MARKET_TENANT',
  'HOSTED_WALLET_MARKET_LISTEN_HOST',
  'HOSTED_WALLET_MARKET_ORIGIN',
  'HOSTED_WALLET_MARKET_RPC',
  'HOSTED_WALLET_MARKET_DISCHARGE_REGISTRY',
  'HOSTED_WALLET_MARKET_FEE_RECIPIENT',
  'HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN',
]);
export const OPTIONAL_ENV_KEYS = Object.freeze(['HOSTED_WALLET_MARKET_MACHINE_PROFILE','HOSTED_WALLET_MARKET_MACHINE_AUTHORITY_MODULE']);
