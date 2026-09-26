import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {IntegrationStore} from '../src/store.mjs';
import {supervise} from '../src/supervisor.mjs';
import {cases,PORTABLE_ENV,PORTABLE_OUTCOME} from '../src/portable-profile.mjs';
import {boot,request,ok,path} from './helpers.mjs';
const exec=promisify(execFile);let a,b,store,tmp;const hosts=[];const evidence=process.env.VF04_EVIDENCE_DIR??'scripts/visitor-foundry/integration/evidence/compound';
before(async()=>{a=await boot();b=await boot();hosts.push(a,b);store=new IntegrationStore(process.env.VF04_TEST_DATABASE_URL,{schema:process.env.VF04_TEST_SCHEMA,poolMax:2});tmp=await mkdtemp('/tmp/vf09-owned-');});
after(async()=>{await Promise.all(hosts.map(h=>h.stop()));await store?.close();if(tmp)await rm(tmp,{recursive:true,force:true});});
const task=(input,taskId=`task:${randomUUID()}`)=>({schema:'neomorphic.foundry.capability-request.v1',taskId,outcome:PORTABLE_OUTCOME,input,environment:PORTABLE_ENV,output:null,capabilityId:null});
async function project(options={}){const c=ok(await request(b,'/v1/projects',{body:{title:'VF09 source receiving',summary:'Owner QA real portable reuse'}}));const p={projectId:c.project.id,owner:c.ownerToken};for(const role of ['writer','reader'])p[role]=ok(await request(b,`/v1/projects/${p.projectId}/grants`,{token:p.owner,body:{role}}));await b.rpc('enrollPortable',p.projectId,options);return p;}
async function cli(mode,p,req,host=b){const id=randomUUID(),prefix=`${tmp}/${id}`;await writeFile(`${prefix}.token`,['contribute','resume','reconcile'].includes(mode)?p.writer.token:p.reader.token,{mode:0o600});await writeFile(`${prefix}.key`,'vf09-local-visitor-identity-key-32-bytes',{mode:0o600});await writeFile(`${prefix}.json`,JSON.stringify({baseUrl:host.baseUrl,projectId:p.projectId,tokenFile:`${prefix}.token`,...(['contribute','resume','reconcile'].includes(mode)?{identityKeyFile:`${prefix}.key`,standingScope:'synthetic-reusable-components',stateDir:`${prefix}.state`}:{})}),{mode:0o600});await writeFile(`${prefix}.request`,JSON.stringify(req));const {stdout}=await exec(process.execPath,['scripts/visitor-foundry/integration/compound/visitor.mjs',mode,`${prefix}.json`,`${prefix}.request`],{maxBuffer:1024*1024});return JSON.parse(stdout);}
const row=(p,table)=>store.db.tx(async c=>(await c.query(`SELECT * FROM correspondence_vf04_${table} WHERE project_id=$1`,[p.projectId])).rows);
const original=()=>task({structuredContent:{event:{id:'evt_original',kind:'artifact'},replayed:false},content:[{type:'text',text:'redundant rendering'}]},'task:visitor-a');
async function complete(p,candidate,generation=1){const assignment=(await store.reserve(p.projectId)).assignment;const execution=await supervise(store,p.projectId,assignment.id);assert.equal(execution.terminationObserved,true,JSON.stringify(execution));const reconciled=await store.reconcile(p.projectId,assignment.id);assert.equal(reconciled.stage,'accepted',JSON.stringify({reconciled,execution}));await store.publish(p.projectId,candidate,generation);return assignment;}
test('actual A contribution through VF05, assigned portable verifier, host restart and cold B discovery/invocation',async()=>{
 const p=await project(),first=await cli('use',p,original());assert.equal(first.invocation,null);
 const contributed=await cli('contribute',p,original());const id=contributed.submission.admission.candidateId;assert.ok(id);const assignment=await complete(p,id);
 const attempts=await row(p,'attempts');assert.equal(attempts[0].children.length,4);assert.ok(attempts[0].children.every(c=>c.identity&&c.sample.observation.termination.exited));
 const graph=await row(p,'graph');assert.equal(graph.filter(g=>g.kind==='observation').length,4);assert.ok(graph.filter(g=>g.kind==='observation').every(g=>g.record.scope.inputDigest));
 await b.stop('SIGKILL');b=await boot();hosts.push(b);
 const later=[];for(const c of cases){const used=await cli('use',p,task(c.input));assert.deepEqual(used.invocation.output,c.expected);later.push({caseId:c.id,...used});}
 const unseen=await cli('use',p,task({structuredContent:{another:'unseen'}}));assert.equal(unseen.invocation,null);
 const invocationRows=await row(p,'invocations');assert.ok(invocationRows.every(r=>!Object.hasOwn(r.execution,'request')&&r.execution.requestId));assert.ok(!JSON.stringify(invocationRows).includes(cases[0].input.content[0].text));
 await writeFile(`${evidence}/journey.json`,JSON.stringify({purpose:'owner_qa',independentUsefulTasks:0,first,contributed,assignment,verification:attempts[0].portable_result,verificationReceipt:attempts[0].result,verificationTermination:attempts[0].termination,later,invocations:(await row(p,'invocations')).map(r=>({taskId:r.task_id,state:r.state,observation:r.execution.sample.observation})),unseen},null,2)+'\n');
});

