import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {IntegrationStore} from '../src/store.mjs';
import {supervise} from '../src/supervisor.mjs';
import {recoverPool} from '../src/recover.mjs';
import {invokeRecipe,runtimePin,matchesInstalledManifest,sourcePinsMatch,installationPins,inputShape,outputShape} from '../src/recipe.mjs';
import {hash,refOf} from '../../capabilities/src/index.mjs';
import {version,observation} from '../../capabilities/examples/fixtures.mjs';
import {boot,project,request,ok,code,path,recipe,frozen,requestFor,candidate,cellCommand} from './helpers.mjs';
const exec=promisify(execFile),hosts=[];let a,b,store;
before(async()=>{a=await boot();b=await boot();hosts.push(a,b);store=new IntegrationStore(process.env.VF04_TEST_DATABASE_URL,{schema:process.env.VF04_TEST_SCHEMA,poolMax:2});});
after(async()=>{await Promise.all(hosts.map(h=>h.stop()));await store?.close();});
const status=async p=>ok(await request(b,`${path(p)}/status`,{token:p.owner}));
const resolve=async(p,task='task:maintenance-discovery')=>ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:requestFor(frozen.cases[0].input,task)}));
async function restart(){await a.stop('SIGKILL');a=await boot();hosts.push(a);}
async function row(p,table,extra='') {return store.db.tx(async c=>(await c.query(`SELECT * FROM correspondence_vf04_${table} WHERE project_id=$1 ${extra}`,[p.projectId])).rows);}
async function complete(p,cand,generation=1){const assignment=(await store.reserve(p.projectId)).assignment;await supervise(store,p.projectId,assignment.id);const r=await store.reconcile(p.projectId,assignment.id);assert.equal(r.stage,'accepted');return {assignment,publication:await store.publish(p.projectId,cand.candidateId,generation)};}
async function expiry(p,generation=1){const pub=(await row(p,'publications',`AND generation=${generation}`))[0];const delay=Date.parse(pub.receipt.observedAt)+pub.verification.validityMs-Date.now()+30;if(delay>0)await new Promise(r=>setTimeout(r,delay));return pub;}
async function profile(p,revision,validityMs=5000){const current=(await status(p)).verification;return (await store.configureVerification(p.projectId,{expectedVerificationId:current.id,revision,validityMs},`policy:${randomUUID()}`)).verification;}
async function renewal(p,cand,expectedGeneration,reason='expiry'){return {candidateId:cand.candidateId,expectedGeneration,expectedVerificationId:(await status(p)).verification.id,reason};}

test('public recipe rejects malformed runtime versions; stored gap projection survives unrelated graph growth',async()=>{
  assert.equal(sourcePinsMatch(installationPins),true);assert.equal(sourcePinsMatch({...installationPins,probe:hash('changed source bytes')}),false);
  for(const value of ['23.not-a-version','23','23.0','v23.0.0junk','23.0.0-beta','23.0.0+build','23.00.0','23.0.NaN','23.0.0\n','9007199254740992.0.0'])
    assert.equal(invokeRecipe(recipe,{range:'>=22.5',nodeVersion:value}).status,'unknown',value);
  assert.equal(invokeRecipe(recipe,{range:'>=22.5',nodeVersion:'v23.0.0'}).status,'compatible');
  const p=await project(b);const original=ok(await request(b,`${path(p)}/gap`,{token:p.writer.token,body:requestFor()}));
  await store.installOwnerQAEvidence(p.projectId,{version:[version({capabilityId:'fixture:unrelated-gap-growth'})]});
  const replay=ok(await request(a,`${path(p)}/gap`,{token:p.writer.token,body:requestFor()}));
  assert.deepEqual(replay,original);assert.equal(replay.cellGap.resolverSnapshot.digest,replay.gap.resolver.snapshotId);
  const cand=await candidate(b,p);await complete(p,cand);
  const req=requestFor({range:'>=22.5',nodeVersion:'23.not-a-version'},'task:malformed-public');
  const resolved=ok(await request(a,`${path(p)}/resolve`,{token:p.reader.token,body:req}));
  const invoked=ok(await request(a,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:resolved.manifest.id,request:req}}));
  assert.equal(invoked.output.status,'unknown');
  const down=await readFile(new URL('../../../../services/correspondence/migrations/visitor-foundry/003_vf04_revalidation.down.sql',import.meta.url),'utf8');
  await assert.rejects(store.db.tx(async c=>{await c.query(down);throw new Error('unguarded_downgrade_executed');}),/revalidation_history_requires_archival_before_downgrade/);
  await store.checkReady();
});

