import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {feeAt} from '../runtime/agent-economy-foundation/dist/money.js';
import {classifyMachineProfileValue} from '../src/machine-profile-document.mjs';
import {readMachineCapability} from '../src/machine-market.mjs';
import {walletEnvironmentPacket} from '../src/release-profile.mjs';

const sds = resolve(import.meta.dirname, '../../..');
const bin = join(sds, 'vendor/hosted-wallet-market/bin/machine-profile.mjs');
const debt = join(sds, 'vendor/hosted-wallet-market/bin/installed-debt.mjs');
const row = object => Object.entries(object).map(([key, value]) => ({key, value}));
const manifest = {domain: 'private.example.test', neomorphicCommit: '0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556', commit: 'a'.repeat(40),
  environmentPolicy: {profile: 'private-wallet-source'}};
const before = {CONTRIBUTOR_JOURNEY_OWNER_TOKEN: 'retained-native-owner', CONTRIBUTOR_JOURNEY_MODE: 'live', CONTRIBUTOR_JOURNEY_INSTALLED: '1',
  CONTRIBUTOR_DESK_MANAGED_ENABLED: '1', CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0', CONTRIBUTOR_DESK_ASSETS_ENABLED: '0',
  CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: manifest.neomorphicCommit, CONTRIBUTOR_JOURNEY_ORIGIN: 'https://private.example.test',
  CONTRIBUTOR_JOURNEY_DATABASE_URL: 'postgres://unit:unit@db.example.test/retained?sslmode=verify-full',
  CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA: 'retained_work', CONTRIBUTOR_JOURNEY_REPLAY_KEY: 'old-replay-key'};