import {participationClient} from '../compound/client.mjs';
import {createServer} from 'node:http';
import {packageModule} from '../../execution/example/package.mjs';
import {createArtifact,bytesHash} from '../../execution/src/contracts.mjs';
import {createVersion,hash,refOf} from '../../capabilities/src/index.mjs';
import {portableEvaluation} from '../src/portable-profile.mjs';
import {wasm} from '../../execution/tests/helpers.mjs';
import {recoverPool} from '../src/recover.mjs';
function client(p,host=b){return participationClient({baseUrl:host.baseUrl,projectId:p.projectId,token:p.writer.token,identityKey:'vf09-local-visitor-identity-key-32-bytes'});}
async function component(bytes,sourceText){bytes??=await readFile(new URL('../../execution/.build/structured-result.wasm',import.meta.url));sourceText??=await readFile(new URL('../../execution/example/structured-result.c',import.meta.url),'utf8');const old=packageModule(bytes,{sourceRevision:bytesHash(Buffer.from(sourceText)).slice(7)});const {contentId,...v}=structuredClone(old.capability);v.rights.ref='permission:vf09-owner-qa';v.provenance.refs=[old.module.digest,portableEvaluation.suiteDigest,bytesHash(Buffer.from(sourceText))];const {id,schema,...body}=old;return {kind:'portable-structured-result-v1',descriptor:createArtifact({...body,capability:createVersion(v),evaluation:portableEvaluation}),sourceText,moduleBase64:bytes.toString('base64')};}
async function prepare(p,{host=b,artifact,client:given}={}){
 const c=given??client(p,host),terms=await c.call('participation/terms'),req=original();
 const offered=await c.call('task',{request:req,negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}});
 const uploaded=await c.call('components',{artifact:artifact??await component(),termsVersion:terms.id},`upload:${randomUUID()}`);
 let cellId=null,current;
 const intent=operation=>c.session.prepare({mode:'adapt-artifact',operation,cellId,termsVersion:terms.id,consent:true,body:operation==='create'?{...offered.continuation,fundingKind:'voluntary',termsVersion:undefined}:operation==='claim'?{expectedRevision:current.revision,ttlSeconds:60,voluntaryOptIn:true}:{expectedRevision:current.revision,fence:current.cell.fence,[operation==='checkpoint'?'checkpointRef':'contributionRef']:uploaded.componentRef}});
 const next=operation=>{if(operation!=='create')return intent(operation);const {termsVersion,...refs}=offered.continuation;return c.session.prepare({mode:'adapt-artifact',operation,cellId:null,termsVersion:terms.id,consent:true,body:{...refs,fundingKind:'voluntary'}});};
 const read=async id=>{cellId=id;current=(await c.session.resume({schema:'neomorphic.foundry.participation-hint.v1',cellId})).current;assert.ok(current);return current;};
 const send=async operation=>{const i=next(operation),r=await c.session.execute(i);assert.equal(r.status,'committed',JSON.stringify({r,metrics:c.metrics}));await read(r.receipt.cellId);return {intent:i,...r};};
 return {c,terms,offered,uploaded,next,read,send,get current(){return current;}};
}
async function submit(p,options){const journey=await prepare(p,options);for(const op of ['create','claim','checkpoint'])await journey.send(op);return {journey,submission:await journey.send('submit')};}
async function proxy(host){let target=host.baseUrl;const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);const r=await fetch(`${target}${req.url}`,{method:req.method,headers:{authorization:req.headers.authorization??'','content-type':'application/json','idempotency-key':req.headers['idempotency-key']??''},...(bytes.length?{body:bytes}:{}),signal:AbortSignal.timeout(20000)});res.writeHead(r.status,{'content-type':'application/json'});res.end(await r.text());}catch{res.destroy();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {baseUrl:`http://127.0.0.1:${server.address().port}`,target(h){target=h.baseUrl;},close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};}

