import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {readMachineCapability} from '../src/machine-market.mjs';
import {canonicalMachineProfile} from '../src/machine-profile-document.mjs';
import {installedSourceSha256, hostSourceSha256} from '../src/native-debt.mjs';
import {walletEnvironmentPacket,machineEntryEnvironmentPacket} from '../src/release-profile.mjs';
import {versionedSource} from '../runtime/agent-economy-rail/dist/index.js';

const sds = resolve(import.meta.dirname, '../../..');
const origin = 'https://receiving.example.test', tenant = 'root410-receiving';
const manifest = {domain: 'receiving.example.test', neomorphicCommit: '0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556'};
const rows = value => Object.entries(value).map(([key,value]) => ({key,value}));
const before = rows({CONTRIBUTOR_JOURNEY_MODE:'live', CONTRIBUTOR_JOURNEY_INSTALLED:'1',
  CONTRIBUTOR_JOURNEY_OWNER_TOKEN:'fixture-owner-only', CONTRIBUTOR_DESK_MANAGED_ENABLED:'1',
  CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0', CONTRIBUTOR_DESK_ASSETS_ENABLED:'0',
  CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:manifest.neomorphicCommit, CONTRIBUTOR_JOURNEY_ORIGIN:origin,
  CONTRIBUTOR_JOURNEY_DATABASE_URL:'postgres://fixture:fixture@db.example.test/fixture?sslmode=verify-full',
  CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA:'retained_work'});
