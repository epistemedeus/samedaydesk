import { hashRequest } from './deps.mjs';
import { fileURLToPath } from 'node:url';
import {lstatSync,readlinkSync} from 'node:fs';
import path from 'node:path';
export const RECEIVE_MS = 20000, ACK_MS = 3000;
// Disconnect stops local SQL immediately; the server's existing statement
// timeout bounds its current statement before session termination/rollback.
export const SQL_CLEANUP_MS = 5000;
export const PROGRESS_SCOPE = 'vf12:entry-progress:v1';
const states = ['unknown','pending','ready','declined'];
const codes = new Set(['transaction_aborted','receive_deadline','port_error','entry_binding_mismatch','charged_attempt_mismatch',
  'admission_binding_mismatch','host_installation_mismatch','receiver_pool_mismatch','installed_verification_changed',
  'immutable_pool_configuration','installed_source_changed','ingress_capacity','entry_busy','receiver_invalid_readback',
  'invalid_invocation_cap','invalid_policy_revision','invalid_evidence_validity']);
const sql = Object.freeze({'57014':'sql_statement_timeout','55P03':'sql_lock_timeout','40P01':'sql_deadlock','53300':'sql_capacity',
  '23502':'sql_not_null','23503':'sql_foreign_key','23505':'sql_unique','23514':'sql_check','23P01':'sql_exclusion',
  '42P01':'sql_table_missing','42703':'sql_column_missing','3F000':'sql_schema_missing','42501':'sql_permission',
  '22P02':'sql_invalid_text','22P05':'sql_untranslatable_character','22021':'sql_character_encoding','22003':'sql_numeric_range',
  '40001':'sql_serialization','25P02':'sql_transaction_failed','25006':'sql_read_only','P0001':'sql_raised_exception'});
const filesystem = Object.freeze({ENOENT:'filesystem_missing',ENOTDIR:'filesystem_not_directory',EACCES:'filesystem_permission',
  EPERM:'filesystem_permission',ELOOP:'filesystem_symlink_loop',EIO:'filesystem_io',EMFILE:'filesystem_capacity',ENFILE:'filesystem_capacity'});
const stages = new Set(['receiver_transaction','receiver_authority','admission_read','admission_binding','workspace_clock',
  'admission_decline','pool_configuration','portable_policy','portable_verification','pool_insert','pool_identity',
  'experiment_insert','peer_read','share_insert','pool_readback','admission_ready']);
const tagged = new WeakMap();
const runtimeRoot=fileURLToPath(new URL('../../execution/',import.meta.url));
const resources=new Map([['.runtime/pyvenv.cfg','runtime_config'],['.runtime/bin/python','interpreter'],
  ['src/child.py','execution_source'],['src/supervisor.mjs','execution_source'],['src/contracts.mjs','execution_source'],
  ['src/launch.mjs','launcher_source'],['src/launcher.py','launcher_source']].map(([file,kind])=>[runtimeRoot+file,kind]));
const resourceKinds=new Set([...resources.values(),'wasmtime_bindings','wasmtime_native']);
const entryKinds=new Set(['missing_entry','unreachable_internal_relative_link','unreachable_internal_absolute_link',
  'unreachable_external_relative_link','unreachable_external_absolute_link','changed_since_failure','unreadable_entry','link_depth_exceeded']);