test('all VF05 mutations survive commit-before-ACK SIGKILL at a stable origin with exact fresh-session replay',async()=>{
 const p=await project(),front=await proxy(a);try{
  const j=await prepare(p,{client:client(p,front)});
  for(const op of ['create','claim','checkpoint','submit']){
   const intent=j.next(op);await writeFile(`${tmp}/intent-${op}.json`,JSON.stringify(intent),{mode:0o600});await a.rpc('armCrash','participate');
   const lost=await j.c.session.execute(intent);assert.equal(lost.status,'unknown-outcome');
   a=await boot();hosts.push(a);front.target(a);
   const fresh=client(p,front),replayed=await fresh.session.reconcile(JSON.parse(await readFile(`${tmp}/intent-${op}.json`,'utf8')));assert.equal(replayed.status,'committed',JSON.stringify(replayed));assert.equal(replayed.receipt.replayed,true);
   const cliReplay=await cli('reconcile',p,intent,front);assert.equal(cliReplay.status,'committed');assert.equal(cliReplay.receipt.cellId,replayed.receipt.cellId);
   const resumed=await cli('resume',p,{schema:'neomorphic.foundry.participation-hint.v1',cellId:replayed.receipt.cellId},front);assert.equal(resumed.current.cellId,replayed.receipt.cellId);await j.read(replayed.receipt.cellId);
  }
  assert.equal((await row(p,'candidates')).length,1);assert.equal((await row(p,'attempts')).length,0);assert.equal(j.current.revision,4);
  const claims=await store.db.tx(async c=>(await c.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE project_id=$1 AND scope LIKE 'vf02:cell:%'",[p.projectId])).rows[0].n);assert.equal(claims,4);
 }finally{await front.close();}
});

test('proposal duplicates coalesce, terms are transactional, and revoked/expired/foreign/reader grants cannot reuse intent',async()=>{
 const p=await project(),j=await prepare(p),first=j.next('create');
 const results=await Promise.all(Array.from({length:8},(_,i)=>request(i%2?a:b,`${path(p)}/participation`,{token:p.writer.token,key:`duplicate-proposal-${i}`,body:{operation:'create',cellId:null,requestId:`duplicate-proposal-${i}`,termsVersion:j.terms.id,body:first.body}})));
 assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.body.cellId)).size,1);await j.read(results[0].body.cellId);
 const stale=j.next('claim');
 let release,entered;const holding=new Promise(r=>entered=r);const held=store.db.tx(async c=>{await store.lock(c,p.projectId);entered();await new Promise(r=>release=r);const next={revision:'terms:changed-under-wait',scope:'synthetic-reusable-components',funding:'voluntary',rights:j.terms.rights};next.id=hash(next);await c.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[p.projectId,next]);});await holding;
 const waiting=request(a,`${path(p)}/participation`,{token:p.writer.token,key:stale.requestId,body:{cellId:stale.cellId,requestId:stale.requestId,termsVersion:stale.termsVersion,body:stale.body,operation:'claim'}});await new Promise(r=>setTimeout(r,40));release();await held;
 assert.equal((await waiting).body.error.code,'stale_terms');assert.equal((await j.c.session.execute(stale)).status,'stale-terms');
 const foreign=await project();assert.equal((await request(b,`${path(p)}/participation/terms`,{token:foreign.writer.token})).status,404);
 assert.equal((await request(b,`${path(p)}/components`,{token:p.reader.token,body:{artifact:await component(),termsVersion:j.terms.id}})).status,403);
 assert.equal((await request(b,`/v1/projects/${p.projectId}/grants/${p.writer.grantId??p.writer.grant?.id??p.writer.id}`,{token:p.owner,method:'DELETE'})).status,204);
 assert.equal((await j.c.session.reconcile(first)).status,'stale-grant');
 const p2=await project(),j2=await prepare(p2);const created=await j2.send('create');const claim=j2.next('claim');
 await store.db.tx(c=>c.query("UPDATE correspondence_grants SET expires_at=clock_timestamp()+interval '120 milliseconds' WHERE project_id=$1 AND role='writer'",[p2.projectId]));
 let unlock,ready;const locked=new Promise(r=>ready=r);const lock=store.db.tx(async c=>{await store.lock(c,p2.projectId);ready();await new Promise(r=>unlock=r);});await locked;
 const late=request(a,`${path(p2)}/participation`,{token:p2.writer.token,key:claim.requestId,body:{operation:'claim',cellId:claim.cellId,requestId:claim.requestId,termsVersion:claim.termsVersion,body:claim.body}});await new Promise(r=>setTimeout(r,180));unlock();await lock;assert.equal((await late).status,401);assert.equal((await row(p2,'candidates')).length,0);
});

