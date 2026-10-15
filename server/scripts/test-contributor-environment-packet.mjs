import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,readFile,stat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareContributorEnvironment,readPrivateJson,writePrivateJson} from '../lib/contributor-environment-packet.js';

const existing={env_vars:[{key:'NODE_ENV',value:'production'},{key:'EXISTING_PRIVATE_SETTING',value:'synthetic-owner-qa-value'}]};
const listed=existing.env_vars.map(({key})=>({key,value:'********'}));
const overlay={env_vars:[{key:'CONTRIBUTOR_JOURNEY_MODE',value:'disabled'},{key:'CONTRIBUTOR_DESK_MANAGED_ENABLED',value:'0'},
  {key:'CONTRIBUTOR_JOURNEY_PUBLIC_READS',value:'0'},{key:'CONTRIBUTOR_JOURNEY_REPLAY_KEY',value:'synthetic-stable-owner-qa-key'}]};

test('full-set packet preserves unrelated real values and provides the exact rollback set; GET masks supply keys only',()=>{
  const result=prepareContributorEnvironment({existing,listed,overlay});
  for(const entry of existing.env_vars)assert.deepEqual(result.install.env_vars.find(row=>row.key===entry.key),entry);
  assert.deepEqual(result.rollback.env_vars,[...existing.env_vars].sort((a,b)=>a.key.localeCompare(b.key)));
  assert.equal(result.receipt.sent,false);assert.equal(result.receipt.publicEnabled,false);
  assert.ok(!JSON.stringify(result.receipt).includes('synthetic-stable-owner-qa-key'));
});

test('masked, missing, stale, duplicate and empty authority cannot become a replacement environment',()=>{
  for(const value of [[],listed,[...existing.env_vars,{key:'NODE_ENV',value:'duplicate'}]])
    assert.throws(()=>prepareContributorEnvironment({existing:value,listed,overlay}));
  for(const inventory of [[],[listed[0]],[...listed,{key:'MISSING_SECRET',value:'********'}]])
    assert.throws(()=>prepareContributorEnvironment({existing,listed:inventory,overlay}));
  assert.throws(()=>prepareContributorEnvironment({existing,listed,overlay:{env_vars:[{key:'CONTRIBUTOR_JOURNEY_CURSOR_KEY',value:'********'}]}}),/masked/);
});

test('packet cannot modify unrelated settings or activate the serving profile or public reads',()=>{
  for(const change of [{key:'NODE_ENV',value:'development'},{key:'CONTRIBUTOR_JOURNEY_MODE',value:'live'},
    {key:'CONTRIBUTOR_DESK_MANAGED_ENABLED',value:'1'},{key:'CONTRIBUTOR_JOURNEY_PUBLIC_READS',value:'1'}])
    assert.throws(()=>prepareContributorEnvironment({existing,listed,overlay:{env_vars:[...overlay.env_vars.filter(row=>row.key!==change.key),change]}}));
  const durable={env_vars:[...existing.env_vars,{key:'CONTRIBUTOR_JOURNEY_REPLAY_KEY',value:'synthetic-original-stable-key'}]};
  assert.throws(()=>prepareContributorEnvironment({existing:durable,listed:durable.env_vars.map(({key})=>({key,value:'********'})),overlay}),/stable credential/);
});

test('private file boundary refuses permissive files, symlinks and overwrite; CLI never prints or sends secret values',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'contributor-env-packet-'));
  try{
    const privateFile=path.join(dir,'existing.json');await writePrivateJson(privateFile,existing);
    assert.equal((await stat(privateFile)).mode&0o777,0o600);assert.deepEqual(await readPrivateJson(privateFile),existing);
    await assert.rejects(writePrivateJson(privateFile,listed),/EEXIST/);
    const link=path.join(dir,'linked.json');await symlink(privateFile,link);await assert.rejects(readPrivateJson(link));
    const publicFile=path.join(dir,'public.json');await writeFile(publicFile,'{}',{mode:0o644});await assert.rejects(readPrivateJson(publicFile));
    await writePrivateJson(path.join(dir,'listed.json'),listed);await writePrivateJson(path.join(dir,'overlay.json'),overlay);
    const args=['server/scripts/prepare-contributor-environment.mjs','--existing',privateFile,'--listed',path.join(dir,'listed.json'),
      '--overlay',path.join(dir,'overlay.json'),'--install',path.join(dir,'install.json'),'--rollback',path.join(dir,'rollback.json')];
    const result=await promisify(execFile)(process.execPath,args,{timeout:5000});
    assert.equal(JSON.parse(result.stdout).sent,false);assert.ok(!result.stdout.includes('synthetic-owner-qa-value'));
    assert.equal((await stat(path.join(dir,'install.json'))).mode&0o777,0o600);
    assert.equal(JSON.parse(await readFile(path.join(dir,'rollback.json'),'utf8')).env_vars.length,existing.env_vars.length);
    await assert.rejects(promisify(execFile)(process.execPath,args,{timeout:5000}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
