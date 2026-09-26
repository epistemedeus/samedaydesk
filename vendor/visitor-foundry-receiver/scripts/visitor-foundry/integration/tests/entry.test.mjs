import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {fixture,configFor,cli,http,attempt,register,BASE,cases,task,original,random} from './entry-helpers.mjs';
import {resumed} from '../entry/client.mjs';
import {supervise} from '../src/supervisor.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {recoverPool} from '../src/recover.mjs';
const ok=r=>{assert.ok([200,202].includes(r.status),JSON.stringify(r));return r.body;};
const evidence='scripts/visitor-foundry/integration/evidence/entry';
const foundry=(p,path)=>`/v1/projects/${p}/foundry/${path}`;
async function fresh(f,host=f.host){const c=await configFor(f,host);const r=ok(await cli(c,'register'));assert.equal(r.receiver.state,'ready',JSON.stringify(r));return {...c,r};}
async function complete(f,p,candidate){const assignment=(await f.store.reserve(p)).assignment;assert.equal(assignment.candidateId,candidate);const executed=await supervise(f.store,p,assignment.id);assert.equal(executed.terminationObserved,true);assert.equal((await f.store.reconcile(p,assignment.id)).stage,'accepted');assert.equal((await f.store.publish(p,candidate)).published,true);return assignment;}

test('cold entry A contributes actual code; restarted fresh B independently enrolls and uses exact verified output',async t=>{
 const f=await fixture(t),a=await fresh(f),start=performance.now();
 const checkpoint=await cli(a,'checkpoint',{text:'VF12 private ordinary correspondence'});assert.equal(checkpoint.sequence,1);
 const miss=await cli(a,'use',original());assert.equal(miss.invocation,null);assert.equal(miss.discovery.manifest,null);
 const contribution=await cli(a,'contribute',original());assert.equal(contribution.privateResult.observation.status,'ok');
 const assignment=await complete(f,a.r.projectId,contribution.submission.admission.candidateId);
 const port=new URL(f.host.baseUrl).port;await f.host.stop();f.host=await f.boot({port});
 assert.equal((await cli(a,'correspondence')).eventCount,1);
 const b=await fresh(f);assert.notEqual(b.r.projectId,a.r.projectId);
 const runs=[];for(const c of cases){const use=await cli(b,'use',task(c.input));assert.deepEqual(use.invocation.output,c.expected);runs.push({caseId:c.id,output:use.invocation.output,observation:use.invocation.observation});}
 assert.equal((await cli(b,'use',task({structuredContent:{unseen:'no manufactured generalization'}}))).invocation,null);
 const attemptA=JSON.parse(await readFile(`${a.config.directory}/attempt.json`,'utf8'));
 const proof=await readFile(`${a.config.directory}/registration.secret`,'utf8');
 const pub=JSON.stringify({contribution,b:b.r,runs,assignment});assert.ok(!pub.includes(proof.trim()));assert.ok(!pub.includes('neo_wtr_'));assert.ok(!pub.includes('neo_rdr_'));
 for(const name of ['registration.secret','attempt.json','authority.json','continuation.json','create.json','claim.json','checkpoint.json','submit.json'])assert.equal((await stat(`${a.config.directory}/${name}`)).mode&0o077,0);
 assert.equal((await cli(b,'correspondence')).eventCount,0);
 const otherToken=(await import('../../entry/src/contract.mjs')).grantToken((await readFile(`${b.config.directory}/registration.secret`,'utf8')).trim(),b.r.registrationId,'writer');
 assert.equal((await http(f.host,`/v1/projects/${a.r.projectId}/events`,{token:otherToken})).status,404);
 const accounting=await f.counts();assert.deepEqual(accounting,{registrations:2,charged:2,projects:2,grants:6,allocations:2,pools:2});
 const status=await f.host.rpc('status');assert.equal(status.remainingAdmissions,2);
 const rows=(await f.query('SELECT state,children,portable_result,termination FROM correspondence_vf04_attempts WHERE project_id=$1',[a.r.projectId])).rows;
 assert.equal(rows[0].children.length,4);assert.ok(rows[0].children.every(c=>c.sample.observation.termination.exited));
 const invocations=(await f.query('SELECT task_id,state,execution,result FROM correspondence_vf04_invocations WHERE project_id=$1 ORDER BY task_id',[b.r.projectId])).rows;assert.equal(invocations.length,4);assert.ok(invocations.every(r=>r.state==='completed'&&r.execution.identity&&r.execution.sample.observation.termination.exited&&r.result.executionObservation===r.execution.sample.observation.id));
 await writeFile(`${evidence}/journey.json`,JSON.stringify({purpose:'owner_qa',independence:'unknown',entryTerms:attemptA.body.termsHash,hostConfigId:status.config.configId,contribution,verification:rows[0],reuse:runs,invocations,accounting,allocated:status.allocated,aggregate:status.config.aggregate,elapsedMs:performance.now()-start,actualSpend:null},null,2)+'\n');
});

