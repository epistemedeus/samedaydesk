import {fork,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createFoundryExtension} from '../src/extension.mjs';
import {cases,PORTABLE_ENV,PORTABLE_OUTCOME} from '../src/portable-profile.mjs';
import {BASE,SCHEMA,grantToken} from '../../entry/src/contract.mjs';
export {cases,BASE,SCHEMA};
export const privateProfile={id:'vf10:private-v1',maxEnrollments:12,maxEvents:3,grantSeconds:3600,workspaceSeconds:86400};
export const hostProfile={id:'host:vf12-qa',maxAdmissions:4,maxPhysical:1,pool:{validityMs:3600000,maxInvocations:8,maxValidationCostUnits:'16000',maxCandidates:4,maxPackages:16,maxWorkCells:4,maxCellCommands:24,maxHttpKeys:48,maxNativeCommands:128,maxManifests:48}};
export const random=()=>randomBytes(32).toString('base64url');
export const task=(input,taskId=`task:${randomUUID()}`)=>({schema:'neomorphic.foundry.capability-request.v1',taskId,outcome:PORTABLE_OUTCOME,input,environment:PORTABLE_ENV,output:null,capabilityId:null});
export const original=()=>task({structuredContent:{event:{id:'evt_original',kind:'artifact'},replayed:false},content:[{type:'text',text:'redundant rendering'}]},'task:visitor-a');
export async function http(host,path,{token,body,key,method=body?'POST':'GET',headers={}}={}){const r=await fetch(`${host.baseUrl}${path}`,{method,redirect:'error',headers:{...headers,...(token?{authorization:`Bearer ${token}`}:{})},...(body?{headers:{...headers,authorization:token?`Bearer ${token}`:'','content-type':'application/json','idempotency-key':key??body.requestId??random()},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};}
export function attempt(d){return {proof:random(),body:{schema:SCHEMA,requestId:random(),profileId:d.profile.profileId,termsHash:d.profile.termsHash}};}
export const register=(host,a,action='register')=>http(host,`${BASE}/${action}`,{token:a.proof,body:a.body});
export function credentials(a,r){return {projectId:r.projectId,registrationId:r.registrationId,token:grantToken(a.proof,r.registrationId,'writer'),headers:{'x-foundry-entry-terms':a.body.termsHash,'x-foundry-contribution-terms':r.contributionTerms}};}
export async function fixture(t,{privateOnly=false,privateOptions={},hostOptions={}}={}){
 const schema=`vf04_entry_${randomUUID().replaceAll('-','')}`,settings={...privateProfile,...privateOptions},limits={...hostProfile,...hostOptions,pool:{...hostProfile.pool,...hostOptions.pool}};
 const tmp=await mkdtemp('/tmp/vf12-owned-'),hosts=[];let extension;
 async function boot({port=0,privateOnly:only=privateOnly}={}){
  const child=fork(new URL('./entry-host.mjs',import.meta.url),[],{env:{...process.env,VF12_SCHEMA:schema,VF12_PRIVATE:JSON.stringify(settings),VF12_HOST:JSON.stringify(limits),VF12_PRIVATE_ONLY:only?'1':'0',VF12_PORT:String(port)},stdio:['ignore','ignore','pipe','ipc']});
  let logs='';child.stderr.on('data',b=>logs+=b);const exited=once(child,'exit');let timer;
  const ready=await Promise.race([once(child,'message').then(([m])=>m),exited.then(([code])=>{throw new Error(`host exit ${code}: ${logs}`);}),new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('boot timeout'));},15000);})]).finally(()=>clearTimeout(timer));
  const pending=new Map();child.on('message',m=>{const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);}});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('host exited'));}pending.clear();});
  const host={...ready,child,exited,logs:()=>logs,async stop(signal='SIGTERM'){if(child.exitCode!==null||child.signalCode!==null)return;child.kill(signal);await exited;},rpc(op,...args){return new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC timeout'));},20000);pending.set(id,{resolve,reject,timer});child.send({id,op,args});});}};
  hosts.push(host);return host;
 }
 t.after(async()=>{await Promise.all(hosts.map(h=>h.stop()));await extension?.close();await rm(tmp,{recursive:true,force:true});});
 const host=await boot();extension=await createFoundryExtension({enabled:true,databaseUrl:process.env.VF04_TEST_DATABASE_URL,schema,poolMax:2,participationKey:'vf12-test-host-private-purpose-key-32'});
 const store=extension.integration;
 return {host,boot,tmp,store,settings,limits,schema,query:(sql,v)=>store.db.tx(c=>c.query(sql,v)),async counts(){return (await store.db.tx(c=>c.query(`SELECT (SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,(SELECT charged FROM correspondence_vf10_installation) charged,(SELECT count(*)::int FROM correspondence_projects) projects,(SELECT count(*)::int FROM correspondence_grants) grants,(SELECT count(*)::int FROM correspondence_vf12_admissions WHERE charged) allocations,(SELECT count(*)::int FROM correspondence_vf04_pools) pools`))).rows[0];}};
}
const exec=promisify(execFile);
export async function configFor(f,host=f.host){const d=(await http(host,BASE)).body,dir=`${f.tmp}/${randomUUID()}`;const config={baseUrl:host.baseUrl,directory:dir,authority:{profileId:d.profile.profileId,entryTerms:d.profile.termsHash,contributionTerms:d.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}};const file=`${dir}.config`;await writeFile(file,JSON.stringify(config),{mode:0o600});return {config,file};}
export async function cli(c,mode,input){const file=`${c.file}.input`;if(input!==undefined)await writeFile(file,JSON.stringify(input),{mode:0o600});const {stdout}=await exec(process.execPath,['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,c.file,...(input!==undefined?[file]:[])],{maxBuffer:1048576});return JSON.parse(stdout);}
