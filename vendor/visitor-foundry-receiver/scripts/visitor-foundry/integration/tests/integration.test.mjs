import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { vectors } from '../wire/vectors.mjs';
import { identity, toValidationIdentity, fromValidationIdentity, toGapBinding, fromGapBinding, wireSchema } from '../src/wire.mjs';
import { capabilityFor } from '../src/recipe.mjs';
import { IntegrationStore } from '../src/store.mjs';
import { supervise } from '../src/supervisor.mjs';
import { recoverPool } from '../src/recover.mjs';
import { majorOnly } from '../src/baseline.mjs';
import { refOf, hash, createSnapshot } from '../../capabilities/src/index.mjs';
import { resolutionManifest, recheckManifest } from '../src/manifest.mjs';
import { version, observation, request as graphRequest, mutation } from '../../capabilities/examples/fixtures.mjs';
import { boot, project, request, ok, code, path, recipe, frozen, requestFor, checkpointed, submit, candidate, cellCommand, cmd, cellPath } from './helpers.mjs';

const exec = promisify(execFile);
let a, b, store;
const hosts = [];
const report = { purpose: 'owner_qa', relationship: 'owner', externalUsefulTasks: 0, tests: [], costs: frozen.costs };
before(async () => {
  a = await boot(); hosts.push(a); b = await boot(); hosts.push(b);
  assert.notEqual(a.pid,b.pid);
  store = new IntegrationStore(process.env.VF04_TEST_DATABASE_URL, {schema:process.env.VF04_TEST_SCHEMA,poolMax:2});
});
after(async () => {
  await Promise.all(hosts.map(h=>h.stop())); await store?.close();
  await writeFile(process.env.VF04_EVIDENCE_DIR ? `${process.env.VF04_EVIDENCE_DIR}/journey.json` : new URL('../evidence/journey.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
});
async function restartA() { await a.stop('SIGKILL'); a=await boot(); hosts.push(a); }
async function accept(p, cand, { host=b }={}) {
  const assigned=await host.rpc('reserve',p.projectId);
  await supervise(store,p.projectId,assigned.assignment.id);
  const receipt=await host.rpc('reconcile',p.projectId,assigned.assignment.id);
  assert.equal(receipt.stage,'accepted');
  return host.rpc('publish',p.projectId,cand.candidateId);
}
const status = async p => ok(await request(b,`${path(p)}/status`,{token:p.owner}));

test('real cold A→B: checkpoint restart, crash at admission/reservation/receipt/publication acknowledgement, one logical result',async t=>{
  const p=await project(a);
  const initial=ok(await request(a,`${path(p)}/resolve`,{token:p.writer.token,body:requestFor()}));
  assert.equal(initial.resolution.status,'missing');
  let cell=await checkpointed(a,p);
  const oldWriter=p.writer;
  cell=await cellCommand(a,p,cell,'transfer',{fence:cell.fence,targetGrantId:p.beneficiary.grantId,ttlSeconds:120});
  p.writer=p.beneficiary;
  const priorPid=a.pid; await restartA(); assert.notEqual(a.pid,priorPid);
  const cold=ok(await request(a,`/v1/projects/${p.projectId}/work-cells/${cell.id}`,{token:p.writer.token}));
  assert.equal(cold.cell.checkpoint.summary,cell.checkpoint.summary);
  code(await request(a,cellPath(p,cell),{token:oldWriter.token,body:cmd('renew',cell.revision,{fence:cell.fence-1,ttlSeconds:120})}),'stale_fence');
  const submitted=await submit(a,p,cold.cell);
  await a.rpc('armCrash','admit');
  await assert.rejects(request(a,`${path(p)}/candidates`,{token:p.writer.token,body:submitted.body,key:'lost-admission-ack'}));
  await restartA();
  const retry=ok(await request(a,`${path(p)}/candidates`,{token:p.writer.token,body:submitted.body,key:'lost-admission-ack'}));
  assert.equal(retry.replayed,true);
  const renamed=ok(await request(b,`${path(p)}/candidates`,{token:p.writer.token,body:submitted.body,key:'new-command-same-semantic'}));
  assert.equal(renamed.candidateId,retry.candidateId); assert.equal(renamed.duplicate,true);
  await a.rpc('armCrash','reserve');
  await assert.rejects(a.rpc('reserve',p.projectId,'command:reservation-crash'));
  await restartA();
  const assignment=(await b.rpc('reserve',p.projectId,'command:reservation-crash')).assignment;
  await assert.rejects(b.rpc('reserve',p.projectId),/physical_reservation_held/);
  const execution=await supervise(store,p.projectId,assignment.id);
  assert.equal(execution.terminationObserved,true);
  await a.rpc('armCrash','reconcile');
  await assert.rejects(a.rpc('reconcile',p.projectId,assignment.id));
  await restartA();
  assert.equal((await b.rpc('reconcile',p.projectId,assignment.id)).duplicate,true);
  assert.equal((await status(p)).publications[0].state,'pending');
  await a.rpc('armCrash','publish');
  await assert.rejects(a.rpc('publish',p.projectId,retry.candidateId));
  await restartA();
  assert.equal((await b.rpc('publish',p.projectId,retry.candidateId)).duplicate,true);
  const state=await status(p);
  assert.equal(state.candidates.length,1); assert.equal(state.attempts.length,1); assert.equal(state.publications.length,1);
  assert.equal(state.reuse.validationCapacityCharged.costUnits,'1000');
  assert.equal(state.reuse.actualValidationCost.unknownCount,1);
  const rows=await store.db.tx(c=>c.query('SELECT receipt FROM correspondence_vf04_publications WHERE project_id=$1',[p.projectId]));
  const receipt=rows.rows[0].receipt;
  const disposition=await cellCommand(b,p,submitted.cell,'disposition',{receipt:{uri:`https://foundry.invalid/receipts/${hash(receipt).slice(7)}`,digest:hash(receipt)}},p.owner);
  assert.equal(disposition.status,'accepted');

  // Cold B is a fresh CLI process. Its only files contain own task/environment
  // and ordinary endpoint/access. No artifact/candidate ID or A transcript.
  const tmp=new URL(`../evidence/tmp/cold-${randomUUID()}/`,import.meta.url); await mkdir(tmp,{recursive:true,mode:0o700});
  await writeFile(new URL('token',tmp),oldWriter.token,{mode:0o600});
  await writeFile(new URL('config.json',tmp),JSON.stringify({baseUrl:b.baseUrl,projectId:p.projectId,tokenFile:new URL('token',tmp).pathname}),{mode:0o600});
  const coldResults=[];
  try {
    for(const arm of ['reuse_only','contribution']) for(const heldout of frozen.cases){
      const req=requestFor(heldout.input,`task:${arm}-${heldout.id}`);
      await writeFile(new URL('request.json',tmp),JSON.stringify(req));
      const {stdout}=await exec(process.execPath,['scripts/visitor-foundry/integration/cli.mjs',new URL('config.json',tmp).pathname,new URL('request.json',tmp).pathname]);
      const result=JSON.parse(stdout); assert.equal(result.invocation.output.status,heldout.expected);
      ok(await request(b,`${path(p)}/observe`,{token:oldWriter.token,body:{taskId:req.taskId,experimentId:frozen.id,caseId:heldout.id,arm}}));
      coldResults.push({arm,caseId:heldout.id,taskId:req.taskId,output:result.invocation.output,manifestId:result.invocation.manifestId});
    }
  } finally {await rm(tmp,{recursive:true,force:true});}
  const unrelated=ok(await request(b,`${path(p)}/resolve`,{token:oldWriter.token,body:requestFor({},'task:unrelated',{outcome:'unrelated-need'})}));
  assert.equal(unrelated.resolution.status,'unknown');
  const decline=ok(await request(b,`${path(p)}/decline`,{token:p.reader.token,body:{taskId:'task:decliner',reason:'Use existing service without contributing'}}));
  assert.equal(decline.contribution,'declined');
  const baseline=frozen.cases.map(x=>{const actual=majorOnly(x.input).status;return{caseId:x.id,inputDigest:hash(x.input),actual,expected:x.expected,success:actual===x.expected,cost:null,effortMs:null};});
  report.journey={projectId:p.projectId,initial:initial.resolution.status,crashPoints:['admit','reserve','reconcile','publish'],restarts:hosts.map(h=>h.pid),
    candidateId:retry.candidateId,receiptId:receipt.id,coldResults,baseline,decline,unrelated:unrelated.resolution.status,reuse:(await status(p)).reuse};
  t.diagnostic(`two host processes; checkpoint PID ${priorPid}; cold CLI calls ${coldResults.length}; 1 charged reservation and publication`);
});

test('withheld runner exit retains physical reservation after deadline; late result cannot promote; later witnessed reconciliation',async()=>{
  const p=await project(b,{wallMs:1200});const cand=await candidate(b,p);
  const assignment=(await b.rpc('reserve',p.projectId)).assignment;
  const live=await supervise(store,p.projectId,assignment.id,{withholdExit:true});
  assert.ok(live.result);
  try {
    await new Promise(r=>setTimeout(r,Math.max(1,Date.parse(assignment.deadline)-Date.now()+20)));
    assert.equal((await b.rpc('markUnknown',p.projectId)).unknown.length,1);
    await assert.rejects(store.reconcile(p.projectId,assignment.id),/termination_unknown/);
    await assert.rejects(a.rpc('reserve',p.projectId),/physical_reservation_held/);
    await restartA(); assert.equal((await status(p)).attempts[0].state,'unknown');
  } finally {await live.release();}
  await store.reconcile(p.projectId,assignment.id);
  const result=await status(p);assert.equal(result.candidates[0].stage,'timed_out');assert.equal(result.publications.length,0);
  assert.equal(result.reuse.actualValidationCost.unknownCount,1);
  await assert.rejects(store.publish(p.projectId,cand.candidateId),/publication_not_ready/);
  report.withheld={stateBefore:'unknown',stateAfter:result.candidates[0].stage,reservation:result.reuse.validationCapacityCharged,actualCost:result.reuse.actualValidationCost};
});

test('new-command semantic duplicates race across hosts; tenant/reader/auth/fence/receipt boundaries',async()=>{
  const p=await project(b), q=await project(a);
  const submission=await submit(b,p,await checkpointed(b,p));
  const all=await Promise.all(Array.from({length:32},(_,i)=>request(i%2?a:b,`${path(p)}/candidates`,{token:p.writer.token,body:submission.body})));
  all.forEach(ok);assert.equal(new Set(all.map(r=>r.body.candidateId)).size,1);
  assert.equal(all.filter(r=>!r.body.duplicate).length,1);
  code(await request(b,`${path(p)}/candidates`,{token:q.writer.token,body:submission.body}),'not_found');
  code(await request(b,`${path(p)}/candidates`,{token:p.reader.token,body:submission.body}),'forbidden');
  code(await request(b,`${path(p)}/candidates`,{token:p.writer.token,body:{...submission.body,fence:submission.body.fence+1}}),'stale_cell_fence');
  code(await request(b,`${path(p)}/candidates`,{token:p.writer.token,body:{...submission.body,artifact:{...recipe,maxRangeLength:129}}}),'submission_content_mismatch');
  assert.equal((await request(b,`${path(p)}/receipt`,{token:p.owner,body:{accepted:true,runner:'runner:installed-owner-qa'}})).status,404);
  code(await request(b,`${path(p)}/resolve`,{token:p.writer.token,body:{...requestFor(),admittedObservationIds:['forged:receipt']}}),'INVALID_INPUT');
  await accept(p,{candidateId:all[0].body.candidateId});
  const state=await status(p);assert.equal(state.attempts.length,1);
  const row=await store.db.tx(c=>c.query('SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1',[p.projectId]));
  await assert.rejects(store.runnerWrite(p.projectId,row.rows[0].id,'forged:supervisor','old-fence',{result:row.rows[0].result}),/stale_attempt_fence/);
});

test('retraction between resolution and invocation fails; shared evidence invalidation is live and unrelated tenant stays usable',async()=>{
  const p=await project(b),shared=await project(a),unrelated=await project(b);
  const cp=await candidate(b,p),cu=await candidate(a,unrelated);await accept(p,cp);await accept(unrelated,cu);
  await store.shareOwnerQA(p.projectId,shared.projectId);
  const req=requestFor(frozen.cases[0].input,'task:shared-cold');
  const resolved=ok(await request(b,`${path(shared)}/resolve`,{token:shared.reader.token,body:req}));assert.ok(resolved.manifest);
  await store.invalidate(p.projectId,cp.candidateId);
  code(await request(a,`${path(shared)}/invoke`,{token:shared.reader.token,body:{manifestId:resolved.manifest.id,request:req}}),'resolution_invalidated');
  const unaffected=ok(await request(b,`${path(unrelated)}/resolve`,{token:unrelated.reader.token,body:requestFor()}));assert.equal(unaffected.resolution.status,'compatible');
  assert.equal((await status(unrelated)).reuse.acceptedContributionInventory[0].distinctLaterTasks,0);
  report.acceptedWithZeroReuse=(await status(unrelated)).reuse.acceptedContributionInventory;
});

test('exact transitive manifest edges, dependency expiry and retraction require replay, unrelated branch retained',async()=>{
  const now=new Date().toISOString(), expiredAt=new Date(Date.now()+80).toISOString();
  const leaf=version({capabilityId:'fixture:leaf'}),dep=version({capabilityId:'fixture:dep',dependencies:[refOf(leaf)]}),root=version({capabilityId:'fixture:root',dependencies:[refOf(dep)]}),other=version({capabilityId:'fixture:other'});
  const observations=[leaf,dep,root,other].map((v,i)=>observation(v,{id:`fixture:obs${i}`,observedAt:now,expiresAt:i===0?expiredAt:null}));
  const snapshot=createSnapshot({versions:[leaf,dep,root,other],observations,mutations:[],coverage:{outcomes:['normalize'],complete:true,sourceRefs:['fixture:owned'],asOf:now}});
  const policy={policyRef:'policy:owned',admittedObservationIds:observations.map(o=>o.id)};
  const req=graphRequest({capabilityId:root.capabilityId});const result=resolutionManifest(snapshot,req,{now,policy});
  assert.equal(result.manifest.versions.length,3);assert.equal(result.manifest.edges.length,2);assert.ok(result.manifest.edges.every(e=>e.compositionEvidence.length));
  assert.equal(result.manifest.validUntil,expiredAt);
  await new Promise(r=>setTimeout(r,100));
  assert.throws(()=>recheckManifest(result.manifest,snapshot,new Date().toISOString(),policy,req),/manifest_expired/);
  const changed=createSnapshot({versions:snapshot.versions,observations:snapshot.observations,coverage:snapshot.coverage,mutations:[mutation(observations[1].id,'retract-observation',{at:new Date().toISOString()})]});
  assert.equal(resolutionManifest(changed,req,{now:new Date().toISOString(),policy}).manifest,null);
  assert.ok(resolutionManifest(changed,graphRequest({capabilityId:other.capabilityId}),{now:new Date().toISOString(),policy}).manifest);
});

test('individually accepted components do not pass an unsupported composition',async()=>{
  const p=await project(b);const first=await candidate(b,p);const publication=await accept(p,first);
  const second=await candidate(b,p,{...recipe,maxRangeLength:130});const publication2=await accept(p,second);
  const composed=await candidate(b,p,{...recipe,maxRangeLength:132},[publication.target,publication2.target]);
  const assignment=(await b.rpc('reserve',p.projectId)).assignment;
  await supervise(store,p.projectId,assignment.id);
  const result=await b.rpc('reconcile',p.projectId,assignment.id);assert.equal(result.stage,'verification_failed');
  await assert.rejects(store.publish(p.projectId,composed.candidateId),/publication_not_ready/);
  assert.equal(ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:requestFor()})).resolution.status,'compatible');
});