test('v1 upgrade preserves charged rows, grant identities, exact retries and private-only scope',async t=>{
 const f=await fixture(t,{privateOnly:true,privateOptions:{maxEnrollments:3,maxEvents:1}}),d=(await http(f.host,BASE)).body,a=attempt(d),before=ok(await register(f.host,a));assert.equal(before.receiver.state,'disabled');
 const grants=(await f.query('SELECT id,token_hash FROM correspondence_grants ORDER BY id')).rows;
 await f.host.rpc('enable');const after=ok(await register(f.host,a,'renew'));assert.equal(after.projectId,before.projectId);assert.deepEqual(after.grants.reader.token,before.grants.reader.token);assert.equal(after.receiver.state,'disabled');
 assert.deepEqual((await f.query('SELECT id,token_hash FROM correspondence_grants ORDER BY id')).rows,grants);
 assert.equal((await http(f.host,foundry(before.projectId,'task'),{token:before.grants.writer.token,body:{request:original(),negotiation:{accepts:[]},sharing:null}})).body.error.code,'entry_scope_excludes_receiver');
 await fresh(f);await fresh(f);assert.equal((await f.counts()).charged,3);
 const next=attempt((await http(f.host,BASE)).body);assert.equal((await register(f.host,next)).body.error.code,'enrollment_exhausted');
 assert.equal((await register(f.host,{...a,body:{...a.body,requestId:random()}})).body.error.code,'attempt_binding_mismatch');
 await assert.rejects(f.host.rpc('install',{...f.settings,id:'vf10:alias'}),/immutable_installation/);
 const active=(await http(f.host,BASE)).body.profile;
 await assert.rejects(f.host.rpc('enableAs',{expectedTerms:d.profile.termsHash,id:'vf10:alias',binding:active.contribution.binding}),/immutable_contribution_installation/);
 assert.equal((await f.counts()).charged,3);
});

test('two real hosts share aggregate admission reservations; aliases and excess registrations retain private service',async t=>{
 const f=await fixture(t,{privateOptions:{maxEnrollments:8},hostOptions:{maxAdmissions:3}}),b=await f.boot();
 const d=(await http(f.host,BASE)).body,attempts=Array.from({length:8},()=>attempt(d));
 const results=await Promise.all(attempts.map((a,i)=>register(i%2?b:f.host,a)));assert.ok(results.every(r=>[200,202].includes(r.status)),JSON.stringify(results));
 const final=await Promise.all(attempts.map((a,i)=>register(i%2?f.host:b,a,'reconcile')));const ready=final.filter(r=>r.body.receiver.state==='ready'),declined=final.filter(r=>r.body.receiver.state==='declined');assert.equal(ready.length,3);assert.equal(declined.length,5);
 const counts=await f.counts();assert.deepEqual(counts,{registrations:8,charged:8,projects:8,grants:24,allocations:3,pools:3});
 const receipt=await b.rpc('status');assert.equal(receipt.remainingAdmissions,0);assert.deepEqual(receipt.allocated,receipt.config.aggregate);
 const r=declined[0].body;const event=await http(b,`/v1/projects/${r.projectId}/events`,{token:r.grants.writer.token,body:{kind:'request',text:'Original task continues after aggregate refusal'}});assert.equal(event.status,201);
 assert.equal((await http(b,foundry(r.projectId,'task'),{token:r.grants.writer.token,body:{request:original(),negotiation:{accepts:[]},sharing:null}})).body.error.code,'receiver_not_ready');
 assert.equal((await http(b,`${BASE}/decline`,{body:{}})).body.nextAction,'continue_original');
 await writeFile(`${evidence}/admission-contention.json`,JSON.stringify({offered:8,ready:3,declined:5,hosts:2,counts,aggregate:receipt.config.aggregate,allocated:receipt.allocated},null,2)+'\n');
});