test('portable expiry and explicit renewal preserve identity and history; old receipt cannot publish the new generation',async()=>{
 const p=await project({validityMs:350}),{submission}=await submit(p);const candidate=submission.receipt.admission.candidateId;await complete(p,candidate);
 const before=(await row(p,'candidates'))[0],pub=(await row(p,'publications'))[0];await new Promise(r=>setTimeout(r,400));assert.equal((await cli('use',p,task(cases[0].input))).invocation,null);
 const current=ok(await request(b,`${path(p)}/status`,{token:p.owner})).verification;const installed=(await store.configureVerification(p.projectId,{expectedVerificationId:current.id,revision:'policy:portable-maintenance',validityMs:10000},'portable-policy-renewal')).verification;
 const body={candidateId:candidate,expectedGeneration:1,expectedVerificationId:installed.id,reason:'expiry'};
 const renewed=await Promise.all(Array.from({length:8},(_,i)=>(i%2?a:b).rpc('requestRevalidation',p.projectId,body,`portable-renewal-${i}`)));assert.ok(renewed.every(r=>r.generation===2));
 assert.equal((await cli('use',p,task(cases[0].input))).invocation,null);await complete(p,candidate,2);
 const after=(await row(p,'candidates'))[0];assert.deepEqual(after.manifest,before.manifest);assert.deepEqual(after.artifact,before.artifact);assert.equal(after.semantic_key,before.semantic_key);
 assert.deepEqual((await row(p,'publications')).find(p=>p.generation===1),pub);await assert.rejects(store.publish(p.projectId,candidate,1),/stale|generation/);
 assert.deepEqual((await cli('use',p,task(cases[0].input))).invocation.output,cases[0].expected);
});

test('failed real component is rejected, dependency execution is explicitly unsupported, and accepted zero-use/decline remain visible',async()=>{
 const text='{"outcome":"observed","payload":{}}',bytes=wasm(`i64.const ${BigInt(Buffer.byteLength(text))<<32n}`,`(data (i32.const 0) "${[...Buffer.from(text)].map(b=>'\\'+b.toString(16).padStart(2,'0')).join('')}")`);
 const p=await project(),bad=await component(bytes,'(module ;; owner-QA constant-output negative control\n)');const {submission}=await submit(p,{artifact:bad});
 const assigned=(await store.reserve(p.projectId)).assignment;await supervise(store,p.projectId,assigned.id);const result=await store.reconcile(p.projectId,assigned.id);assert.equal(result.stage,'verification_failed');assert.equal((await row(p,'publications')).length,0);assert.ok((await row(p,'attempts'))[0].portable_result.checks.some(c=>c.status==='fail'));
 const dep=await component(),{contentId,...v}=structuredClone(dep.descriptor.capability);v.dependencies=[refOf(bad.descriptor.capability)];dep.descriptor={...dep.descriptor,capability:createVersion(v)};const {id,...d}=dep.descriptor;dep.descriptor.id=hash(d);
 const unsupported=await request(b,`${path(p)}/components`,{token:p.writer.token,body:{artifact:dep,termsVersion:(await client(p).call('participation/terms')).id}});assert.equal(unsupported.status,422);assert.equal(unsupported.body.reason,'portable_composition_mapping_unavailable');assert.equal(unsupported.body.accepted,false);
 const unused=await project(),accepted=await submit(unused);await complete(unused,accepted.submission.receipt.admission.candidateId);assert.equal((await row(unused,'invocations')).length,0);
 const decline=await cli('decline',unused,task({structuredContent:{notQualified:true}}));assert.equal(decline.decline.contribution,'declined');assert.equal((await row(unused,'candidates')).length,1);
 const ordinary=await client(unused).call('task',{request:task({},'task:unsupported-outcome'),negotiation:{accepts:['neomorphic.foundry.participation.v1']},sharing:null});assert.equal(ordinary.participation.modes.length,0);
});