const wallet = {MODE:'private',LABEL:'PRIVATE',CHAIN:'eip155:8453',SCHEMA:'hosted_wallet_market',EARNED_SCHEMA:'retained_work',
  TENANT:tenant,PAYMENTS:'off',PUBLIC_READS:'0',FUNDED_TASKS:'off',HUMAN_ASSETS:'off',TLS:'verified-edge',ORIGIN:origin,
  LISTEN_HOST:'127.0.0.1',RPC:'https://rpc.example.test',FEE_RECIPIENT:'0x'+'1'.repeat(40),
  SETTLEMENT_TOKEN:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',DISCHARGE_REGISTRY:'/private/retained-registry'};
const options = {sdsRoot:sds,origin,tenant};
const profile = () => ({schema:'pilot.machine-market.capability.v1',profile:'machine-market',origin,tenant,
  sourceSha256:installedSourceSha256(),hostSha256:hostSourceSha256(sds),discovery:'qualified-source',money:'unfunded',networkSource:versionedSource('eip155:8453')});
const inline = value => 'source-bound:'+canonicalMachineProfile(value);
const packet = (value, root=sds, extra={}) => walletEnvironmentPacket({manifest,existing:before,
  wallet:rows(Object.fromEntries(Object.entries({...wallet,MACHINE_PROFILE:value,...extra}).map(([key,value])=>['HOSTED_WALLET_MARKET_'+key,value]))),sdsRoot:root});

test('runtime and release bind origin, tenant, both actual source hashes and required roots', () => {
  const value = profile();
  assert.equal(readMachineCapability('', options), null);
  assert.equal(readMachineCapability(inline(value), options).money, 'unfunded');
  assert.equal(packet(inline(value)).receipt.machineProfile, 'source-bound');
  for (const patch of [{origin:'https://wrong.example.test'},{tenant:'wrong-tenant'},{sourceSha256:'0'.repeat(64)},{hostSha256:'0'.repeat(64)}]) {
    assert.throws(()=>readMachineCapability(inline({...value,...patch}),options), /machine_profile_refused/);
    assert.throws(()=>packet(inline({...value,...patch})), /machine_profile_refused/);
  }
  assert.throws(()=>packet(inline(value),null), /machine_profile_unbound/);
  assert.throws(()=>readMachineCapability(inline(value),{origin,tenant}), /discharge_consumer_unbound|machine_profile_refused/);
  assert.throws(()=>packet('var/capability.json',null), /machine_profile_unbound/);
  assert.equal(packet('/retained/private-capability.json',null).receipt.machineProfile,'path-unopened');
});

test('release and runtime refuse the same incomplete qualified capability', () => {
  const value = profile(); delete value.networkSource; value.money='qualified';
  for(const incomplete of [value,{...value,networkSource:versionedSource('eip155:8453')}]) {
    assert.throws(()=>readMachineCapability(inline(incomplete),options), /machine_profile_refused/);
    assert.throws(()=>packet(inline(incomplete)), /machine_profile_refused/);
  }
  const qualified={...value,networkSource:versionedSource('eip155:8453'),execution:{class:'public'}};
  assert.equal(readMachineCapability(inline(qualified),options).money,'qualified');
  assert.equal(packet(inline(qualified)).receipt.qualified,false);
});

test('an unfunded release cannot carry a money authority module', () => {
  assert.throws(()=>packet(inline(profile()),sds,{MACHINE_AUTHORITY_MODULE:'/private/authority.mjs'}), /machine_authority_refused/);
});

test('profile files reject parent symlinks', () => {
  const scratch=mkdtempSync(join(tmpdir(),'root410-admission-'));
  const relativeName='.root410-profile-'+process.pid;
  try {
    writeFileSync(join(scratch,'capability.json'),JSON.stringify(profile()),{mode:0o600});
    symlinkSync(scratch,join(sds,relativeName),'dir');
    assert.throws(()=>readMachineCapability(join(sds,relativeName,'capability.json'),options), /machine_profile_refused/);
    assert.throws(()=>readMachineCapability(relativeName+'/capability.json',options), /machine_profile_refused/);
  } finally {rmSync(join(sds,relativeName),{force:true});rmSync(scratch,{recursive:true,force:true});}
});

test('generation refuses before an escaping write', () => {
  const scratch=mkdtempSync(join(tmpdir(),'root410-generation-')),name='.root410-generation-'+process.pid;
  try {
    symlinkSync(scratch,join(sds,name),'dir');
    const result=spawnSync(process.execPath,[join(sds,'vendor/hosted-wallet-market/bin/machine-profile.mjs'),
      '--sds-root',sds,'--origin',origin,'--tenant',tenant,'--out',name+'/must-not-exist.json'],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.equal(existsSync(join(scratch,'must-not-exist.json')),false,'refusal must precede writing outside the installation');
  }finally{rmSync(join(sds,name),{force:true});rmSync(scratch,{recursive:true,force:true});}
});

test('host hashing refuses symlinked parent directories in the pinned source closure', () => {
  const scratch=mkdtempSync(join(tmpdir(),'root410-host-'));
  try {
    mkdirSync(join(scratch,'server/foundry/activation'),{recursive:true});mkdirSync(join(scratch,'actual'));
    const bytes='exact member bytes';writeFileSync(join(scratch,'actual/member'),bytes);
    symlinkSync('actual',join(scratch,'linked'),'dir');
    writeFileSync(join(scratch,'server/foundry/activation/private-control-pin.json'),JSON.stringify({files:{'linked/member':createHash('sha256').update(bytes).digest('hex')}}));
    assert.throws(()=>hostSourceSha256(scratch), /binding_stale/);
  }finally{rmSync(scratch,{recursive:true,force:true});}
});

test('post-qualification entry preparation changes only the capability and captures the exact current rollback',()=>{
  const sourceCommit='a'.repeat(40),sourceManifest={...manifest,commit:sourceCommit};
  const existing=rows({...Object.fromEntries(before.map(row=>[row.key,row.value])),
    ...Object.fromEntries(Object.entries(wallet).map(([key,value])=>['HOSTED_WALLET_MARKET_'+key,value])),
    CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT:sourceCommit,CONTRIBUTOR_DESK_INGRESS_MODE:'litespeed-https-only',
    CONTRIBUTOR_DESK_INSTALLATION_ID:'fixture-installed-build',CONTRIBUTOR_DESK_HTTPS_QUALIFICATION:'fixture-preserved-envelope',
    RETAINED_PRIVATE_SETTING:'unchanged-fixture'});
  const value=inline(profile());
  const make=patch=>machineEntryEnvironmentPacket({manifest:sourceManifest,existing,machineProfile:value,sdsRoot:sds,...patch});
  const prepared=make();
  assert.deepEqual(prepared.rollback.env_vars,[...existing].sort((a,b)=>a.key.localeCompare(b.key)));
  assert.equal(existing.every(row=>prepared.install.env_vars.some(next=>next.key===row.key&&next.value===row.value)),true);
  assert.deepEqual(prepared.receipt.changedKeys,['HOSTED_WALLET_MARKET_MACHINE_PROFILE']);
  assert.equal(prepared.receipt.qualified,false);assert.equal(prepared.receipt.sent,false);
  assert.throws(()=>make({manifest:{...sourceManifest,commit:'b'.repeat(40)}}),/installed_source_required/);
  assert.throws(()=>make({existing:[...existing,{key:'HOSTED_WALLET_MARKET_MACHINE_AUTHORITY_MODULE',value:'/private/fixture.mjs'}]}),/machine_authority_refused/);
  assert.throws(()=>make({machineProfile:inline({...profile(),money:'qualified',execution:{class:'public'}})}),/unfunded_entry_required/);
});
