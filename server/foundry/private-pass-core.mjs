// Private owner adapter over the installed canonical assignment/publication journal.
// No migrations, enrollment, authority changes, guest engine or HTTP route.
import { hash,stableJSON } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/index.mjs';
import { supervise } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/supervisor.mjs';
import { recoverPool } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/recover.mjs';
import { checkInstalledVerification } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/verification.mjs';
import { PORTABLE_KIND } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-profile.mjs';

export const PASS_SCHEMA = 'sds.foundry.private-pass.v1';
export const PASS_SCOPE = 'sds:private-pass:v1';
const fields = ['schema','intentId','action','projectId','expectedHostConfigId','expectedEntryTermsHash',
  'expectedVerificationId','candidateId','expectedGeneration','reconcileIntentId'];
export const digest = hash;
export const canonicalJSON = stableJSON;
export function need(ok, code) { if (!ok) throw Object.assign(new Error(code), { code }); }
const id = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(value);
const sha = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
export function validateRequest(value) {
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value,k)), 'private_pass_request_invalid');
  const r = Object.fromEntries(fields.map(k => [k,value[k]]));
  need(r.schema === PASS_SCHEMA && ['observe','dispatch','reconcile'].includes(r.action) && id(r.intentId) && id(r.projectId)
    && sha(r.expectedHostConfigId) && sha(r.expectedEntryTermsHash), 'private_pass_request_invalid');
  need(r.action === 'observe' ? r.reconcileIntentId === null : r.action === 'dispatch' ? r.reconcileIntentId === null : id(r.reconcileIntentId) && r.reconcileIntentId !== r.intentId, 'private_pass_request_invalid');
  need((r.expectedVerificationId === null && r.action === 'observe') || sha(r.expectedVerificationId), 'private_pass_request_invalid');
  need((r.candidateId === null && r.expectedGeneration === null && r.action === 'observe')
    || id(r.candidateId) && Number.isSafeInteger(r.expectedGeneration) && r.expectedGeneration >= 1 && r.expectedGeneration <= 16, 'private_pass_request_invalid');
  return r;
}
async function bound(store, receiver, c, r, write) {
  const host = await receiver.host(c,write);
  need(host.configId === r.expectedHostConfigId, 'private_pass_host_conflict');
  const entry = (await c.query('SELECT active_profile FROM correspondence_vf10_installation WHERE singleton FOR SHARE')).rows[0];
  need(entry?.active_profile?.termsHash === r.expectedEntryTermsHash, 'private_pass_terms_conflict');
  const locked = await store.lock(c,r.projectId,write);
  need(locked.config.kind === PORTABLE_KIND && locked.config.entryHost === host.configId, 'private_pass_project_conflict');
  checkInstalledVerification(locked.verification,locked.config);
  if (r.expectedVerificationId !== null) need(locked.verification.id === r.expectedVerificationId, 'private_pass_verification_conflict');
  const candidates = (await c.query('SELECT id,generation,verification,manifest,artifact FROM correspondence_vf04_candidates WHERE project_id=$1 ORDER BY id LIMIT 17',[r.projectId])).rows;
  need(candidates.length <= 16,'private_pass_capacity');
  if (r.candidateId !== null) {
    const candidate = candidates.find(x => x.id === r.candidateId);
    need(candidate && candidate.generation === r.expectedGeneration, 'private_pass_candidate_conflict');
    need(candidate.verification?.id === locked.verification.id, 'private_pass_verification_conflict');
  }
  const engine = await store.replay(c,r.projectId,locked.config);
  return { ...locked, candidates, state: engine.service.snapshot() };
}
const ended = t => t?.noLaunch === true || t?.exited === true && t?.drained === true;
const termination = t => t ? { exited: t.exited === true, drained: t.drained === true, noLaunch: t.noLaunch === true,
  code: Number.isInteger(t.code) ? t.code : null, signal: typeof t.signal === 'string' && /^SIG[A-Z0-9]{1,12}$/.test(t.signal) ? t.signal : null } : null;