test('pool locks are tenant-local, cell writes independent, freeze immutable, receipt outbox atomic',async()=>{
  const p=await project(b),q=await project(a);
  await assert.rejects(store.enroll(p.projectId,{...frozen,cases:[{...frozen.cases[0],expected:'compatible'}]}),/experiment_already_frozen/);
  let unlock,locked;const acquired=new Promise(r=>locked=r);
  const holding=store.db.tx(async c=>{await c.query('SELECT project_id FROM correspondence_vf04_pools WHERE project_id=$1 FOR UPDATE',[p.projectId]);locked();await new Promise(r=>unlock=r);});
  await acquired;
  try {
    const before=performance.now();
    await candidate(a,q);
    // VF02 shares project/grant locks but never waits on the VF04 budget row.
    await checkpointed(b,p,recipe,'independent-cell');
    assert.ok(performance.now()-before<1400);
  } finally {unlock();await holding;}
});

test('expired unlaunched reservation reconciles exactly once; concurrent recovery dispatches one actual process',async()=>{
  const p=await project(b,{wallMs:600});await candidate(b,p);
  const {assignment}=await b.rpc('reserve',p.projectId);
  await new Promise(r=>setTimeout(r,650));
  await assert.rejects(store.claimAttempt(p.projectId,assignment.id,'supervisor:late'),/attempt_already_claimed/);
  await recoverPool(store,p.projectId);
  const state=await status(p);assert.equal(state.attempts[0].termination.noLaunch,true);assert.equal(state.candidates[0].stage,'timed_out');
  assert.equal((await recoverPool(store,p.projectId)).blocked,null);
  assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'1000');
  const q=await project(b);await candidate(b,q);await b.rpc('reserve',q.projectId);
  const recovered=await Promise.all([recoverPool(store,q.projectId),recoverPool(store,q.projectId)]);
  const final=await status(q);assert.equal(final.attempts.length,1);assert.equal(final.attempts[0].state,'reconciled');assert.equal(final.publications.length,1);
});

