import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {admitMachineCapability, canonicalMachineProfile} from '../../vendor/hosted-wallet-market/src/machine-profile-document.mjs';
import {hostSourceSha256, installedSourceSha256} from '../../vendor/hosted-wallet-market/src/native-debt.mjs';
import {versionedSource} from '../../vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/candidate.js';

const root = resolve(import.meta.dirname, '../..');
const origin = 'https://127.0.0.1:9';
const tenant = 'h136010-release';
const bin = join(root, 'vendor/hosted-wallet-market/bin/machine-profile.mjs');
const PREFIX = '/api/neomorphic-contributor-journey';

function base() {
  return {
    schema: 'pilot.machine-market.capability.v1', profile: 'machine-market',
    origin: 'https://receiving.example.test', tenant: 'root410-receiving',
    sourceSha256: installedSourceSha256(), hostSha256: hostSourceSha256(root),
    discovery: 'qualified-source', money: 'unfunded', networkSource: versionedSource('eip155:8453'),
    participation: 'voluntary-artifact-v1',
  };
}

test('accepted work stays off unless the source-bound document says true', () => {
  const ordinary = base();
  const canonical = canonicalMachineProfile(ordinary);
  assert.equal(canonical.includes('acceptedWorkPublic'), false);
  const admitted = admitMachineCapability('source-bound:' + canonical, {sdsRoot: root, origin: ordinary.origin, tenant: ordinary.tenant});
  assert.equal(admitted.acceptedWorkPublic, undefined);
  const opted = canonicalMachineProfile({...ordinary, acceptedWorkPublic: true});
  assert.equal(JSON.parse(opted).acceptedWorkPublic, true);
  assert.equal(opted.includes('networkSource'), true);
  assert.equal(admitMachineCapability('source-bound:' + opted, {sdsRoot: root, origin: ordinary.origin, tenant: ordinary.tenant}).acceptedWorkPublic, true);
  for (const bad of [false, 'true', 1]) {
    assert.throws(() => canonicalMachineProfile({...ordinary, acceptedWorkPublic: bad}), /machine_profile_refused/);
  }
  assert.throws(() => canonicalMachineProfile({...ordinary, money: 'sandbox', participation: undefined, networkSource: undefined, acceptedWorkPublic: true}), /machine_profile_refused/);
  assert.throws(() => canonicalMachineProfile({...ordinary, participation: undefined, acceptedWorkPublic: true}), /machine_profile_refused/);
  const wrong = JSON.parse(opted);
  wrong.sourceSha256 = '0'.repeat(64);
  assert.throws(() => admitMachineCapability('source-bound:' + canonicalMachineProfile(wrong), {sdsRoot: root, origin: ordinary.origin, tenant: ordinary.tenant}), /machine_profile_refused/);
});

test('the profile generator emits the flag only for the exact unfunded voluntary opt-in', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'h136010-profile-'));
  const run = extra => execFileSync(process.execPath, ['--max-old-space-size=256', bin,
    '--sds-root', root, '--origin', origin, '--tenant', tenant, '--money', 'unfunded',
    '--out', join(scratch, 'out-' + Math.random().toString(16).slice(2) + '.json'),
    ...extra], {encoding: 'utf8'});
  const status = extra => {
    try { run(extra); return 0; }
    catch (error) { return error.status ?? 1; }
  };
  try {
    const off = JSON.parse(run(['--participation', 'voluntary-artifact-v1']));
    assert.equal(off.acceptedWorkPublic, undefined);
    assert.equal(off.installed, false);
    assert.equal(off.signerAuthority, false);
    assert.equal(off.money, 'unfunded');
    const on = JSON.parse(run(['--participation', 'voluntary-artifact-v1', '--accepted-work-public', 'true']));
    assert.equal(on.acceptedWorkPublic, true);
    assert.equal(on.participation, 'voluntary-artifact-v1');
    assert.equal(on.sourceBound.startsWith('source-bound:'), true);
    assert.equal(JSON.parse(on.sourceBound.slice('source-bound:'.length)).acceptedWorkPublic, true);
    for (const flag of ['false', 'yes', '1']) assert.notEqual(status(['--participation', 'voluntary-artifact-v1', '--accepted-work-public', flag]), 0);
    assert.notEqual(status(['--accepted-work-public', 'true']), 0);
    assert.notEqual(status(['--accepted-work-public']), 0);
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});

test('production mount follows the source-bound document and leaves public reads and money unchanged', {timeout: 180000}, async () => {
  const {machineHost} = await import('./root10940-machine-host.mjs');
  const host = await machineHost();
  try {
    const off = await host.boot();
    const before = await host.financialSnapshot();
    assert.equal(off.acceptedWorkPublic, undefined);
    const closed = await host.request(PREFIX + '/v1/market/profile', {method: 'GET'});
    assert.equal(closed.status, 200);
    assert.equal(closed.body.value.acceptedWork, undefined);
    assert.equal(closed.body.value.signerAuthority, false);
    assert.equal(closed.body.value.capability.money, 'unfunded');
    assert.equal((await host.request(PREFIX + '/v1/market/accepted-work', {method: 'GET'})).status, 404);
    assert.equal((await host.request(PREFIX + '/v1/discover', {method: 'GET'})).body.value.publicEnabled, false);
    const on = await host.boot({acceptedWorkFromProfile: true});
    assert.equal(on.acceptedWorkPublic, true);
    assert.equal(on.installed, false);
    assert.equal(on.sourceSha256, off.sourceSha256);
    assert.equal(on.hostSha256, off.hostSha256);
    const opened = await host.request(PREFIX + '/v1/market/profile', {method: 'GET'});
    assert.equal(opened.body.value.acceptedWork.schema, 'pilot.machine-market.accepted-work-publication.v1');
    assert.equal(opened.body.value.acceptedWork.publicReads, '0');
    assert.equal(opened.body.value.acceptedWork.paidWork, false);
    assert.equal(opened.body.value.acceptedWork.signerAuthority, false);
    assert.equal(opened.body.value.capability.money, 'unfunded');
    assert.equal(opened.body.value.capability.acceptedWorkPublic, undefined);
    const listed = await host.request(PREFIX + '/v1/market/accepted-work', {method: 'GET'});
    assert.equal(listed.status, 200);
    assert.equal(listed.body.value.acceptedWorkPublic, true);
    assert.equal(listed.body.value.publicReads, '0');
    assert.equal(listed.body.value.paidWork, false);
    assert.equal(listed.body.value.signerAuthority, false);
    assert.deepEqual(listed.body.value.items, []);
    assert.deepEqual(await host.financialSnapshot(), before);
    await assert.rejects(() => host.boot({acceptedWorkFromProfile: true, corruptSource: true}), /machine_profile_refused/);
    const recovered = await host.boot();
    assert.equal(recovered.acceptedWorkPublic, undefined);
    assert.equal((await host.request(PREFIX + '/v1/market/accepted-work', {method: 'GET'})).status, 404);
    assert.deepEqual(await host.financialSnapshot(), before);
  } finally {
    await host.close();
  }
});
