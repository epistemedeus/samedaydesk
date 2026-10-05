#!/usr/bin/env node
// Explicit managed build only. Never imported by startup/build/install.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstatSync } from 'node:fs';
import { PostgresStore } from '@neomorphic/correspondence';
import { parseMountedDatabaseUrl,parseMountedPgSchema } from '../../vendor/visitor-foundry-receiver/services/correspondence/dist/config.js';
import { openEntryFacade,closeEntryThenBase } from './compose.js';
import { materializePrivateInputs,materializePrivateProfiles,PROFILE_JSON_KEYS } from './private-materialize.js';
import { readPrivateBytes } from './private-paths.js';
import { verifiedFoundryDatabaseUrl } from './pg-tls.js';
import { REUSE_CLASS,reusesProductDataService } from './product-isolation.js';
import { validateRequest,runPrivatePass,digest,canonicalJSON,need } from './private-pass-core.mjs';

const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
export function receivePassRequest(env) {
  need(!env.FOUNDRY_EXECUTION_RUNTIME && !env.FOUNDRY_WORKER_PASS,'private_pass_override_refused');
  const dir=path.resolve(env.FOUNDRY_PRIVATE_DIR || '.');
  need(Boolean(env.FOUNDRY_PRIVATE_DIR),'private_dir_required');
  const inline=String(env.FOUNDRY_PRIVATE_PASS_JSON || '').trim(),file=String(env.FOUNDRY_PRIVATE_PASS_FILE || '').trim();
  need(inline || file,'private_pass_request_required');
  let value;
  try {
    const raw=inline || readPrivateBytes(file,{repoRoot,limit:8192}).toString('utf8').trim();
    need(Buffer.byteLength(raw)<=8192 && !/[\r\n]/.test(raw),'private_pass_request_invalid');
    value=validateRequest(JSON.parse(raw));
  } catch(error) { need(false,error.code ?? 'private_pass_request_invalid'); }
  if(file) need(path.dirname(path.resolve(file))===dir,'private_pass_directory_conflict');
  const name=`operator-request-${digest(value.intentId).slice(7)}.json`;
  const received=materializePrivateInputs({...env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(value)}, {repoRoot,
    files:[['FOUNDRY_PRIVATE_PASS_JSON','FOUNDRY_PRIVATE_PASS_FILE',name,'json']]});
  const receipts=[];
  for(const phase of ['prepared','started','unknown','completed']) {
    const receipt=path.join(dir,`operator-${digest(value.intentId).slice(7)}-${phase}.json`);
    try { lstatSync(receipt); } catch(error) { if(error.code==='ENOENT') continue; throw error; }
    let saved;
    try { saved=JSON.parse(readPrivateBytes(receipt,{repoRoot}).toString('utf8')); } catch(error) { throw Object.assign(new Error(),{code:error.code ?? 'private_pass_receipt_invalid'}); }
    need(saved.schema==='sds.foundry.private-pass-receipt.v1' && saved.phase===phase && saved.requestHash===digest(value),'private_pass_receipt_conflict');
    if(phase!=='prepared') receipts.push(saved);
  }
  const persist=(phase,record)=>materializePrivateInputs({FOUNDRY_PRIVATE_DIR:dir,VALUE:canonicalJSON({schema:'sds.foundry.private-pass-receipt.v1',phase,requestHash:digest(value),...record})},{repoRoot,
    files:[['VALUE','FILE',`operator-${digest(value.intentId).slice(7)}-${phase}.json`,'json']]});
  // Check existing receipt paths/modes/content before SQL; no chmod/overwrite.
  // Prepared is an intent, never a statement that a child ran or completed.
  persist('prepared',{request:value});
  return {request:value,persist,receipts,requestFile:file || received.assigned.FOUNDRY_PRIVATE_PASS_FILE};
}

export async function privatePassMain(env=process.env) {
  let base,mounted;
  const controller=new AbortController(),stop=()=>controller.abort();
  const timer=setTimeout(stop,90000);
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  try {
    need(!reusesProductDataService(env.CORRESPONDENCE_DATABASE_URL,{supabaseUrl:env.SUPABASE_URL}),REUSE_CLASS);
    const {request,persist,receipts}=receivePassRequest(env);
    const materialized=materializePrivateProfiles(env,{repoRoot});
    const privateEnv={...env,...materialized.assigned};
    for(const key of [...PROFILE_JSON_KEYS,'FOUNDRY_PRIVATE_PASS_JSON']) delete privateEnv[key];
    const databaseUrl=verifiedFoundryDatabaseUrl(parseMountedDatabaseUrl(privateEnv.CORRESPONDENCE_DATABASE_URL),privateEnv);
    const pgSchema=parseMountedPgSchema(privateEnv.CORRESPONDENCE_PG_SCHEMA);
    base=new PostgresStore(databaseUrl,{schema:pgSchema,poolMax:1});
    ({mounted}=await openEntryFacade({store:base,config:{databaseUrl,pgSchema,adminToken:'private-pass-does-not-serve',store:'postgres',
      bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:120,corsOrigins:[],trustProxyHops:0,poolMax:1,port:0},env:privateEnv}));
    const result=await runPrivatePass(mounted.extension.integration,mounted.receiver,request,{signal:controller.signal,persist,localReceipts:receipts});
    console.log(JSON.stringify({schema:'sds.foundry.private-pass-result.v1',...result,migrated:false,enrolled:false}));
    if(!result.ok) process.exitCode=2;
    return result;
  } catch(error) {
    console.error(JSON.stringify({ok:false,code:/^[a-z_]{1,100}$/.test(error?.code)?error.code:'private_pass_failed'}));
    process.exitCode=2;
  } finally {
    if(base) await closeEntryThenBase(mounted,base).catch(()=>{});
    clearTimeout(timer);process.off('SIGTERM',stop);process.off('SIGINT',stop);
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==2){console.error(JSON.stringify({ok:false,code:'private_pass_arguments_invalid'}));process.exitCode=2;}
  else await privatePassMain();
}