for(const phase of ['entry:before','entry:reserved','createProject','createGrant','receiver:marker','receiver:reserved','receiver:completed','entry:reply'])test(`actual SIGKILL at ${phase} recovers one exact registration and finite allowance`,async t=>{
 const f=await fixture(t),d=(await http(f.host,BASE)).body,a=attempt(d);await f.host.rpc('arm',phase);await assert.rejects(register(f.host,a));await f.host.exited;
 const killed=await f.counts();const port=new URL(f.host.baseUrl).port;f.host=await f.boot({port});
 let receipt=ok(await register(f.host,a,'reconcile'));
 if(phase==='receiver:marker'||phase==='receiver:reserved'){
  assert.equal(receipt.receiver.state,phase==='receiver:marker'?'unknown':'pending');const input={registrationId:receipt.registrationId,projectId:receipt.projectId};
  const before=await f.counts();for(let i=0;i<3;i++)assert.equal((await register(f.host,a,'reconcile')).body.receiver.state,receipt.receiver.state);assert.deepEqual(await f.counts(),before);
  const recovered=await f.host.rpc('recover',input);assert.equal(recovered,phase==='receiver:marker'?'declined':'ready');
  if(phase==='receiver:marker'){await f.host.rpc('begin',input);assert.equal(await f.host.rpc('read',input),'declined');}
  receipt=ok(await register(f.host,a,'reconcile'));
 }
 assert.equal(receipt.receiver.state,phase==='receiver:marker'?'declined':'ready');
 const counts=await f.counts();assert.equal(counts.registrations,1);assert.equal(counts.charged,1);assert.equal(counts.projects,1);assert.equal(counts.grants,3);assert.equal(counts.pools,phase==='receiver:marker'?0:1);assert.equal(counts.allocations,counts.pools);
 const repeat=await Promise.all(Array.from({length:4},()=>register(f.host,a)));assert.ok(repeat.every(x=>x.body.projectId===receipt.projectId&&x.body.grants.writer.token===receipt.grants.writer.token));assert.deepEqual(await f.counts(),counts);
 await writeFile(`${evidence}/crash-${phase.replace(':','-')}.json`,JSON.stringify({phase,signal:'SIGKILL',killed,recovered:counts,state:receipt.receiver.state},null,2)+'\n');
});