test('candidate invalidated while runner alive retains reservation until witnessed exit; unrelated budget progresses',async()=>{
  const p=await project(b),q=await project(a);const cand=await candidate(b,p),other=await candidate(a,q);
  const {assignment}=await b.rpc('reserve',p.projectId);const live=await supervise(store,p.projectId,assignment.id,{withholdExit:true});
  try{
    await store.invalidate(p.projectId,cand.candidateId);
    await assert.rejects(store.reserve(p.projectId),/physical_reservation_held/);
    await accept(q,other);
  }finally{await live.release();}
  const reconciliation=await store.reconcile(p.projectId,assignment.id);assert.equal(reconciliation.receiptAdmitted,false);
  assert.equal((await status(p)).attempts[0].state,'reconciled');assert.equal((await status(p)).publications.length,0);
});

test('runner binding drift and claimed receipt fail the real durable VF03 boundary without promotion',async()=>{
  const p=await project(b);const cand=await candidate(b,p);const {assignment}=await b.rpc('reserve',p.projectId);
  const original=store.runnerWrite.bind(store);
  store.runnerWrite=(projectId,id,supervisor,fence,parts)=>original(projectId,id,supervisor,fence,
    parts.result?{...parts,result:{...parts.result,sourceRevision:'forged:revision'}}:parts);
  try{await supervise(store,p.projectId,assignment.id);}finally{store.runnerWrite=original;}
  await assert.rejects(store.reconcile(p.projectId,assignment.id),/receipt_binding:sourceRevision/);
  assert.equal((await status(p)).publications.length,0);
  // A bad known result is retained. Operator invalidation plus actual witnessed
  // termination reconciles capacity; no receipt is rewritten to make it pass.
  await store.invalidate(p.projectId,cand.candidateId,'runner_binding_drift');await store.reconcile(p.projectId,assignment.id);
  assert.equal((await status(p)).reuse.actualValidationCost.unknownCount,1);
});

