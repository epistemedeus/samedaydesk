#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {assertAdmitted, loadInstalledContract} from '../src/admission.mjs';
import {inspectInstallation} from '../src/migrate.mjs';
import {ADDITIVE_ENV_KEYS, loadDeploymentProfile} from '../src/profile.mjs';
import {startServer} from '../src/server.mjs';

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw Object.assign(new Error('usage'), {codeName: 'usage'});
  return value;
}

function profileInput(argv, {listen}) {
  return loadDeploymentProfile({
    mode: process.env.HOSTED_WALLET_MARKET_MODE,
    label: process.env.HOSTED_WALLET_MARKET_LABEL,
    chain: process.env.HOSTED_WALLET_MARKET_CHAIN,
    payments: process.env.HOSTED_WALLET_MARKET_PAYMENTS,
    publicReads: process.env.HOSTED_WALLET_MARKET_PUBLIC_READS,
    fundedTasks: process.env.HOSTED_WALLET_MARKET_FUNDED_TASKS,
    humanAssets: process.env.HOSTED_WALLET_MARKET_HUMAN_ASSETS,
    tls: process.env.HOSTED_WALLET_MARKET_TLS,
    origin: process.env.HOSTED_WALLET_MARKET_ORIGIN,
    tenant: process.env.HOSTED_WALLET_MARKET_TENANT,
    earnedSchema: process.env.HOSTED_WALLET_MARKET_EARNED_SCHEMA,
    schemaName: process.env.HOSTED_WALLET_MARKET_SCHEMA,
    listenHost: process.env.HOSTED_WALLET_MARKET_LISTEN_HOST,
    databaseUrl: flag(argv, 'database-url'),
    rpcUrl: flag(argv, 'rpc') || process.env.HOSTED_WALLET_MARKET_RPC,
    cert: flag(argv, 'cert'),
    key: flag(argv, 'key'),
    feeRecipient: process.env.HOSTED_WALLET_MARKET_FEE_RECIPIENT,
    settlementToken: process.env.HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN,
  }, {listen});
}

function contractFrom(argv) {
  const repo = flag(argv, 'sds-pin');
  if (!repo) return null;
  const contract = loadInstalledContract({repo});
  assertAdmitted(contract.names, ADDITIVE_ENV_KEYS);
  return contract;
}

async function check(argv) {
  const profile = profileInput(argv, {listen: false});
  const contract = contractFrom(argv);
  const client = new pg.Client({connectionString: profile.databaseUrl, connectionTimeoutMillis: 1500});
  try {
    await client.connect();
  } catch {
    throw Object.assign(new Error('database_unreachable'), {codeName: 'database_unreachable'});
  }
  try {
    await client.query(`SET search_path TO ${profile.earnedSchema}`);
    const shape = await inspectInstallation(client, {earnedSchema: profile.earnedSchema});
    if (!shape.obligationColumnsMatch || !shape.legacyTrigger || shape.configValuesCopied) {
      throw Object.assign(new Error('installation_refused'), {codeName: 'installation_refused'});
    }
    if (!shape.guardSealed) throw Object.assign(new Error('guard_unsealed'), {codeName: 'guard_unsealed'});
    if (!shape.guardComplete) throw Object.assign(new Error('guard_incomplete'), {codeName: 'guard_incomplete'});
    process.stdout.write(JSON.stringify({
      ok: true,
      command: 'check',
      label: profile.label,
      chain: profile.chain,
      payments: profile.payments,
      publicChain: profile.publicChain,
      fundedTasks: profile.fundedTasks,
      humanAssets: profile.humanAssets,
      tenant: profile.tenant,
      databaseHost: profile.host,
      migration005Applied: shape.migration005Applied,
      obligationColumnsMatch: true,
      legacyTrigger: true,
      configValuesCopied: false,
      guardSealed: true,
      guardComplete: true,
      contractDigest: contract?.digest || null,
    }) + '\n');
  } finally {
    await client.end();
  }
}

async function serve(argv) {
  const profile = profileInput(argv, {listen: true});
  const contract = contractFrom(argv);
  const port = Number(flag(argv, 'port'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Object.assign(new Error('usage'), {codeName: 'usage'});
  const started = await startServer({
    ...profile,
    port,
    contract,
    replayKey: process.env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
    sdsRoot: flag(argv, 'sds-pin'),
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    command: 'serve',
    origin: started.origin,
    deploymentLabel: started.profile.label,
    chain: started.profile.chain,
    payments: 'off',
    publicChain: started.profile.publicChain,
  }) + '\n');
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await started.close();
}

export async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'check') return check(rest);
  if (command === 'serve') return serve(rest);
  throw Object.assign(new Error('usage'), {codeName: 'usage'});
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  main(process.argv.slice(2)).catch(error => {
    const code = error.codeName || error.code || 'refused';
    process.stderr.write(JSON.stringify({ok: false, code: /^[a-z0-9_]+$/.test(code) ? code : 'refused'}) + '\n');
    process.exitCode = 1;
  });
}
