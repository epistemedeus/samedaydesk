import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {agreedSourceCommit, artifactSourceContract, selectContributorSource} from './resolve-contributor-source.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const wrong='0'.repeat(40);

test('a missing source env derives the runtime contract while retaining the separate desk identity',()=>{
  const contract=artifactSourceContract(root);
  assert.equal(selectContributorSource(undefined,contract),contract);
  assert.equal(selectContributorSource('',contract),contract);
  const journey=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-journey/SOURCE.json'),'utf8'));
  const desk=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-desk/SOURCE.json'),'utf8'));
  assert.equal(contract,journey.sourceCommit);
  assert.equal(agreedSourceCommit(contract,desk.sourceCommit,contract,false),contract);
  assert.match(desk.sourceCommit,/^[a-f0-9]{40}$/);
});

test('a set source env is passed through, including a mismatch',()=>{
  const contract=artifactSourceContract(root);
  assert.equal(selectContributorSource(wrong,contract),wrong);
  assert.equal(selectContributorSource(contract,contract),contract);
});

test('runtime/build disagreement and malformed desk identity are named refusals',()=>{
  const contract=artifactSourceContract(root);
  assert.equal(agreedSourceCommit(contract,wrong,contract,false),contract);
  assert.throws(()=>agreedSourceCommit(contract,'not-a-source',contract,false),/contributor_source_contract_refused/);
  assert.throws(()=>agreedSourceCommit(contract,contract,wrong,false),/contributor_source_contract_refused/);
  assert.throws(()=>agreedSourceCommit(contract,contract,contract,true),/contributor_source_contract_refused/);
});

test('the managed package script has no stale lock repair and no historical source fallback',()=>{
  const script=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).scripts['build:managed-contributor'];
  assert.equal(script.includes('restore-host-lock'),false);
  assert.equal(/[a-f0-9]{40}/.test(script),false);
  assert.match(script,/node server\/scripts\/resolve-contributor-source\.mjs$/);
});

function run(args,envPatch){
  const env={...process.env};
  for(const [key,value] of Object.entries(envPatch)){
    if(value===undefined)delete env[key];
    else env[key]=value;
  }
  return spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8'});
}

test('direct verifier negative controls stay refused',()=>{
  const unset=run(['server/scripts/verify-contributor-install.mjs'],{CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:undefined});
  const mismatched=run(['server/scripts/verify-contributor-install.mjs'],{CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:wrong});
  assert.equal(unset.status,1);
  assert.equal(mismatched.status,1);
  assert.match(unset.stderr,/managed contributor artifact refused/);
  assert.match(mismatched.stderr,/managed contributor artifact refused/);
});
