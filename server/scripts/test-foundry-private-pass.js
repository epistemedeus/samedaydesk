import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,symlink,stat,cp} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {channel} from 'node:diagnostics_channel';
import pg from 'pg';
import {PostgresStore} from '@neomorphic/correspondence';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {runBounded} from '../foundry/bounded-child.mjs';
import {bootFoundryServer} from '../foundry/activation/local-journey.mjs';
import {openEntryFacade,closeEntryThenBase} from '../foundry/compose.js';
import {receivePassRequest} from '../foundry/private-pass.mjs';
import {runPrivatePass,PASS_SCHEMA,INVOCATION_PASS_SCHEMA,PASS_SCOPE,digest,validateRequest} from '../foundry/private-pass-core.mjs';
import {resumed,useFromEntry} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/client.mjs';
import {grantToken} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs';
import {python} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/supervisor.mjs';
import {launchFailure,launchEvidenceView,observeLaunch} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/launch-evidence.mjs';
import {continuationView,executionView} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/execution-view.mjs';
import {original,task,cases} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
const root=process.cwd(),vendor=path.join(root,'vendor/visitor-foundry-receiver');
let cluster,dir,admin,receivedPortableMethods;
const owners=new Set(),servers=new Set(),pools=new Set();
const inherited={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'};
async function command(args,env={},cwd=root,expected=0) {
 const r=await runBounded(process.execPath,args,{cwd,env:{...inherited,...env},capture:true,timeoutMs:90000,stdoutLimit:1000000,outputLimit:2000000});
 assert.equal(r.reason,null);assert.equal(r.code,expected,`exit ${r.code}: ${args[0]}`);
 return r.stdout.trim()?JSON.parse(r.stdout.trim().split('\n').at(-1)):null;
}
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'sds-private-pass-'));cluster=await startDisposablePg();admin=new pg.Pool({connectionString:cluster.url});
 const file=path.join(vendor,'scripts/visitor-foundry/integration/src/portable-store.mjs');
 const old=await runBounded('git',['show','eaed1efef1c6b04fc0ba74bd55e25bf424964a34:vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-store.mjs'],{capture:true,stdoutLimit:100000});assert.equal(old.code,0);assert.equal(old.reason,null);
 const source=old.stdout.replace(/from '(\.\.?\/[^']+)'/g,(_m,p)=>`from '${new URL(p,pathToFileURL(file)).href}'`);
 receivedPortableMethods=(await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).portableMethods;
});
after(async()=>{for(const s of servers) await s.stop();for(const o of owners) await closeEntryThenBase(o.mounted,o.base);for(const p of pools) await p.end();await admin?.end();await cluster?.stop();await rm(dir,{recursive:true,force:true});});
async function fixture(withContribution=true,{validityMs}={}) {
 const db=`privatepass_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE "${db}"`);
 const privateDir=path.join(dir,db);await mkdir(privateDir,{mode:0o700});
 const env={CORRESPONDENCE_DATABASE_URL:cluster.url.replace('/correspondence',`/${db}`),CORRESPONDENCE_PG_SCHEMA:'pilot_correspondence',FOUNDRY_PRIVATE_DIR:privateDir,
  FOUNDRY_HOST_PROFILE_FILE:path.join(privateDir,'host.json'),FOUNDRY_PRIVATE_PROFILE_FILE:path.join(privateDir,'private.json'),FOUNDRY_PARTICIPATION_KEY_FILE:path.join(privateDir,'key')};
 for(const [name,file] of [['host-profile.example.json',env.FOUNDRY_HOST_PROFILE_FILE],['private-profile.example.json',env.FOUNDRY_PRIVATE_PROFILE_FILE]])await writeFile(file,await readFile(path.join(vendor,'scripts/visitor-foundry/integration/entry',name)),{mode:0o600});
 await writeFile(env.FOUNDRY_PARTICIPATION_KEY_FILE,'disposable-private-pass-key-32-characters\n',{mode:0o600});
 await command(['server/foundry/install.mjs','--migrate','--install'],env);
 const config={databaseUrl:env.CORRESPONDENCE_DATABASE_URL,pgSchema:env.CORRESPONDENCE_PG_SCHEMA,adminToken:'fixture-not-public',store:'postgres',bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:10000,corsOrigins:[],trustProxyHops:0,poolMax:1,port:0};
 const base=new PostgresStore(config.databaseUrl,{schema:config.pgSchema,poolMax:1});const {mounted}=await openEntryFacade({store:base,config,env});owners.add({base,mounted});
 const pool=new pg.Pool({connectionString:config.databaseUrl});pools.add(pool);
 const query=async(sql,values)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO pilot_correspondence');const r=await c.query(sql,values);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const boot=async(port='0')=>{const s=await bootFoundryServer({...inherited,...env,FOUNDRY_HOST_OPT_IN:'1',CORRESPONDENCE_STORE:'postgres',CORRESPONDENCE_POOL_MAX:'1',CORRESPONDENCE_ADMIN_TOKEN:'fixture-only-admin-never-issued',
   SUPABASE_URL:'https://local-baseline.example',SUPABASE_SERVICE_ROLE_KEY:'local-baseline-stub',STRIPE_SECRET_KEY:'local-baseline-stub',RESEND_API_KEY:'local-baseline-stub',PORT:String(port)},process.execPath);servers.add(s);return s;};
 const s=await boot();
 const visitor=async(name,host=s)=>{
  const d=await(await fetch(`${host.origin}/api/correspondence/v1/visitor-entry`,{signal:AbortSignal.timeout(5000)})).json();
  const file=path.join(privateDir,`${name}.json`),directory=path.join(privateDir,name);
  await writeFile(file,JSON.stringify({baseUrl:`${host.origin}/api/correspondence`,directory,authority:{profileId:d.profile.profileId,entryTerms:d.profile.termsHash,contributionTerms:d.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
  const run=async(mode,input,expected=0)=>{const inputFile=path.join(privateDir,`${name}-${randomUUID()}.json`);if(input!==undefined) await writeFile(inputFile,JSON.stringify(input),{mode:0o600});return command(['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,file,...(input===undefined?[]:[inputFile]),'--json-result'],{},vendor,expected);};
  const r=await run('register');assert.equal(r.body.receiver.state,'ready');return {run,projectId:r.body.projectId,file,directory,registration:r.body};
 };
 const a=await visitor('a');
 if(validityMs){const previous=(await query('SELECT verification FROM correspondence_vf04_pools WHERE project_id=$1',[a.projectId])).rows[0].verification;await mounted.extension.integration.configureVerification(a.projectId,{expectedVerificationId:previous.id,revision:previous.policy.revision,validityMs},'fixture-short-evidence');}
 const contribution=withContribution?await a.run('contribute',original()):null;
 const candidateId=contribution?.submission.admission.candidateId ?? null;
 const allocation=(await command(['server/foundry/install.mjs','--inspect-installation'],env)).installation;
 const verification=(await query('SELECT verification FROM correspondence_vf04_pools WHERE project_id=$1',[a.projectId])).rows[0].verification;
 const request={schema:PASS_SCHEMA,intentId:`owner:${randomUUID()}`,action:'dispatch',projectId:a.projectId,expectedHostConfigId:allocation.hostConfigId,expectedEntryTermsHash:allocation.entryTermsHash,
  expectedVerificationId:verification.id,candidateId,expectedGeneration:1,reconcileIntentId:null};
 const store=mounted.extension.integration,receiver=mounted.receiver;
 const pass=(r=request,opts={})=>runPrivatePass(store,receiver,r,opts);
 const cli=(r=request,extra={},exit=0)=>command(['server/foundry/private-pass.mjs'],{...env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(r),...extra},root,exit);
 const counts=async()=> (await query(`SELECT (SELECT count(*)::int FROM correspondence_vf04_attempts) attempts,(SELECT count(*)::int FROM correspondence_vf04_invocations) invocations,(SELECT count(*)::int FROM correspondence_idempotency WHERE scope=$1) intents,(SELECT charged FROM correspondence_vf10_installation) charged`,[PASS_SCOPE])).rows[0];
 return {env,privateDir,query,s,boot,visitor,a,candidateId,request,store,receiver,pass,cli,counts};
}
function code(p,value){return assert.rejects(p,e=>e.code===value);}
test('strict typed request and absent explicit selection refuse without SQL',async()=>{
 assert.throws(()=>receivePassRequest({FOUNDRY_PRIVATE_DIR:dir}),{code:'private_pass_request_required'});
 for(const v of [null,{}, {schema:PASS_SCHEMA}, {schema:PASS_SCHEMA,command:'shell'}]) assert.throws(()=>validateRequest(v),{code:'private_pass_request_invalid'});
 await command(['server/foundry/private-pass.mjs'],{FOUNDRY_PRIVATE_DIR:dir},root,2);
});
test('explicit canonical dispatch publishes; exact replay charges once; read-only observation binds task termination',async()=>{
 const f=await fixture(),before=await f.counts();const authority=(await f.query('SELECT to_jsonb(t) AS value FROM correspondence_vf10_installation t')).rows;const caps=(await f.query('SELECT config FROM correspondence_vf12_host')).rows;const result=await f.cli();assert.equal(result.state,'completed');assert.equal(result.readback.publications[0].state,'published');
 const replay=await f.cli();assert.equal(replay.replayed,true);assert.equal(replay.assignmentId,result.assignmentId);assert.deepEqual(replay.readback.charged,result.readback.charged);
 const used=await f.a.run('use',task(cases[0].input));assert.deepEqual(used.invocation.output,cases[0].expected);
 const obs=await f.cli({...f.request,intentId:'read:a',action:'observe'});assert.equal(obs.mutated,false);assert.equal(obs.readback.invocations[0].sample.termination.exited,true);assert.equal(obs.readback.invocations[0].sample.termination.drained,true);
 assert.deepEqual(obs.readback.invocations[0].sample.phases,['compile','instantiate','execute']);assert.equal(obs.readback.invocations[0].candidateId,f.candidateId);
 const after=await f.counts();assert.equal(after.attempts,1);assert.equal(after.intents,1);assert.equal(after.charged,before.charged);assert.deepEqual((await f.query('SELECT to_jsonb(t) AS value FROM correspondence_vf10_installation t')).rows,authority);assert.deepEqual((await f.query('SELECT config FROM correspondence_vf12_host')).rows,caps);
 for(const name of ['prepared','started','completed']) assert.equal((await stat(path.join(f.privateDir,`operator-${digest(f.request.intentId).slice(7)}-${name}.json`))).mode&0o777,0o600);
});
test('wrong project, allocation, entry terms and generation refuse before dispatch',async()=>{
 const f=await fixture();const initial=await f.counts();
 for(const [key,value,error] of [['projectId','nonexistent','pool_not_enrolled'],['expectedHostConfigId',`sha256:${'a'.repeat(64)}`,'private_pass_host_conflict'],['expectedEntryTermsHash',`sha256:${'b'.repeat(64)}`,'private_pass_terms_conflict'],['expectedVerificationId',`sha256:${'c'.repeat(64)}`,'private_pass_verification_conflict'],['expectedGeneration',2,'private_pass_candidate_conflict']])await code(f.pass({...f.request,[key]:value}),error);
 assert.deepEqual(await f.counts(),initial);
});
test('changed durable intent and concurrent exact retry cannot launch twice',async()=>{
 const f=await fixture();const out=await Promise.all([f.pass(),f.pass()]);assert.equal(out.filter(x=>x.ok && !x.replayed).length,1);assert.equal((await f.counts()).attempts,1);
 await code(f.pass({...f.request,action:'reconcile',reconcileIntentId:'changed'}),'private_pass_intent_conflict');
});
test('unknown/lost response never redispatches; unlaunched reservation remains held for explicit reconciliation',async()=>{
 const f=await fixture();await assert.rejects(f.pass(f.request,{onStarted:()=>{throw Object.assign(new Error(),{code:'lost_response'});}}),{code:'lost_response'});
 const prior=await f.counts();const again=await f.pass();assert.equal(again.code,'private_pass_outcome_unknown');assert.equal(again.readback.outstandingPhysical,1);assert.deepEqual(await f.counts(),prior);
 const entry=await f.a.run('reconcile');assert.equal(entry.status,200);assert.equal(entry.body.projectId,f.a.projectId);assert.equal(entry.body.receiver.state,'ready');assert.deepEqual(await f.counts(),prior);
 const read=await f.cli({...f.request,intentId:'observe-held-entry',action:'observe'});assert.equal(read.readback.outstandingPhysical,1);assert.equal(read.readback.attempts[0].state,'reserved');assert.deepEqual(await f.counts(),prior);
 await code(f.pass({...f.request,intentId:'new-attempt'}),'physical_reservation_held');
 await code(f.pass({...f.request,intentId:'reconcile-held',action:'reconcile',reconcileIntentId:f.request.intentId}),'private_pass_outcome_unknown');
 assert.equal((await f.counts()).attempts,1);
});
test('completed physical work with lost receipt is explicitly reconciled without another execution',async()=>{
 const f=await fixture();const done=await f.pass();
 await f.query("UPDATE correspondence_idempotency SET response_json=jsonb_set(response_json,'{state}','\"unknown\"') WHERE scope=$1",[PASS_SCOPE]);
 const unknown=await f.pass();assert.equal(unknown.ok,false);
 const reconciled=await f.pass({...f.request,intentId:'receive-exit',action:'reconcile',reconcileIntentId:f.request.intentId});assert.equal(reconciled.ok,true);assert.equal(reconciled.assignmentId,done.assignmentId);
 assert.equal((await f.counts()).attempts,1);assert.equal((await f.pass()).replayed,true);
});
test('stale installed execution policy refuses; no journal/charge is changed',async()=>{
 const f=await fixture();await f.query("UPDATE correspondence_vf04_pools SET verification=jsonb_set(verification,'{runtimePin}','\"changed\"') WHERE project_id=$1",[f.a.projectId]);
 const before=await f.counts();await assert.rejects(f.pass(),e=>['installed_runtime_changed','installed_verification_changed','installed_source_changed'].includes(e.code));assert.deepEqual(await f.counts(),before);
});
test('outstanding physical ownership in another admitted project blocks this pass',async()=>{
 const f=await fixture();const b=await f.visitor('b');await b.run('contribute',original());await f.store.reserve(b.projectId);
 const before=await f.counts();await code(f.pass(),'physical_reservation_held');assert.deepEqual(await f.counts(),before);
});
test('private inputs/receipt modes and path/symlink/changed replay refuse without dispatch',async()=>{
 const f=await fixture(),env={...f.env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(f.request)};
 const got=receivePassRequest(env);const before=await f.counts();
 const receipt=path.join(f.privateDir,`operator-${digest(f.request.intentId).slice(7)}-completed.json`);await writeFile(receipt,'{}',{mode:0o644});assert.throws(()=>receivePassRequest(env),{code:'private_input_mode'});await rm(receipt);
 await symlink(got.requestFile,receipt);assert.throws(()=>receivePassRequest(env));await rm(receipt);
 assert.throws(()=>receivePassRequest({...env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify({...f.request,action:'observe'})}),{code:'private_content_mismatch'});
 assert.throws(()=>receivePassRequest({...env,FOUNDRY_PRIVATE_DIR:path.join(root,'public_html')}));
 assert.throws(()=>receivePassRequest({...env,FOUNDRY_PRIVATE_PASS_JSON:'{\n"schema":1}'}),{code:'private_pass_request_invalid'});
 assert.throws(()=>receivePassRequest({...env,FOUNDRY_WORKER_PASS:'arbitrary'}),{code:'private_pass_override_refused'});
 assert.deepEqual(await f.counts(),before);
});
test('SIGTERM cancellation stays supervised and drained; visitor execution is not replayed',async()=>{
 const f=await fixture(),controller=new AbortController();const pids=[];
 const result=await f.pass(f.request,{signal:controller.signal,onSpawn:r=>{pids.push(r.identity.pid);controller.abort();}}).catch(e=>({code:e.code}));
 assert.ok(result.ok || result.code);const read=await f.pass({...f.request,intentId:'cancel-observe',action:'observe'});
 for(const a of read.readback.attempts)for(const c of a.children)assert.ok(c.sample?.termination?.noLaunch || c.sample?.termination?.exited && c.sample?.termination?.drained);
 assert.equal((await f.counts()).attempts,1);assert.ok(pids.length>0);for(const pid of pids)await assert.rejects(stat(`/proc/${pid}`),{code:'ENOENT'});
});
test('visitor A / actual HTTP stop-restart / B canonical acquisition: useful, negative, changed and private correspondence',async()=>{
 const f=await fixture();await f.a.run('checkpoint',{text:'private continuation survives restart'});await f.cli();const a=await f.a.run('use',task(cases[0].input));assert.deepEqual(a.invocation.output,cases[0].expected);
 await f.s.stop();servers.delete(f.s);const restarted=await f.boot(f.s.port);const b=await f.visitor('b',restarted);
 for(const n of [0,1,3]){const r=await b.run('use',task(cases[n].input));assert.deepEqual(r.invocation.output,cases[n].expected);}
 const r=await b.run('use',task({structuredContent:{project:{id:'unmeasured',status:'closed',version:7},nextAction:null}}));assert.equal(r.invocation,null);assert.equal(r.discovery.manifest,null);
 const obs=await f.cli({...f.request,intentId:'after-restart',action:'observe'});assert.equal(obs.readback.attempts.length,1);
 // Consumer invocations are owned by B; observe that existing project explicitly.
 const bObs=await f.cli({...f.request,intentId:'observe-b',action:'observe',projectId:b.projectId,candidateId:null,expectedGeneration:null,expectedVerificationId:null});
 assert.equal(bObs.readback.invocations.length,3);for(const i of bObs.readback.invocations){assert.equal(i.candidateId,f.candidateId);assert.equal(i.sample.termination.exited,true);assert.equal(i.sample.termination.drained,true);}
 const config=JSON.parse(await readFile(f.a.file));config.baseUrl=`${restarted.origin}/api/correspondence`;
 // Canonical continuation binds origin; restart should retain the same HTTP port.
 // The canonical private SQL event remains independent of contribution sharing.
 const rows=(await f.query('SELECT text FROM correspondence_events WHERE project_id=$1',[f.a.projectId])).rows;assert.ok(rows.some(x=>x.text==='private continuation survives restart'));
});
test('source-pinned remote caller rehearses A / restart / B; named managed pass works with a minimal PATH',async()=>{
 const f=await fixture(false);const qaDir=path.join(f.privateDir,'root-caller');await mkdir(qaDir,{mode:0o700});
 const d=await(await fetch(`${f.s.origin}/api/correspondence/v1/visitor-entry`)).json();
 const configFile=path.join(f.privateDir,'root-caller.json');await writeFile(configFile,JSON.stringify({schema:'sds.foundry.remote-owner-qa.v1',directory:qaDir,baseUrl:`${f.s.origin}/api/correspondence`,
   expectedHostConfigId:f.request.expectedHostConfigId,expectedEntryTermsHash:f.request.expectedEntryTermsHash,authority:{profileId:d.profile.profileId,entryTerms:d.profile.termsHash,
   contributionTerms:d.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
 const harness=(stage,expected=0)=>command(['server/foundry/activation/remote-private-journey.mjs',stage,configFile],{},root,expected);
 const contributed=await harness('a-contribute');assert.equal(contributed.purpose,'owner_qa');
 const observed=await f.cli({...f.request,intentId:'harness-observe',action:'observe',projectId:contributed.projectId,candidateId:null,expectedGeneration:null,expectedVerificationId:null});
 const intent={...f.request,intentId:'harness-dispatch',projectId:contributed.projectId,candidateId:contributed.candidateId,expectedVerificationId:observed.readback.verificationId};
 const utilities=path.join(f.privateDir,'node-only');await mkdir(utilities);await symlink(process.execPath,path.join(utilities,'node'));await symlink('/bin/sh',path.join(utilities,'sh'));await symlink(path.join(path.dirname(process.execPath),'npm'),path.join(utilities,'npm'));
 const managed=await runBounded(path.join(utilities,'npm'),['run','build:managed-foundry-private-pass'],{cwd:root,env:{...f.env,PATH:utilities,LANG:'C',LC_ALL:'C',FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(intent)},capture:true,timeoutMs:90000,stdoutLimit:1000000,outputLimit:2000000});
 assert.equal(managed.code,0);assert.equal(managed.reason,null);
 const lines=managed.stdout.trim().split('\n').filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));const probe=lines.find(x=>x.probe==='managed-node');assert.equal(probe.python3,false);assert.equal(typeof probe.prlimit,'boolean');assert.equal(probe.referenceRuntime,true);assert.equal(lines.at(-1).state,'completed');
 const a=await harness('a-use');assert.equal(a.uses.length,3);await harness('b-use',2);
 await f.s.stop();servers.delete(f.s);const restarted=await f.boot(f.s.port);
 await writeFile(path.join(qaDir,'actual-http-restart.json'),JSON.stringify({schema:'sds.foundry.actual-restart.v1',receiptId:'disposable-actual-stop-start',stoppedAt:'2026-10-05T19:00:00Z',startedAt:'2026-10-05T19:00:01Z',
   expectedHostConfigId:f.request.expectedHostConfigId,expectedEntryTermsHash:f.request.expectedEntryTermsHash}),{mode:0o600});
 const b=await harness('b-use');assert.equal(b.uses.length,3);assert.equal(b.candidateId,contributed.candidateId);
 const read=await f.cli(JSON.parse(await readFile(path.join(qaDir,'owner-observe-b.json'))));assert.equal(read.readback.invocations.length,3);
 for(const i of read.readback.invocations){assert.equal(i.candidateId,contributed.candidateId);assert.equal(i.sample.termination.exited,true);assert.equal(i.sample.termination.drained,true);}
 assert.equal(read.readback.outstandingPhysical,0);
 const aRead=await f.cli(JSON.parse(await readFile(path.join(qaDir,'owner-observe-a-use.json'))));const proofFile=path.join(f.privateDir,'canonical-readbacks.json');await writeFile(proofFile,JSON.stringify({a:aRead,b:read}),{mode:0o600});
 const {remoteJourney}=await import('../foundry/activation/remote-private-journey.mjs');const proof=await remoteJourney('check',configFile,proofFile);assert.equal(proof.observations.length,6);
 const wrongSource=structuredClone(read);wrongSource.readback.invocations[0].sourceProject='different-project';await writeFile(proofFile,JSON.stringify({a:aRead,b:wrongSource}));await command(['server/foundry/activation/remote-private-journey.mjs','check',configFile,proofFile],{},root,2);
 read.readback.invocations[0].sample.termination.drained=false;await writeFile(proofFile,JSON.stringify({a:aRead,b:read}));await command(['server/foundry/activation/remote-private-journey.mjs','check',configFile,proofFile],{},root,2);
});

test('caller source closure refuses an unrelated or changed control source before network/enrollment',async()=>{
 const copied=path.join(dir,'changed-source');await mkdir(copied);const pin=JSON.parse(await readFile('server/foundry/activation/private-control-pin.json'));
 for(const file of Object.keys(pin.files)){const target=path.join(copied,file);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(root,file),target);}
 await cp('server/foundry/activation/private-control-pin.json',path.join(copied,'server/foundry/activation/private-control-pin.json'));await symlink(path.join(root,'node_modules'),path.join(copied,'node_modules'));
 await writeFile(path.join(copied,'server/foundry/private-pass-core.mjs'),(await readFile('server/foundry/private-pass-core.mjs'))+'\n// Changed received control source.\n');
 const changed=await import(pathToFileURL(path.join(copied,'server/foundry/activation/remote-private-journey.mjs')));assert.throws(()=>changed.verifyCallerClosure(),{code:'caller_source_changed'});
 const r=await command(['server/foundry/activation/remote-private-journey.mjs','a-contribute',path.join(dir,'no-network-config.json')],{},copied,2);assert.equal(r,null);
});
test('private started/completed receipt with missing durable journal refuses new work',async()=>{
 const f=await fixture();await f.cli();
 const local=receivePassRequest({...f.env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(f.request)});
 await f.query('DELETE FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2',[PASS_SCOPE,f.a.projectId]);
 const before=await f.counts();await code(f.pass(f.request,{localReceipts:local.receipts}),'private_pass_journal_missing');
 await f.cli(f.request,{},2);assert.deepEqual(await f.counts(),before);
});

// All interpreter mutations below are confined to the disposable namespace created
// by managed-layout-tests.mjs, which never changes the parent installation.
async function noLaunchFixture({peerBeforeInvocation=false,validityMs}={}){
 const f=await fixture(true,{validityMs});await f.cli();const peer=peerBeforeInvocation?await f.visitor('b'):null,request=task(cases[0].input,'task:owner-a-use-useful');
 const mode=(await stat(python)).mode&0o777;let refused;
 try{await chmod(python,0o644);refused=await f.a.run('use',request,1);}finally{await chmod(python,mode);}
 assert.equal(refused.error.code,'invocation_no_launch');assert.equal(refused.error.diagnostic.applicationMarked,true);
 const row=async()=>(await f.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2',[f.a.projectId,request.taskId])).rows[0];
 const prior=await row();assert.equal(prior.state,'completed');assert.equal(prior.execution.sample.observation.termination.noLaunch,true);
 const r=await f.a.run('prepare-no-launch',{intentId:`receive:${randomUUID()}`,expectedHostConfigId:f.request.expectedHostConfigId,request});
 assert.equal(r.schema,INVOCATION_PASS_SCHEMA);assert.equal(r.registrationId,(await f.query('SELECT id FROM correspondence_vf10_registrations WHERE project_id=$1',[f.a.projectId])).rows[0].id);
 const cfg=JSON.parse(await readFile(f.a.file)),ctx=resumed(cfg);const client=ctx.client;
 return {...f,ownerRequest:f.request,request,r,row,prior,client,peer};
}
const authorityRows=f=>f.query('SELECT to_jsonb(t) value FROM correspondence_vf10_installation t');
test('real HTTP no-launch evidence, explicit lossless receiving, saved intent continuation and charged ceiling',async()=>{
 const f=await noLaunchFixture(),authority=(await authorityRows(f)).rows,terms=(await f.query('SELECT config,verification,participation FROM correspondence_vf04_pools')).rows;
 const intent=path.join(f.a.directory,`invoke-${digest(f.request).slice(7)}.json`),bytes=await readFile(intent);
 const proof=(await readFile(path.join(f.a.directory,'registration.secret'),'utf8')).trim(),ctx={projectId:f.a.projectId,token:grantToken(proof,f.a.registration.registrationId,'writer')};
 await code(receivedPortableMethods.invokePortable.call(f.store,ctx,{manifestId:f.prior.manifest_id,request:f.request}),'invocation_outcome_unknown');assert.deepEqual(await f.row(),f.prior);
 const status=await f.a.run('status'),i=status.portableExecution.invocations[0];
 assert.equal(i.execution.status,'incomplete');assert.equal(i.execution.stage,'launch');assert.equal(i.execution.launchEvidence.failure.code,'spawn_permission');assert.equal(i.execution.launchEvidence.interpreterEntry,'regular_not_executable');
 assert.equal(i.observationId,f.prior.execution.sample.observation.id);assert.equal(i.requestDigest,digest(f.request));assert.equal(status.portableExecution.chargedInvocations,1);
 const read=await f.cli({...f.ownerRequest,intentId:'observe-no-launch',action:'observe'});
 assert.equal(read.readback.invocations[0].execution.launchEvidence.failure.code,'spawn_permission');assert.equal(read.readback.outstandingPhysical,0);
 await code(f.client.call('invoke',{manifestId:f.prior.manifest_id,request:f.request}),'invocation_no_launch');assert.deepEqual(await f.row(),f.prior);
 const received=await f.cli(f.r);assert.equal(received.receipt.chargedBefore,1);assert.equal(received.receipt.chargedAfter,2);assert.equal(received.physicalLaunched,false);assert.equal(received.receipt.budgetRefunded,false);
 assert.equal((await f.cli(f.r)).replayed,true);
 await code(f.store.invocationWrite(f.a.projectId,f.request.taskId,f.prior.execution.fence,f.prior.execution.supervisor,{sample:f.prior.execution.sample}),'stale_invocation_fence');
 const result=await f.a.run('use',f.request);assert.deepEqual(result.invocation.output,cases[0].expected);
 const current=await f.row();assert.deepEqual(current.execution.priorAttempts,[f.prior.execution]);assert.equal(current.manifest_id,f.prior.manifest_id);assert.equal(current.input_digest,f.prior.input_digest);
 assert.equal(current.execution.grantId,f.prior.execution.grantId);assert.equal(current.execution.requestId,f.prior.execution.requestId);assert.equal(current.execution.binding.moduleDigest,f.prior.execution.binding.moduleDigest);
 assert.deepEqual(await readFile(intent),bytes);assert.deepEqual((await authorityRows(f)).rows,authority);assert.deepEqual((await f.query('SELECT config,verification,participation FROM correspondence_vf04_pools')).rows,terms);
 assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,2);assert.equal((await f.cli(f.r)).replayed,true);
 const repeated=await f.a.run('use',f.request);assert.equal(repeated.invocation.replayed,true);assert.equal((await f.row()).execution.id,current.execution.id);
 for(const phase of ['prepared','completed'])assert.equal((await stat(path.join(f.privateDir,`operator-${digest(f.r.intentId).slice(7)}-${phase}.json`))).mode&0o777,0o600);
});
test('concurrent exact owner receiving consumes one slot; changed intent, identity and readback refuse',async()=>{
 const f=await noLaunchFixture();const two=await Promise.all([f.pass(f.r),f.pass(f.r)]);assert.equal(two.filter(x=>!x.replayed).length,1);
 assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,2);
 await code(f.pass({...f.r,intentId:'other-receive'}),'invocation_receive_conflict');
 await code(f.pass({...f.r,expectedObservationId:`sha256:${'b'.repeat(64)}`}),'private_pass_intent_conflict');
 const good=await f.row();await f.query("UPDATE correspondence_vf04_invocations SET execution=jsonb_set(execution,'{fence}','\"changed\"') WHERE project_id=$1",[f.a.projectId]);
 await code(f.pass(f.r),'private_pass_readback_conflict');await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,good.execution]);
 await f.a.run('use',f.request);assert.equal((await f.row()).execution.priorAttempts.length,1);
});
test('lost completed receipt replays durable receiving without another allowance or child',async()=>{
 const f=await noLaunchFixture();await assert.rejects(f.pass(f.r,{persist:phase=>{if(phase==='completed')throw Object.assign(new Error(),{code:'lost_receipt'});}}),{code:'lost_receipt'});
 const before=await f.row(),again=await f.pass(f.r);assert.equal(again.replayed,true);assert.equal(again.invocationState,'reserved');assert.deepEqual(await f.row(),before);
 const badReceipt={request:f.r,receipt:{executionId:'wrong'}};await code(f.pass(f.r,{localReceipts:[badReceipt]}),'private_pass_receipt_conflict');
 await f.a.run('use',f.request);assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,2);
});
test('lost HTTP invocation reply keeps the exact saved intent; restart returns its committed result without another child',async()=>{
 const f=await noLaunchFixture();await f.pass(f.r);const config=JSON.parse(await readFile(f.a.file)),nativeFetch=globalThis.fetch;let writes=0;
 const intent=path.join(f.a.directory,`invoke-${digest(f.request).slice(7)}.json`),bytes=await readFile(intent);
 globalThis.fetch=async(url,options)=>{const response=await nativeFetch(url,options);if(String(url).endsWith('/invoke')){writes++;await response.arrayBuffer();throw new Error('PRIVATE_LOST_REPLY_PROSE');}return response;};
 try{await code(useFromEntry(config,f.request),'transport_outcome_unknown');}finally{globalThis.fetch=nativeFetch;}
 assert.equal(writes,1);const committed=await f.row();assert.equal(committed.state,'completed');assert.ok(committed.result);
 assert.equal(committed.execution.sample.observation.termination.exited,true);assert.equal(committed.execution.sample.observation.termination.drained,true);
 const pid=committed.execution.identity.pid;await assert.rejects(stat(`/proc/${pid}`),{code:'ENOENT'});
 await f.s.stop();servers.delete(f.s);await f.boot(f.s.port);
 const resumed=await f.a.run('use',f.request);assert.equal(resumed.invocation.replayed,true);assert.deepEqual(resumed.invocation.output,cases[0].expected);
 assert.deepEqual(await readFile(intent),bytes);assert.deepEqual(await f.row(),committed);assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,2);
});
test('wrong allocation, terms, project, registration, candidate, generation, observation and original request refuse atomically',async()=>{
 const f=await noLaunchFixture();const before=await f.row(),counts=await f.counts();
 const controls=[['expectedHostConfigId',`sha256:${'b'.repeat(64)}`,'private_pass_host_conflict'],['expectedEntryTermsHash',`sha256:${'b'.repeat(64)}`,'private_pass_terms_conflict'],['projectId','unrelated','private_pass_entry_conflict'],['registrationId','unrelated','private_pass_entry_conflict'],['candidateId','candidate:unrelated','invocation_receive_conflict'],['expectedGeneration',2,'invocation_receive_conflict'],['expectedExecutionId','invocation:unrelated','invocation_receive_conflict'],['expectedFence',randomUUID(),'invocation_receive_conflict'],['expectedObservationId',`sha256:${'b'.repeat(64)}`,'invocation_launch_not_excluded']];
 for(const[key,value,error]of controls)await code(f.pass({...f.r,[key]:value}),error);
 await code(f.pass({...f.r,request:{...f.request,input:{changed:true}}}),'manifest_request_mismatch');
 await f.query('UPDATE correspondence_vf12_admissions SET charged=false WHERE project_id=$1',[f.a.projectId]);await code(f.pass(f.r),'private_pass_entry_conflict');await f.query('UPDATE correspondence_vf12_admissions SET charged=true WHERE project_id=$1',[f.a.projectId]);
 assert.deepEqual(await f.row(),before);assert.deepEqual(await f.counts(),counts);
});
test('no-launch receiving rejects forged observations, contradictory process identity and uncertain physical outcomes',async()=>{
 const f=await noLaunchFixture(),original=f.prior.execution;
 const set=async execution=>f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,execution]);
 const mutations=[x=>x.sample.observation.termination.noLaunch=false,x=>x.sample.observation.termination.exited=true,x=>x.identity={pid:123},x=>x.sample.observation.processIdentity={pid:123},x=>x.sample.observation.phasesObserved=[{phase:'compile'}],x=>x.sample.observation.phasesObserved=null,x=>x.sample.output={},x=>x.sample.observation.usage.wallMs=123,x=>x.binding.moduleDigest=`sha256:${'b'.repeat(64)}`];
 for(const mutate of mutations){const x=structuredClone(original);mutate(x);await set(x);await assert.rejects(f.pass(f.r),e=>['invocation_launch_not_excluded','invocation_receive_evidence_conflict'].includes(e.code));}
 await set(original);
 for(const state of ['reserved','running','unknown']){await f.query('UPDATE correspondence_vf04_invocations SET state=$2 WHERE project_id=$1',[f.a.projectId,state]);await code(f.pass(f.r),'invocation_receive_conflict');}
 await f.query("UPDATE correspondence_vf04_invocations SET state='completed' WHERE project_id=$1",[f.a.projectId]);assert.deepEqual(await f.row(),f.prior);
});
test('stale manifest, evidence, terms, grant and runtime generation never receive a no-launch continuation',async()=>{
 const f=await noLaunchFixture(),manifest=(await f.query('SELECT record FROM correspondence_vf04_manifests WHERE project_id=$1 AND id=$2',[f.a.projectId,f.r.manifestId])).rows[0].record;
 await f.query('UPDATE correspondence_vf04_manifests SET record=$3 WHERE project_id=$1 AND id=$2',[f.a.projectId,f.r.manifestId,{...manifest,validUntil:'2000-01-01T00:00:00Z'}]);await code(f.pass(f.r),'manifest_expired');
 await f.query('UPDATE correspondence_vf04_manifests SET record=$3 WHERE project_id=$1 AND id=$2',[f.a.projectId,f.r.manifestId,{...manifest,edges:[{changed:true}]}]);await code(f.pass(f.r),'evidence_changed');
 await f.query('UPDATE correspondence_vf04_manifests SET record=$3 WHERE project_id=$1 AND id=$2',[f.a.projectId,f.r.manifestId,manifest]);
 const pool=(await f.query('SELECT participation,verification FROM correspondence_vf04_pools WHERE project_id=$1',[f.a.projectId])).rows[0];
 await f.query("UPDATE correspondence_vf04_pools SET participation=jsonb_set(participation,'{id}','\"changed\"') WHERE project_id=$1",[f.a.projectId]);await code(f.pass(f.r),'private_pass_terms_conflict');await f.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[f.a.projectId,pool.participation]);
 await f.query("UPDATE correspondence_vf04_pools SET verification=jsonb_set(verification,'{runtimePin}','\"changed\"') WHERE project_id=$1",[f.a.projectId]);await assert.rejects(f.pass(f.r),e=>['installed_runtime_changed','installed_verification_changed','installed_source_changed'].includes(e.code));await f.query('UPDATE correspondence_vf04_pools SET verification=$2 WHERE project_id=$1',[f.a.projectId,pool.verification]);
 await f.query('UPDATE correspondence_grants SET revoked_at=clock_timestamp() WHERE id=$1',[f.prior.execution.grantId]);await code(f.pass(f.r),'invocation_receive_grant_conflict');assert.deepEqual(await f.row(),f.prior);
});
test('outstanding physical ownership and exhausted original cap prohibit receiving without resetting charges',async()=>{
 const f=await noLaunchFixture({peerBeforeInvocation:true}),b=f.peer;
 const proof=(await readFile(path.join(b.directory,'registration.secret'),'utf8')).trim(),ctx={projectId:b.projectId,token:grantToken(proof,b.registration.registrationId,'writer')};
 const request=task(cases[1].input,'task:held-b'),discovered=await f.store.task(ctx,{request,negotiation:{accepts:[]},sharing:null});
 f.store.onInvocationReserved=()=>{throw Object.assign(new Error(),{code:'interrupted_before_claim'});};
 await assert.rejects(f.store.invokePortable(ctx,{manifestId:discovered.manifest.id,request}),{code:'interrupted_before_claim'});delete f.store.onInvocationReserved;
 await code(f.pass(f.r),'host_physical_reservation_held');
 const held=(await f.query('SELECT state,execution FROM correspondence_vf04_invocations WHERE project_id=$1',[b.projectId])).rows[0];assert.equal(held.state,'reserved');assert.equal(held.execution.supervisor,null);
 // Explicit canonical unclaimed reconciliation fences the existing reservation.
 await f.store.reconcileUnlaunchedInvocation(b.projectId,request.taskId);
 const old=structuredClone(f.prior.execution);old.priorAttempts=Array.from({length:7},()=>f.prior.execution);
 await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,old]);await code(f.pass(f.r),'invocation_budget_exhausted');
 assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,8);assert.equal((await f.row()).execution.priorAttempts.length,7);
});
test('failed SQL rollback and cancellation preserve the original no-launch history and do not reserve a child',async()=>{
 const f=await noLaunchFixture(),before=await f.row(),counts=await f.counts(),original=f.store.receiveNoLaunchInvocation;
 f.store.receiveNoLaunchInvocation=async(c,r)=>{await original.call(f.store,c,r);await c.query('SELECT 1/0');};
 await assert.rejects(f.pass(f.r),e=>e.code==='22012');f.store.receiveNoLaunchInvocation=original;
 assert.deepEqual(await f.row(),before);assert.deepEqual(await f.counts(),counts);
 const controller=new AbortController();controller.abort();await assert.rejects(f.pass(f.r,{signal:controller.signal}));assert.deepEqual(await f.row(),before);
});
test('exited but undrained evidence stays unknown and held; no-launch receiving cannot reassign it',async()=>{
 const f=await noLaunchFixture(),execution=structuredClone(f.prior.execution),sample=structuredClone(execution.sample);
 execution.sample=null;execution.launchEvidence=null;sample.observation.status='unknown';sample.observation.termination={exited:true,drained:false,noLaunch:false,code:null,signal:null};
 const {id,...body}=sample.observation;sample.observation={...body,id:digest(body)};
 await f.query("UPDATE correspondence_vf04_invocations SET state='running',execution=$2 WHERE project_id=$1",[f.a.projectId,execution]);
 await f.store.invocationWrite(f.a.projectId,f.request.taskId,execution.fence,execution.supervisor,{sample});assert.equal((await f.row()).state,'unknown');
 await code(f.pass(f.r),'invocation_receive_conflict');await code(f.client.call('invoke',{manifestId:f.prior.manifest_id,request:f.request}),'invocation_outcome_unknown');
 const next=task(cases[1].input),discovered=await f.client.call('task',{request:next,negotiation:{accepts:[]},sharing:null});await code(f.client.call('invoke',{manifestId:discovered.manifest.id,request:next}),'quota-pressure');
 assert.equal((await f.client.call('status')).portableExecution.chargedInvocations,1);assert.equal((await f.row()).execution.fence,execution.fence);
});
test('HTTP invocation refuses missing/changed installed interpreter or native bytes before any charge; original manifest then executes',async()=>{
 const f=await fixture();await f.cli();const request=task(cases[0].input,'task:unchanged-runtime-negative'),client=resumed(JSON.parse(await readFile(f.a.file))).client;
 const discovered=await client.call('task',{request,negotiation:{accepts:[]},sharing:null}),body={manifestId:discovered.manifest.id,request};
 const native=path.join(path.dirname(python),'../lib/python3.12/site-packages/wasmtime/linux-x86_64/_libwasmtime.so');
 for(const file of [python,native]){
  const bytes=await readFile(file),mode=(await stat(file)).mode&0o777;
  try{await writeFile(file,Buffer.concat([bytes,Buffer.from('changed')]));await code(client.call('invoke',body),'stale-terms');}finally{await writeFile(file,bytes,{mode});}
  assert.equal((await f.query('SELECT count(*)::int n FROM correspondence_vf04_invocations')).rows[0].n,0);
 }
 const bytes=await readFile(python),mode=(await stat(python)).mode&0o777;
 try{await rm(python);await code(client.call('invoke',body),'stale-terms');}finally{await writeFile(python,bytes,{mode});}
 assert.equal((await f.query('SELECT count(*)::int n FROM correspondence_vf04_invocations')).rows[0].n,0);
 const result=await client.call('invoke',body);assert.deepEqual(result.output,cases[0].expected);assert.equal(result.manifestId,body.manifestId);
 assert.equal((await client.call('status')).portableExecution.chargedInvocations,1);
});
test('closed launch/status/CLI diagnostics discard arbitrary error prose and native aliases remain truthful',async()=>{
 const sentinel='PRIVATE_CREDENTIAL_PROSE_SENTINEL_100511';
 for(const [native,alias]of [['ENOENT','spawn_not_found'],['EACCES','spawn_permission'],['EAGAIN','spawn_process_capacity'],['EMFILE','spawn_file_capacity'],['ERR_ACCESS_DENIED','spawn_permission_model']]){const out=launchFailure({code:native,message:sentinel,path:sentinel});assert.equal(out.code,alias);assert.doesNotMatch(JSON.stringify(out),new RegExp(sentinel));}
 const forged=launchEvidenceView({schema:'neomorphic.foundry.launch-evidence.v1',interpreterEntry:sentinel,childPermission:sentinel,failure:{code:sentinel,errorClass:sentinel,resource:sentinel,message:sentinel}});
 const view=executionView({observation:{status:sentinel,code:sentinel,phase:sentinel,termination:{noLaunch:true}}},forged);assert.doesNotMatch(JSON.stringify(view),new RegExp(sentinel));assert.equal(view.status,'unclassified');assert.equal(view.code,'unclassified');
 const {callerFailure,callerResult,acceptedCallerPin,verifyCallerClosure}=await import('../foundry/activation/remote-private-journey.mjs');
 assert.throws(()=>callerResult({code:1,stdout:JSON.stringify({error:{code:'invocation_no_launch',diagnostic:{stage:'invoke',status:409,contentClass:'json',applicationMarked:true,message:sentinel}}})}),e=>{assert.equal(callerFailure(e).code,'invocation_no_launch');assert.doesNotMatch(JSON.stringify(callerFailure(e)),new RegExp(sentinel));return true;});
 const control=JSON.parse(await readFile('server/foundry/activation/private-control-pin.json'));assert.equal(acceptedCallerPin(control.receivedCallerClosures.at(-1)),true);assert.equal(acceptedCallerPin({...verifyCallerClosure(),closureDigest:`sha256:${'b'.repeat(64)}`} ),false);
 assert.throws(()=>validateRequest({...filler(),schema:INVOCATION_PASS_SCHEMA}),{code:'private_pass_request_invalid'});
 function filler(){return {command:sentinel};}
});
test('documented launch observer is scoped under concurrency and cleans up after an exception',async()=>{
 const ch=channel('child_process'),before=ch.hasSubscribers,mode=(await stat(python)).mode&0o777;
 const failed=command=>new Promise(resolve=>{const child=spawn(command,[],{stdio:'ignore'});let error;child.once('error',e=>{error=e.code;});child.once('close',()=>resolve({error,pid:child.pid??null}));});
 try{
  await chmod(python,0o644);
  const two=await Promise.all([observeLaunch(()=>failed(python)),observeLaunch(()=>failed(python))]);
  for(const r of two){assert.equal(r.sample.pid,null);assert.equal(r.launchEvidence.failure.code,'spawn_permission');}
  const unrelated=await observeLaunch(()=>failed('/absent-unrelated-process'));assert.equal(unrelated.launchEvidence.failure,null);
  const afterLaunch=await observeLaunch(async()=>{const child=new EventEmitter();child.spawnfile=python;child.pid=123;ch.publish({process:child});child.emit('error',{code:'EACCES',message:'private prose'});return null;});assert.equal(afterLaunch.launchEvidence.failure,null);
  await assert.rejects(observeLaunch(()=>Promise.reject(new Error('private sentinel'))));
 }finally{await chmod(python,mode);}
 assert.equal(ch.hasSubscribers,before);
});