test('invocation commit-before-ACK and concurrent retries do not repeat physical work; finite invocation budget remains charged',async()=>{
 const p=await project({maxInvocations:2}),s=await submit(p);await complete(p,s.submission.receipt.admission.candidateId);
 const req=task(cases[0].input),resolved=ok(await request(a,`${path(p)}/resolve`,{token:p.reader.token,body:req}));const body={manifestId:resolved.manifest.id,request:req};
 await a.rpc('armCrash','invokePortable');await assert.rejects(request(a,`${path(p)}/invoke`,{token:p.reader.token,body}));a=await boot();hosts.push(a);
 const retry=ok(await request(a,`${path(p)}/invoke`,{token:p.reader.token,body}));assert.equal(retry.replayed,true);assert.deepEqual(retry.output,cases[0].expected);assert.equal((await row(p,'invocations')).length,1);
 const next=task(cases[1].input),resolution=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:next}));const call={manifestId:resolution.manifest.id,request:next};
 const concurrent=await Promise.all([request(a,`${path(p)}/invoke`,{token:p.reader.token,body:call}),request(b,`${path(p)}/invoke`,{token:p.reader.token,body:call})]);assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal(concurrent.find(r=>r.status!==200).body.error.code,'invocation_outcome_unknown');
 const rows=await row(p,'invocations');assert.equal(rows.length,2);assert.ok(rows.every(r=>r.execution.identity&&r.execution.sample.observation.termination.exited));
 const extra=task(cases[2].input),r=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:extra}));assert.equal((await request(b,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:r.manifest.id,request:extra}})).body.error.code,'invocation_budget_exhausted');
});

test('withdrawal between actual verifier samples prevents further launch and publication without inventing child exit',async()=>{
 const p=await project(),{submission,journey}=await submit(p);const assignment=(await store.reserve(p.projectId)).assignment;let called=0;
 const executed=await supervise(store,p.projectId,assignment.id,{onObservation:async()=>{if(called++===0){const cell=journey.current.cell;ok(await request(b,`/v1/projects/${p.projectId}/work-cells/${cell.id}/commands`,{token:p.owner,body:{schema:'neomorphic.foundry.work-cell-command.v1',action:'cancel',expectedRevision:cell.revision,reason:'Voluntary source withdrawal'}}));}}});
 assert.equal((await client(p).call(`participation/cells/${journey.current.cell.id}`)).cell.status,'cancelled');assert.equal(executed.terminationObserved,true);const rows=await row(p,'attempts');assert.equal(rows[0].children.length,1);assert.equal(rows[0].children[0].sample.observation.termination.exited,true);await store.reconcile(p.projectId,assignment.id);assert.equal((await row(p,'publications')).length,0);assert.equal((await cli('use',p,task(cases[0].input))).invocation,null);
});

test('multi-child launch/identity/result lost acknowledgements retain uncertainty, while all durable exits recover without rerunning',async()=>{
 for(const phase of ['planned','identity','sample','last-sample']){
  const p=await project(),{submission}=await submit(p),assignment=(await store.reserve(p.projectId)).assignment;
  await a.rpc('armCrash',`child:${phase}`);await assert.rejects(a.rpc('supervise',p.projectId,assignment.id));a=await boot();hosts.push(a);
  const before=(await row(p,'attempts'))[0];assert.equal(before.termination,null);
  if(phase==='last-sample'){
   assert.equal(before.children.length,4);const observations=before.children.map(c=>c.sample.observation.id);await recoverPool(store,p.projectId);
   const after=(await row(p,'attempts'))[0];assert.equal(after.state,'reconciled');assert.deepEqual(after.children.map(c=>c.sample.observation.id),observations);assert.equal((await row(p,'publications')).length,1);
  }else{
   assert.equal(before.children.length,1);assert.equal((await recoverPool(store,p.projectId)).blocked,'termination_or_outcome_unknown');await assert.rejects(store.reserve(p.projectId),/physical_reservation_held/);assert.equal((await row(p,'publications')).length,0);
   if(phase==='identity')assert.ok(before.children[0].identity&&!before.children[0].sample);
  }
 }
});