test('real PG expiry, lost renewal/reservation/outbox acknowledgements, concurrent coalescing and cold later use preserve exact artifact identity',async t=>{
  const p=await project(b,{evidenceValidityMs:350}),cand=await candidate(b,p);const first=await complete(p,cand);
  const oldCandidate=(await row(p,'candidates'))[0],oldPub=await expiry(p),oldObs=(await row(p,'graph',"AND kind='observation'"))[0];
  assert.equal((await resolve(p)).manifest,null);
  await profile(p,'policy:renewal-v2',5000);const body=await renewal(p,cand,1);
  await a.rpc('armCrash','requestRevalidation');await assert.rejects(a.rpc('requestRevalidation',p.projectId,body,'renewal:lost-ack'));
  await restart();const retry=await a.rpc('requestRevalidation',p.projectId,body,'renewal:lost-ack');assert.equal(retry.generation,2);assert.equal(retry.replayed,true);
  const concurrent=await Promise.all(Array.from({length:16},(_,i)=>(i%2?a:b).rpc('requestRevalidation',p.projectId,body,`renewal:race-${i}`)));
  assert.ok(concurrent.every(r=>r.generation===2&&r.coalesced));
  assert.equal((await status(p)).attempts.length,1);assert.equal((await resolve(p)).manifest,null);
  await a.rpc('armCrash','reserve');await assert.rejects(a.rpc('reserve',p.projectId,'command:renewal-reservation'));
  await restart();const assigned=(await a.rpc('reserve',p.projectId,'command:renewal-reservation')).assignment;
  assert.notEqual(assigned.id,first.assignment.id);
  const oldAttempt=(await row(p,'attempts','AND generation=1'))[0];
  await assert.rejects(store.runnerWrite(p.projectId,oldAttempt.id,oldAttempt.supervisor,oldAttempt.fence,{result:oldPub.receipt}),/stale_attempt_fence/);
  const failed=await store.db.tx(async c=>{const {config}=await store.lock(c,p.projectId);const e=await store.replay(c,p.projectId,config);await assert.rejects(e.apply({subject:'runner:installed-owner-qa'},'receipt',oldPub.receipt),/stale_assignment/);return e.service.snapshot();});
  assert.equal(failed.candidates[cand.candidateId].acceptance,'pending');
  assert.equal((await store.reconcile(p.projectId,oldAttempt.id)).duplicate,true);
  await assert.rejects(store.publish(p.projectId,cand.candidateId,1),/round_verification_stale|stale_publication_generation/);
  await assert.rejects(store.reserve(p.projectId),/physical_reservation_held/);
  await supervise(store,p.projectId,assigned.id);
  await a.rpc('armCrash','reconcile');await assert.rejects(a.rpc('reconcile',p.projectId,assigned.id));await restart();
  assert.equal((await store.reconcile(p.projectId,assigned.id)).duplicate,true);
  await a.rpc('armCrash','publish');await assert.rejects(a.rpc('publish',p.projectId,cand.candidateId,2));await restart();
  assert.equal((await store.publish(p.projectId,cand.candidateId,2)).duplicate,true);
  const nowCandidate=(await row(p,'candidates'))[0];assert.deepEqual(nowCandidate.manifest,oldCandidate.manifest);assert.equal(nowCandidate.semantic_key,oldCandidate.semantic_key);
  assert.deepEqual((await row(p,'publications','AND generation=1'))[0],oldPub);assert.deepEqual((await row(p,'graph',"AND kind='observation'" )).find(r=>r.id===oldObs.id),oldObs);
  const tmp=await mkdtemp(new URL('../evidence/tmp/renewal-',import.meta.url));
  try{await writeFile(`${tmp}/token`,p.reader.token,{mode:0o600});await writeFile(`${tmp}/config.json`,JSON.stringify({baseUrl:a.baseUrl,projectId:p.projectId,tokenFile:`${tmp}/token`}),{mode:0o600});
    await writeFile(`${tmp}/request.json`,JSON.stringify(requestFor(frozen.cases[0].input,'task:cold-after-renewal')));
    const {stdout}=await exec(process.execPath,['scripts/visitor-foundry/integration/cli.mjs',`${tmp}/config.json`,`${tmp}/request.json`]);const used=JSON.parse(stdout);
    assert.deepEqual(used.invocation.target,refOf(oldCandidate.manifest));assert.equal(used.invocation.output.status,frozen.cases[0].expected);
  }finally{await rm(tmp,{recursive:true,force:true});}
  assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'2000');
  t.diagnostic('Two real verification generations, one stable semantic candidate; cold CLI ran after expiry and SIGKILL recovery.');
});