function interpreterEntry(error,resource) {
  if(error?.code!=='ENOENT'||resource!=='interpreter')return null;
  const directory=runtimeRoot+'.runtime';
  let file=directory+'/bin/python',hops=0,absolute=false;
  // At most eight no-follow metadata/readlink pairs; never inspect outside the
  // installed execution subtree, follow a target's contents, or disclose a path.
  while(hops<8){
    // Refuse symlinked parents instead of following metadata outside the tree.
    const parents=path.relative(directory,path.dirname(file)).split(path.sep).filter(Boolean);
    if(parents.length>8)return 'unreadable_entry';
    let parent=directory;try{
      if(!lstatSync(parent).isDirectory())return 'unreadable_entry';
      for(const part of parents){parent=path.join(parent,part);if(!lstatSync(parent).isDirectory())return 'unreadable_entry';}
    }catch{return 'unreadable_entry';}
    let stat;try{stat=lstatSync(file);}catch(e){return e.code==='ENOENT'?hops===0?'missing_entry':absolute?'unreachable_internal_absolute_link':'unreachable_internal_relative_link':'unreadable_entry';}
    if(!stat.isSymbolicLink())return 'changed_since_failure';
    let link;try{link=readlinkSync(file);}catch{return 'unreadable_entry';}
    absolute ||= path.isAbsolute(link);file=path.resolve(path.dirname(file),link);hops++;
    if(!file.startsWith(runtimeRoot))return absolute?'unreachable_external_absolute_link':'unreachable_external_relative_link';
  }
  return 'link_depth_exceeded';
}
function runtimeResource(error) {
  // Compare against this installed closure only. Do not stat, log or return a
  // path, basename, arbitrary module name or error prose.
  const path=error?.path;
  if(typeof path!=='string')return null;
  if(resources.has(path))return resources.get(path);
  if(!path.startsWith(runtimeRoot+'.runtime/lib/'))return null;
  const relative=path.slice((runtimeRoot+'.runtime/lib/').length);
  if(/^python\d+\.\d+\/site-packages\/wasmtime\/linux-x86_64\/_libwasmtime\.so$/.test(relative))return 'wasmtime_native';
  if(/^python\d+\.\d+\/site-packages\/wasmtime(?:\/[a-zA-Z0-9_/-]+\.py)?$/.test(relative))return 'wasmtime_bindings';
  return null;
}
// Retain the actual inner failure tag and rethrow the original error. No retry,
// filesystem preflight, SQL change or receiving behavior is added here.
export async function receivingStep(stage, fn) {
  if (!stages.has(stage)) throw new TypeError('invalid receiving stage');
  try { return await fn(); } catch(error) {
    if (error && typeof error==='object' && !tagged.has(error)) tagged.set(error,stage);
    throw error;
  }
}
export function phaseFailure(error) {
  const code=error?.code,raw=typeof code==='string'?code:null,stage=error && typeof error==='object' ? tagged.get(error) ?? null : null;
  const resource=Object.hasOwn(filesystem,raw)?runtimeResource(error):null;
  const context={stage,resource,interpreterEntry:interpreterEntry(error,resource)};
  if (Object.hasOwn(sql,raw)) return {code:sql[raw],errorClass:'sql',sqlState:raw,...context};
  if (/^08[A-Z0-9]{3}$/.test(raw ?? '')) return {code:'sql_connection_failure',errorClass:'sql',sqlState:null,...context};
  if (Object.hasOwn(filesystem,raw)) return {code:filesystem[raw],errorClass:'filesystem',sqlState:null,...context};
  if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE'].includes(raw)) return {code:'connection_failure',errorClass:'transport',sqlState:null,...context};
  if (raw==='INVALID_INPUT') return {code:'validation_failed',errorClass:'validation',sqlState:null,...context};
  if (codes.has(raw)) return {code:raw,errorClass:['transaction_aborted','receive_deadline','ingress_capacity','entry_busy'].includes(raw)?'transaction':raw==='port_error'?'unknown':'validation',sqlState:null,...context};
  return {code:'port_error',errorClass:'unknown',sqlState:null,...context};
}
export const phaseCode = error => phaseFailure(error).code;
export function progressBinding(row) {
  return hashRequest({registrationId:row.id,projectId:row.project_id,receiverId:row.receiver_id,requestHash:row.request_hash,
    entryTerms:row.entry_profile?.termsHash,hostConfigId:row.entry_profile?.contribution?.binding?.hostConfigId});
}
// Only this projection leaves the private journal. No error prose, SQL or args.
export function progressView(value) {
  if (!value || value.schema !== 'neomorphic.foundry.entry-progress.v1' || !Array.isArray(value.phases) || value.phases.length > 4) return null;
  const safeCodes = new Set([...codes,...Object.values(sql),...Object.values(filesystem),'sql_connection_failure','connection_failure','validation_failed']);
  return {schema:value.schema,receiveBudgetMs:RECEIVE_MS,ackBudgetMs:ACK_MS,sqlCleanupBoundMs:SQL_CLEANUP_MS,totalBudgetMs:RECEIVE_MS+ACK_MS+SQL_CLEANUP_MS,
    plannedPhase:['begin','recover','read'].includes(value.plannedPhase)?value.plannedPhase:null,
    budgetExpired:value.budgetExpired===true,observedState:states.includes(value.observedState)?value.observedState:'unknown',
    acknowledgedState:states.includes(value.acknowledgedState)?value.acknowledgedState:'unknown',
    phases:value.phases.map(p=>({phase:['marker','begin','recover','read'].includes(p.phase)?p.phase:'unknown',
      outcome:['returned','error','deadline'].includes(p.outcome)?p.outcome:'error',
      code:p.code===null?null:safeCodes.has(p.code)?p.code:'port_error',
      errorClass:['sql','filesystem','transport','validation','transaction','unknown'].includes(p.errorClass)?p.errorClass:null,
      sqlState:typeof p.sqlState==='string'&&Object.hasOwn(sql,p.sqlState)?p.sqlState:null,stage:stages.has(p.stage)?p.stage:null,
      resource:resourceKinds.has(p.resource)?p.resource:null,
      interpreterEntry:entryKinds.has(p.interpreterEntry)?p.interpreterEntry:null,
      state:states.includes(p.state)?p.state:null,ms:Number.isFinite(p.ms)?Math.max(0,Math.min(RECEIVE_MS,Math.round(p.ms))):null}))};
}