test('entry-derived VF05 intents survive each real commit-before-ACK death and reject foreign continuation',async t=>{
 const f=await fixture(t),a=await fresh(f);
 for(const op of ['create','claim','checkpoint','submit']){
  await f.host.rpc('arm',`participate:${op}`);await assert.rejects(cli(a,'contribute',original()));await f.host.exited;
  const port=new URL(f.host.baseUrl).port;f.host=await f.boot({port});
  const replay=await cli(a,'reconcile-contribution',{operation:op});assert.equal(replay.status,'committed',JSON.stringify(replay));assert.equal(replay.receipt.replayed,true);
 }
 const submit=await cli(a,'reconcile-contribution',{operation:'submit'});
 const b=await fresh(f),saved=JSON.parse(await readFile(`${a.config.directory}/submit.json`,'utf8'));
 await assert.rejects(resumed(b.config).client.session.reconcile(saved.intent),/intent_binding_mismatch/);
 const hint={schema:'neomorphic.foundry.participation-hint.v1',cellId:submit.receipt.cellId};
 assert.equal((await cli(a,'resume-contribution',hint)).current.cellId,hint.cellId);
 assert.equal((await cli(b,'resume-contribution',hint)).status,'temporary-outage');
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_candidates')).rows[0].n,1);
 assert.equal((await f.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope LIKE 'vf02:cell:%'",[a.r.projectId])).rows[0].n,4);
 await complete(f,a.r.projectId,submit.receipt.admission.candidateId);
 const input=task(cases[0].input);await f.host.rpc('arm','invokePortable');await assert.rejects(cli(b,'use',input));await f.host.exited;const port=new URL(f.host.baseUrl).port;f.host=await f.boot({port});
 const recovered=await cli(b,'use',input);assert.equal(recovered.invocation.replayed,true);assert.deepEqual(recovered.invocation.output,cases[0].expected);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_invocations')).rows[0].n,1);
});

test('both exact terms, grant expiry/revocation, denied authority and original use remain separated',async t=>{
 const f=await fixture(t),a=await fresh(f),client=resumed(a.config).client;
 const proof=(await readFile(`${a.config.directory}/registration.secret`,'utf8')).trim(),{grantToken}=await import('../../entry/src/contract.mjs'),token=grantToken(proof,a.r.registrationId,'writer');
 const terms=await client.call('participation/terms'),body={request:original(),negotiation:{accepts:['neomorphic.foundry.participation.v1']},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}};
 for(const [header,expected] of [['x-foundry-entry-terms','stale_entry_terms'],['x-foundry-contribution-terms','stale_contribution_terms']]){
  const headers={'x-foundry-entry-terms':a.config.authority.entryTerms,'x-foundry-contribution-terms':terms.id,[header]:'sha256:'+'0'.repeat(64)};
  assert.equal((await http(f.host,foundry(a.r.projectId,'task'),{token,body,headers})).body.error.code,expected);
 }
 for(const route of ['candidates','verify','publish','configure-verification','request-revalidation','environment-evidence'])assert.equal((await http(f.host,foundry(a.r.projectId,route),{token,body:{}})).status,403);
 assert.equal((await http(f.host,`/v1/projects/${a.r.projectId}/WoRk-CeLlS`,{token,body:{}})).status,403);
 const before=(await f.query('SELECT id,token_hash FROM correspondence_grants WHERE project_id=$1 ORDER BY id',[a.r.projectId])).rows;
 await f.query("UPDATE correspondence_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1 AND role IN ('reader','writer')",[a.r.projectId]);
 const expired=await http(f.host,foundry(a.r.projectId,'participation/terms'),{token});assert.equal(expired.status,401);assert.equal(expired.body.error.nextAction,'renew_same_registration');
 assert.equal(ok(await cli(a,'renew')).registrationId,a.r.registrationId);
 assert.deepEqual((await f.query('SELECT id,token_hash FROM correspondence_grants WHERE project_id=$1 ORDER BY id',[a.r.projectId])).rows,before);
 await f.host.rpc('configureParticipation',a.r.projectId,{expectedTerms:terms.id,revision:'terms:changed'},'vf12-private-terms-change');
 await assert.rejects(cli(a,'contribute',original()));
 assert.equal((await cli(a,'use',original())).invocation,null);assert.deepEqual((await cli(a,'decline',original())).original,original().input);
 assert.equal((await cli(a,'checkpoint',{text:'Private use after stale contribution terms'})).sequence,1);
 await f.query("UPDATE correspondence_grants SET revoked_at=clock_timestamp() WHERE project_id=$1 AND role='writer'",[a.r.projectId]);
 assert.equal((await cli(a,'renew')).body.error.code,'registration_revoked');
 assert.equal((await http(f.host,foundry(a.r.projectId,'participation/terms'),{token})).status,401);
 assert.deepEqual(await f.counts(),{registrations:1,charged:1,projects:1,grants:3,allocations:1,pools:1});
});

test('global physical reservation covers different entry pools across hosts and retains unknown launch uncertainty',async t=>{
 const f=await fixture(t),a=await fresh(f),b=await fresh(f);const sa=await cli(a,'contribute',original()),sb=await cli(b,'contribute',original());const second=await f.boot();
 const assigned=(await f.host.rpc('reserve',a.r.projectId)).assignment;
 await assert.rejects(second.rpc('reserve',b.r.projectId),/host_physical_reservation_held/);
 let observed=false;const executed=await supervise(f.store,a.r.projectId,assigned.id,{onSpawn:async record=>{
  process.kill(record.identity.pid,0);observed=true;await assert.rejects(second.rpc('reserve',b.r.projectId),/host_physical_reservation_held/);
 }});assert.equal(observed,true);assert.equal(executed.terminationObserved,true);
 await f.store.reconcile(a.r.projectId,assigned.id);await f.store.publish(a.r.projectId,sa.submission.admission.candidateId);
 const invocationRequest=task(cases[0].input);await f.host.rpc('arm','invocation:reserved');await assert.rejects(cli(a,'use',invocationRequest));await f.host.exited;
 await assert.rejects(second.rpc('reserve',b.r.projectId),/host_physical_reservation_held/);
 const recovered=await recoverPool(f.store,a.r.projectId);assert.ok(recovered.actions.some(x=>x.noLaunch&&x.budgetRefunded===false));
 const next=(await second.rpc('reserve',b.r.projectId)).assignment;await second.rpc('arm','child:identity');await assert.rejects(second.rpc('supervise',b.r.projectId,next.id));await second.exited;
 const row=(await f.query('SELECT state,children FROM correspondence_vf04_attempts WHERE project_id=$1',[b.r.projectId])).rows[0];assert.equal(row.children.length,1);assert.ok(row.children[0].identity&&!row.children[0].sample);
 assert.equal((await recoverPool(f.store,b.r.projectId)).blocked,'termination_or_outcome_unknown');
 const port=new URL(f.host.baseUrl).port;f.host=await f.boot({port});
 await assert.rejects(cli(a,'use',task(cases[1].input)),/host_physical_reservation_held/);
 const charged=(await f.query('SELECT state,execution FROM correspondence_vf04_invocations WHERE project_id=$1',[a.r.projectId])).rows;assert.equal(charged.length,1);assert.equal(charged[0].state,'completed');assert.ok(charged[0].execution.noLaunchProof);
 await writeFile(`${evidence}/physical-contention.json`,JSON.stringify({maxPhysical:1,liveChildObserved:observed,unlaunchedInvocationRefunded:false,unknownChild:row,afterRecovery:'capacity held pending full exit evidence'},null,2)+'\n');
});

test('explicit evidence renewal keeps identity/history; terminal withdrawal remains available after public command exhaustion',async t=>{
 const f=await fixture(t,{hostOptions:{pool:{validityMs:1200,maxCellCommands:4,maxHttpKeys:6,maxWorkCells:1,maxCandidates:1,maxPackages:2}}}),a=await fresh(f),b=await fresh(f),s=await cli(a,'contribute',original()),candidate=s.submission.admission.candidateId;
 await complete(f,a.r.projectId,candidate);
 const stored=(await f.query('SELECT * FROM correspondence_vf04_candidates WHERE project_id=$1',[a.r.projectId])).rows[0];
 const before=await f.counts();await new Promise(r=>setTimeout(r,1300));assert.equal((await cli(b,'use',task(cases[0].input))).invocation,null);
 const status=await resumed(a.config).client.call('status');
 const verification=(await f.host.rpc('configureVerification',a.r.projectId,{expectedVerificationId:status.verification.id,revision:'policy:vf12-renew',validityMs:10000},'vf12-explicit-evidence-policy')).verification;
 const renewal=await f.host.rpc('requestRevalidation',a.r.projectId,{candidateId:candidate,expectedGeneration:1,expectedVerificationId:verification.id,reason:'expiry'},'vf12-explicit-evidence-renewal');assert.equal(renewal.generation,2);
 const assignment=(await f.store.reserve(a.r.projectId)).assignment;await supervise(f.store,a.r.projectId,assignment.id);assert.equal((await f.store.reconcile(a.r.projectId,assignment.id)).stage,'accepted');await f.store.publish(a.r.projectId,candidate,2);
 assert.deepEqual((await f.query('SELECT manifest FROM correspondence_vf04_candidates WHERE project_id=$1',[a.r.projectId])).rows[0].manifest,stored.manifest);
 assert.deepEqual((await cli(b,'use',task(cases[0].input))).invocation.output,cases[0].expected);
 assert.equal((await f.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope='vf04:http'",[a.r.projectId])).rows[0].n,6);
 const current=(await cli(a,'resume-contribution',s.continuation)).current;
 const withdraw={cellId:current.cellId,expectedRevision:current.revision,reason:'Voluntary source withdrawal after bounded allowance'};
 await cli(a,'withdraw',withdraw);assert.equal((await cli(a,'withdraw',withdraw)).replayed,true);
 assert.equal((await cli(b,'use',task(cases[0].input))).invocation,null);
 assert.deepEqual(await f.counts(),before);
 const statusAfter=await f.host.rpc('status');assert.equal(statusAfter.remainingAdmissions,2);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_publications WHERE project_id=$1',[a.r.projectId])).rows[0].n,2);
});

test('nested submit/admit receipts cannot overrun a finite journal; actual cell and candidate changes roll back together',async t=>{
 const f=await fixture(t,{hostOptions:{pool:{maxHttpKeys:5,maxCellCommands:4,maxPackages:2,maxWorkCells:1}}}),a=await fresh(f);
 await assert.rejects(cli(a,'contribute',original()));const receipt=await cli(a,'reconcile-contribution',{operation:'submit'});assert.equal(receipt.status,'quota-pressure');
 const cells=(await f.query('SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1',[a.r.projectId])).rows;assert.equal(cells.length,1);assert.equal(cells[0].state.revision,3);assert.equal(cells[0].state.status,'leased');
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_candidates WHERE project_id=$1',[a.r.projectId])).rows[0].n,0);
 assert.equal((await f.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope='vf04:http'",[a.r.projectId])).rows[0].n,4);
 assert.equal((await f.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope LIKE 'vf02:cell:%'",[a.r.projectId])).rows[0].n,3);
 await cli(a,'withdraw',{cellId:cells[0].state.id,expectedRevision:3,fence:cells[0].state.fence,reason:'Decline after host receipt capacity refusal'});
 const cl=resumed(a.config).client,terms=await cl.call('participation/terms');
 await assert.rejects(cl.call('task',{request:task({structuredContent:{newGap:'bounded proposal exhaustion'}}),negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}}),/package_capacity/);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_gaps WHERE project_id=$1',[a.r.projectId])).rows[0].n,1);
});

test('current exact pool proof is required for ready readback, and expired pending reservations remain charged',async t=>{
 const f=await fixture(t,{hostOptions:{maxAdmissions:1}}),a=await fresh(f),input={registrationId:a.r.registrationId,projectId:a.r.projectId};
 const old=(await f.query('SELECT config FROM correspondence_vf04_pools WHERE project_id=$1',[a.r.projectId])).rows[0].config;
 await f.query("UPDATE correspondence_vf04_pools SET config=jsonb_set(config,'{entryBounds,maxPackages}','64') WHERE project_id=$1",[a.r.projectId]);
 await assert.rejects(f.host.rpc('read',input),/receiver_pool_mismatch/);
 const report=ok(await cli(a,'reconcile'));assert.equal(report.receiver.state,'unknown');
 await assert.rejects(resumed(a.config).client.call('status'),/entry_pool_binding_mismatch/);
 await f.query('UPDATE correspondence_vf04_pools SET config=$2 WHERE project_id=$1',[a.r.projectId,old]);assert.equal(ok(await cli(a,'reconcile')).receiver.state,'ready');
 const other={...input,projectId:'prj_foreign_project'};await assert.rejects(f.host.rpc('read',other),/entry_binding_mismatch/);
 const f2=await fixture(t,{hostOptions:{maxAdmissions:1}}),d=(await http(f2.host,BASE)).body,attemptA=attempt(d);await f2.host.rpc('arm','receiver:reserved');await assert.rejects(register(f2.host,attemptA));await f2.host.exited;
 const row=(await f2.query('SELECT id,project_id FROM correspondence_vf10_registrations')).rows[0];await f2.query("UPDATE correspondence_vf10_registrations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[row.id]);f2.host=await f2.boot();
 assert.equal(await f2.host.rpc('recover',{registrationId:row.id,projectId:row.project_id}),'declined');
 const freshAttempt=attempt((await http(f2.host,BASE)).body);assert.equal(ok(await register(f2.host,freshAttempt)).receiver.state,'declined');
 const counts=await f2.counts();assert.equal(counts.allocations,1);assert.equal(counts.pools,0);assert.equal((await f2.host.rpc('status')).remainingAdmissions,0);
});

test('terms and grant expiry after real lock waiting cannot commit sharing or submit changes',async t=>{
 const f=await fixture(t),a=await fresh(f),proof=(await readFile(`${a.config.directory}/registration.secret`,'utf8')).trim(),{grantToken}=await import('../../entry/src/contract.mjs'),token=grantToken(proof,a.r.registrationId,'writer');
 const client=resumed(a.config).client,terms=await client.call('participation/terms');
 const body={request:original(),negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}},headers={'x-foundry-entry-terms':a.config.authority.entryTerms,'x-foundry-contribution-terms':terms.id};
 let release,entered;const ready=new Promise(r=>entered=r);const held=f.store.db.tx(async c=>{await f.store.lock(c,a.r.projectId);entered();await new Promise(r=>release=r);const {id,...old}=terms;delete old.evaluation;delete old.environment;delete old.outcome;const next={...old,revision:'terms:changed-under-lock'};next.id=hash(next);await c.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[a.r.projectId,next]);});await ready;
 const waiting=http(f.host,foundry(a.r.projectId,'task'),{token,body,headers});await new Promise(r=>setTimeout(r,60));release();await held;assert.equal((await waiting).body.error.code,'stale_contribution_terms');
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_packages')).rows[0].n,0);
 await f.query("UPDATE correspondence_grants SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE project_id=$1 AND role='writer'",[a.r.projectId]);
 let unlock,started;const locked=new Promise(r=>started=r);const held2=f.store.db.tx(async c=>{await f.store.lock(c,a.r.projectId);started();await new Promise(r=>unlock=r);});await locked;
 const late=http(f.host,foundry(a.r.projectId,'task'),{token,body:{...body,sharing:null},headers});await new Promise(r=>setTimeout(r,150));unlock();await held2;assert.equal((await late).status,401);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_packages')).rows[0].n,0);
});

test('non-actionable negotiation cannot bypass durable gap inventory bounds',async t=>{
 const f=await fixture(t,{hostOptions:{pool:{maxPackages:2}}}),a=await fresh(f),c=resumed(a.config).client,terms=await c.call('participation/terms');
 const offer=i=>c.call('task',{request:task({structuredContent:{inventory:i}}),negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:[],budgetSeconds:300},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}});
 await offer(1);await offer(2);await assert.rejects(offer(3),/entry_gap_capacity/);
 assert.equal((await f.query('SELECT count(*)::int AS n FROM correspondence_vf04_gaps WHERE project_id=$1',[a.r.projectId])).rows[0].n,2);
});

test('wrong standing terms stop before enrollment; anonymous decline preserves exact original result',async t=>{
 const f=await fixture(t),a=await configFor(f);a.config.authority.entryTerms='sha256:'+'1'.repeat(64);await writeFile(a.file,JSON.stringify(a.config),{mode:0o600});
 await assert.rejects(cli(a,'register'),/standing_terms_mismatch/);assert.equal((await f.counts()).charged,0);
 await assert.rejects(stat(`${a.config.directory}/registration.secret`),/ENOENT/);
 assert.deepEqual((await cli(a,'decline',original())).original,original().input);assert.equal((await f.counts()).charged,0);
});