test('failed and unknown renewal retain historical evidence; unknown physical work blocks renewal and unrelated capability remains usable',async()=>{
  const p=await project(b,{wallMs:650,evidenceValidityMs:250}),other=await project(a);const cand=await candidate(b,p),unrelated=await candidate(a,other);
  await complete(p,cand);await complete(other,unrelated);const old=await expiry(p);await profile(p,'policy:renewal-fail',5000);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,1),'renewal:failed');
  const a2=(await store.reserve(p.projectId)).assignment;
  // Fault injected only into the installed supervisor's child input. The real
  // evaluator observes a manifest binding failure; no forged passing receipt.
  const faultStore={runnerWrite:store.runnerWrite.bind(store),async claimAttempt(...args){const a=await store.claimAttempt(...args);return {...a,manifest:{...a.manifest,source:{...a.manifest.source,path:'unexpected/source'}}};}};
  await supervise(faultStore,p.projectId,a2.id);assert.equal((await store.reconcile(p.projectId,a2.id)).stage,'verification_failed');
  assert.equal((await resolve(p)).manifest,null);assert.ok((await resolve(other)).manifest);
  const failed=(await row(p,'attempts','AND generation=2'))[0];assert.ok(failed.result.observed.checks.some(c=>c.status==='fail'));
  await store.requestRevalidation(p.projectId,await renewal(p,cand,2,'retry_failure'),'renewal:unknown');
  const a3=(await store.reserve(p.projectId)).assignment;const live=await supervise(store,p.projectId,a3.id,{withholdExit:true});
  try{await new Promise(r=>setTimeout(r,680));await store.markUnknown(p.projectId);
    await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,cand,3,'retry_failure'),'renewal:still-alive'),/physical_reservation_held/);
    await assert.rejects(store.reconcile(p.projectId,a3.id),/termination_unknown/);assert.equal((await resolve(p)).manifest,null);assert.ok((await resolve(other)).manifest);
  }finally{await live.release();}
  await store.reconcile(p.projectId,a3.id);const unknown=(await row(p,'attempts','AND generation=3'))[0];assert.ok(unknown.result);assert.equal(unknown.state,'reconciled');
  assert.equal((await status(p)).candidates[0].stage,'timed_out');
  await store.requestRevalidation(p.projectId,await renewal(p,cand,3,'retry_failure'),'renewal:fourth');await complete(p,cand,4);
  assert.deepEqual((await row(p,'attempts','AND generation=2'))[0],failed);
  assert.deepEqual((await row(p,'publications','AND generation=1'))[0],old);
  assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'4000');
  await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,cand,4),'renewal:round-limit'),/generation_capacity/);
});

test('current policy/runtime/source changes require explicit generation; queued policies can be superseded without spending',async()=>{
  const p=await project(b),cand=await candidate(b,p);await complete(p,cand);const initial=(await row(p,'candidates'))[0];
  await profile(p,'policy:evolved');assert.equal((await resolve(p)).manifest,null);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,1,'verification_changed'),'renewal:policy');
  await profile(p,'policy:evolved-again');await assert.rejects(store.reserve(p.projectId),/round_verification_stale/);
  assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'1000');
  await store.requestRevalidation(p.projectId,await renewal(p,cand,2,'verification_changed'),'renewal:queued-policy');await complete(p,cand,3);
  assert.deepEqual((await row(p,'candidates'))[0].manifest,initial.manifest);
  const actual=(await status(p)).verification;
  // Boundary drift injection, not a claim that another Node runtime was run.
  const drift={...actual,runtimePin:hash('uninstalled-runtime')};delete drift.id;drift.id=hash(drift);
  await store.db.tx(c=>c.query('UPDATE correspondence_vf04_pools SET verification=$2 WHERE project_id=$1',[p.projectId,drift]));
  assert.equal((await resolve(p)).manifest,null);
  await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,cand,3,'verification_changed'),'renewal:stale-runtime'),/installed_verification_changed/);
  const installed=await profile(p,'policy:actual-current-runtime');assert.equal(installed.runtimePin,runtimePin);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,3,'verification_changed'),'renewal:runtime');await complete(p,cand,4);
  const q=await project(b),source=await candidate(b,q);await complete(q,source);
  const original=(await row(q,'candidates'))[0],changed={...original.manifest,source:{...original.manifest.source,revision:'different-source'}};
  assert.equal(matchesInstalledManifest(changed,recipe),false);
  await store.db.tx(c=>c.query('UPDATE correspondence_vf04_candidates SET manifest=$2 WHERE project_id=$1',[q.projectId,changed]));
  await assert.rejects(store.requestRevalidation(q.projectId,{candidateId:source.candidateId,expectedGeneration:1,expectedVerificationId:(await row(q,'pools'))[0].verification.id,reason:'verification_changed'},'renewal:source-change'),/installed_source_changed/);
  await store.db.tx(c=>c.query('UPDATE correspondence_vf04_candidates SET manifest=$2 WHERE project_id=$1',[q.projectId,original.manifest]));
  const body=await renewal(q,source,1);
  await assert.rejects(store.requestRevalidation(q.projectId,{...body,artifact:{...recipe,maxRangeLength:130}},'renewal:changed-artifact'),/invalid_revalidation/);
  const upgrade=await candidate(b,q,{...recipe,maxRangeLength:130});assert.notEqual(upgrade.candidateId,source.candidateId);assert.notDeepEqual(upgrade.identity.target,source.identity.target);
});

