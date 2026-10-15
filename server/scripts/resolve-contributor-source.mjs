#!/usr/bin/env node
// When the build-time source env is absent, derive it from the checked-in
// runtime and desk artifact contract. A value that is already set is passed
// through unchanged so the verifier still refuses a mismatch. The verifier
// file itself stays unchanged.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const COMMIT=/^[a-f0-9]{40}$/;

function coded(code){
  return Object.assign(new Error(code),{code});
}

export function agreedSourceCommit(runtimeCommit,deskCommit,stampCommit,dirty){
  if(!COMMIT.test(runtimeCommit??'')||runtimeCommit!==deskCommit||runtimeCommit!==stampCommit||dirty!==false){
    throw coded('contributor_source_contract_refused');
  }
  return runtimeCommit;
}

export function selectContributorSource(envValue,contractCommit){
  if(envValue==null||envValue==='')return contractCommit;
  return envValue;
}

export function artifactSourceContract(root){
  const journey=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-journey/SOURCE.json'),'utf8'));
  const desk=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-desk/SOURCE.json'),'utf8'));
  const stamp=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/SOURCE-BUILD.json'),'utf8'));
  if(journey.schema!=='neomorphic.contributor-journey.artifact.v1'||desk.schema!=='neomorphic.contributor-desk.assets.v1'){
    throw coded('contributor_source_contract_refused');
  }
  return agreedSourceCommit(journey.sourceCommit,desk.sourceCommit,stamp.sourceCommit,stamp.dirty);
}

function fail(error){
  const known=new Set(['contributor_source_contract_refused']);
  process.stderr.write(`${known.has(error?.code)?error.code:'contributor_source_contract_refused'}\n`);
  process.exitCode=1;
}

function main(){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  let commit;
  try{
    commit=selectContributorSource(process.env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT,artifactSourceContract(root));
  }catch(error){
    fail(error);
    return;
  }
  const verifier=path.join(root,'server/scripts/verify-contributor-install.mjs');
  const result=spawnSync(process.execPath,[verifier],{
    cwd:root,
    env:{...process.env,CONTRIBUTOR_JOURNEY_SOURCE_COMMIT:commit},
    stdio:'inherit',
  });
  process.exitCode=result.status===null?1:result.status;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main();