test('durable transitive evidence expiry/retraction refuses old invocation manifest; input is digest-only at rest',async()=>{
  const p=await project(b);const live=await candidate(b,p);await accept(p,live);
  const now=new Date().toISOString();
  const leaf=version({capabilityId:'fixture:durable-leaf'}),root=version({capabilityId:'fixture:durable-root',dependencies:[refOf(leaf)]});
  const observations=[leaf,root].map((v,i)=>observation(v,{id:`fixture:durable-${i}`,observedAt:now,expiresAt:i===0?new Date(Date.now()+180).toISOString():null}));
  await store.installOwnerQAEvidence(p.projectId,{version:[leaf,root],observation:observations});
  const req=graphRequest({capabilityId:root.capabilityId});
  const first=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:req}));assert.equal(first.manifest.edges.length,1);
  assert.equal(first.manifest.request.input,null);assert.equal(first.manifest.applicability.inputDigest,hash(req.input));
  await new Promise(r=>setTimeout(r,200));
  code(await request(a,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:first.manifest.id,request:req}}),'manifest_expired');
  await store.retract(p.projectId,observations[1].id);
  assert.equal(ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:req})).resolution.status,'unknown');
  assert.equal(ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:requestFor()})).resolution.status,'compatible');
});

test('grant expiry during lock wait aborts authority at commit; cross-project manifests and changed heldouts refused',async()=>{
  const p=await project(b),q=await project(a);const cand=await candidate(b,p);await accept(p,cand);
  const req=requestFor(frozen.cases[0].input,'task:binding-test');
  const resolved=ok(await request(b,`${path(p)}/resolve`,{token:p.beneficiary.token,body:req}));
  code(await request(a,`${path(q)}/invoke`,{token:q.reader.token,body:{manifestId:resolved.manifest.id,request:req}}),'manifest_request_mismatch');
  ok(await request(b,`${path(p)}/invoke`,{token:p.beneficiary.token,body:{manifestId:resolved.manifest.id,request:req}}));
  code(await request(b,`${path(p)}/observe`,{token:p.beneficiary.token,body:{taskId:req.taskId,experimentId:frozen.id,caseId:'case:minor-equal',arm:'reuse_only'}}),'frozen_case_binding');
  const ephemeral=ok(await request(b,`/v1/projects/${p.projectId}/grants`,{token:p.owner,body:{role:'reader',expiresAt:new Date(Date.now()+350).toISOString()}}));
  let unlock,locked;const acquired=new Promise(r=>locked=r);
  const holding=store.db.tx(async c=>{await c.query('SELECT project_id FROM correspondence_vf04_pools WHERE project_id=$1 FOR UPDATE',[p.projectId]);locked();await new Promise(r=>unlock=r);});await acquired;
  const waiting=request(a,`${path(p)}/status`,{token:ephemeral.token});
  await new Promise(r=>setTimeout(r,400));unlock();await holding;code(await waiting,'unauthorized');
});

