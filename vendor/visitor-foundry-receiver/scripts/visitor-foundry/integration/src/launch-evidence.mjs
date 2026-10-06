// Receiver-only diagnostics. Observe Node's documented channel; never patch spawn,
// inspect argv/env/stderr, change a launch, or infer physical termination from this trace.
import {AsyncLocalStorage} from 'node:async_hooks';
import {channel} from 'node:diagnostics_channel';
import {lstatSync,accessSync,constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {python} from '../../execution/src/supervisor.mjs';
const context=new AsyncLocalStorage(),children=channel('child_process');
const failures=Object.freeze({ENOENT:['spawn_not_found','filesystem','interpreter_or_loader'],ENOTDIR:['spawn_not_directory','filesystem','interpreter'],
 EACCES:['spawn_permission','permission','launch_boundary'],EPERM:['spawn_denied','permission','process'],
 EAGAIN:['spawn_process_capacity','capacity','process'],ENOMEM:['spawn_memory_capacity','capacity','memory'],
 EMFILE:['spawn_file_capacity','capacity','file_descriptors'],ENFILE:['spawn_file_capacity','capacity','file_descriptors'],
 ERR_ACCESS_DENIED:['spawn_permission_model','permission','process']});
const aliases=new Map(Object.values(failures).map(x=>[x[0],x]));
const entries=new Set(['regular_executable','regular_not_executable','symbolic_link','missing','unreadable']);
export function launchFailure(error){
 const value=typeof error?.code==='string' && Object.hasOwn(failures,error.code)?failures[error.code]:['spawn_unclassified','unknown','process'];
 return {stage:'launch',code:value[0],errorClass:value[1],resource:value[2],nativeCode:Object.hasOwn(failures,error?.code)?error.code:null};
}
export function launchResources(){
 let interpreterEntry='unreadable';try{const s=lstatSync(python);if(s.isSymbolicLink())interpreterEntry='symbolic_link';else if(s.isFile()){
  try{accessSync(python,constants.X_OK);interpreterEntry='regular_executable';}catch{interpreterEntry='regular_not_executable';}
 }}catch(error){if(error.code==='ENOENT')interpreterEntry='missing';}
 let childPermission=null;try{if(process.permission)childPermission=process.permission.has('child');}catch{}
 const uid=process.geteuid?.(),gid=process.getegid?.(),groups=process.getgroups?.()??[];
 const fixed={runtime:path.dirname(path.dirname(python)),bin:path.dirname(python),interpreter:python,
  launcher:fileURLToPath(new URL('../../execution/src/launcher.py',import.meta.url)),child:fileURLToPath(new URL('../../execution/src/child.py',import.meta.url)),cwd:'/'};
 const roles=Object.fromEntries(Object.entries(fixed).map(([role,file])=>{
  let mode=null,identityRole=null,type=null;try{const s=lstatSync(file);mode=s.mode&0o7777;identityRole=s.uid===uid?'owner':s.gid===gid||groups.includes(s.gid)?'group':'other';type=s.isDirectory()?'directory':s.isFile()?'regular':s.isSymbolicLink()?'link':'other';}catch{}
  const check=flag=>{try{accessSync(file,flag);return {ok:true,code:null};}catch(e){return {ok:false,code:['EACCES','EPERM','ENOENT','ENOTDIR','ERR_ACCESS_DENIED'].includes(e.code)?e.code:'unclassified'};}};
  return [role,{type,mode,identityRole,read:check(constants.R_OK),execute:role==='interpreter'||role==='runtime'||role==='bin'||role==='cwd'?check(constants.X_OK):null}];
 }));
 return {interpreterEntry,childPermission,processIdentity:uid===0?'root':'unprivileged',effectiveUid:uid??null,effectiveGid:gid??null,launchIdentity:'inherited',launchCwd:'root',roles};
}
// No launch is attempted here. Access success cannot prove provider exec permission.
export function launchAccessReady(){const r=launchResources();return ['regular_executable','symbolic_link'].includes(r.interpreterEntry) && r.childPermission!==false
 && ['runtime','bin','interpreter','cwd'].every(k=>r.roles[k].execute?.ok===true)
 && ['launcher','child'].every(k=>r.roles[k].type==='regular' && r.roles[k].read.ok===true);}
const resourceRoles=['runtime','bin','interpreter','launcher','child','cwd'];
const accessCodes=new Set(['EACCES','EPERM','ENOENT','ENOTDIR','ERR_ACCESS_DENIED','unclassified']);
function safeResources(value){
 const roles=value?.roles;if(!roles || !resourceRoles.every(k=>Object.hasOwn(roles,k)))return {};
 const access=v=>v && typeof v.ok==='boolean'?{ok:v.ok,code:v.ok?null:accessCodes.has(v.code)?v.code:'unclassified'}:null;
 const identity=n=>Number.isInteger(n)&&n>=0&&n<=4294967295?n:null;
 return {processIdentity:['root','unprivileged'].includes(value.processIdentity)?value.processIdentity:null,effectiveUid:identity(value.effectiveUid),effectiveGid:identity(value.effectiveGid),launchIdentity:'inherited',launchCwd:'root',
  roles:Object.fromEntries(resourceRoles.map(k=>{const v=roles[k];return [k,{type:['directory','regular','link','other'].includes(v?.type)?v.type:null,
   mode:Number.isInteger(v?.mode)&&v.mode>=0&&v.mode<=0o7777?v.mode:null,identityRole:['owner','group','other'].includes(v?.identityRole)?v.identityRole:null,read:access(v?.read),execute:access(v?.execute)}];}))};
}
export function launchEvidenceView(value){
 if(!value || value.schema!=='neomorphic.foundry.launch-evidence.v1')return null;
 const f=value.failure,alias=aliases.get(f?.code)??['spawn_unclassified','unknown','process'];
 return {schema:value.schema,...safeResources(value),interpreterEntry:entries.has(value.interpreterEntry)?value.interpreterEntry:null,
  childPermission:typeof value.childPermission==='boolean'?value.childPermission:null,
  failure:f?{stage:'launch',code:alias[0],errorClass:alias[1],resource:alias[2],nativeCode:Object.hasOwn(failures,f.nativeCode) && failures[f.nativeCode][0]===alias[0]?f.nativeCode:null}:null};
}
export async function observeLaunch(run){
 const record={schema:'neomorphic.foundry.launch-evidence.v1',...launchResources(),failure:null},scope={record},owned=[];
 const listener=message=>{try{
  if(context.getStore()!==scope || owned.length>=1)return;
  const child=message?.process;if(!child?.once)return;
  const error=e=>{try{if(child.spawnfile===python && !child.pid)record.failure=launchFailure(e);}catch{}};
  child.once('error',error);owned.push({child,error});
 }catch{/* A diagnostic subscriber cannot change execution. */}};
 children.subscribe(listener);
 try{return await context.run(scope,async()=>({sample:await run(),launchEvidence:launchEvidenceView(record)}));}
 finally{children.unsubscribe(listener);for(const {child,error}of owned)child.off('error',error);}
}