const wallet = {HOSTED_WALLET_MARKET_MODE: 'private', HOSTED_WALLET_MARKET_LABEL: 'PRIVATE', HOSTED_WALLET_MARKET_CHAIN: 'eip155:8453',
  HOSTED_WALLET_MARKET_SCHEMA: 'hosted_wallet_market', HOSTED_WALLET_MARKET_EARNED_SCHEMA: 'retained_work', HOSTED_WALLET_MARKET_TENANT: 'private-wallet',
  HOSTED_WALLET_MARKET_PAYMENTS: 'off', HOSTED_WALLET_MARKET_PUBLIC_READS: '0', HOSTED_WALLET_MARKET_FUNDED_TASKS: 'off', HOSTED_WALLET_MARKET_HUMAN_ASSETS: 'off',
  HOSTED_WALLET_MARKET_TLS: 'verified-edge', HOSTED_WALLET_MARKET_ORIGIN: 'https://private.example.test', HOSTED_WALLET_MARKET_LISTEN_HOST: '127.0.0.1',
  HOSTED_WALLET_MARKET_RPC: 'https://base.example.test/read-only', HOSTED_WALLET_MARKET_FEE_RECIPIENT: '0x' + '1'.repeat(40),
  HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', HOSTED_WALLET_MARKET_DISCHARGE_REGISTRY: '/retained/root-registry'};
const make = (extra = {}, sdsRoot) => walletEnvironmentPacket({manifest, existing: row(before), wallet: row({...wallet, ...extra}), sdsRoot});

test('five percent fee policy still refuses any other rate', () => {
  assert.equal(feeAt('10000'), '500');
  assert.throws(() => feeAt('10000', 100), /fee_policy/);
});

test('a switch, raw JSON, and an escaping path are machine_profile_refused', () => {
  for (const value of ['1', 'true', 'on', 'unfunded', '{"money":"qualified"}', '../capability.json', 'capability.json\n']) {
    assert.throws(() => classifyMachineProfileValue(value), /machine_profile_refused/);
  }
  assert.equal(readMachineCapability('', {sdsRoot: sds, origin: 'https://127.0.0.1:9', tenant: 'root404-cold'}), null);
});

test('absolute mode 0600 still loads and a loose or linked file is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'root404-profile-'));
  try {
    const generated = JSON.parse(execFileSync(process.execPath, [bin, '--sds-root', sds, '--origin', 'https://127.0.0.1:9', '--tenant', 'root404-cold', '--money', 'unfunded', '--out', join(dir, 'capability.json')], {encoding: 'utf8'}));
    assert.equal(generated.installed, false);
    assert.equal(generated.signerAuthority, false);
    assert.equal(generated.money, 'unfunded');
    const loaded = readMachineCapability(join(dir, 'capability.json'), {sdsRoot: sds, origin: 'https://127.0.0.1:9', tenant: 'root404-cold'});
    assert.equal(loaded.money, 'unfunded');
    assert.equal(loaded.signerAuthority, undefined);
    const loose = join(dir, 'loose.json');
    writeFileSync(loose, readFileSync(join(dir, 'capability.json')));
    chmodSync(loose, 0o644);
    assert.throws(() => readMachineCapability(loose, {sdsRoot: sds, origin: generated.origin, tenant: generated.tenant}), /machine_profile_refused/);
    const link = join(dir, 'link.json');
    symlinkSync(join(dir, 'capability.json'), link);
    assert.throws(() => readMachineCapability(link, {sdsRoot: sds, origin: generated.origin, tenant: generated.tenant}), /machine_profile_refused/);
    const tampered = JSON.parse(readFileSync(join(dir, 'capability.json'), 'utf8'));
    tampered.sourceSha256 = '0'.repeat(64);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify(tampered), {mode: 0o600});
    assert.throws(() => readMachineCapability(bad, {sdsRoot: sds, origin: generated.origin, tenant: generated.tenant}), /machine_profile_refused/);
    assert.equal(generated.sourceBound.startsWith('source-bound:'), true);
    assert.equal(readMachineCapability(generated.sourceBound, {sdsRoot: sds, origin: generated.origin, tenant: generated.tenant}).hostSha256, generated.hostSha256);
    assert.throws(() => readMachineCapability(generated.sourceBound, {sdsRoot: sds, origin: 'https://other.example.test', tenant: generated.tenant}), /machine_profile_refused/);
    assert.throws(() => readMachineCapability(generated.sourceBound, {sdsRoot: sds, origin: generated.origin, tenant: 'other-tenant'}), /machine_profile_refused/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('a relative file stays inside the installation', () => {
  const dir = join(sds, 'var');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const name = 'root404-unit-capability.json';
  try {
    const generated = JSON.parse(execFileSync(process.execPath, [bin, '--sds-root', sds, '--origin', 'https://127.0.0.1:9', '--tenant', 'root404-cold', '--money', 'unfunded', '--out', `var/${name}`], {encoding: 'utf8'}));
    assert.equal(generated.relative, `var/${name}`);
    assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600);
    const loaded = readMachineCapability(`var/${name}`, {sdsRoot: sds, origin: 'https://127.0.0.1:9', tenant: 'root404-cold'});
    assert.equal(loaded.money, 'unfunded');
    assert.throws(() => execFileSync(process.execPath, [bin, '--sds-root', sds, '--origin', 'https://127.0.0.1:9', '--tenant', 'root404-cold', '--money', 'unfunded', '--out', '../outside.json'], {encoding: 'utf8'}), /machine_profile_arguments_refused/);
  } finally {
    rmSync(join(dir, name), {force: true});
    try { rmSync(dir); } catch { /* retained directory */ }
  }
});

test('release admission keeps an unread absolute path and refuses a switch or unbound document', () => {
  const absolute = make({HOSTED_WALLET_MARKET_MACHINE_PROFILE: '/private/source-qualified-machine.json'});
  assert.equal(absolute.receipt.sent, false);
  assert.equal(absolute.receipt.qualified, false);
  assert.equal(absolute.receipt.machineProfile, 'path-unopened');
  assert.equal(absolute.rollback.env_vars.some(rowItem => rowItem.key === 'HOSTED_WALLET_MARKET_MACHINE_PROFILE'), false);
  for (const value of ['1', 'true', 'on', 'unfunded']) assert.throws(() => make({HOSTED_WALLET_MARKET_MACHINE_PROFILE: value}), /machine_profile_refused/);
  for (const [key, value] of Object.entries({HOSTED_WALLET_MARKET_PAYMENTS: 'on', HOSTED_WALLET_MARKET_PUBLIC_READS: '1', HOSTED_WALLET_MARKET_FUNDED_TASKS: 'on', HOSTED_WALLET_MARKET_HUMAN_ASSETS: 'on'})) {
    assert.throws(() => make({[key]: value}), /payments_refused|public_reads_refused|funded_tasks_refused|human_assets_refused/);
  }
  const dir = mkdtempSync(join(tmpdir(), 'root404-release-'));
  try {
    const generated = JSON.parse(execFileSync(process.execPath, [bin, '--sds-root', sds, '--origin', 'https://private.example.test', '--tenant', 'private-wallet', '--money', 'unfunded', '--out', join(dir, 'capability.json')], {encoding: 'utf8'}));
    assert.throws(() => make({HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound}), /machine_profile_unbound/);
    const bound = make({HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound}, sds);
    assert.equal(bound.receipt.machineProfile, 'source-bound');
    assert.equal(bound.receipt.qualified, false);
    const forged = generated.sourceBound.replace(generated.sourceSha256, 'ab'.repeat(32));
    assert.throws(() => make({HOSTED_WALLET_MARKET_MACHINE_PROFILE: forged}, sds), /machine_profile_refused/);
    const output = join(dir, 'packet');
    for (const [name, value] of Object.entries({
      manifest,
      existing: row(before),
      wallet: row({...wallet, HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound}),
    })) writeFileSync(join(dir, name + '.json'), JSON.stringify(value), {mode: 0o600});
    const stdout = execFileSync(process.execPath, [debt, 'prepare-release', '--manifest', join(dir, 'manifest.json'), '--input', join(dir, 'existing.json'), '--wallet', join(dir, 'wallet.json'), '--sds-root', sds, '--output', output], {encoding: 'utf8'});
    assert.equal(stdout.includes(generated.sourceSha256), false);
    assert.equal(stdout.includes('old-replay-key'), false);
    const result = JSON.parse(stdout);
    assert.equal(result.result.machineProfile, 'source-bound');
    assert.equal(result.result.qualified, false);
    assert.equal(result.result.sent, false);
    const install = JSON.parse(readFileSync(join(output, 'install.json'), 'utf8'));
    assert.equal(install.env_vars.find(item => item.key === 'HOSTED_WALLET_MARKET_MACHINE_PROFILE').value, generated.sourceBound);
    const rollback = JSON.parse(readFileSync(join(output, 'rollback.json'), 'utf8'));
    assert.equal(rollback.env_vars.some(item => item.key === 'HOSTED_WALLET_MARKET_MACHINE_PROFILE'), false);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
