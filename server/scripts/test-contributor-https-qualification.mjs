import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,createHmac} from 'node:crypto';
import {readFile,mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {issueContributorHttpsQualification,loadContributorHttpsQualification,readContributorEdgeIdentity} from '../lib/contributor-https-qualification.js';
import {prepareContributorEnvironment} from '../lib/contributor-environment-packet.js';

// Signature/config unit QA only. No DB connection, provider receiving or customer.
const manifest=JSON.parse(await readFile(new URL('../../vendor/neomorphic-contributor-journey/SOURCE.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sdsCommit='5'.repeat(40);
const env=()=>({CONTRIBUTOR_JOURNEY_MODE:'disabled',CONTRIBUTOR_DESK_MANAGED_ENABLED:'0',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0',
  CONTRIBUTOR_DESK_INSTALLATION_ID:'synthetic-installation-v2',CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT:sdsCommit,CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:manifest.sourceCommit,
  CONTRIBUTOR_JOURNEY_ORIGIN:'https://desk.invalid',CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:'https://desk.invalid',
  CONTRIBUTOR_JOURNEY_DATABASE_URL:'owner-qa-unit-metadata-no-connection',CONTRIBUTOR_JOURNEY_STORE_ID:'owner-qa-binding',
  CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA:'owner_qa_work',CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA:'owner_qa_correspondence',
  CONTRIBUTOR_JOURNEY_REPLAY_KEY:'a'.repeat(64),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:'b'.repeat(64),CONTRIBUTOR_JOURNEY_CURSOR_KEY:'c'.repeat(64),
  CONTRIBUTOR_JOURNEY_OWNER_TOKEN:'private-owner-qa-token',CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:'private-owner-qa-admin'});
const input=()=>({schema:'sds.contributor-https-only-receiving.v2',profile:'live',installationId:'synthetic-installation-v2',sdsCommit,loaderSha256:hash('owner QA loader, not provider bytes'),
  checks:Object.fromEntries(['providerHttpsPolicy','certificateVerifiedHttps','plaintextRefusal','backendIsolation']
    .map(name=>[name,{receivedAt:new Date().toISOString(),receiptSha256:hash('distinct owner QA receipt '+name)}]))});
const serving=(qualification,overrides={})=>({...env(),CONTRIBUTOR_JOURNEY_MODE:'live',CONTRIBUTOR_DESK_MANAGED_ENABLED:'1',
  CONTRIBUTOR_DESK_INGRESS_MODE:'litespeed-https-only',CONTRIBUTOR_DESK_HTTPS_QUALIFICATION:qualification,...overrides});
const sign=payload=>{const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return encoded+'.'+createHmac('sha256',Buffer.from(env().CONTRIBUTOR_JOURNEY_INTEGRITY_KEY,'hex')).update(payload.schema+'\0'+encoded).digest('hex');};

test('explicit disabled issuer binds complete independent receiving to exact artifacts and existing stable store',async()=>{
  const {qualification,payload}=await issueContributorHttpsQualification(input(),env());
  assert.equal(payload.scope,'private-transport');assert.equal(payload.provider,'hostinger-litespeed-node');
  assert.equal(payload.binding.productCommit,manifest.sourceCommit);assert.equal(payload.binding.sdsCommit,sdsCommit);
  assert.match(payload.binding.edgeSha256,/^[a-f0-9]{64}$/);assert.match(payload.binding.storeBindingHmac,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(payload).includes('private-owner-qa-token'));assert.ok(!JSON.stringify(payload).includes(env().CONTRIBUTOR_JOURNEY_INTEGRITY_KEY));
  const loaded=await loadContributorHttpsQualification(serving(qualification));assert.equal(loaded.current(),true);
  assert.equal(loaded.loaderSha256,payload.loaderSha256);
  assert.equal(Object.keys(await readContributorEdgeIdentity(manifest.sourceCommit)).length,4);
});

test('issuer refuses missing, old, future, reused or malformed receiving; no single trust boolean substitutes',async()=>{
  for(const name of Object.keys(input().checks)){
    const i=input();delete i.checks[name];await assert.rejects(issueContributorHttpsQualification(i,env()));
    const old=input();old.checks[name].receivedAt=new Date(Date.now()-600001).toISOString();await assert.rejects(issueContributorHttpsQualification(old,env()));
    const future=input();future.checks[name].receivedAt=new Date(Date.now()+10000).toISOString();await assert.rejects(issueContributorHttpsQualification(future,env()));
    const invalid=input();invalid.checks[name].receiptSha256='passed';await assert.rejects(issueContributorHttpsQualification(invalid,env()));
  }
  const same=input();for(const value of Object.values(same.checks))value.receiptSha256=hash('one boolean is not four receipts');
  await assert.rejects(issueContributorHttpsQualification(same,env()));
  await assert.rejects(issueContributorHttpsQualification({...input(),httpsTrusted:true},env()));
});

test('issuer cannot activate or rotate credentials; exact canonical source/origin and installation identity required',async()=>{
  for(const change of [{CONTRIBUTOR_JOURNEY_MODE:'live'},{CONTRIBUTOR_DESK_MANAGED_ENABLED:'1'},{CONTRIBUTOR_JOURNEY_PUBLIC_READS:'1'},
    {CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:undefined},{CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT:undefined},
    {CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT:'6'.repeat(40)},{CONTRIBUTOR_JOURNEY_ORIGIN:'http://desk.invalid'},
    {CONTRIBUTOR_JOURNEY_ORIGIN:'https://desk.invalid/'},{CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:'7'.repeat(40)},
    {CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:undefined},
    {CONTRIBUTOR_JOURNEY_STORE_ID:undefined}])await assert.rejects(issueContributorHttpsQualification(input(),{...env(),...change}));
  await assert.rejects(issueContributorHttpsQualification({...input(),expiresAt:new Date(Date.now()+10000).toISOString()},env()));
  await assert.rejects(issueContributorHttpsQualification({...input(),schema:'sds.contributor-https-only-receiving.v1'},env()));
});

test('reader refuses modified bytes/signature/unknown shape and legacy finite controller state',async()=>{
  const {qualification,payload}=await issueContributorHttpsQualification(input(),env());
  for(const value of [undefined,'true','1',qualification+'.extra',qualification.slice(0,-1)+(qualification.endsWith('0')?'1':'0')])
    await assert.rejects(loadContributorHttpsQualification(serving(value)));
  for(const change of [{provider:'guessed-provider'},{scope:'public'},{listener:'tcp'},
    {expiresAt:new Date(Date.now()+10000).toISOString()},{issuedAt:new Date(Date.now()+10000).toISOString()},
    {untrustedExtra:true},{checks:{...payload.checks,plaintextRefusal:{receivedAt:payload.issuedAt,receiptSha256:'unknown'}}}])
    await assert.rejects(loadContributorHttpsQualification(serving(sign({...payload,...change}))));
});

test('qualified source/profile/origin/store/key changes require fresh receiving rather than accepting stored stale qualification',async()=>{
  const {qualification}=await issueContributorHttpsQualification(input(),env());
  for(const change of [{CONTRIBUTOR_DESK_INSTALLATION_ID:'different-installation'},{CONTRIBUTOR_DESK_INSTALLATION_ID:undefined},{CONTRIBUTOR_JOURNEY_MODE:'staging'},{CONTRIBUTOR_JOURNEY_ORIGIN:'https://other.invalid'},
    {CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT:'6'.repeat(40)},{CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:'7'.repeat(40)},
    {CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:undefined},
    {CONTRIBUTOR_JOURNEY_DATABASE_URL:'different-private-unit-binding'},{CONTRIBUTOR_JOURNEY_STORE_ID:'different-store'},
    {CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA:'different_work'},{CONTRIBUTOR_JOURNEY_REPLAY_KEY:'d'.repeat(64)},
    {CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:'e'.repeat(64)},{CONTRIBUTOR_JOURNEY_OWNER_TOKEN:'different-token'}])
    await assert.rejects(loadContributorHttpsQualification(serving(qualification,change)));
});

test('the issuer CLI emits only a deployment-bound private overlay and refuses unsafe inputs or overwriting it',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'sds-https-qualification-'));
  const receiving=path.join(directory,'receiving.json'),overlay=path.join(directory,'overlay.json');
  try{
    await writeFile(receiving,JSON.stringify(input()),{mode:0o600});
    const args=['server/scripts/qualify-contributor-https-edge.mjs','issue',receiving,overlay];
    const result=await promisify(execFile)(process.execPath,args,{env:{...process.env,...env()},timeout:10000});
    const report=JSON.parse(result.stdout);assert.equal(report.sent,false);assert.equal(report.publicEnabled,false);
    assert.equal((await stat(overlay)).mode&0o777,0o600);
    const data=JSON.parse(await readFile(overlay,'utf8'));assert.equal(data.env_vars.length,5);
    const setting=data.env_vars.find(row=>row.key==='CONTRIBUTOR_DESK_HTTPS_QUALIFICATION');
    await loadContributorHttpsQualification(serving(setting.value));
    assert.ok(!result.stdout.includes(setting.value));assert.ok(!result.stdout.includes(env().CONTRIBUTOR_JOURNEY_INTEGRITY_KEY));
    await assert.rejects(promisify(execFile)(process.execPath,args,{env:{...process.env,...env()},timeout:10000}),{code:1});
    await writeFile(path.join(directory,'unsafe.json'),JSON.stringify(input()),{mode:0o644});
    await assert.rejects(promisify(execFile)(process.execPath,[args[0],'issue',path.join(directory,'unsafe.json'),path.join(directory,'new.json')],
      {env:{...process.env,...env()},timeout:10000}),{code:1});
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('qualification installation preserves the full authoritative provider environment and stays disabled',async()=>{
  const {qualification}=await issueContributorHttpsQualification(input(),env());
  const existing=Object.entries({...env(),UNRELATED_EXISTING_SECRET:'unchanged-private-QA-value'}).map(([key,value])=>({key,value}));
  const listed=existing.map(({key})=>({key,value:'********'}));
  const packet=prepareContributorEnvironment({existing,listed,overlay:[{key:'CONTRIBUTOR_DESK_HTTPS_QUALIFICATION',value:qualification},
    {key:'CONTRIBUTOR_DESK_INGRESS_MODE',value:'litespeed-https-only'},{key:'CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS',value:'[]'}]});
  for(const row of existing)assert.deepEqual(packet.install.env_vars.find(value=>value.key===row.key),row);
  assert.equal(packet.receipt.sent,false);assert.equal(packet.receipt.publicEnabled,false);assert.deepEqual(packet.rollback.env_vars.length,existing.length);
});


test('deployment-bound qualification survives elapsed days but rejects legacy v1 and live binding changes',async()=>{
  const {qualification,payload}=await issueContributorHttpsQualification(input(),env());
  assert.equal(payload.lifecycle,'deployment-bound');assert.equal(Object.hasOwn(payload,'expiresAt'),false);
  const currentEnv=serving(qualification),clock=Date.now;
  try{
    Date.now=()=>clock()+3*86400000;
    const loaded=await loadContributorHttpsQualification(currentEnv);assert.equal(loaded.current(),true);
    currentEnv.CONTRIBUTOR_DESK_INSTALLATION_ID='new-synthetic-installation';assert.equal(loaded.current(),false);
  }finally{Date.now=clock;}
  const {lifecycle,...finite}=payload;
  for(const expiresAt of [new Date(Date.now()+60000).toISOString(),new Date(Date.now()-1).toISOString()])
    await assert.rejects(loadContributorHttpsQualification(serving(sign({...finite,schema:'sds.contributor-https-only-qualification.v1',expiresAt}))));
});
