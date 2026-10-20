#!/usr/bin/env node
// Root-only installed artifact administration. No provider, wallet or signer.
import {constants,openSync,readFileSync,fstatSync,closeSync,writeFileSync,mkdirSync} from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {walletEnvironmentPacket,machineEntryEnvironmentPacket} from '../src/release-profile.mjs';
import {unfundedFunnelSnapshot} from '../src/machine-funnel.mjs';
import pg from 'pg';
import {applyAdditiveSchema,assertObligationGuard,inspectInstallation,rollbackAdapter} from '../src/migrate.mjs';
import {IMPORT_BODY_KEYS,importBodyKeys,assertImportShape} from '../src/native-debt.mjs';
import {dischargeReceiptId} from '../src/native-obligation-discharge.mjs';
import {assertIdent} from '../src/profile.mjs';
const [command,...args]=process.argv.slice(2);
const stop=code=>{throw Object.assign(new Error(code),{codeName:code});};
const flag=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
function privateJson(file){
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||s.size>131072)stop('private_input_required');return JSON.parse(readFileSync(fd,'utf8'));}
 finally{closeSync(fd);}
}
async function database(){
 const raw=process.env.DATABASE_URL;let url;try{url=new URL(raw);}catch{stop('database_refused');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.searchParams.get('sslmode')!=='verify-full')stop('database_refused');
 const schema=assertIdent(process.env.HOSTED_WALLET_MARKET_EARNED_SCHEMA);
 const client=new pg.Client({connectionString:raw,connectionTimeoutMillis:10000});
 await client.connect();
 try{
  await client.query('BEGIN'+(['inspect','rollback-check'].includes(command)?' READ ONLY':''));
  await client.query(`SET LOCAL search_path TO ${schema}`);
  let result;
  if(command==='migrate'){await applyAdditiveSchema(client,{earnedSchema:schema});result={migrated:true};}
  else if(command==='seal'){
   const prior=await client.query('SELECT id FROM hosted_wallet_market_guard.obligation_guard_seal WHERE id IS TRUE');
   if(!prior.rows.length){
    await client.query(`INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids(id)
      SELECT id FROM ${schema}.earned_work_obligations UNION SELECT id FROM ${schema}.opportunity_obligations ON CONFLICT DO NOTHING`);
    await client.query('INSERT INTO hosted_wallet_market_guard.obligation_guard_seal(id,sealed_at) VALUES(TRUE,now())');
   }
   result=await assertObligationGuard(client,{earnedSchema:schema});
  }else if(command==='rollback-check')result=await rollbackAdapter(client,{earnedSchema:schema});
  else result=await inspectInstallation(client,{earnedSchema:schema});
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
}
async function request(method,route,body){
 const raw=process.env.HOSTED_WALLET_MARKET_ORIGIN;let origin;try{origin=new URL(raw);}catch{stop('origin_required');}
 if(origin.protocol!=='https:'||origin.origin!==raw||origin.username||origin.password)stop('origin_required');
 const owner=process.env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN ?? process.env.EARNED_WORK_OWNER_TOKEN;if(!owner||owner.length<8)stop('authority_required');
 const data=body===undefined?null:Buffer.from(JSON.stringify(body));
 const headers={authorization:'Bearer '+owner,'x-ae-wire-version':'c0-1'};
 if(data){headers['idempotency-key']=flag('operation');if(!headers['idempotency-key'])stop('idempotency_required');headers['content-type']='application/json';headers['content-length']=String(data.length);}
 return new Promise((resolve,reject)=>{
  const req=https.request(new URL('/api/neomorphic-contributor-journey'+route,origin),{method,headers},res=>{
   const unavailable=()=>reject(Object.assign(Error(),{codeName:method==='POST'?'unknown_outcome':'read_unavailable'}));
   res.on('error',unavailable);res.on('aborted',unavailable);
   let text='';res.setEncoding('utf8');res.on('data',c=>{text+=c;if(text.length>1048576)req.destroy();});
   res.on('end',()=>{try{const parsed=JSON.parse(text);if(res.statusCode!==200)reject(Object.assign(Error(),{codeName:parsed.code||'request_refused'}));else if(parsed.ok===true&&parsed.value)resolve(parsed.value);else reject(Object.assign(Error(),{codeName:method==='POST'?'unknown_outcome':'read_unavailable'}));}catch{reject(Object.assign(Error(),{codeName:method==='POST'?'unknown_outcome':'read_unavailable'}));}});
  });
  const timer=setTimeout(()=>req.destroy(),20000);req.on('close',()=>clearTimeout(timer));
  req.on('error',()=>reject(Object.assign(Error(),{codeName:method==='POST'?'unknown_outcome':'read_unavailable'})));req.end(data??undefined);
 });
}
async function main(){
 if(['inspect','migrate','seal','rollback-check'].includes(command))return database();
 if(command==='prepare-release'||command==='prepare-machine-entry'){
  const common={manifest:privateJson(flag('manifest')),existing:privateJson(flag('input')),sdsRoot:flag('sds-root')};
  const packet=command==='prepare-release'?walletEnvironmentPacket({...common,wallet:privateJson(flag('wallet'))}):
    machineEntryEnvironmentPacket({...common,machineProfile:process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE});
  const dir=flag('output');mkdirSync(dir,{mode:0o700});
  for(const name of ['install','rollback','receipt'])writeFileSync(path.join(dir,name+'.json'),JSON.stringify(packet[name],null,2)+'\n',{mode:0o600,flag:'wx'});
  return {prepared:true,keys:packet.install.env_vars.length,sent:false,qualified:false,machineProfile:packet.receipt.machineProfile??(command==='prepare-machine-entry'?'unfunded':'absent')};
 }
 if(command==='funnel'){
  const raw=process.env.DATABASE_URL;let url;try{url=new URL(raw);}catch{stop('database_refused');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.searchParams.get('sslmode')!=='verify-full')stop('database_refused');
  const schema=assertIdent(process.env.HOSTED_WALLET_MARKET_EARNED_SCHEMA);
  const exclude=flag('exclude')?privateJson(flag('exclude')):{};
  const client=new pg.Client({connectionString:raw,connectionTimeoutMillis:10000});
  await client.connect();
  try{
   await client.query('BEGIN READ ONLY');
   const result=await unfundedFunnelSnapshot(client,{earnedSchema:schema,tenant:process.env.HOSTED_WALLET_MARKET_TENANT,exclude});
   await client.query('COMMIT');
   return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
 }
 if(command==='prepare'){
  const receipt=privateJson(flag('input'));
  if(receipt.receiptId!==dischargeReceiptId(receipt)||receipt.kernelPaid!==false||receipt.kernelTransfer!==null)stop('receipt_refused');
  const input=Object.fromEntries(importBodyKeys(receipt).map(k=>[k,receipt[k]]));
  input.tenant=process.env.HOSTED_WALLET_MARKET_TENANT;input.receivedAt=flag('received-at');assertImportShape(input);
  writeFileSync(flag('output'),JSON.stringify(input,null,2)+'\n',{mode:0o600,flag:'wx'});return {prepared:true};
 }
 if(command==='enrollment')return request('GET','/v1/native-debt/enrollment');
 if(command==='disposition')return request('GET','/v1/native-debt?obligationId='+encodeURIComponent(flag('obligation')||''));
 if(command==='enroll')return request('POST','/v1/native-debt/enroll',{});
 if(command==='import'){const input=privateJson(flag('input'));assertImportShape(input);return request('POST','/v1/native-debt/import',input);}
 stop('usage');
}
main().then(result=>console.log(JSON.stringify({ok:true,result,secretPrinted:false}))).catch(error=>{
 const code=error.codeName&&/^[a-z_]+$/.test(error.codeName)?error.codeName:'refused';
 console.error(JSON.stringify({ok:false,code,secretPrinted:false}));process.exitCode=code==='unknown_outcome'?2:1;
});