test('unrelated evidence scopes, expired audit rows and new preferred version do not poison a pinned valid branch',()=>{
  const now=new Date().toISOString();const past=new Date(Date.now()-1000).toISOString();
  const v=version({capabilityId:'fixture:z-pinned'}),earlier=version({capabilityId:'fixture:a-preferred'});
  const active=observation(v,{id:'fixture:active',observedAt:past,expiresAt:null});
  const history=observation(v,{id:'fixture:expired',observedAt:new Date(Date.now()-3000).toISOString(),expiresAt:past});
  const initial=createSnapshot({versions:[v],observations:[active,history],mutations:[],coverage:{outcomes:['normalize'],complete:true,sourceRefs:['fixture:owned'],asOf:now}});
  const req=graphRequest();const policy={policyRef:'policy:owned',admittedObservationIds:[active.id,history.id]};
  const pinned=resolutionManifest(initial,req,{now,policy});assert.equal(pinned.manifest.validUntil,null);
  const otherEnvironment=observation(v,{id:'fixture:other-env',scope:{outcome:'normalize',environment:{nodeMajor:22,platform:'darwin'},inputDigest:null},observedAt:now,expiresAt:null,verdict:'incompatible'});
  const earlierObservation=observation(earlier,{id:'fixture:earlier-active',observedAt:past,expiresAt:null});
  const extended=createSnapshot({versions:[v,earlier],observations:[active,history,otherEnvironment,earlierObservation],mutations:[],coverage:initial.coverage});
  const updatedPolicy={...policy,admittedObservationIds:[...policy.admittedObservationIds,otherEnvironment.id,earlierObservation.id]};
  assert.doesNotThrow(()=>recheckManifest(pinned.manifest,extended,new Date().toISOString(),updatedPolicy,req));
});