function sampleView(sample) {
  const o = sample?.observation;
  return o ? { id:o.id, status:o.status, binding:o.binding, phases:o.phasesObserved?.map(p=>p.phase) ?? [],
    termination:termination(o.termination), usage:o.usage, outputDigest:digest(sample.output ?? null) } : null;
}
async function physical(c, config) {
  return (await c.query(`SELECT count(*)::int AS n FROM (
    SELECT a.id FROM correspondence_vf04_attempts a JOIN correspondence_vf04_pools p USING(project_id)
      WHERE p.config->>'entryHost'=$1 AND a.state<>'reconciled'
    UNION ALL SELECT i.task_id FROM correspondence_vf04_invocations i JOIN correspondence_vf04_pools p USING(project_id)
      WHERE p.config->>'entryHost'=$1 AND i.state<>'completed') work`,[config.entryHost])).rows[0].n;
}
async function view(c,r,b) {
  const attempts = (await c.query('SELECT id,candidate_id,generation,verification,state,termination,children FROM correspondence_vf04_attempts WHERE project_id=$1 ORDER BY id LIMIT 65',[r.projectId])).rows;
  const invocations = (await c.query('SELECT task_id,manifest_id,input_digest,state,execution FROM correspondence_vf04_invocations WHERE project_id=$1 ORDER BY task_id LIMIT 65',[r.projectId])).rows;
  const publications = (await c.query('SELECT candidate_id,generation,state FROM correspondence_vf04_publications WHERE project_id=$1 ORDER BY candidate_id,generation LIMIT 65',[r.projectId])).rows;
  need(Math.max(attempts.length,invocations.length,publications.length) <= 64,'private_pass_capacity');
  const result = { projectId:r.projectId, hostConfigId:r.expectedHostConfigId, entryTermsHash:r.expectedEntryTermsHash,
    verificationId:b.verification.id, installedVerificationMatches:true, charged:b.state.charged,
    validationCeiling:b.config.limits.maxCost, invocationCeiling:b.config.invocationLimits, outstandingPhysical:await physical(c,b.config),
    candidates:b.candidates.map(x=>({ id:x.id,generation:x.generation,verificationId:x.verification?.id,
      stage:b.state.candidates[x.id]?.stage, acceptance:b.state.candidates[x.id]?.acceptance,
      moduleDigest:x.artifact?.descriptor?.module?.digest ?? x.artifact?.module?.digest ?? null, target:{capabilityId:x.manifest.capabilityId,version:x.manifest.version,contentId:x.manifest.contentId} })),
    attempts:attempts.map(a=>({id:a.id,candidateId:a.candidate_id,generation:a.generation,verificationId:a.verification?.id,state:a.state,
      termination:termination(a.termination),children:a.children.map(x=>({caseId:x.caseId,sample:sampleView(x.sample)}))})),
    publications:publications.map(p=>({candidateId:p.candidate_id,generation:p.generation,state:p.state})),
    invocations:invocations.map(i=>({ taskId:i.task_id,manifestId:i.manifest_id,inputDigest:i.input_digest,requestDigest:i.execution?.requestId,state:i.state,sourceProject:i.execution?.sourceProject,
      candidateId:i.execution?.binding?.candidateId,generation:i.execution?.generation,verificationId:i.execution?.verification?.id,
      binding:i.execution?.binding,sample:sampleView(i.execution?.sample) })) };
  need(Buffer.byteLength(JSON.stringify(result)) <= 60000,'private_pass_capacity');
  return result;
}
async function journal(c,r) {
  return (await c.query('SELECT request_hash,response_json FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND key=$3 FOR UPDATE',[PASS_SCOPE,r.projectId,r.intentId])).rows[0];
}
async function save(c,r,record,insert=false) {
  if (insert) await c.query('INSERT INTO correspondence_idempotency(scope,project_id,key,request_hash,status_code,response_json,created_at) VALUES($1,$2,$3,$4,200,$5,clock_timestamp())',[PASS_SCOPE,r.projectId,r.intentId,digest(r),record]);
  else await c.query('UPDATE correspondence_idempotency SET response_json=$4 WHERE scope=$1 AND project_id=$2 AND key=$3',[PASS_SCOPE,r.projectId,r.intentId,record]);
}
function witness(v,assignmentId) {
  const a=v.attempts.find(x=>x.id===assignmentId);
  need(a && a.state==='reconciled' && a.children.length>0 && a.children.every(x=>ended(x.sample?.termination)), 'private_pass_outcome_unknown');
  // Attempt-level termination is an aggregate; the child observations carry pipe drain.
  need(a.termination?.exited || a.termination?.noLaunch,'private_pass_outcome_unknown');
  return { assignment:a, publications:v.publications.filter(x=>x.candidateId===a.candidateId && x.generation===a.generation) };
}
export async function observePass(store,receiver,input) {
  const r=validateRequest(input);
  return store.db.tx(async c=>{ const b=await bound(store,receiver,c,r,false); const j=await journal(c,r);
    return {ok:true,action:'observe',mutated:false,journalState:j?.response_json.state ?? null,readback:await view(c,r,b)}; });
}
export async function runPrivatePass(store,receiver,input,{signal,persist=()=>{},onStarted=()=>{},onSpawn,localReceipts=[]}={}) {
  const r=validateRequest(input); if(r.action==='observe') return observePass(store,receiver,r);
  const initial = await store.db.tx(async c=>{
    const b=await bound(store,receiver,c,r,true), prior=await journal(c,r);
    need(prior || localReceipts.length===0,'private_pass_journal_missing');
    if(prior){ need(prior.request_hash===digest(r),'private_pass_intent_conflict');
      need(localReceipts.every(x=>x.assignmentId===prior.response_json.assignmentId && digest(x.request)===digest(r)),'private_pass_receipt_conflict');
      const v=await view(c,r,b);
      if(prior.response_json.state==='completed') {
        const w=witness(v,prior.response_json.assignmentId);
        need(digest(w)===prior.response_json.witnessDigest,'private_pass_readback_conflict');
        return {replay:true,record:prior.response_json,readback:v};
      }
      return {unknown:true,record:prior.response_json,readback:v};
    }
    const count=(await c.query('SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2',[PASS_SCOPE,r.projectId])).rows[0].n;
    need(count<Math.min(64,b.config.limits.maxCommands),'private_pass_capacity');
    need(!signal?.aborted,'private_pass_cancelled');
    if(r.action==='reconcile') {
      const old=(await c.query('SELECT response_json FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND key=$3 FOR UPDATE',[PASS_SCOPE,r.projectId,r.reconcileIntentId])).rows[0]?.response_json;
      need(old && old.request.action==='dispatch' && ['started','unknown','completed'].includes(old.state),'private_pass_reconcile_conflict');
      for(const k of fields.filter(k=>!['intentId','action','reconcileIntentId'].includes(k))) need(old.request[k]===r[k],'private_pass_reconcile_conflict');
      persist('prepared',{request:r});
      const record={state:'started',request:r,assignmentId:old.assignmentId}; await save(c,r,record,true); return {record};
    }
    need(await physical(c,b.config)===0,'physical_reservation_held');
    need(!(await c.query("SELECT 1 FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND response_json->>'state'<>'completed' LIMIT 1",[PASS_SCOPE,r.projectId])).rows.length,'private_pass_outcome_unknown');
    const queued=Object.values(b.state.candidates).filter(x=>x.active && x.stage==='queued');
    need(queued.length===1 && queued[0].candidate.id===r.candidateId,'private_pass_queue_conflict');
    persist('prepared',{request:r});
    // Run the unmodified reserve method inside this same host/pool transaction.
    // The intent, exact queue check, charge and assignment commit atomically.
    const transactional=Object.create(store); transactional.db=Object.create(store.db);transactional.db.tx=fn=>fn(c);
    const result=await transactional.reserve(r.projectId,`command:${digest(r).slice(7)}`);
    need(result.assignment?.candidateId===r.candidateId,'private_pass_queue_conflict');
    const record={state:'started',request:r,assignmentId:result.assignment.id}; await save(c,r,record,true); return {record};
  });
  if(initial.replay){persist('completed',initial.record);return {ok:true,state:'completed',replayed:true,assignmentId:initial.record.assignmentId,readback:initial.readback};}
  if(initial.unknown) return {ok:false,code:'private_pass_outcome_unknown',state:initial.record.state,assignmentId:initial.record.assignmentId,readback:initial.readback};
  const record=initial.record;
  try {
    persist('started',record); await onStarted(record);
    if(r.action==='dispatch') await supervise(store,r.projectId,record.assignmentId,{signal,onSpawn});
    else {
      // Explicit reconciliation may consume existing exit witnesses, never launch.
      await store.db.tx(async c=>{await bound(store,receiver,c,r,true);
        const a=(await c.query('SELECT state,termination,children,assignment FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2 FOR UPDATE',[r.projectId,record.assignmentId])).rows[0];
        need(a,'private_pass_reconcile_conflict');
        need(a.state==='reconciled' || a.children.length===a.assignment.requiredChecks.length && a.children.every(x=>ended(x.sample?.observation?.termination)), 'private_pass_outcome_unknown'); });
      const a=await store.db.tx(async c=>(await c.query('SELECT state FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2',[r.projectId,record.assignmentId])).rows[0]);
      if(a.state!=='reconciled') await store.recoverPortableAttempt(r.projectId,record.assignmentId);
    }
    await store.reconcile(r.projectId,record.assignmentId);
    // Recovery is now publication only: refuse ANY outstanding ownership first.
    await store.db.tx(async c=>{const b=await bound(store,receiver,c,r,true);need(await physical(c,b.config)===0,'physical_reservation_held');});
    const publicationOnly=Object.create(store);
    publicationOnly.db=Object.create(store.db);
    publicationOnly.db.tx=fn=>store.db.tx(async c=>{const b=await bound(store,receiver,c,r,true);
      need(await physical(c,b.config)===0,'physical_reservation_held');return fn(c);});
    publicationOnly.markUnknown=()=>publicationOnly.db.tx(async()=>{});
    const recovered=await recoverPool(publicationOnly,r.projectId); need(!recovered.blocked,'private_pass_outcome_unknown');
    const result=await store.db.tx(async c=>{
      const b=await bound(store,receiver,c,r,true),v=await view(c,r,b),w=witness(v,record.assignmentId);
      const completed={...record,state:'completed',witnessDigest:digest(w)};
      await save(c,r,completed);
      if(r.action==='reconcile') {
        const oldRequest=(await c.query('SELECT response_json FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND key=$3',[PASS_SCOPE,r.projectId,r.reconcileIntentId])).rows[0].response_json;
        await save(c,{...r,intentId:r.reconcileIntentId},{...oldRequest,state:'completed',witnessDigest:digest(w)});
      }
      return {record:completed,readback:v};
    });
    persist('completed',result.record);
    return {ok:true,state:'completed',replayed:false,assignmentId:record.assignmentId,readback:result.readback};
  } catch(error) {
    // A response/DB/host loss never becomes evidence of termination or a retry.
    await store.db.tx(async c=>{await store.lock(c,r.projectId);const prior=await journal(c,r);
      if(prior?.response_json.state==='started') await save(c,r,{...record,state:'unknown'});}).catch(()=>{});
    persist('unknown',{...record,state:'unknown'});
    throw error;
  }
}