test('withdrawal and source revocation cancel renewal eligibility without inventing child exit; observation retraction can receive fresh evidence',async()=>{
  const p=await project(b),cand=await candidate(b,p);await complete(p,cand);const pub=(await row(p,'publications'))[0];
  await store.retract(p.projectId,`observation:${hash(pub.receipt).slice(7)}`);assert.equal((await resolve(p)).manifest,null);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,1,'evidence_retracted'),'renewal:retracted');
  const assignment=(await store.reserve(p.projectId)).assignment,live=await supervise(store,p.projectId,assignment.id,{withholdExit:true});
  try{await cellCommand(b,p,cand.cell,'cancel',{reason:'Withdraw maintained source'},p.owner);
    assert.equal((await resolve(p)).manifest,null);await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,cand,2,'retry_failure'),'renewal:withdrawn'),/source_withdrawn/);
    await assert.rejects(store.reconcile(p.projectId,assignment.id),/termination_unknown/);await assert.rejects(store.reserve(p.projectId),/physical_reservation_held/);
  }finally{await live.release();}
  assert.equal((await store.reconcile(p.projectId,assignment.id)).receiptAdmitted,false);assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'2000');
  const q=await project(b),revoked=await candidate(b,q);await complete(q,revoked);
  await store.db.tx(async c=>{await store.lock(c,q.projectId);await store.mutation(c,q.projectId,'revoke-version',revoked.identity.target,'Explicit source revocation');});
  await assert.rejects(store.requestRevalidation(q.projectId,await renewal(q,revoked,1,'verification_changed'),'renewal:revoked'),/source_revoked/);
  assert.equal((await resolve(q)).manifest,null);
});

test('finite renewal budget, no public maintenance authority, and lossless migration rollback gates',async()=>{
  const p=await project(b,{maxValidationCostUnits:'2000',evidenceValidityMs:250}),cand=await candidate(b,p);await complete(p,cand);await expiry(p);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,1),'renewal:last-budget');await complete(p,cand,2);await expiry(p,2);
  const before=await status(p);await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,cand,2),'renewal:exhausted'),/budget_exhausted/);assert.deepEqual(await status(p),before);
  for(const endpoint of ['revalidate','configureVerification','assign'])assert.equal((await request(b,`${path(p)}/${endpoint}`,{token:p.owner,body:{candidateId:cand.candidateId}})).status,404);
  const down=await readFile(new URL('../../../../services/correspondence/migrations/visitor-foundry/003_vf04_revalidation.down.sql',import.meta.url),'utf8');
  await assert.rejects(store.db.tx(c=>c.query(down)),/revalidation_history_requires_archival_before_downgrade/);await store.checkReady();
  assert.equal((await row(p,'attempts')).length,2);assert.equal((await row(p,'publications')).length,2);
});

