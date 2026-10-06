// Receiver-only diagnostics. Observe Node's documented channel; never patch spawn,
// inspect argv/env/stderr, change a launch, or infer physical termination from this trace.
import {AsyncLocalStorage} from 'node:async_hooks';
import {channel} from 'node:diagnostics_channel';
import {lstatSync,accessSync,constants} from 'node:fs';
import {python} from '../../execution/src/supervisor.mjs';
const context=new AsyncLocalStorage(),children=channel('child_process');
const failures=Object.freeze({ENOENT:['spawn_not_found','filesystem','interpreter_or_loader'],ENOTDIR:['spawn_not_directory','filesystem','interpreter'],
 EACCES:['spawn_permission','permission','interpreter'],EPERM:['spawn_denied','permission','process'],
 EAGAIN:['spawn_process_capacity','capacity','process'],ENOMEM:['spawn_memory_capacity','capacity','memory'],
 EMFILE:['spawn_file_capacity','capacity','file_descriptors'],ENFILE:['spawn_file_capacity','capacity','file_descriptors'],
 ERR_ACCESS_DENIED:['spawn_permission_model','permission','process']});
const aliases=new Map(Object.values(failures).map(x=>[x[0],x]));
const entries=new Set(['regular_executable','regular_not_executable','symbolic_link','missing','unreadable']);
export function launchFailure(error){
 const value=typeof error?.code==='string' && Object.hasOwn(failures,error.code)?failures[error.code]:['spawn_unclassified','unknown','process'];
 return {stage:'launch',code:value[0],errorClass:value[1],resource:value[2]};
}
export function launchResources(){
 let interpreterEntry='unreadable';try{const s=lstatSync(python);if(s.isSymbolicLink())interpreterEntry='symbolic_link';else if(s.isFile()){
  try{accessSync(python,constants.X_OK);interpreterEntry='regular_executable';}catch{interpreterEntry='regular_not_executable';}
 }}catch(error){if(error.code==='ENOENT')interpreterEntry='missing';}
 let childPermission=null;try{if(process.permission)childPermission=process.permission.has('child');}catch{}
 return {interpreterEntry,childPermission};
}
export function launchEvidenceView(value){
 if(!value || value.schema!=='neomorphic.foundry.launch-evidence.v1')return null;
 const f=value.failure,alias=aliases.get(f?.code)??['spawn_unclassified','unknown','process'];
 return {schema:value.schema,interpreterEntry:entries.has(value.interpreterEntry)?value.interpreterEntry:null,
  childPermission:typeof value.childPermission==='boolean'?value.childPermission:null,
  failure:f?{stage:'launch',code:alias[0],errorClass:alias[1],resource:alias[2]}:null};
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