async function waitManifestExpiry(f){
 const m=(await f.query('SELECT record FROM correspondence_vf04_manifests WHERE project_id=$1 AND id=$2',[f.a.projectId,f.r.manifestId])).rows[0].record;
 const ms=Math.max(0,Date.parse(m.validUntil)-Date.now()+80);assert.ok(ms<10000);await new Promise(r=>setTimeout(r,ms));return m;
}
async function lifecyclePlan(f){return f.a.run('prepare-continuation',{intentId:`lifecycle:${randomUUID()}`,expectedHostConfigId:f.r.expectedHostConfigId,request:f.request});}
test('expired original receives freshly measured successor; old intent/charge/history survive and loss/restart replays one execution',async()=>{
 const f=await noLaunchFixture({validityMs:7000}),authority=(await authorityRows(f)).rows,caps=(await f.query('SELECT config,verification,participation FROM correspondence_vf04_pools')).rows;
 const intent=path.join(f.a.directory,`invoke-${digest(f.request).slice(7)}.json`),bytes=await readFile(intent),manifest=await waitManifestExpiry(f),plan=await lifecyclePlan(f);
 // The exact received v2 path refuses expiry, without consuming its no-launch proof.
 await code(f.pass(f.r),'manifest_expired');assert.deepEqual(await f.row(),f.prior);
 const missing=await f.a.run('use',f.request,1);assert.equal(missing.error.code,'stale-terms');
 const renew=await f.cli(plan.renew);assert.equal(renew.receipt.previousGeneration,1);assert.equal(renew.receipt.generation,2);assert.equal(renew.physicalLaunched,false);
 assert.equal((await f.cli(plan.renew)).replayed,true);
 const dispatch=await f.cli(plan.dispatch);assert.equal(dispatch.readback.attempts.length,2);assert.equal(dispatch.readback.charged.costUnits,'8000');assert.equal(dispatch.readback.publications.find(p=>p.generation===2).state,'published');
 assert.equal((await f.cli(plan.dispatch)).replayed,true);
 await code(f.pass({...plan.receive,renewalIntentId:'absent-renewal'}),'invocation_renewal_conflict');
 const received=await f.cli(plan.receive);assert.equal(received.receipt.chargedBefore,1);assert.equal(received.receipt.chargedAfter,2);
 const t=received.receipt.transition;assert.equal(continuationView(t),t);
 for(const altered of [{...t,message:'PRIVATE_AUTHORITY_PROSE_SENTINEL'},{...t,target:{...t.target,private:'PRIVATE_AUTHORITY_PROSE_SENTINEL'}}]){const {id,...body}=altered;altered.id=digest(body);assert.equal(continuationView(altered),null);}
 assert.equal(t.predecessorManifestId,manifest.id);assert.notEqual(t.successorManifestId,manifest.id);assert.equal(t.generation,2);assert.equal(t.verificationId,f.r.expectedVerificationId);
 assert.equal((await f.cli(plan.receive)).replayed,true);
 assert.deepEqual((await f.query('SELECT record FROM correspondence_vf04_manifests WHERE project_id=$1 AND id=$2',[f.a.projectId,manifest.id])).rows[0].record,manifest);
 const reconcile=await f.a.run('reconcile-invocation',f.request);assert.deepEqual(reconcile.transition,t);assert.equal((await f.a.run('reconcile-invocation',f.request)).reconciled,true);
 const config=JSON.parse(await readFile(f.a.file)),nativeFetch=globalThis.fetch;let writes=0;
 try{globalThis.fetch=async(url,options)=>{const result=await nativeFetch(url,options);if(String(url).endsWith('/invoke')&&options?.method==='POST'){writes++;await result.arrayBuffer();throw new Error('PRIVATE_LOST_RESPONSE_SENTINEL');}return result;};await code(useFromEntry(config,f.request),'transport_outcome_unknown');}finally{globalThis.fetch=nativeFetch;}
 assert.equal(writes,1);const executed=await f.row();assert.equal(executed.state,'completed');assert.equal(executed.execution.sample.observation.termination.drained,true);
 assert.deepEqual(executed.execution.priorAttempts,[{...f.prior.execution,manifestId:manifest.id}]);assert.equal(executed.execution.requestId,f.prior.execution.requestId);assert.equal(executed.execution.grantId,f.prior.execution.grantId);assert.equal(executed.execution.binding.moduleDigest,f.prior.execution.binding.moduleDigest);
 await f.s.stop();f.s=await f.boot(f.s.port);const replay=await f.a.run('use',f.request);assert.equal(replay.invocation.replayed,true);assert.deepEqual(replay.invocation.output,cases[0].expected);
 assert.deepEqual(await readFile(intent),bytes);assert.deepEqual((await authorityRows(f)).rows,authority);assert.deepEqual((await f.query('SELECT config,verification,participation FROM correspondence_vf04_pools')).rows,caps);
 const localNames=(await import('node:fs/promises')).readdir;for(const name of await localNames(f.a.directory))if(name.includes('-continuation-'))assert.equal((await stat(path.join(f.a.directory,name))).mode&0o777,0o600);
 assert.equal((await f.a.run('status')).portableExecution.chargedInvocations,2);
 // Root's pinned owner caller follows the new manifest while retaining the first
 // private intent; its final A/B checker must compare the receiving manifest.
 const {remoteJourney,verifyCallerClosure}=await import('../foundry/activation/remote-private-journey.mjs');
 await cp(f.a.directory,path.join(f.privateDir,'visitor-a'),{recursive:true});
 const configA=JSON.parse(await readFile(f.a.file)),ownerFile=path.join(f.privateDir,'owner-qa.json');
 await writeFile(ownerFile,JSON.stringify({schema:'sds.foundry.remote-owner-qa.v1',directory:f.privateDir,baseUrl:configA.baseUrl,authority:configA.authority,expectedHostConfigId:f.r.expectedHostConfigId,expectedEntryTermsHash:f.r.expectedEntryTermsHash}),{mode:0o600});
 await writeFile(path.join(f.privateDir,'a-contribution-receipt.json'),JSON.stringify({schema:'sds.foundry.remote-contribution.v1',purpose:'owner_qa',projectId:f.a.projectId,candidateId:f.candidateId,generation:1,hostConfigId:f.r.expectedHostConfigId,entryTermsHash:f.r.expectedEntryTermsHash,moduleDigest:f.prior.execution.binding.moduleDigest,pin:verifyCallerClosure()}),{mode:0o600});
 assert.equal((await remoteJourney('a-reconcile-invocation',ownerFile)).transition.successorManifestId,t.successorManifestId);
 const usedByCaller=await remoteJourney('a-use',ownerFile);assert.equal(usedByCaller.expectedGeneration,2);assert.equal(usedByCaller.uses[0].manifestId,t.successorManifestId);
 const changed=await f.a.run('use',task({structuredContent:{project:{id:'unmeasured',status:'closed',version:7},nextAction:null}},'task:changed-unmeasured'));assert.equal(changed.invocation,null);
 const publication=(await f.query('SELECT receipt,verification FROM correspondence_vf04_publications WHERE project_id=$1 AND generation=2',[f.a.projectId])).rows[0];
 await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(publication.receipt.observedAt)+publication.verification.validityMs-Date.now()+80)));
 await f.cli({...plan.renew,intentId:'later-visitor-evidence',expectedGeneration:2});await f.cli({...plan.dispatch,intentId:'later-visitor-dispatch',expectedGeneration:3});
 const stoppedAt=new Date().toISOString();await f.s.stop();f.s=await f.boot(f.s.port);
 await writeFile(path.join(f.privateDir,'actual-http-restart.json'),JSON.stringify({schema:'sds.foundry.actual-restart.v1',receiptId:'disposable-actual-http-restart',stoppedAt,startedAt:new Date().toISOString(),expectedHostConfigId:f.r.expectedHostConfigId,expectedEntryTermsHash:f.r.expectedEntryTermsHash}),{mode:0o600});
 const later=await remoteJourney('b-use',ownerFile);assert.equal(later.expectedGeneration,3);
 const controls={a:await f.cli({...f.ownerRequest,intentId:'readback-a-caller',action:'observe',expectedGeneration:3}),b:await f.cli({...f.ownerRequest,intentId:'readback-b-caller',action:'observe',projectId:later.projectId,expectedVerificationId:null,candidateId:null,expectedGeneration:null})};
 const controlsFile=path.join(f.privateDir,'canonical-readbacks.json');await writeFile(controlsFile,JSON.stringify(controls),{mode:0o600});
 const checked=await remoteJourney('check',ownerFile,controlsFile);assert.equal(checked.ok,true);assert.equal(checked.generation,3);assert.deepEqual([...new Set(checked.observations.map(o=>o.generation))],[2,3]);

});
test('successor refuses changed binding, unknown/no-proof/fence, grant/caps, SQL rollback and concurrent receive consumes once',async()=>{
 const f=await noLaunchFixture({validityMs:7000});await waitManifestExpiry(f);const plan=await lifecyclePlan(f);await f.cli(plan.renew);await f.cli(plan.dispatch);
 const initial=await f.row();
 for(const [key,value] of [['expectedExecutionId','invocation:wrong'],['expectedFence',randomUUID()],['expectedObservationId',`sha256:${'a'.repeat(64)}`],['request',{...f.request,input:{changed:true}}],['expectedVerificationId',`sha256:${'b'.repeat(64)}`],['candidateId','candidate:wrong']])await assert.rejects(f.pass({...plan.receive,[key]:value}));
 assert.deepEqual(await f.row(),initial);
 for(const state of ['reserved','running','unknown']){await f.query('UPDATE correspondence_vf04_invocations SET state=$3 WHERE project_id=$1 AND task_id=$2',[f.a.projectId,f.request.taskId,state]);await code(f.pass(plan.receive),'invocation_receive_conflict');}await f.query("UPDATE correspondence_vf04_invocations SET state='completed' WHERE project_id=$1",[f.a.projectId]);
 const forged=structuredClone(initial.execution);forged.identity={pid:123};await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,forged]);await code(f.pass(plan.receive),'invocation_launch_not_excluded');await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,initial.execution]);
 const grants=(await f.query('SELECT id,expires_at FROM correspondence_grants WHERE id=$1',[initial.execution.grantId])).rows[0];await f.query("UPDATE correspondence_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[grants.id]);await code(f.pass(plan.receive),'invocation_receive_grant_conflict');await f.query('UPDATE correspondence_grants SET expires_at=$2 WHERE id=$1',[grants.id,grants.expires_at]);
 const noBudget=structuredClone(initial.execution);noBudget.priorAttempts=Array.from({length:7},()=>initial.execution);
 await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,noBudget]);await code(f.pass(plan.receive),'invocation_budget_exhausted');await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,initial.execution]);
 const changedPolicy=structuredClone(initial.execution);changedPolicy.verification.policy.revision='changed-policy-sentinel';await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,changedPolicy]);await code(f.pass(plan.receive),'invocation_receive_evidence_conflict');await f.query('UPDATE correspondence_vf04_invocations SET execution=$2 WHERE project_id=$1',[f.a.projectId,initial.execution]);
 const pool=(await f.query('SELECT participation,verification FROM correspondence_vf04_pools WHERE project_id=$1',[f.a.projectId])).rows[0];
 await f.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[f.a.projectId,{...pool.participation,id:`sha256:${'f'.repeat(64)}`}]);await code(f.pass(plan.receive),'private_pass_terms_conflict');await f.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[f.a.projectId,pool.participation]);
 await f.query('UPDATE correspondence_vf04_pools SET verification=$2 WHERE project_id=$1',[f.a.projectId,{...pool.verification,runtimePin:'changed-runtime'}]);await code(f.pass(plan.receive),'installed_verification_changed');await f.query('UPDATE correspondence_vf04_pools SET verification=$2 WHERE project_id=$1',[f.a.projectId,pool.verification]);
 const oldMethod=f.store.receiveNoLaunchInvocation;f.store.receiveNoLaunchInvocation=async function(c,r){await oldMethod.call(this,c,r);await c.query('SELECT unknown_column_100517');};try{await assert.rejects(f.pass(plan.receive));}finally{f.store.receiveNoLaunchInvocation=oldMethod;}assert.deepEqual(await f.row(),initial);
 const two=await Promise.all([f.pass(plan.receive),f.pass(plan.receive)]);assert.equal(two.filter(x=>!x.replayed).length,1);assert.equal((await f.a.run('status')).portableExecution.chargedInvocations,2);
 await code(f.pass({...plan.receive,intentId:'another-owner'}),'invocation_receive_conflict');
});
test('delayed successor receiving refuses expired new evidence; no owner renewal occurs on cold startup or ordinary discovery',async()=>{
 const f=await noLaunchFixture({validityMs:2200});await waitManifestExpiry(f);const plan=await lifecyclePlan(f);await f.cli(plan.renew);await f.cli(plan.dispatch);
 const pub=(await f.query('SELECT receipt,verification FROM correspondence_vf04_publications WHERE project_id=$1 AND generation=2',[f.a.projectId])).rows[0];await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(pub.receipt.observedAt)+pub.verification.validityMs-Date.now()+80)));
 await assert.rejects(f.pass(plan.receive),e=>['invocation_successor_conflict','resolution_invalidated'].includes(e.code));assert.deepEqual(await f.row(),f.prior);
 const before=await f.counts();await f.s.stop();await f.boot(f.s.port);const status=await f.a.run('status');assert.equal(status.candidates[0].generation,2);assert.equal(status.portableExecution.chargedInvocations,1);assert.deepEqual(await f.counts(),before);
});
