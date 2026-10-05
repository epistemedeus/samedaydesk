import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,symlink,stat,cp} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PostgresStore} from '@neomorphic/correspondence';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {runBounded} from '../foundry/bounded-child.mjs';
import {bootFoundryServer} from '../foundry/activation/local-journey.mjs';
import {openEntryFacade,closeEntryThenBase} from '../foundry/compose.js';
import {receivePassRequest} from '../foundry/private-pass.mjs';
import {runPrivatePass,PASS_SCHEMA,PASS_SCOPE,digest,validateRequest} from '../foundry/private-pass-core.mjs';
import {original,task,cases} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
const root=process.cwd(),vendor=path.join(root,'vendor/visitor-foundry-receiver');
let cluster,dir,admin;
const owners=new Set(),servers=new Set(),pools=new Set();
const inherited={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'};
async function command(args,env={},cwd=root,expected=0) {
 const r=await runBounded(process.execPath,args,{cwd,env:{...inherited,...env},capture:true,timeoutMs:90000,stdoutLimit:1000000,outputLimit:2000000});
 assert.equal(r.reason,null);assert.equal(r.code,expected,`exit ${r.code}: ${args[0]}`);
 return r.stdout.trim()?JSON.parse(r.stdout.trim().split('\n').at(-1)):null;
}
before(async()=>{dir=await mkdtemp(path.join(tmpdir(),'sds-private-pass-'));cluster=await startDisposablePg();admin=new pg.Pool({connectionString:cluster.url});});
after(async()=>{for(const s of servers) await s.stop();for(const o of owners) await closeEntryThenBase(o.mounted,o.base);for(const p of pools) await p.end();await admin?.end();await cluster?.stop();await rm(dir,{recursive:true,force:true});});
async function fixture(withContribution=true) {
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
  const run=async(mode,input)=>{const inputFile=path.join(privateDir,`${name}-${randomUUID()}.json`);if(input!==undefined) await writeFile(inputFile,JSON.stringify(input),{mode:0o600});return command(['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,file,...(input===undefined?[]:[inputFile])],{},vendor);};
  const r=await run('register');assert.equal(r.body.receiver.state,'ready');return {run,projectId:r.body.projectId,file,directory};
 };
 const a=await visitor('a');const contribution=withContribution?await a.run('contribute',original()):null;
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