test('policy change during a live renewal cannot admit its receipt; same-scope unrelated candidate survives ordinary evidence renewal',async()=>{
  const p=await project(b),first=await candidate(b,p),other=await candidate(b,p,{...recipe,maxRangeLength:130});
  await complete(p,first);await complete(p,other);
  const pubs=await row(p,'publications');const old=pubs.find(r=>r.candidate_id===first.candidateId);
  await store.retract(p.projectId,`observation:${hash(old.receipt).slice(7)}`);
  await store.requestRevalidation(p.projectId,await renewal(p,first,1,'evidence_retracted'),'renewal:same-scope');
  const during=await resolve(p);assert.ok(during.resolution.candidates.some(c=>hash(c.target)===hash(other.identity.target)&&c.status==='compatible'));
  assert.equal(during.resolution.candidates.find(c=>hash(c.target)===hash(first.identity.target)).status,'unknown');
  const assignment=(await store.reserve(p.projectId)).assignment;const child=await supervise(store,p.projectId,assignment.id,{withholdExit:true});
  try{await profile(p,'policy:changed-during-execution');
    await assert.rejects(store.requestRevalidation(p.projectId,await renewal(p,first,2,'verification_changed'),'renewal:live-policy'),/physical_reservation_held/);
    await assert.rejects(store.reconcile(p.projectId,assignment.id),/termination_unknown/);
    assert.equal((await row(p,'attempts','AND generation=2'))[0].state,'running');
  }finally{await child.release();}
  const result=await store.reconcile(p.projectId,assignment.id);assert.equal(result.code,'verification_unknown');
  assert.equal((await row(p,'publications','AND generation=2')).length,0);
  assert.ok((await row(p,'attempts','AND generation=2'))[0].result);
  await store.requestRevalidation(p.projectId,await renewal(p,first,2,'verification_changed'),'renewal:current-policy');await complete(p,first,3);
  assert.equal((await status(p)).reuse.validationCapacityCharged.costUnits,'4000');
});

test('expired pending outbox remains historical; bounded recovery publishes only the explicitly renewed current generation',async()=>{
  const p=await project(b,{evidenceValidityMs:250}),cand=await candidate(b,p);
  const a1=(await store.reserve(p.projectId)).assignment;await supervise(store,p.projectId,a1.id);await store.reconcile(p.projectId,a1.id);
  const historical=await expiry(p);assert.equal(historical.state,'pending');
  await assert.rejects(store.publish(p.projectId,cand.candidateId,1),/publication_evidence_expired/);
  await profile(p,'policy:outbox-renewal');
  const temp=await mkdtemp(new URL('../evidence/tmp/maintenance-cli-',import.meta.url));
  try {
    await writeFile(`${temp}/request.json`,JSON.stringify(await renewal(p,cand,1)));
    const {stdout}=await exec(process.execPath,['scripts/visitor-foundry/integration/worker.mjs','revalidate',p.projectId,`${temp}/request.json`,'renewal:unpublished-expiry'],
      {env:{...process.env,VF04_OWNER_QA_WORKER:'1',CORRESPONDENCE_DATABASE_URL:process.env.VF04_TEST_DATABASE_URL,CORRESPONDENCE_PG_SCHEMA:process.env.VF04_TEST_SCHEMA}});
    assert.equal(JSON.parse(stdout).generation,2);
  }finally{await rm(temp,{recursive:true,force:true});}
  const pass=await recoverPool(store,p.projectId);assert.equal(pass.actions.length,0);
  const a2=(await store.reserve(p.projectId)).assignment;await supervise(store,p.projectId,a2.id);await store.reconcile(p.projectId,a2.id);
  const recovered=await recoverPool(store,p.projectId);assert.equal(recovered.actions[0].published,true);assert.equal(recovered.actions[0].generation,2);
  assert.deepEqual((await row(p,'publications','AND generation=1'))[0],historical);assert.ok((await resolve(p)).manifest);
});

test('historical dependency expiry stays authoritative while renewal is pending and after fresh component evidence',async()=>{
  const p=await project(b,{evidenceValidityMs:400}),cand=await candidate(b,p);await complete(p,cand);
  const parent=version({capabilityId:'fixture:maintained-parent',input:inputShape,output:outputShape,outcomes:['node-engine-compatibility'],dependencies:[cand.identity.target]});
  const parentEvidence=observation(parent,{id:'fixture:parent-before-renewal',observedAt:new Date().toISOString(),expiresAt:null});
  await store.installOwnerQAEvidence(p.projectId,{version:[parent],observation:[parentEvidence]});
  const inspect=async()=>ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:requestFor(frozen.cases[0].input,'task:parent-maintenance',{capabilityId:parent.capabilityId})}));
  assert.ok((await inspect()).manifest);await expiry(p);assert.equal((await inspect()).manifest,null);
  await store.requestRevalidation(p.projectId,await renewal(p,cand,1),'renewal:dependency-evidence');
  assert.equal((await inspect()).manifest,null,'renewal must not hide the expired dependency evidence and revive a stale parent');
  await complete(p,cand,2);
  assert.equal((await inspect()).manifest,null,'component renewal is not replay of its historical parent composition');
  const retained=(await row(p,'graph',"AND kind='observation'")).find(r=>r.id===parentEvidence.id);assert.deepEqual(retained.record,parentEvidence);
});