test('opt-in lifecycle defaults and migration rollback preserve base/VF02 records in a separate owned namespace',async()=>{
  const {prepareFoundryHost}=await import('../../../../services/correspondence/dist/visitor-foundry/host.js');
  let called=false,closed=false;
  const base={checkReady:async()=>{},close:async()=>{closed=true;}};
  const disabled=await prepareFoundryHost(base,{create:async()=>{called=true;throw new Error('must stay disabled');}});
  disabled.mount({use(){throw new Error('disabled mount');}});await base.checkReady();await base.close();assert.equal(called,false);assert.equal(closed,true);
  const schema=`vf04_rollback_${process.pid}`;
  const {createPostgresStore}=await import('../../../../services/correspondence/dist/store/postgres.js');
  const {WorkCellStore}=await import('../../../../services/correspondence/dist/visitor-work-cells/index.js');
  const pgBase=await createPostgresStore(process.env.VF04_TEST_DATABASE_URL,{schema,poolMax:1});
  const cells=new WorkCellStore(process.env.VF04_TEST_DATABASE_URL,{schema,poolMax:1});
  const local=new IntegrationStore(process.env.VF04_TEST_DATABASE_URL,{schema,poolMax:1});
  try{
    await cells.migrate();await local.migrate();await local.migrate();await local.checkReady();
    await local.db.tx(c=>c.query("INSERT INTO correspondence_idempotency(scope,project_id,key,request_hash,status_code,response_json,created_at) VALUES('unrelated:test','','keep','hash',200,'{}',clock_timestamp())"));
    const onlyRoundDown=await readFile(new URL('../../../../services/correspondence/migrations/visitor-foundry/003_vf04_revalidation.down.sql',import.meta.url),'utf8');
    await local.db.tx(c=>c.query(onlyRoundDown));await assert.rejects(local.checkReady());await cells.checkReady();await local.migrate();await local.checkReady();
    const down=(await Promise.all(['004_vf09_portable.down.sql','003_vf04_revalidation.down.sql','002_vf04_wire.down.sql','001_vf04_integration.down.sql'].map(name=>readFile(new URL(`../../../../services/correspondence/migrations/visitor-foundry/${name}`,import.meta.url),'utf8')))).join('\n');
    await local.db.tx(c=>c.query(down));
    const retained=await local.db.tx(c=>c.query("SELECT count(*)::integer AS count FROM correspondence_idempotency WHERE scope='unrelated:test'"));assert.equal(retained.rows[0].count,1);
    await cells.checkReady();await pgBase.checkReady();await assert.rejects(local.checkReady());
    await local.migrate();await local.checkReady();
  }finally{await local.close();await cells.close();await pgBase.close();}
});

test('VF02 withdrawal gates queued dispatch, prelaunch execution and already-published discovery',async()=>{
  const p=await project(b);const first=await candidate(b,p),second=await candidate(b,p,{...recipe,maxRangeLength:140});
  await cellCommand(b,p,first.cell,'cancel',{reason:'Visitor withdrew voluntary contribution'},p.owner);
  const assigned=(await store.reserve(p.projectId)).assignment;assert.equal(assigned.candidateId,second.candidateId);
  await supervise(store,p.projectId,assigned.id);await store.reconcile(p.projectId,assigned.id);await store.publish(p.projectId,second.candidateId);
  const req=requestFor(frozen.cases[0].input,'task:withdrawal-before-use');
  const pinned=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:req}));assert.ok(pinned.manifest);
  await cellCommand(a,p,second.cell,'cancel',{reason:'Withdraw before cell disposition'},p.owner);
  code(await request(b,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:pinned.manifest.id,request:req}}),'resolution_invalidated');
  assert.equal((await store.reserve(p.projectId)).code,'queue_empty');
  assert.equal((await status(p)).publications[0].state,'withdrawn');
  const q=await project(b);const beforeLaunch=await candidate(b,q);const reservation=(await store.reserve(q.projectId)).assignment;
  await cellCommand(b,q,beforeLaunch.cell,'cancel',{reason:'Opt out before execution'},q.owner);
  assert.equal((await supervise(store,q.projectId,reservation.id)).notLaunched,true);
  assert.equal((await store.reconcile(q.projectId,reservation.id)).receiptAdmitted,false);
  assert.equal((await status(q)).reuse.validationCapacityCharged.costUnits,'1000');
});

