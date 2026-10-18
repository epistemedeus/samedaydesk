#!/usr/bin/env node
// HTTPS client for the existing account and unfunded machine-market routes.
// Credentials and operation proofs are written before sending, in one private file.
import {randomBytes} from 'node:crypto';
import {constants, openSync, closeSync, fstatSync, fsyncSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync} from 'node:fs';
import https from 'node:https';
import net from 'node:net';

const PREFIX='/api/neomorphic-contributor-journey',args=process.argv.slice(2),command=args[0];
const flag=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
function emit(value,exit=value.ok===false?1:0){console.log(JSON.stringify(value));process.exit(exit);}
const fail=code=>{throw Object.assign(Error(code),{codeName:code});};
const token=()=>randomBytes(32).toString('base64url');
const operation=name=>'cold-'+name+'-'+randomBytes(8).toString('hex');
const codeOf=response=>response.body?.code||response.body?.error?.code||null;
let origin,secretFile;
function loadSecret(file){
  let fd;
  try{
    fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||(st.mode&0o077)||st.nlink!==1||st.size>131072||(process.getuid&&st.uid!==process.getuid()))fail('secret_file_refused');
    const value=JSON.parse(readFileSync(fd,'utf8'));
    if(value?.schema!=='ae.password-file.v1'||typeof value.password!=='string'||value.password.length<16)fail('secret_file_refused');
    if(value.origin!==origin)fail('secret_origin_refused');
    return value;
  }finally{if(fd!==undefined)closeSync(fd);}
}
function saveSecret(file,value,{initial=false}={}){
  const bytes=JSON.stringify(value)+'\n';
  if(initial){
    const fd=openSync(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    return;
  }
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  const fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
  try{renameSync(tmp,file);}finally{if(existsSync(tmp))unlinkSync(tmp);}
}
function request(route,{method='GET',body,headers={}}={}){
  const data=body===undefined?null:Buffer.from(JSON.stringify(body));
  const ca=flag('ca-file')?readFileSync(flag('ca-file')):undefined,hostname=new URL(origin).hostname;
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(!settled){settled=true;resolve(value);}};
    const unavailable=()=>finish({status:0,body:null,cookie:null,csrf:null});
    const req=https.request(origin+PREFIX+route,{method,ca,...(net.isIP(hostname)?{}:{servername:hostname}),
      headers:{'x-ae-wire-version':flag('wire')||'c0-1',...(data?{'content-type':'application/json','content-length':String(data.length)}:{}),...headers}},res=>{
      let text='';res.setEncoding('utf8');
      res.on('error',unavailable);res.on('aborted',unavailable);
      res.on('data',chunk=>{text+=chunk;if(text.length>1048576)req.destroy();});
      res.on('end',()=>{
        let parsed;try{parsed=JSON.parse(text);}catch{}
        const cookies=res.headers['set-cookie'];
        const cookie=(Array.isArray(cookies)?cookies:[cookies]).find(row=>String(row||'').startsWith('__Host-neo_contributor='));
        finish({status:res.statusCode,body:parsed,cookie:cookie?String(cookie).split(';')[0]:null,csrf:res.headers['x-cj-csrf']||null});
      });
    });
    req.on('error',unavailable);req.setTimeout(20000,()=>req.destroy());req.end(data);
  });
}
const sessionHeaders=(secret,csrf=true)=>({origin,cookie:secret.cookie,...(csrf?{'x-cj-csrf':secret.csrf}:{})});
const proofHeaders=stored=>({origin,'idempotency-key':stored.idempotencyKey,'x-account-operation-proof':stored.proof});
function receiveAccount(secret,name,response){
  const value=response.body?.value,stored=secret.operations[name];
  const same=Boolean(value?.account?.accountId&&(!secret.accountId||value.account.accountId===secret.accountId));
  if(response.status===0||(response.status===200&&(!same||!response.cookie||!response.csrf))){
    emit({ok:false,status:response.status,code:'unknown_outcome',operation:name,nextAction:'readback'},2);
  }
  if(response.status!==200){stored.state='refused';saveSecret(secretFile,secret);emit({ok:false,status:response.status,code:codeOf(response)});}
  secret.accountId=value.account.accountId;secret.role=value.account.role;
  if(name==='recover')secret.password=stored.body.newPassword;
  if(value.recoveryCode)secret.recoveryCode=value.recoveryCode;
  secret.cookie=response.cookie;secret.csrf=response.csrf;stored.state='received';
  saveSecret(secretFile,secret);
  emit({ok:true,status:200,role:secret.role,...(command==='readback'||command==='replay-signup'?{replay:true}:{}),recoveryStored:Boolean(secret.recoveryCode)});
}
async function main(){
  if(args.some(arg=>/^--(?:password|cookie|token|secret|recovery-code|private-key|seed|csrf|session)(?:=|$)/.test(arg)))fail('secret_flag_refused');
  origin=flag('origin');let url;try{url=new URL(origin);}catch{fail('origin_required');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)fail('origin_required');
  secretFile=flag('secret-file');
  if(command==='profile'||command==='wrong-wire'){
    const response=await request('/v1/market/profile',command==='wrong-wire'?{headers:{'x-ae-wire-version':'1'}}:{});
    const value=response.body?.value;
    emit({ok:command==='profile'&&response.status===200&&response.body?.ok===true,status:response.status,code:codeOf(response),
      money:value?.capability?.money??null,signerAuthority:value?.signerAuthority??null,discovery:value?.capability?.discovery??null});
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
  if(command==='readback'||command==='replay-signup'){
    const secret=loadSecret(secretFile),name=command==='replay-signup'?'signup':flag('operation')||'signup';
    if(!['signup','login','recover'].includes(name)||!secret.operations?.[name])fail('account_operation_required');
    const stored=secret.operations[name];
    const response=await request(command==='readback'?'/v1/account/readback':'/v1/account/signup',
      {method:'POST',body:command==='readback'?{operation:name}:stored.body,headers:proofHeaders(stored)});
    receiveAccount(secret,name,response);
  }
  if(command==='login'||command==='recover'){
    const secret=loadSecret(secretFile),name=command;
    if(Object.values(secret.operations).some(op=>op.state==='pending'))fail('pending_account_operation_readback_required');
    const body=name==='login'?{accountId:secret.accountId,password:secret.password}:
      {accountId:secret.accountId,recoveryCode:secret.recoveryCode,newPassword:randomBytes(24).toString('hex')};
    const stored={idempotencyKey:operation(name),proof:token(),body,state:'pending'};
    secret.operations[name]=stored;saveSecret(secretFile,secret);
    receiveAccount(secret,name,await request('/v1/account/'+name,{method:'POST',body,headers:proofHeaders(stored)}));
  }
  if(['post','replay-post','conflict-post','post-without-csrf'].includes(command)){
    const secret=loadSecret(secretFile),fresh=command==='post';
    const stored=fresh?{idempotencyKey:operation('post'),body:{title:flag('title'),summary:flag('summary'),criteria:[flag('criterion')],payableKinds:['usable']}}:secret.operations.post;
    if(!stored)fail('post_operation_required');
    if(fresh){secret.operations.post=stored;saveSecret(secretFile,secret);}
    const body=command==='conflict-post'?{...stored.body,title:'Different unfunded title'}:stored.body;
    const response=await request('/v1/market/post',{method:'POST',body,headers:{...sessionHeaders(secret,command!=='post-without-csrf'),'idempotency-key':stored.idempotencyKey}});
    if(response.status===0)emit({ok:false,status:0,code:'unknown_outcome',nextAction:'replay-post'},2);
    const result=response.body?.value?.result,state=result?.state??null;
    if(fresh&&response.status===200){secret.taskId=result.taskId;saveSecret(secretFile,secret);}
    const replay=command==='replay-post'&&response.status===200&&(!secret.taskId||result?.taskId===secret.taskId);
    if(replay){secret.taskId=result.taskId;saveSecret(secretFile,secret);}
    emit({ok:(fresh&&response.status===200&&state==='unfunded_interest')||replay,status:response.status,code:codeOf(response),state,
      ...(result?.taskId?{taskId:result.taskId}:{}),...(command==='replay-post'?{replay}:{}),commissioned:false});
  }
  if(command==='interest'){
    const secret=loadSecret(secretFile),taskId=flag('task-id')||(flag('peer-secret')?loadSecret(flag('peer-secret')).taskId:null);
    if(!/^market-[0-9a-f]{64}$/.test(taskId||'')||!flag('note'))fail('interest_arguments_refused');
    const stored={idempotencyKey:operation('interest'),body:{taskId,note:flag('note')}};
    secret.operations.interest=stored;saveSecret(secretFile,secret);
    const response=await request('/v1/market/interest',{method:'POST',body:stored.body,headers:{...sessionHeaders(secret),'idempotency-key':stored.idempotencyKey}});
    emit({ok:response.status===200&&response.body?.value?.result?.state==='unfunded_interest',status:response.status,code:codeOf(response),
      state:response.body?.value?.result?.state??null,commissioned:false});
  }
  if(command==='fund'){
    const secret=loadSecret(secretFile),response=await request('/v1/market/fund',{method:'POST',body:{taskId:secret.taskId,quoteDigest:'unfunded',proofId:'unfunded'},
      headers:{...sessionHeaders(secret),'idempotency-key':operation('fund')}});
    emit({ok:false,status:response.status,code:codeOf(response),paidWork:false});
  }
  fail('usage');
}
main().catch(error=>emit({ok:false,code:error.codeName||'client_input_refused'}));