test('a live cancelled portable child retains charge until witnessed exit; authorized retry and finite verification cost cap',async()=>{
 const p=await project({validityMs:300,maxValidationCostUnits:'8000'}),{submission}=await submit(p),candidate=submission.receipt.admission.candidateId;
 const assignment=(await store.reserve(p.projectId)).assignment,controller=new AbortController();let observedLive=false;
 const result=await supervise(store,p.projectId,assignment.id,{signal:controller.signal,onSpawn:async record=>{process.kill(record.identity.pid,0);observedLive=true;await assert.rejects(store.reserve(p.projectId),/physical_reservation_held/);controller.abort();}});
 assert.equal(observedLive,true);assert.equal(result.terminationObserved,true);assert.equal((await row(p,'attempts'))[0].children.length,1);
 assert.equal((await store.reconcile(p.projectId,assignment.id)).stage,'timed_out');const state=ok(await request(b,`${path(p)}/status`,{token:p.owner}));assert.equal(state.reuse.validationCapacityCharged.costUnits,'4000');
 await store.requestRevalidation(p.projectId,{candidateId:candidate,expectedGeneration:1,expectedVerificationId:state.verification.id,reason:'retry_failure'},'portable-retry-after-exit');await complete(p,candidate,2);
 await new Promise(r=>setTimeout(r,350));await assert.rejects(store.requestRevalidation(p.projectId,{candidateId:candidate,expectedGeneration:2,expectedVerificationId:state.verification.id,reason:'expiry'},'portable-budget-exhausted'),/budget_exhausted/);
 assert.equal(ok(await request(b,`${path(p)}/status`,{token:p.owner})).reuse.validationCapacityCharged.costUnits,'8000');
});

test('F93 full coordinates reach the actual portable verifier losslessly; source/module substitution and public authority are refused',async()=>{
 const p=await project(),artifact=await component(),{contentId,...v}=structuredClone(artifact.descriptor.capability);v.capabilityId='cap:'+'λ'.repeat(508);v.version='v'+'界'.repeat(511);
 const {id,schema,...body}=artifact.descriptor;artifact.descriptor=createArtifact({...body,capability:createVersion(v)});
 const {submission}=await submit(p,{artifact});const candidate=submission.receipt.admission.candidateId;await complete(p,candidate);
 const attempt=(await row(p,'attempts'))[0];assert.deepEqual(attempt.portable_result.binding.capability,refOf(artifact.descriptor.capability));assert.match(attempt.assignment.capability.id,/^capability:[a-f0-9]{64}$/);
 const terms=(await client(p).call('participation/terms')).id;
 for(const invalid of [{...artifact,sourceText:artifact.sourceText+'\n'},{...artifact,moduleBase64:Buffer.from('invalid module').toString('base64')}])assert.notEqual((await request(b,`${path(p)}/components`,{token:p.writer.token,body:{artifact:invalid,termsVersion:terms}})).status,200);
 assert.equal((await row(p,'packages')).filter(p=>p.kind==='component').length,1);
 for(const route of ['verify','publish','configure-verification','request-revalidation'])assert.equal((await request(b,`${path(p)}/${route}`,{token:p.writer.token,body:{receipt:attempt.result,accepted:true}})).status,404);
});

test('actual installed wrapper drift invalidates discovery; output observed before retraction remains audit data and cannot be reused',async()=>{
 const p=await project(),s=await submit(p);await complete(p,s.submission.receipt.admission.candidateId);
 const req=task(cases[0].input),resolved=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:req}));
 for(const relative of ['../../execution/src/child.py','../compound/oracle.py','../compound/heldouts.json','../../execution/src/ports.mjs']){
 const file=new URL(relative,import.meta.url),bytes=await readFile(file);
 try{await writeFile(file,Buffer.concat([bytes,Buffer.from('\n')]));await assert.rejects(store.checkReady(),/changed/);const drift=ok(await request(b,`${path(p)}/resolve`,{token:p.reader.token,body:req}));assert.equal(drift.manifest,null);await assert.rejects(store.invokePortable({projectId:p.projectId,token:p.reader.token},{manifestId:resolved.manifest.id,request:req}),/invalidated|changed/);}finally{await writeFile(file,bytes);}
 }
 const originalWrite=store.invocationWrite.bind(store);store.invocationWrite=async(...args)=>{const r=await originalWrite(...args);if(args[4].sample){const obs=(await row(p,'graph')).find(r=>r.kind==='observation');await store.retract(p.projectId,obs.id);}return r;};
 try{await assert.rejects(store.invokePortable({projectId:p.projectId,token:p.reader.token},{manifestId:resolved.manifest.id,request:req}),/evidence_changed|resolution_invalidated/);}finally{store.invocationWrite=originalWrite;}
 const invocations=await row(p,'invocations');assert.equal(invocations.length,1);assert.ok(invocations[0].execution.sample.observation.termination.exited);assert.equal(invocations[0].state,'completed');assert.ok(invocations[0].result);
 const other=await project();assert.equal((await cli('use',other,original())).invocation,null);
});

