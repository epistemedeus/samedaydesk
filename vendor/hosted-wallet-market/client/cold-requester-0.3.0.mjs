#!/usr/bin/env node
// HTTPS client for the existing account and unfunded machine-market routes.
// Credentials and operation proofs are written before sending, in one private file.
import {randomBytes,createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {constants, openSync, closeSync, fstatSync, fsyncSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync} from 'node:fs';
import https from 'node:https';
import net from 'node:net';

const VERSION='0.3.0';
const PREFIX='/api/neomorphic-contributor-journey',args=process.argv.slice(2),command=args[0];
const flag=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
function emit(value,exit=value.ok===false?1:0){console.log(JSON.stringify(value));process.exit(exit);}
const fail=code=>{throw Object.assign(Error(code),{codeName:code});};
const token=()=>randomBytes(32).toString('base64url');
const operation=name=>'cold-'+name+'-'+randomBytes(8).toString('hex');
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
function saveSecret(file,value,{initial=false}={}){
  const bytes=JSON.stringify(value)+'\n';
  if(Buffer.byteLength(bytes)>1048576)fail('secret_capacity_readback_required');
  if(initial){
    const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    syncDirectory(file);return;
  }
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  const fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  try{renameSync(tmp,file);syncDirectory(file);}finally{if(existsSync(tmp))unlinkSync(tmp);}
}
function syncDirectory(file){const fd=openSync(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function request(route,{method='GET',body,headers={}}={}){
  const data=body===undefined?null:Buffer.from(JSON.stringify(body));
  const ca=flag('ca-file')?readFileSync(flag('ca-file')):undefined,hostname=new URL(origin).hostname;
  return new Promise(resolve=>{
    let settled=false,status=0,received=0,pieces=[],captured=0,rawHeaders=[],responseHeaders={},termination='transport_error';
    const bodyHash=createHash('sha256');
    const finish=complete=>{
      if(settled)return;settled=true;
      const bytes=Buffer.concat(pieces),observation={observedAt:new Date().toISOString(),status,complete,termination:complete?'end':termination,
        receivedBytes:received,bodyBase64:bytes.toString('base64'),bodySha256:bodyHash.digest('hex'),captureTruncated:received>captured,rawHeaders};
      let parsed;if(complete&&received===captured)try{parsed=JSON.parse(bytes.toString('utf8'));}catch{}
      const cookies=responseHeaders['set-cookie'];
      const cookie=(Array.isArray(cookies)?cookies:[cookies]).find(row=>String(row||'').startsWith('__Host-neo_contributor='));
      resolve({status,body:parsed,cookie:cookie?String(cookie).split(';')[0]:null,csrf:responseHeaders['x-cj-csrf']||null,observation});
    };
    const req=https.request(origin+PREFIX+route,{method,ca,maxHeaderSize:8192,...(net.isIP(hostname)?{}:{servername:hostname}),
      headers:{'x-ae-wire-version':flag('wire')||'c0-1',...(data?{'content-type':'application/json','content-length':String(data.length)}:{}),...headers}},res=>{
      status=res.statusCode;responseHeaders=res.headers;rawHeaders=res.rawHeaders;
      res.on('error',()=>finish(false));res.on('aborted',()=>{termination='aborted';finish(false);});
      res.on('data',part=>{const bytes=Buffer.from(part);received+=bytes.length;bodyHash.update(bytes);
        if(captured<131072){const keep=bytes.subarray(0,131072-captured);pieces.push(keep);captured+=keep.length;}
        if(received>1048576){termination='response_limit';req.destroy();finish(false);}
      });
      res.on('end',()=>finish(res.complete));
    });
    req.on('error',()=>finish(false));req.setTimeout(20000,()=>{termination='timeout';req.destroy();finish(false);});req.end(data);
  });
}
// Original observation bodies and Node raw header pairs stay in the private file only.
function observe(stored,response){
  stored.observations??=[];if(stored.observations.length>=24)fail('observation_capacity_readback_required');
  stored.observations.push(response.observation);
}
function room(stored,secret){if((stored?.observations?.length??0)>=24)fail('observation_capacity_readback_required');if(secret&&Buffer.byteLength(JSON.stringify(secret))+65536>1048576)fail('private_archive_required');}
function archive(secret,name){
  const prior=secret.operations[name];if(!prior)return;
  if(!['received','refused'].includes(prior.state))emit({ok:false,code:'operation_readback_required',operation:name,nextAction:'readback'},2);
  secret.operationHistory??=[];if(secret.operationHistory.length>=24)fail('operation_history_capacity');
  secret.operationHistory.push({name,...prior});
}
const sessionHeaders=(secret,csrf=true)=>({origin,cookie:secret.cookie,...(csrf?{'x-cj-csrf':secret.csrf}:{})});
const proofHeaders=stored=>({origin,'idempotency-key':stored.idempotencyKey,'x-account-operation-proof':stored.proof});
function receiveAccount(secret,name,response){
  const value=response.body?.value,stored=secret.operations[name];observe(stored,response);
  const same=Boolean(value?.account?.accountId&&(!secret.accountId||value.account.accountId===secret.accountId));
  if(response.status===0||response.status>=500||(response.status>=200&&response.status<300&&(response.body?.ok!==true||!same||!response.cookie||!response.csrf))){
    stored.state='unknown';saveSecret(secretFile,secret);emit({ok:false,status:response.status,code:'unknown_outcome',operation:name,nextAction:'readback'},2);
  }
  if(response.status!==200){stored.state='refused';saveSecret(secretFile,secret);emit({ok:false,status:response.status,code:codeOf(response)});}
  secret.accountId=value.account.accountId;secret.role=value.account.role;
  if(name==='recover')secret.password=stored.body.newPassword;
  if(value.recoveryCode)secret.recoveryCode=value.recoveryCode;
  secret.cookie=response.cookie;secret.csrf=response.csrf;stored.state='received';
  saveSecret(secretFile,secret);
  emit({ok:true,status:200,role:secret.role,...(command==='readback'||command==='replay-signup'?{replay:true}:{}),recoveryStored:Boolean(secret.recoveryCode)});
}
async function marketBinding(secret){
  const response=await request('/v1/market/profile'),profile=response.body?.value;
  if(response.status!==200||response.body?.ok!==true||profile?.capability?.origin!==origin||
    typeof profile.capability.tenant!=='string'||profile.capability.money!=='unfunded'||profile.signerAuthority!==false)
    emit({ok:false,code:'profile_unavailable',nextAction:'readback'},2);
  if(profile.mutationReceipts?.schema!=='pilot.machine-market.cold-mutation-receipt.v1'||profile.mutationReceipts.readback!=='/v1/market/readback'||digest(profile.mutationReceipts.actions)!==digest(['post','interest']))emit({ok:false,code:'mutation_receipts_unavailable',nextAction:'profile'},2);
  const binding={origin,tenantId:profile.capability.tenant};
  if(secret.marketBinding&&digest(secret.marketBinding)!==digest(binding))fail('market_binding_changed');
  secret.marketBinding=binding;saveSecret(secretFile,secret);return binding;
}
function validReceipt(secret,name,stored,response){
  const result=response.body?.value?.result,receipt=result?.receipt;
  if(response.status!==200||!response.observation.complete||response.body?.ok!==true||
    response.body.value.action!==(command==='readback'?'readback':name)||!receipt)return false;
  const {receiptId,...binding}=receipt,{receipt:ignored,...effect}=result;
  const request={...secret.marketBinding,actorId:secret.accountId,action:name,operationId:stored.idempotencyKey,bodyDigest:digest(stored.body)};
  return receipt.schema==='pilot.machine-market.cold-mutation-receipt.v1'&&Object.entries(request).every(([k,v])=>receipt[k]===v)&&
    /^market-[0-9a-f]{64}$/.test(result.taskId||'')&&receipt.taskId===result.taskId&&
    (name==='post'?(result.taskId==='market-'+digest({actor:{tenantId:secret.marketBinding.tenantId,actorId:secret.accountId},action:'post',id:stored.idempotencyKey})&&digest(Object.fromEntries(['title','summary','criteria','payableKinds'].map(k=>[k,result.spec?.[k]])))===digest(stored.body)):(result.taskId===stored.body.taskId&&result.actorId===secret.accountId))&&
    result.state==='unfunded_interest'&&receipt.resultDigest===digest(effect)&&receiptId===digest(binding)&&
    ((receipt.evidence==='atomic_operation'&&receipt.originalBodyRecorded===true)||
     (command==='readback'&&receipt.evidence==='legacy_transition_and_current_effect'&&receipt.originalBodyRecorded===false));
}
function receiveMarket(secret,name,stored,response){
  observe(stored,response);
  if(validReceipt(secret,name,stored,response)){
    stored.state='received';stored.receipt=response.body.value.result.receipt;
    if(name==='post')secret.taskId=response.body.value.result.taskId;
    saveSecret(secretFile,secret);
    emit({ok:true,status:200,operation:name,taskId:response.body.value.result.taskId,state:'unfunded_interest',commissioned:false,
      evidence:stored.receipt.evidence,originalBodyRecorded:stored.receipt.originalBodyRecorded,receiptId:stored.receipt.receiptId,...(command==='replay-post'?{replay:true}:{})});
  }
  // Only a complete, structured non-success refusal can be called a refusal.
  // Malformed successful responses, transport failures and server errors are ambiguous.
  const refused=response.observation.complete&&response.status>=400&&response.status<500&&response.body?.ok===false&&codeOf(response);
  if(command!=='readback')stored.state=refused?'refused':'unknown';
  else if(stored.state!=='received')stored.state='unknown';
  saveSecret(secretFile,secret);
  emit({ok:false,status:response.status,code:refused?codeOf(response):'unknown_outcome',operation:name,state:null,commissioned:false,
    nextAction:refused&&['unauthenticated','revoked','csrf_required'].includes(codeOf(response))?'login-then-readback':command==='readback'&&refused?'check-original-operation':'readback',
    diagnostic:{complete:response.observation.complete,receivedBytes:response.observation.receivedBytes,
      bodySha256:response.observation.bodySha256,captureTruncated:response.observation.captureTruncated}},refused?1:2);
}

const voluntaryMutations=['offerVoluntary','assentVoluntary','deliverVoluntary','reviewVoluntary','grantVoluntary','withdrawVoluntary','withdrawNeed','useVoluntary'];
async function participationBinding(secret){
  await marketBinding(secret);
  const response=await request('/v1/market/profile'),p=response.body?.value;
  if(response.status!==200||p?.participation?.protocol!=='voluntary-artifact-v1'||
    !/^[a-f0-9]{64}$/.test(p?.capability?.sourceSha256||'')||!/^[a-f0-9]{64}$/.test(p?.capability?.hostSha256||''))
    fail('voluntary_unavailable');
  return {sourceSha256:p.capability.sourceSha256,hostSha256:p.capability.hostSha256};
}
function receiveVoluntary(secret,name,stored,response){
  observe(stored,response);
  const result=response.body?.value?.result,r=result?.receipt;
  const {receiptId,...rb}=r||{},{receipt:ignored,...effect}=result||{};
  const expected={...secret.marketBinding,actorId:secret.accountId,action:name,operationId:stored.idempotencyKey,bodyDigest:digest(stored.body)};
  const valid=response.status===200&&response.observation.complete&&response.body?.ok===true&&
    response.body.value.action===(command==='readback'?'readbackVoluntary':name)&&r?.schema==='pilot.machine-market.cold-mutation-receipt.v1'&&
    Object.entries(expected).every(([k,v])=>r[k]===v)&&r.taskId===stored.body.taskId&&result.taskId===stored.body.taskId&&
    r.resultDigest===digest(effect)&&receiptId===digest(rb)&&r.evidence==='atomic_operation'&&r.originalBodyRecorded===true&&
    result.paymentAuthority==='none'&&result.paidWork===false&&result.debtCreated===false;
  if(valid){stored.state='received';stored.receipt=r;saveSecret(secretFile,secret);
    emit({ok:true,operation:name,taskId:result.taskId,revision:result.revision,termsDigest:result.termsDigest,
      artifactDigest:result.artifactDigest,state:result.state,paidWork:false,receiptId});}
  const refused=response.observation.complete&&response.status>=400&&response.status<500&&response.body?.ok===false&&codeOf(response);
  if(command!=='readback')stored.state=refused?'refused':'unknown';
  saveSecret(secretFile,secret);
  emit({ok:false,code:refused?codeOf(response):'unknown_outcome',operation:name,nextAction:'readback'},refused?1:2);
}
function safeInput(file){
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const st=fstatSync(fd);if(!st.isFile()||st.size>65536)fail('input_refused');
    const v=JSON.parse(readFileSync(fd,'utf8'));if(!v||typeof v!=='object'||Array.isArray(v))fail('input_refused');return v;
  }finally{closeSync(fd);}
}
function saveOutput(value){
  const file=flag('out');if(!file)fail('out_required');
  const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(file);
}

async function main(){
  if(command==='--version'||command==='version')emit({ok:true,version:VERSION});
  if(args.some(arg=>/^--(?:password|cookie|token|secret|recovery-code|private-key|seed|csrf|session)(?:=|$)/.test(arg)))fail('secret_flag_refused');
  origin=flag('origin');let url;try{url=new URL(origin);}catch{fail('origin_required');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)fail('origin_required');
  secretFile=flag('secret-file');
  if(command==='profile'||command==='wrong-wire'){
    const response=await request('/v1/market/profile',command==='wrong-wire'?{headers:{'x-ae-wire-version':'1'}}:{});
    const value=response.body?.value;
    emit({ok:command==='profile'&&response.status===200&&response.body?.ok===true,status:response.status,code:codeOf(response),
      money:value?.capability?.money??null,signerAuthority:value?.signerAuthority??null,discovery:value?.capability?.discovery??null,mutationReceipts:value?.mutationReceipts?.schema??null});
  }
  if(command==='discover'){
    const response=await request('/v1/market/discover?limit=20'+(flag('cursor')?'&cursor='+encodeURIComponent(flag('cursor')):''));
    const value=response.body?.value,items=value?.items||[],taskId=secretFile?loadSecret(secretFile).taskId:undefined;
    const matched=taskId?items.find(item=>item.taskId===taskId):null;
    emit({ok:response.status===200&&response.body?.ok===true,status:response.status,code:codeOf(response),
      publicEnabled:value?.publicEnabled??null,moneyQualified:value?.moneyQualified??null,signerAuthority:value?.signerAuthority??null,
      items,nextCursor:value?.nextCursor??null,count:items.length,matched:Boolean(matched),fundingState:matched?.fundingState??null,assigned:matched?.assigned??null});
  }
  if(command==='signup'){
    const displayName=flag('display-name'),role=flag('role');
    if(!secretFile||!displayName||!['requester','contributor'].includes(role))fail('signup_arguments_refused');
    if(existsSync(secretFile))fail('secret_file_exists');
    const password=randomBytes(24).toString('hex'),body={password,displayName,role};
    const stored={idempotencyKey:operation('signup'),proof:token(),body,state:'pending'};
    const secret={schema:'ae.password-file.v1',origin,password,displayName,role,operations:{signup:stored}};
    saveSecret(secretFile,secret,{initial:true});
    receiveAccount(secret,'signup',await request('/v1/account/signup',{method:'POST',body,headers:proofHeaders(stored)}));
  }
  if(command==='act'){
    const secret=loadSecret(secretFile),name=flag('action');
    if(!voluntaryMutations.includes(name)||!flag('input'))fail('participation_arguments_refused');
    archive(secret,name);
    const source=await participationBinding(secret),input=safeInput(flag('input'));
    const body=['withdrawVoluntary','withdrawNeed','useVoluntary'].includes(name)?input:{...input,...source};
    const stored={idempotencyKey:operation(name),body,state:'pending',observations:[]};
    secret.operations[name]=stored;saveSecret(secretFile,secret);room(stored,secret);
    receiveVoluntary(secret,name,stored,await request('/v1/market/'+name,{method:'POST',body,
      headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}}));
  }
  if(['inspect','export','proposals'].includes(command)){
    if(!flag('out')||!/^market-[a-f0-9]{64}$/.test(flag('task-id')||''))fail('participation_arguments_refused');
    const secret=loadSecret(secretFile);await participationBinding(secret);
    const name=command==='proposals'?'interests':command==='inspect'?'readVoluntary':'exportVoluntary';
    const response=await request('/v1/market/'+name,{method:'POST',body:{taskId:flag('task-id'),...(command==='proposals'&&flag('cursor')?{cursor:flag('cursor')}:{})},headers:sessionHeaders(secret)});
    const result=response.body?.value?.result;
    if(response.status!==200||!response.observation.complete||response.body?.ok!==true||response.body.value.action!==name||!result)
      emit({ok:false,code:codeOf(response)||'read_unavailable'},1);
    if(command==='export'&&(result.schema!=='pilot.machine-market.voluntary-export.v1'||!result.evidence||
      digest(result.evidence)!==result.artifactDigest||result.review?.artifactDigest!==result.artifactDigest||
      result.review?.accepted!==true||result.review?.exportAuthorized!==true||result.paidWork!==false))fail('export_binding_refused');
    saveOutput(result);emit({ok:true,taskId:result.taskId,state:result.state,revision:result.revision,
      termsDigest:result.termsDigest,artifactDigest:result.artifactDigest,paidWork:false});
  }
  if(command==='readback'||command==='replay-signup'){
    const secret=loadSecret(secretFile),name=command==='replay-signup'?'signup':flag('operation')||'signup';
    if(command==='readback'&&voluntaryMutations.includes(name)){
      const stored=secret.operations?.[name];if(!stored)fail('market_operation_required');room(stored,secret);
      await participationBinding(secret);
      receiveVoluntary(secret,name,stored,await request('/v1/market/readbackVoluntary',{method:'POST',
        body:{action:name,input:stored.body},headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}}));
    }
    if(command==='readback'&&['post','interest'].includes(name)){
      const stored=secret.operations?.[name];if(!stored)fail('market_operation_required');room(stored,secret);
      await marketBinding(secret);
      const response=await request('/v1/market/readback',{method:'POST',body:{action:name,input:stored.body},headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}});
      receiveMarket(secret,name,stored,response);
    }
    if(!['signup','login','recover'].includes(name)||!secret.operations?.[name])fail('account_operation_required');
    const stored=secret.operations[name];room(stored,secret);
    const response=await request(command==='readback'?'/v1/account/readback':'/v1/account/signup',
      {method:'POST',body:command==='readback'?{operation:name}:stored.body,headers:proofHeaders(stored)});
    receiveAccount(secret,name,response);
  }
  if(command==='login'||command==='recover'){
    const secret=loadSecret(secretFile),name=command;
    if(['signup','login','recover'].some(key=>secret.operations[key]&&['pending','unknown'].includes(secret.operations[key].state)))fail('pending_account_operation_readback_required');
    const body=name==='login'?{accountId:secret.accountId,password:secret.password}:
      {accountId:secret.accountId,recoveryCode:secret.recoveryCode,newPassword:randomBytes(24).toString('hex')};
    const stored={idempotencyKey:operation(name),proof:token(),body,state:'pending'};
    archive(secret,name);secret.operations[name]=stored;saveSecret(secretFile,secret);
    receiveAccount(secret,name,await request('/v1/account/'+name,{method:'POST',body,headers:proofHeaders(stored)}));
  }
  if(['post','interest','replay-post','conflict-post','post-without-csrf'].includes(command)){
    const secret=loadSecret(secretFile),name=command==='interest'?'interest':'post',fresh=['post','interest'].includes(command);
    if(fresh)archive(secret,name);
    let stored=secret.operations[name];
    if(fresh){
      let body;
      if(name==='post'){
        body={title:flag('title'),summary:flag('summary'),criteria:[flag('criterion')],payableKinds:['usable']};
        if(!body.title||!body.summary||!body.criteria[0])fail('post_arguments_refused');
      }else{
        const taskId=flag('task-id')||(flag('peer-secret')?loadSecret(flag('peer-secret')).taskId:null);
        if(!/^market-[0-9a-f]{64}$/.test(taskId||'')||!flag('note'))fail('interest_arguments_refused');
        body={taskId,note:flag('note')};
      }
      stored={idempotencyKey:operation(name),body,state:'pending',observations:[]};
      secret.operations[name]=stored;
    }
    if(!stored)fail('post_operation_required');room(stored,secret);
    if(!fresh&&stored.state!=='received'&&command==='replay-post')emit({ok:false,code:'operation_readback_required',operation:name,nextAction:'readback'},2);
    await marketBinding(secret);saveSecret(secretFile,secret);
    const body=command==='conflict-post'?{...stored.body,title:'Different unfunded title'}:stored.body;
    const response=await request('/v1/market/'+name,{method:'POST',body,headers:{...sessionHeaders(secret,command!=='post-without-csrf'),'idempotency-key':stored.idempotencyKey}});
    // Operator negative probes preserve the original successful operation state and receipt.
    if(['conflict-post','post-without-csrf'].includes(command)){
      observe(stored,response);saveSecret(secretFile,secret);emit({ok:false,status:response.status,code:codeOf(response),commissioned:false});
    }
    receiveMarket(secret,name,stored,response);
  }
  if(command==='fund'){
    const secret=loadSecret(secretFile),response=await request('/v1/market/fund',{method:'POST',body:{taskId:secret.taskId,quoteDigest:'unfunded',proofId:'unfunded'},
      headers:{...sessionHeaders(secret),'idempotency-key':operation('fund')}});
    emit({ok:false,status:response.status,code:codeOf(response),paidWork:false});
  }
  fail('usage');
}
main().catch(error=>emit({ok:false,code:error.codeName||'client_input_refused'}));