test('F93 maximum exact identities survive PostgreSQL and cold restart; conflicts and alias corruption are refused',async()=>{
  const p=await project(b),v=vectors(),original=v.maximum.identity;
  await store.db.tx(async c=>{await store.lock(c,p.projectId);await store.identities(c,p.projectId,original,true);});
  await restartA();
  const rows=await store.db.tx(c=>c.query('SELECT original,native FROM correspondence_vf04_identities WHERE project_id=$1',[p.projectId]));
  assert.equal(rows.rows.length,101);
  for(const r of [original.target,...original.dependencies]) {
    const saved=rows.rows.find(x=>x.original.capabilityId===r.capabilityId);assert.deepEqual(saved.original,r);
  }
  const savedBinding={schema:wireSchema('validation-identity-binding'),original,native:{capability:rows.rows.find(x=>x.original.capabilityId===original.target.capabilityId).native,
    dependencies:original.dependencies.map(r=>rows.rows.find(x=>x.original.capabilityId===r.capabilityId).native)}};
  assert.deepEqual(fromValidationIdentity(JSON.parse(JSON.stringify(savedBinding))),original);
  await assert.rejects(store.db.tx(async c=>{await store.lock(c,p.projectId);await store.identities(c,p.projectId,identity(v.conflictingTarget),true);}),/coordinate_content_conflict/);
  assert.equal((await status(p)).candidates.length,0);assert.equal((await status(p)).attempts.length,0);
});

test('F93 max-domain admission returns exact unsupported result atomically, retaining submitted cell without promotion',async()=>{
  const p=await project(b),v=vectors();
  const submitted=await submit(b,p,await checkpointed(b,p));
  const before=await status(p);
  for(const original of [v.maximum.identity,identity(v.maximum.identity.target),identity(capabilityFor(recipe),v.maximum.identity.dependencies)]) {
    const r=await request(a,`${path(p)}/candidates`,{token:p.writer.token,body:{...submitted.body,identity:original}});
    assert.equal(r.status,422,JSON.stringify(r));assert.equal(r.body.schema,wireSchema('unsupported'));assert.equal(r.body.accepted,false);
    assert.deepEqual(r.body.original,original);
    assert.equal(r.body.reason,original.dependencies.length?'installed_dependency_limit':'installed_capability_identity_unavailable');
    if(original.dependencies.length)assert.deepEqual(r.body.limit,{field:'dependencies',maximum:32,requested:100});
  }
  assert.deepEqual(await status(p),before);
  await store.db.tx(async c=>{
    for(const table of ['identities','candidates','attempts','publications'])assert.equal((await c.query(`SELECT count(*)::int AS n FROM correspondence_vf04_${table} WHERE project_id=$1`,[p.projectId])).rows[0].n,0);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope LIKE 'vf04:%'",[p.projectId])).rows[0].n,0);
  });
  await restartA();
  const cell=ok(await request(a,`/v1/projects/${p.projectId}/work-cells/${submitted.cell.id}`,{token:p.writer.token})).cell;
  assert.equal(cell.status,'submitted');assert.equal(cell.revision,submitted.cell.revision);
  const admitted=ok(await request(a,`${path(p)}/candidates`,{token:p.writer.token,body:submitted.body}));
  assert.deepEqual(admitted.identity,submitted.body.identity);
  const conflicting={...submitted.body,identity:identity({...admitted.identity.target,contentId:hash('conflict')})};
  code(await request(b,`${path(p)}/candidates`,{token:p.writer.token,body:conflicting}),'coordinate_content_conflict');
  await accept(p,admitted);
  assert.equal((await status(p)).attempts.length,1);
  const forged=structuredClone(submitted.body);forged.identity=toValidationIdentity(submitted.body.identity).native;
  code(await request(b,`${path(p)}/candidates`,{token:p.writer.token,body:forged}),'INVALID_INPUT');
});

