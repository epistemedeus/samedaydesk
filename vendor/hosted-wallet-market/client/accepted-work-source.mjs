#!/usr/bin/env node
// Source candidate for opt-in accepted-work publication. It does not replace
// cold-requester-0.3.0.mjs and it is not a hosted release. Anonymous reads use
// the mounted market; permission and withdrawal reuse that client's secret file.
import {randomBytes,createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {constants, openSync, closeSync, fstatSync, fsyncSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync} from 'node:fs';
import https from 'node:https';
import net from 'node:net';

const PREFIX='/api/neomorphic-contributor-journey';
const args=process.argv.slice(2);
const command=args[0];
const flag=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
function emit(value,exit=value.ok===false?1:0){console.log(JSON.stringify(value));process.exit(exit);}
const fail=code=>{throw Object.assign(Error(code),{codeName:code});};
const digest=value=>{const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');};
const codeOf=response=>{const code=response.body?.code||response.body?.error?.code;return typeof code==='string'&&/^[a-zA-Z0-9_]{1,96}$/.test(code)?code:null;};
let origin,secretFile;
function loadSecret(file){
  let fd;
  try{
    fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||(st.mode&0o077)||st.nlink!==1||st.size>1048576||(process.getuid&&st.uid!==process.getuid()))fail('secret_file_refused');
    const value=JSON.parse(readFileSync(fd,'utf8'));
    if(value?.schema!=='ae.password-file.v1'||typeof value.password!=='string'||value.password.length<16)fail('secret_file_refused');
    if(value.origin!==origin)fail('secret_origin_refused');
    return value;
  }finally{if(fd!==undefined)closeSync(fd);}
}
function saveSecret(file,value){
  const bytes=JSON.stringify(value)+'\n';
  if(Buffer.byteLength(bytes)>1048576)fail('secret_capacity_readback_required');
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  const fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  try{renameSync(tmp,file);syncDirectory(file);}finally{if(existsSync(tmp))unlinkSync(tmp);}
}
function syncDirectory(file){const fd=openSync(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function request(route,{method='GET',body,headers={}}={}){
  const data=body===undefined?null:Buffer.from(JSON.stringify(body));
  const ca=flag('ca-file')?readFileSync(flag('ca-file')):undefined;
  const hostname=new URL(origin).hostname;
  return new Promise(resolve=>{
    let settled=false,status=0,received=0,pieces=[],captured=0,responseHeaders={},termination='transport_error';
    const finish=complete=>{
      if(settled)return;settled=true;
      const bytes=Buffer.concat(pieces);
      let parsed;if(complete&&received===captured)try{parsed=JSON.parse(bytes.toString('utf8'));}catch{}
      resolve({status,body:parsed,complete,cacheControl:responseHeaders['cache-control']||null,termination});
    };
    const req=https.request(origin+PREFIX+route,{method,ca,maxHeaderSize:8192,...(net.isIP(hostname)?{}:{servername:hostname}),
      headers:{'x-ae-wire-version':flag('wire')||'c0-1',...(data?{'content-type':'application/json','content-length':String(data.length)}:{}),...headers}},res=>{
      status=res.statusCode;responseHeaders=res.headers;
      res.on('error',()=>finish(false));
      res.on('aborted',()=>{termination='aborted';finish(false);});
      res.on('data',part=>{const bytes=Buffer.from(part);received+=bytes.length;if(captured<131072){const keep=bytes.subarray(0,131072-captured);pieces.push(keep);captured+=keep.length;}
        if(received>1048576){termination='response_limit';req.destroy();finish(false);}});
      res.on('end',()=>finish(res.complete));
    });
    req.on('error',()=>finish(false));
    req.setTimeout(20000,()=>{termination='timeout';req.destroy();finish(false);});
    req.end(data);
  });
}
function safeInput(file){
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const st=fstatSync(fd);if(!st.isFile()||st.size>65536)fail('input_refused');
    const value=JSON.parse(readFileSync(fd,'utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))fail('input_refused');
    if('sourceSha256' in value||'hostSha256' in value)fail('source_hash_refused');
    return value;
  }finally{closeSync(fd);}
}
function keysOf(value, keys){
  if(Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail('input_refused');
}
async function liveProfile(secret){
  const response=await request('/v1/market/profile');
  const profile=response.body?.value;
  if(!response.complete||response.status!==200||response.body?.ok!==true||profile?.capability?.origin!==origin||profile?.capability?.money!=='unfunded'||profile?.signerAuthority!==false||profile?.participation?.protocol!=='voluntary-artifact-v1')
    emit({ok:false,code:'profile_unavailable',nextAction:'readback'},2);
  if(digest(profile.mutationReceipts?.actions)!==digest(['post','interest']))emit({ok:false,code:'mutation_receipts_unavailable'},2);
  const sourceSha256=profile.capability.sourceSha256,hostSha256=profile.capability.hostSha256;
  if(!/^[a-f0-9]{64}$/.test(sourceSha256||'')||!/^[a-f0-9]{64}$/.test(hostSha256||''))fail('profile_unavailable');
  if(secret?.acquisition&&(secret.acquisition.sourceSha256!==sourceSha256||secret.acquisition.hostSha256!==hostSha256))fail('acquisition_reacquire_required');
  return {sourceSha256,hostSha256,profile};
}
function sessionHeaders(secret){return {origin,cookie:secret.cookie,'x-cj-csrf':secret.csrf};}
function receive(secret,name,stored,response){
  const result=response.body?.value?.result,receipt=result?.receipt;
  const {receiptId,...binding}=receipt||{};
  const {receipt:ignored,...effect}=result||{};
  const expected={origin,tenantId:secret.marketBinding?.tenantId,actorId:secret.accountId,action:name,operationId:stored.idempotencyKey,bodyDigest:digest(stored.body)};
  const valid=response.complete&&response.status===200&&response.body?.ok===true&&
    response.body.value.action===(command==='readback'?'readbackVoluntary':name)&&
    receipt?.schema==='pilot.machine-market.cold-mutation-receipt.v1'&&
    Object.entries(expected).every(([key,value])=>receipt[key]===value)&&
    receipt.taskId===stored.body.taskId&&result.taskId===stored.body.taskId&&
    receipt.resultDigest===digest(effect)&&receiptId===digest(binding)&&
    receipt.evidence==='atomic_operation'&&receipt.originalBodyRecorded===true&&
    result.paymentAuthority==='none'&&result.paidWork===false&&result.debtCreated===false;
  if(valid){
    stored.state='received';stored.receipt=receipt;saveSecret(secretFile,secret);
    emit({ok:true,operation:name,taskId:result.taskId,revision:result.revision,termsDigest:result.termsDigest,
      artifactDigest:result.artifactDigest,state:result.state,acceptedWorkVisible:result.acceptedWorkVisible===true,
      paidWork:false,receiptId,cacheControl:response.cacheControl});
  }
  const refused=response.complete&&response.status>=400&&response.status<500&&response.body?.ok===false&&codeOf(response);
  if(command!=='readback')stored.state=refused?'refused':'unknown';
  saveSecret(secretFile,secret);
  emit({ok:false,status:response.status,code:refused?codeOf(response):'unknown_outcome',operation:name,nextAction:'readback',
    complete:response.complete},refused?1:2);
}
function archive(secret,name){
  const prior=secret.operations?.[name];if(!prior)return;
  if(!['received','refused'].includes(prior.state))emit({ok:false,code:'operation_readback_required',operation:name,nextAction:'readback'},2);
}

async function main(){
  if(args.some(arg=>/^--(?:password|cookie|token|secret|recovery-code|private-key|seed|csrf|session|source-sha256|host-sha256)(?:=|$)/.test(arg)))fail('secret_flag_refused');
  origin=flag('origin');
  let url;try{url=new URL(origin);}catch{fail('origin_required');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)fail('origin_required');
  secretFile=flag('secret-file');
  if(command==='discover-accepted'||command==='detail'||command==='artifact'){
    const profile=await liveProfile(null);
    let route;
    if(command==='discover-accepted'){
      const limit=flag('limit')||'20';
      const cursor=flag('cursor');
      route='/v1/market/accepted-work?limit='+encodeURIComponent(limit)+(cursor?'&cursor='+encodeURIComponent(Buffer.from(cursor).toString('base64url')):'');
    }else{
      const taskId=flag('task-id');
      if(!/^market-[a-f0-9]{64}$/.test(taskId||''))fail('task_refused');
      route='/v1/market/accepted-work/'+taskId+(command==='artifact'?'/artifact':'');
    }
    const response=await request(route);
    if(!response.complete)emit({ok:false,code:'unknown_outcome',cacheControl:response.cacheControl},2);
    const value=response.body?.value??null;
    emit({ok:response.status===200&&response.body?.ok===true,status:response.status,code:codeOf(response),
      cacheControl:response.cacheControl,sourceSha256:profile.sourceSha256,hostSha256:profile.hostSha256,
      acceptedWorkPublic:value?.acceptedWorkPublic??null,publicReads:value?.publicReads??null,paidWork:value?.paidWork??null,
      items:value?.items??null,nextCursor:value?.nextCursor??null,value:command==='discover-accepted'?null:value});
  }
  if(command==='permit'||command==='withdraw-publication'){
    if(!secretFile||!flag('input'))fail('input_refused');
    const secret=loadSecret(secretFile);
    const name=command==='permit'?'permitAcceptedWork':'withdrawAcceptedWork';
    archive(secret,name);
    const profile=await liveProfile(secret);
    secret.marketBinding={origin,tenantId:profile.profile.capability.tenant};
    const input=safeInput(flag('input'));
    let body;
    if(command==='permit'){
      keysOf(input,['taskId','termsDigest','expectedRevision','summary','summaryDigest','publicArtifact','publicArtifactDigest','rightsDigest','artifactDigest','publicationConsent']);
      if(digest(input.summary)!==input.summaryDigest||digest(input.publicArtifact)!==input.publicArtifactDigest)fail('digest_refused');
      body={...input,sourceSha256:profile.sourceSha256,hostSha256:profile.hostSha256};
    }else{
      keysOf(input,['taskId','termsDigest','expectedRevision','reason']);
      body=input;
    }
    const stored={idempotencyKey:'cold-'+name+'-'+randomBytes(8).toString('hex'),body,state:'pending'};
    secret.operations??={};secret.operations[name]=stored;saveSecret(secretFile,secret);
    receive(secret,name,stored,await request('/v1/market/'+name,{method:'POST',body,headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}}));
  }
  if(command==='readback'){
    if(!secretFile)fail('input_refused');
    const secret=loadSecret(secretFile);
    const name=flag('operation');
    if(!['permitAcceptedWork','withdrawAcceptedWork'].includes(name))fail('input_refused');
    const stored=secret.operations?.[name];
    if(!stored)fail('market_operation_required');
    await liveProfile(secret);
    if(!secret.marketBinding)secret.marketBinding={origin,tenantId:(await liveProfile(secret)).profile.capability.tenant};
    receive(secret,name,stored,await request('/v1/market/readbackVoluntary',{method:'POST',body:{action:name,input:stored.body},
      headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}}));
  }
  fail('usage');
}
main().catch(error=>emit({ok:false,code:error.codeName||'client_input_refused'}));