test('additive portable migration refuses to discard execution/package/terms history',async()=>{
 const sql=await readFile(new URL('../../../../services/correspondence/migrations/visitor-foundry/004_vf09_portable.down.sql',import.meta.url),'utf8');
 await assert.rejects(store.db.tx(async c=>{await c.query(sql);throw new Error('unguarded_downgrade_executed');}),/portable_history_requires_archival_before_downgrade/);await store.checkReady();
});

test('native portable reuse accounting binds real output, beneficiary and frozen input without upgrading unknown usefulness',async()=>{
 const p=await project(),s=await submit(p);await complete(p,s.submission.receipt.admission.candidateId);
 for(const c of cases){const req=task(c.input),r=ok(await request(b,`${path(p)}/resolve`,{token:p.writer.token,body:req}));ok(await request(b,`${path(p)}/invoke`,{token:p.writer.token,body:{manifestId:r.manifest.id,request:req}}));
  const body={taskId:req.taskId,experimentId:'experiment:vf09-cold-reuse',caseId:c.id,arm:'reuse_only'};
  assert.notEqual((await request(b,`${path(p)}/observe`,{token:p.owner,body})).status,200);
  ok(await request(b,`${path(p)}/observe`,{token:p.writer.token,body}));
 }
 const events=await store.db.tx(async c=>(await c.query("SELECT response_json->'command'->'payload' AS p FROM correspondence_idempotency WHERE project_id=$1 AND scope='vf04:transition' AND response_json->'command'->>'type'='observe'",[p.projectId])).rows.map(r=>r.p));
 assert.equal(events.length,4);assert.equal(events.filter(x=>x.outcome==='useful').length,1);assert.equal(events.filter(x=>x.outcome==='unknown').length,3);assert.ok(events.every(x=>x.relationship==='owner'&&x.purpose==='owner_qa'&&x.cost===null));
 await store.checkReady();
});