test('F93 maximal gap identity crosses VF02 submit and supported admission; restart verifies original/native binding',async()=>{
  const p=await project(b),v=vectors();
  const binding=ok(await request(b,`${path(p)}/gap`,{token:p.writer.token,body:requestFor(frozen.originalTask.input,v.gap.gap.taskId)}));
  const g={...binding.gap,id:v.gap.gap.id};delete g.contentId;g.contentId=hash(g);
  const full=toGapBinding(g,binding.cellGap.reproducer);fromGapBinding(full);
  await store.db.tx(c=>c.query('INSERT INTO correspondence_vf04_gaps(project_id,id,record) VALUES($1,$2,$3)',[p.projectId,g.id,g]));
  p.cellGap=full.cellGap;
  const cand=await candidate(b,p);assert.equal(cand.cell.gap.id.length,512);assert.equal(cand.cell.gap.contentId,g.contentId);
  await restartA();assert.equal((await status(p)).candidates.length,1);
  const saved=await store.db.tx(c=>c.query('SELECT candidate,manifest FROM correspondence_vf04_candidates WHERE project_id=$1',[p.projectId]));
  assert.deepEqual(fromValidationIdentity({schema:wireSchema('validation-identity-binding'),original:identity(saved.rows[0].manifest,saved.rows[0].manifest.dependencies),native:{capability:saved.rows[0].candidate.capability,dependencies:saved.rows[0].candidate.dependencies}}),cand.body.identity);
  const bad=structuredClone(saved.rows[0].candidate);bad.capability.revision=hash('substituted');
  await store.db.tx(c=>c.query('UPDATE correspondence_vf04_candidates SET candidate=$2 WHERE project_id=$1',[p.projectId,bad]));
  code(await request(a,`${path(p)}/status`,{token:p.owner}),'IDENTITY_BINDING_MISMATCH');
  await assert.rejects(store.reserve(p.projectId),/native identity binding mismatch/);
  await store.db.tx(c=>c.query('UPDATE correspondence_vf04_candidates SET candidate=$2 WHERE project_id=$1',[p.projectId,saved.rows[0].candidate]));
  await accept(p,cand);assert.equal((await status(p)).publications[0].state,'published');
});

test('F93 unique visitor environment evidence survives review/restart without independent replay or compatibility promotion',async()=>{
  const p=await project(b),q=await project(a),cand=await candidate(b,p);await accept(p,cand);
  const target=cand.identity.target,req=requestFor(frozen.cases[0].input,'task:unique-environment',{environment:{nodeMajor:22,platform:'unique-visitor-os'}});
  const resolve=async()=>ok(await request(a,`${path(p)}/resolve`,{token:p.reader.token,body:req}));
  const before=await resolve(),state=await status(p);assert.notEqual(before.resolution.status,'compatible');assert.equal(before.manifest,null);
  const body={schema:wireSchema('environment-evidence-submission'),target,scope:{outcome:req.outcome,environment:req.environment,inputDigest:hash(req.input)},
    evidence:{uri:'https://fixtures.invalid/visitor-supplied-log',digest:hash('visitor claims successful execution')},observedAt:new Date().toISOString(),claim:'Visitor reports success in a unique environment; not independently replayed.',permission:'authorized-reusable'};
  code(await request(b,`${path(p)}/environment-evidence`,{token:p.reader.token,body}),'forbidden');
  const observed=ok(await request(b,`${path(p)}/environment-evidence`,{token:p.writer.token,body,key:'unique-environment-log'}));
  assert.deepEqual(observed.replay,{status:'not-replayed',assignmentId:null,receiptId:null});
  assert.equal(observed.review.status,'unreviewed');
  code(await request(b,`${path(p)}/environment-evidence`,{token:p.writer.token,body:{...body,replay:{status:'replayed'}}}),'INVALID_INPUT');
  const reviewed=await store.reviewEnvironmentEvidence(p.projectId,observed.id,'Read supplied log; no installed replay for this environment.');
  assert.equal(reviewed.review.status,'supplied-evidence-reviewed');assert.deepEqual(reviewed.replay,observed.replay);
  await restartA();
  const records=ok(await request(a,`${path(p)}/environment-evidence`,{token:p.reader.token})).observations;
  assert.equal(records.length,1);assert.deepEqual(records[0],reviewed);assert.deepEqual(records[0].submission,body);
  assert.equal(ok(await request(a,`${path(q)}/environment-evidence`,{token:q.reader.token})).observations.length,0);
  const after=await resolve();assert.equal(after.resolution.status,before.resolution.status);assert.equal(after.manifest,null);
  assert.deepEqual(await status(p),state);assert.equal((await status(p)).attempts.length,1);
  report.nonReplayedEvidence={schema:observed.schema,replay:reviewed.replay,review:reviewed.review.status,compatible:false,extraAssignments:0};
});
test('F93 valid wire lone surrogates return explicit unsupported before PostgreSQL can rewrite identity',async()=>{
  const p=await project(b),submission=await submit(b,p,await checkpointed(b,p));
  const original=identity({capabilityId:'fixture:\ud800',version:'v\udfff',contentId:hash('unicode')});
  const r=await request(a,`${path(p)}/candidates`,{token:p.writer.token,body:{...submission.body,identity:original}});
  assert.equal(r.status,422);assert.equal(r.body.reason,'postgres_json_unicode_unavailable');assert.deepEqual(r.body.original,original);assert.equal(r.body.accepted,false);
  const gap={...p.cellGap,id:'gap:\ud800'};
  const c=await request(a,cellPath(p,null),{token:p.writer.token,body:cmd('create',0,{gap,workScope:'scope:unicode'})});
  assert.equal(c.status,422);assert.equal(c.body.reason,'postgres_json_unicode_unavailable');assert.equal(c.body.original.gap.id,gap.id);
  assert.equal((await status(p)).candidates.length,0);assert.equal((await status(p)).attempts.length,0);
});
