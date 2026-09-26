import {readFile} from 'node:fs/promises';
import {hash} from '../../capabilities/src/index.mjs';
import {hashToken,hashRequest} from '../../entry/src/deps.mjs';
import {SCHEMA,need,EntryError} from '../../entry/src/contract.mjs';
import {checkInstalledVerification} from '../src/verification.mjs';
import {hostProfile,entryBinding,RECEIVER_ID} from './profile.mjs';

/** Trusted binding over existing entry charges and canonical receiver transactions.
 * begin crosses two durable phases once. read never mutates; private recover
 * finishes an already reserved phase or fences absent begin with a tombstone. */
export class EntryReceiver {
 constructor(integration,options){this.store=integration;this.config=hostProfile(options);this.id=RECEIVER_ID;}
 async migrate(){const sql=await readFile(new URL('../../../../services/correspondence/migrations/visitor-foundry/005_vf12_entry.sql',import.meta.url),'utf8');await this.store.db.tx(c=>c.query(sql));}
 binding(){return entryBinding(this.config);}
 async installBinding(c,profile){
  need(hash(profile.contribution?.binding)===hash(this.binding()),409,'entry_receiver_profile_mismatch');
  await c.query('INSERT INTO correspondence_vf12_host(singleton,config) VALUES(true,$1) ON CONFLICT DO NOTHING',[this.config]);
  const stored=(await c.query('SELECT config FROM correspondence_vf12_host WHERE singleton FOR UPDATE')).rows[0].config;
  need(hash(stored)===hash(this.config),409,'immutable_host_allocation');
 }
 async host(c,write=false){const row=(await c.query(`SELECT config FROM correspondence_vf12_host WHERE singleton FOR ${write?'UPDATE':'SHARE'}`)).rows[0];need(row&&hash(row.config)===hash(this.config),409,'host_installation_mismatch');return row.config;}
 async charged(c,{registrationId,projectId}){
  const r=(await c.query('SELECT * FROM correspondence_vf10_registrations WHERE id=$1 FOR SHARE',[registrationId])).rows[0];
  const entry=(await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton')).rows[0];
  need(r&&r.project_id===projectId&&r.receiver_started&&r.receiver_id===this.id&&r.entry_profile?.contribution,409,'entry_binding_mismatch');
  need(entry.active_receiver_id===this.id&&entry.active_profile.termsHash===r.entry_profile.termsHash&&hash(r.entry_profile.contribution.binding)===hash(this.binding()),409,'entry_binding_mismatch');
  need(r.request_hash===hashRequest({schema:SCHEMA,requestId:r.request_id,profileId:r.entry_profile.profileId,termsHash:r.entry_profile.termsHash}),409,'charged_attempt_mismatch');
  const binding={schema:'neomorphic.foundry.charged-entry-admission.v1',registrationId,projectId,requestHash:r.request_hash,entryTerms:r.entry_profile.termsHash,profileId:r.entry_profile.profileId,hostConfigId:this.config.configId,receiverId:this.id,allowance:this.config.allowance};
  return {r,binding};
 }
 async begin(input){
  await this.store.db.tx(async c=>{
   await this.host(c,true);const {r,binding}=await this.charged(c,input);
   const old=(await c.query('SELECT * FROM correspondence_vf12_admissions WHERE registration_id=$1',[r.id])).rows[0];
   if(old){need(hash(old.binding)===hash(binding),409,'admission_binding_mismatch');return;}
   const count=(await c.query('SELECT count(*)::int AS n FROM correspondence_vf12_admissions WHERE charged')).rows[0].n;
   const expired=r.expires_at<=new Date(await this.store.db.now(c));const accepted=count<this.config.maxAdmissions&&!expired;
   await c.query('INSERT INTO correspondence_vf12_admissions(registration_id,project_id,binding,state,charged,reason) VALUES($1,$2,$3,$4,$5,$6)',[r.id,r.project_id,binding,accepted?'pending':'declined',accepted,accepted?null:expired?'workspace_expired':'aggregate_allowance_exhausted']);
  });
  await this.afterReservation?.(input);
  if(input.signal?.aborted)return;
  await this.complete(input);
 }
 async complete(input){
  const result=await this.store.db.tx(async c=>{
   await this.host(c,true);const {r,binding}=await this.charged(c,input);
   const row=(await c.query('SELECT * FROM correspondence_vf12_admissions WHERE registration_id=$1 FOR UPDATE',[r.id])).rows[0];
   need(row&&hash(row.binding)===hash(binding),409,'admission_binding_mismatch');
   if(row.state!=='pending')return row.state;
   if(r.expires_at<=new Date(await this.store.db.now(c))){await c.query("UPDATE correspondence_vf12_admissions SET state='declined',reason='workspace_expired_after_reservation' WHERE registration_id=$1",[r.id]);return 'declined';}
   const p=this.config.pool;
   await this.store.enrollPortable(r.project_id,{validityMs:p.validityMs,maxInvocations:p.maxInvocations,maxValidationCostUnits:p.maxValidationCostUnits,entryBounds:{...p,hostConfigId:this.config.configId}},c);
   // Shares expose only canonical published code/evidence, never private correspondence.
   const peers=(await c.query("SELECT project_id FROM correspondence_vf12_admissions WHERE state='ready' ORDER BY project_id")).rows;
   for(const peer of peers){await c.query('INSERT INTO correspondence_vf04_shares(consumer,source) VALUES($1,$2),($2,$1) ON CONFLICT DO NOTHING',[r.project_id,peer.project_id]);}
   const installed=(await c.query('SELECT config FROM correspondence_vf04_pools WHERE project_id=$1',[r.project_id])).rows[0].config;
   await c.query("UPDATE correspondence_vf12_admissions SET state='ready',pool_config_digest=$2 WHERE registration_id=$1",[r.id,hash(installed)]);return 'ready';
  });
  await this.afterCompletion?.(input);return result;
 }
 async read(input){return this.store.db.tx(async c=>{
  await this.host(c);const {binding}=await this.charged(c,input);
  const row=(await c.query('SELECT * FROM correspondence_vf12_admissions WHERE registration_id=$1',[input.registrationId])).rows[0];
  if(!row)return 'unknown';need(hash(row.binding)===hash(binding),409,'admission_binding_mismatch');
  if(row.state==='ready'){
   const pool=(await c.query('SELECT config,verification FROM correspondence_vf04_pools WHERE project_id=$1',[input.projectId])).rows[0];
   need(pool&&hash(pool.config)===row.pool_config_digest&&pool.config.entryHost===this.config.configId&&hash(pool.config.entryBounds)===hash({...this.config.pool,hostConfigId:this.config.configId}),409,'receiver_pool_mismatch');
   checkInstalledVerification(pool.verification,pool.config);
  }
  return row.state;
 });}
 async recover(input){
  // Authoritative tombstone prevents a delayed first begin from reviving an
  // absent reservation. It never repeats an unknown begin call.
  const state=await this.store.db.tx(async c=>{
   await this.host(c,true);const {r,binding}=await this.charged(c,input);
   const old=(await c.query('SELECT * FROM correspondence_vf12_admissions WHERE registration_id=$1',[r.id])).rows[0];
   if(old){need(hash(old.binding)===hash(binding),409,'admission_binding_mismatch');return old.state;}
   await c.query("INSERT INTO correspondence_vf12_admissions(registration_id,project_id,binding,state,charged,reason) VALUES($1,$2,$3,'declined',false,'begin_absent_fenced_by_private_recovery')",[r.id,r.project_id,binding]);return 'declined';
  });
  return state==='pending'?this.complete(input):state;
 }
 async authorizeRequest(req,token){
  const match=/^\/v1\/projects\/([^/]+)\/foundry(?:\/(.*))?$/i.exec(req.path);
  need(match,403,'entry_scope_excludes_receiver');
  const path=(match[2]??'').toLowerCase();
  const read=req.method==='GET'&&(/^(participation\/terms|participation\/cells\/[^/]+|status)$/.test(path));
  const post=req.method==='POST'&&['task','resolve','invoke','decline','components','participation','withdraw','observe'].includes(path);
  need(read||post,403,'entry_scope_excludes_receiver');
  await this.store.db.tx(async c=>{
   let grant;try{grant=await this.store.db.authorize(c,{projectId:match[1],token},false);}catch(e){if([401,403,404].includes(e.status))throw new EntryError(e.status,e.code,e.status===401?'renew_same_registration':'continue_original');throw e;}
   const reg=(await c.query('SELECT * FROM correspondence_vf10_registrations WHERE project_id=$1',[match[1]])).rows[0];
   need(reg?.entry_profile?.contribution&&reg.receiver_id===this.id,403,'entry_scope_excludes_receiver');
   await this.host(c);
   need(reg.expires_at>new Date(await this.store.db.now(c)),410,'workspace_expired');
   const {binding}=await this.charged(c,{registrationId:reg.id,projectId:reg.project_id});
   const row=(await c.query('SELECT * FROM correspondence_vf12_admissions WHERE registration_id=$1',[reg.id])).rows[0];
   need(row?.state==='ready'&&row.charged&&hash(row.binding)===hash(binding),409,'receiver_not_ready','use_private_correspondence');
   const sharing=['components','participation'].includes(path)||path==='task'&&req.body?.sharing;
   if(sharing){
    need(grant.role!=='reader',403,'forbidden');
    need(req.header('x-foundry-entry-terms')===reg.entry_profile.termsHash,409,'stale_entry_terms','read_descriptor');
    const terms=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[reg.project_id])).rows[0]?.participation;
    need(req.header('x-foundry-contribution-terms')===terms?.id&&terms.id===this.config.contributionTerms,409,'stale_contribution_terms','continue_original');
   }
  });
 }
 async status(){return this.store.db.tx(async c=>{const config=await this.host(c);const admissions=(await c.query('SELECT registration_id,project_id,state,charged,reason,binding FROM correspondence_vf12_admissions ORDER BY registration_id')).rows;const n=admissions.filter(r=>r.charged).length;return {config,admissions,allocated:Object.fromEntries(Object.entries(config.allowance).map(([k,v])=>[k,v*n])),remainingAdmissions:config.maxAdmissions-n};});}
}