if(process.env.VF09_BENCH)test('measured portable reads with growing unrelated inventory and real mixed publication traffic',async()=>{
 const p=await project({maxInvocations:64}),s=await submit(p);const prepared=[];
 for(const inventory of [0,32,128,512]){
  // Freeze concurrent useful-miss proposals before any qualification exists.
  const req=task({structuredContent:{loadOriginal:inventory}}),cl=client(p),terms=await cl.call('participation/terms');
  const offer=await cl.call('task',{request:req,negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:'synthetic-reusable-components',termsVersion:terms.id}});
  const artifact=await component(),{contentId,...v}=structuredClone(artifact.descriptor.capability);v.capabilityId=`capability:load-published:${inventory}`;const {id,schema,...d}=artifact.descriptor;artifact.descriptor=createArtifact({...d,capability:createVersion(v)});
  const upload=await cl.call('components',{artifact,termsVersion:terms.id},`bench-upload-${inventory}`);let cellId=null,current;
  for(const operation of ['create','claim','checkpoint','submit']){
   const body=operation==='create'?{proposalRef:offer.continuation.proposalRef,resolverRef:offer.continuation.resolverRef,reproducerRef:offer.continuation.reproducerRef,fundingKind:'voluntary'}:operation==='claim'?{expectedRevision:current.revision,ttlSeconds:60,voluntaryOptIn:true}:{expectedRevision:current.revision,fence:current.cell.fence,[operation==='checkpoint'?'checkpointRef':'contributionRef']:upload.componentRef};
   const r=await cl.session.execute(cl.session.prepare({mode:'adapt-artifact',operation,cellId,termsVersion:terms.id,consent:true,body}));assert.equal(r.status,'committed');if(operation==='submit')prepared.push(r.receipt.admission.candidateId);cellId=r.receipt.cellId;current=await cl.call(`participation/cells/${cellId}`);
  }
 }
 await complete(p,s.submission.receipt.admission.candidateId);
 const samples=[],runs=[],metrics=[];store.onMetric=m=>metrics.push(m);
 let prior=0;
 for(const inventory of [0,32,128,512]){
  // Trusted load fixture only: unrelated, unqualified immutable versions are not publications or demand.
  await store.db.tx(async c=>{await store.lock(c,p.projectId);for(let i=prior;i<inventory;i++){const {contentId,...v}=structuredClone((await component()).descriptor.capability);v.capabilityId=`load:unrelated:${i}`;v.outcomes=['load-unrelated'];await store.appendGraph(c,p.projectId,'version',createVersion(v),'operator:load-fixture');}});prior=inventory;
  const assignment=(await store.reserve(p.projectId)).assignment;await supervise(store,p.projectId,assignment.id);await store.reconcile(p.projectId,assignment.id);
  await a.rpc('metrics');await b.rpc('metrics');metrics.length=0;
  const start=performance.now();
  const reads=(async()=>{for(let i=0;i<8;i++){const req=task(cases[i%4].input),t=performance.now(),r=ok(await request(i%2?a:b,`${path(p)}/resolve`,{token:p.reader.token,body:req}));const t2=performance.now();const inv=ok(await request(i%2?a:b,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:r.manifest.id,request:req}}));assert.deepEqual(inv.output,cases[i%4].expected);samples.push({inventory,resolveMs:t2-t,invokeMs:performance.now()-t2});}})();
  const publication=store.publish(p.projectId,assignment.candidateId);await Promise.all([reads,publication]);
  // Separately identify true database lock waiting, with a controlled 60ms writer hold.
  let release,entered;const ready=new Promise(r=>entered=r);const held=store.db.tx(async c=>{await store.lock(c,p.projectId);entered();await new Promise(r=>release=r);});await ready;
  const waiting=request(b,`${path(p)}/resolve`,{token:p.reader.token,body:task(cases[0].input)});await new Promise(r=>setTimeout(r,60));
  const waits=await store.db.tx(async c=>(await c.query("SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows);release();await held;ok(await waiting);assert.ok(waits.length);
  runs.push({inventory,published:inventory===0?2:inventory===32?3:inventory===128?4:5,elapsedMs:performance.now()-start,metrics:[...metrics,...await a.rpc('metrics'),...await b.rpc('metrics')],controlledHoldMs:60,observedPostgresWaits:waits});
 }
 await writeFile(`${evidence}/read-bench-${process.env.VF09_BENCH_LABEL??'current'}.json`,JSON.stringify({purpose:'owner_qa',samples,runs,measurement:'loopback HTTP; graphBuild and journalReplay synchronous elapsed; profileChecks elapsed; lockQuery includes SQL roundtrip and row-lock wait; controlled wait measured separately; no demand or economic inference'},null,2)+'\n');
});


test('reserved invocation crash has durable no-launch recovery, retains charge and cannot revive its old claim',async()=>{
 const p=await project({maxInvocations:2}),s=await submit(p);await complete(p,s.submission.receipt.admission.candidateId);
 const req=task(cases[0].input),r=ok(await request(a,`${path(p)}/resolve`,{token:p.reader.token,body:req}));
 await a.rpc('armCrash','invocation:reserved');await assert.rejects(request(a,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:r.manifest.id,request:req}}));a=await boot();hosts.push(a);
 const recovered=await recoverPool(store,p.projectId);assert.ok(recovered.actions.some(x=>x.noLaunch&&x.budgetRefunded===false));
 const inv=(await row(p,'invocations'))[0];assert.equal(inv.state,'completed');assert.equal(inv.execution.identity,null);assert.equal(inv.result,null);assert.ok(inv.execution.noLaunchProof);
 assert.equal((await request(b,`${path(p)}/invoke`,{token:p.reader.token,body:{manifestId:r.manifest.id,request:req}})).body.error.code,'invocation_outcome_unknown');
 await assert.rejects(store.invocationWrite(p.projectId,req.taskId,inv.execution.fence,'forged-supervisor',{identity:{pid:1}}),/stale_invocation_fence/);
 assert.deepEqual((await cli('use',p,task(cases[0].input))).invocation.output,cases[0].expected);assert.equal((await row(p,'invocations')).length,2);
});
