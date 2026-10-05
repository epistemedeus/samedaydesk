import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {PostgresStore} from '@neomorphic/correspondence';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {runBounded} from '../foundry/bounded-child.mjs';
import {createEntryReuseMount} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/mount.mjs';
import {EntryStore} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/store.mjs';
import {continueEntry,prepare} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/client.mjs';
import {grantToken} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs';
import {express} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/deps.mjs';
import {original,task,cases} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
import {PASS_SCHEMA,runPrivatePass,digest} from '../foundry/private-pass-core.mjs';
import {verifyFoundrySource} from './fixtures/verify-foundry-source.mjs';
const root=process.cwd(),vendor=path.join(root,'vendor/visitor-foundry-receiver'),baseHead='e73bd8956305fc7d5a53cbb309560f4c77e5c0a5';
const entrySource='scripts/visitor-foundry/entry/src/store.mjs';
const inherited={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let dir,cluster,admin,OldEntryStore;
const fixtures=new Set();
const evidence={base:baseHead,hostingerMeasured:false,latencyBoundary:null};
test('declared receiving amendment chain and exact sealed execution bytes remain bound',async()=>{
 const pin=await verifyFoundrySource(root),amendment=pin.localAmendments.find(a=>a.package==='ROOT-SOL-HOST-ENTRY-RESERVATION-100505');
 assert.equal(amendment.sdsBase,baseHead);assert.equal(Object.keys(amendment.files).length,3);
 evidence.sourcePinSha256=createHash('sha256').update(await readFile(path.join(vendor,'SOURCE-PIN.json'))).digest('hex');
});
async function command(args,cwd=root,expected=0,env={}) {
 const r=await runBounded(process.execPath,args,{cwd,env:{...inherited,...env},capture:true,stdoutLimit:1048576,outputLimit:2097152,timeoutMs:60000});
 assert.equal(r.reason,null);assert.equal(r.code,expected,`exit ${r.code}`);return r.stdout.trim()?JSON.parse(r.stdout.trim().split('\n').at(-1)):null;
}
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'sds-entry-reservation-'));cluster=await startDisposablePg();admin=new pg.Pool({connectionString:cluster.url});
 const oldRoot=path.join(dir,'received-source');await mkdir(oldRoot);
 await cp(vendor,path.join(oldRoot,'vendor/visitor-foundry-receiver'),{recursive:true,filter:p=>!['.runtime','.python-standalone','.build'].includes(path.basename(p))});
 await symlink(path.join(root,'node_modules'),path.join(oldRoot,'node_modules'));
 const r=await runBounded('git',['show',`${baseHead}:vendor/visitor-foundry-receiver/${entrySource}`],{cwd:root,capture:true,stdoutLimit:50000});assert.equal(r.code,0);
 await writeFile(path.join(oldRoot,'vendor/visitor-foundry-receiver',entrySource),r.stdout);
 evidence.receivedEntrySha256=createHash('sha256').update(r.stdout).digest('hex');
 ({EntryStore:OldEntryStore}=await import(pathToFileURL(path.join(oldRoot,'vendor/visitor-foundry-receiver',entrySource))));
});
after(async()=>{for(const f of fixtures)await f.close();await admin?.end();await cluster?.stop();if(dir)await rm(dir,{recursive:true,force:true});
 if(process.env.FOUNDRY_ENTRY_RESERVATION_RECEIPT)await writeFile(process.env.FOUNDRY_ENTRY_RESERVATION_RECEIPT,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});});
async function fixture({legacy=false}={}) {
 const db=`entryreservation_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE "${db}"`);const url=cluster.url.replace('/correspondence',`/${db}`),schema='pilot_correspondence';
 const privateDir=path.join(dir,db);await mkdir(privateDir,{mode:0o700});const pool=new pg.Pool({connectionString:url});
 const query=async(sql,values)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO ${schema}`);const r=await c.query(sql,values);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const hostProfile=JSON.parse(await readFile(path.join(vendor,'scripts/visitor-foundry/integration/entry/host-profile.example.json'))),privateProfile=JSON.parse(await readFile(path.join(vendor,'scripts/visitor-foundry/integration/entry/private-profile.example.json')));
 const privateEnv={CORRESPONDENCE_DATABASE_URL:url,CORRESPONDENCE_PG_SCHEMA:schema,FOUNDRY_PRIVATE_DIR:privateDir,
  FOUNDRY_HOST_PROFILE_FILE:path.join(privateDir,'host.json'),FOUNDRY_PRIVATE_PROFILE_FILE:path.join(privateDir,'private.json'),FOUNDRY_PARTICIPATION_KEY_FILE:path.join(privateDir,'participation.key')};
 await writeFile(privateEnv.FOUNDRY_HOST_PROFILE_FILE,JSON.stringify(hostProfile),{mode:0o600});await writeFile(privateEnv.FOUNDRY_PRIVATE_PROFILE_FILE,JSON.stringify(privateProfile),{mode:0o600});
 await writeFile(privateEnv.FOUNDRY_PARTICIPATION_KEY_FILE,'disposable-entry-reservation-purpose-key-32',{mode:0o600});
 const config={databaseUrl:url,pgSchema:schema,adminToken:'disposable-only-not-issued-admin',store:'postgres',bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:10000,corsOrigins:[],trustProxyHops:0,poolMax:1,port:0};
 let base,mount,server;
 async function boot({install=false,old=false,port=0}={}) {
  base=new PostgresStore(url,{schema,poolMax:1});mount=await createEntryReuseMount({enabled:true,databaseUrl:url,schema,correspondence:base,config,hostProfile,participationKey:'disposable-entry-reservation-purpose-key-32',poolMax:2});
  if(install){await base.migrate();await mount.extension.cells.migrate();await mount.extension.integration.migrate();await mount.entry.migrate();await mount.receiver.migrate();
   mount.entry.receiver=null;const prior=await mount.entry.install(privateProfile);mount.entry.receiver=mount.receiver;await mount.entry.enableContribution({expectedTerms:prior.termsHash,id:'vf10:contribution-v2',binding:mount.receiver.binding()});}
  if(old)Object.setPrototypeOf(mount.entry,OldEntryStore.prototype);
  const app=express();app.use('/api/correspondence',mount.app);server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 }
 async function stop(){if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}await mount?.close();await base?.close();}
 await boot({install:true,old:legacy});
 const configFile=path.join(privateDir,'a.config.json'),clientDir=path.join(privateDir,'visitor-a');
 async function client(name='a') {
  const describe=await mount.entry.describe(),file=path.join(privateDir,`${name}.config.json`),directory=path.join(privateDir,`visitor-${name}`);
  await writeFile(file,JSON.stringify({baseUrl:`http://127.0.0.1:${server.address().port}/api/correspondence`,directory,authority:{profileId:describe.profile.profileId,entryTerms:describe.profile.termsHash,contributionTerms:describe.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
  const run=async(mode,input)=>{const fileInput=path.join(privateDir,`${randomUUID()}.json`);if(input!==undefined)await writeFile(fileInput,JSON.stringify(input),{mode:0o600});return command(['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,file,...(input===undefined?[]:[fileInput])],vendor);};
  return {file,directory,run};
 }
 const a=await client();
 const counts=async()=> (await query(`SELECT (SELECT charged FROM correspondence_vf10_installation) charged,(SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,
  (SELECT count(*)::int FROM correspondence_projects) projects,(SELECT count(*)::int FROM correspondence_grants) grants,(SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,
  (SELECT count(*)::int FROM correspondence_vf12_admissions WHERE charged) allocated,(SELECT count(*)::int FROM correspondence_vf04_pools) pools,
  (SELECT count(*)::int FROM correspondence_vf04_attempts) attempts,(SELECT count(*)::int FROM correspondence_vf04_invocations) invocations`)).rows[0];
 const authority=async()=>({installation:(await query('SELECT to_jsonb(t) record FROM correspondence_vf10_installation t')).rows,host:(await query('SELECT config FROM correspondence_vf12_host')).rows});
 const observeRequest=async(projectId,extra={})=>({schema:PASS_SCHEMA,intentId:'observe-entry',action:'observe',projectId,
  expectedHostConfigId:mount.receiver.config.configId,expectedEntryTermsHash:(await mount.entry.describe()).profile.termsHash,expectedVerificationId:null,candidateId:null,expectedGeneration:null,reconcileIntentId:null,...extra});
 const observe=async(projectId,extra={})=>runPrivatePass(mount.extension.integration,mount.receiver,await observeRequest(projectId,extra));
 const f={privateDir,privateEnv,clientDir,configFile,a,client,query,counts,authority,observe,observeRequest,get mount(){return mount;},get port(){return server.address().port;},get baseUrl(){return `http://127.0.0.1:${server.address().port}/api/correspondence`;},
  async restart({legacy=false}={}){const port=server.address().port;await stop();await boot({port,old:legacy});},async close(){await stop();await pool.end();fixtures.delete(f);}};
 fixtures.add(f);return f;
}
async function pending(f) {
 let begins=0;const begin=f.mount.receiver.begin.bind(f.mount.receiver);f.mount.receiver.begin=async i=>{begins++;return begin(i);};
 f.mount.receiver.afterReservation=()=>delay(1200);
 const first=await f.a.run('register');assert.equal(first.status,202);assert.equal(first.body.status,'partial');assert.equal(first.body.receiver.state,'pending');
 await delay(300);return {first,begins:()=>begins,input:{registrationId:first.body.registrationId,projectId:first.body.projectId}};
}
test('received source reproduces >1s committed-reservation abort: exact reconcile remains pending without another begin',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f),original=await f.authority();
 const again=await f.a.run('reconcile');assert.equal(again.status,202);assert.equal(again.body.receiver.state,'pending');assert.equal(again.body.projectId,p.input.projectId);assert.equal(p.begins(),1);
 assert.deepEqual(await f.counts(),{charged:1,registrations:1,projects:1,grants:3,admissions:1,allocated:1,pools:0,attempts:0,invocations:0});assert.deepEqual(await f.authority(),original);
 evidence.latencyBoundary={afterCommittedReservationMs:1200,wrapperDeadlineMs:1000,receivedRegisterStatus:firstStatus(p),receivedReconcileStatus:again.status,beginCalls:p.begins(),pendingCommitted:true,poolAbsent:true,physicalWork:0};
});
function firstStatus(p){return p.first.status;}
test('normal repaired registration completes the same pending phase even while original begin is interrupted',async()=>{
 const f=await fixture();let begins=0;const begin=f.mount.receiver.begin.bind(f.mount.receiver);f.mount.receiver.begin=async i=>{begins++;return begin(i);};f.mount.receiver.afterReservation=()=>delay(1200);
 const result=await f.a.run('register');assert.equal(result.status,200);assert.equal(result.body.receiver.state,'ready');await delay(300);
 const c=await f.counts();assert.equal(c.charged,1);assert.equal(c.allocated,1);assert.equal(c.pools,1);assert.equal(c.attempts,0);assert.equal(begins,1);
});
test('retained partial A survives HTTP restart; reconcile uses the same proof/project/registration and preserves original terms/history',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f);await f.a.run('checkpoint',{text:'disposable private checkpoint before restart'});
 const auth=await f.authority(),attempt=await readFile(path.join(f.a.directory,'attempt.json')),proof=await readFile(path.join(f.a.directory,'registration.secret'));
 const reg=(await f.query('SELECT id,request_id,request_hash,proof_hash,owner_hash,expires_at,grant_expires_at,entry_profile FROM correspondence_vf10_registrations')).rows;
 await f.restart();f.mount.receiver.begin=()=>{throw new Error('begin_must_not_repeat');};const continued=await f.a.run('reconcile');assert.equal(continued.status,200);assert.equal(continued.body.receiver.state,'ready');assert.equal(continued.body.projectId,p.input.projectId);assert.equal(continued.body.registrationId,p.input.registrationId);
 assert.deepEqual(await f.authority(),auth);assert.deepEqual((await f.query('SELECT id,request_id,request_hash,proof_hash,owner_hash,expires_at,grant_expires_at,entry_profile FROM correspondence_vf10_registrations')).rows,reg);
 assert.deepEqual(await readFile(path.join(f.a.directory,'attempt.json')),attempt);assert.deepEqual(await readFile(path.join(f.a.directory,'registration.secret')),proof);
 assert.equal((await f.a.run('correspondence')).eventCount,1);assert.equal((await f.counts()).pools,1);assert.equal((await f.counts()).attempts,0);
});
test('pre-pool private observation proves reserved pending binding without SQL mutations or invented verification',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f),before=await f.counts();const view=await f.observe(p.input.projectId);
 assert.equal(view.mutated,false);assert.equal(view.readback.entry.registrationId,p.input.registrationId);assert.equal(view.readback.entry.receiverState,'pending');assert.equal(view.readback.entry.admission.charged,true);assert.equal(view.readback.entry.poolEnrolled,false);assert.equal(view.readback.entry.poolReady,false);
 assert.equal(view.readback.verificationId,null);assert.equal(view.readback.installedVerificationMatches,null);assert.equal(view.readback.charged,null);assert.equal(view.readback.outstandingPhysical,0);assert.deepEqual(await f.counts(),before);
 const cli=await command(['server/foundry/private-pass.mjs'],root,0,{...f.privateEnv,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(await f.observeRequest(p.input.projectId))});
 assert.equal(cli.schema,'sds.foundry.private-pass-result.v1');assert.equal(cli.migrated,false);assert.equal(cli.enrolled,false);assert.deepEqual(cli.readback,view.readback);assert.deepEqual(await f.counts(),before);
 await assert.rejects(f.observe(p.input.projectId,{expectedHostConfigId:`sha256:${'a'.repeat(64)}`}),{code:'private_pass_host_conflict'});
 await assert.rejects(f.observe(p.input.projectId,{expectedEntryTermsHash:`sha256:${'b'.repeat(64)}`}),{code:'private_pass_terms_conflict'});
 await assert.rejects(f.observe(p.input.projectId,{expectedVerificationId:`sha256:${'c'.repeat(64)}`}),{code:'private_pass_verification_conflict'});
 await assert.rejects(f.observe('prj_missing'),{code:'private_pass_entry_conflict'});
});
test('a lost recovery response is resolved only by canonical readback; an uncommitted claim remains partial',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f);await f.restart();f.mount.receiver.begin=()=>{throw new Error('begin_must_not_repeat');};
 const recover=f.mount.receiver.recover.bind(f.mount.receiver);let calls=0;
 f.mount.receiver.recover=async()=>{calls++;return 'ready';};
 const unproven=await f.a.run('reconcile');assert.equal(unproven.status,202);assert.equal(unproven.body.receiver.state,'pending');assert.equal((await f.counts()).pools,0);
 f.mount.receiver.recover=async(...args)=>{calls++;await recover(...args);throw new Error('disposable response loss after completion');};
 const proven=await f.a.run('reconcile');assert.equal(proven.status,200);assert.equal(proven.body.projectId,p.input.projectId);assert.equal(proven.body.registrationId,p.input.registrationId);
 assert.equal(calls,2);assert.equal((await f.counts()).pools,1);assert.equal((await f.counts()).charged,1);assert.equal((await f.counts()).admissions,1);assert.equal((await f.counts()).attempts,0);
});
test('missing/unknown begin is not retried or fenced by public reconcile; explicit canonical tombstone blocks delayed begin',async()=>{
 const f=await fixture();let beginCalls=0,recoverCalls=0;const begin=f.mount.receiver.begin.bind(f.mount.receiver),recover=f.mount.receiver.recover.bind(f.mount.receiver);
 f.mount.receiver.begin=async i=>{beginCalls++;await delay(1800);return begin(i);};f.mount.receiver.recover=async(...args)=>{recoverCalls++;return recover(...args);};
 const first=await f.a.run('register');assert.equal(first.status,202);assert.equal(first.body.receiver.state,'unknown');
 const input={registrationId:first.body.registrationId,projectId:first.body.projectId};const second=await f.a.run('reconcile');assert.equal(second.status,202);assert.equal(second.body.receiver.state,'unknown');assert.equal(beginCalls,1);assert.equal(recoverCalls,0);
 const obs=await f.observe(input.projectId);assert.equal(obs.readback.entry.admission,null);assert.equal(obs.readback.entry.receiverState,'unknown');
 assert.equal(await recover(input,{reservedOnly:true}),'unknown');assert.equal((await f.counts()).admissions,0);
 assert.equal(await recover(input),'declined');await delay(900);const terminal=await f.a.run('reconcile');assert.equal(terminal.body.receiver.state,'declined');assert.equal(beginCalls,1);
 const c=await f.counts();assert.equal(c.charged,1);assert.equal(c.allocated,0);assert.equal(c.pools,0);assert.equal(c.admissions,1);assert.equal(c.attempts,0);
});
test('concurrent known-pending reconcile creates one pool and does not add charge/admissions/grants',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f);await f.restart();let begins=0;f.mount.receiver.begin=()=>{begins++;throw new Error();};
 const attempt=JSON.parse(await readFile(path.join(f.a.directory,'attempt.json'))),proof=(await readFile(path.join(f.a.directory,'registration.secret'),'utf8')).trim();
 const post=async()=>{const r=await fetch(`${f.baseUrl}/v1/visitor-entry/reconcile`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':attempt.body.requestId,authorization:`Bearer ${proof}`},body:JSON.stringify(attempt.body),signal:AbortSignal.timeout(10000)});const b=await r.json();return {status:r.status,projectId:b.projectId,registrationId:b.registrationId,state:b.receiver?.state};};
 const r=await Promise.all([post(),post(),post()]);for(const x of r){assert.equal(x.status,200);assert.equal(x.state,'ready');assert.equal(x.projectId,p.input.projectId);assert.equal(x.registrationId,p.input.registrationId);}assert.equal(begins,0);
 assert.deepEqual(await f.counts(),{charged:1,registrations:1,projects:1,grants:3,admissions:1,allocated:1,pools:1,attempts:0,invocations:0});
});
test('pool completion crossing >1s response deadline remains atomic; next exact reconcile reads committed ready',async()=>{
 const f=await fixture();await f.query(`CREATE FUNCTION slow_pool() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2.2); RETURN NEW; END $$;
  CREATE TRIGGER slow_pool BEFORE INSERT ON correspondence_vf04_pools FOR EACH ROW EXECUTE FUNCTION slow_pool()`);
 f.mount.receiver.afterReservation=()=>delay(1200);
 const first=await f.a.run('register');assert.equal(first.status,202);assert.equal(first.body.status,'partial');assert.equal(first.body.nextAction,'reconcile_same_attempt');await delay(500);
 const second=await f.a.run('reconcile');assert.equal(second.status,200);assert.equal(second.body.projectId,first.body.projectId);assert.equal((await f.counts()).pools,1);assert.equal((await f.counts()).allocated,1);assert.equal((await f.counts()).attempts,0);
});
test('lost registration response retains the original proof/attempt; exact reconciliation completes one admission',async()=>{
 const f=await fixture({legacy:true});f.mount.receiver.afterReservation=()=>delay(1200);
 const d=await f.mount.entry.describe();await mkdir(f.a.directory,{mode:0o700});prepare(f.a.directory,f.baseUrl,d.profile.profileId,d.profile.termsHash);
 const attempt=await readFile(path.join(f.a.directory,'attempt.json')),proof=await readFile(path.join(f.a.directory,'registration.secret'));
 const lost=async(...args)=>{const r=await fetch(...args);assert.equal(r.status,202);await r.arrayBuffer();throw Object.assign(new Error('disposable lost response'),{code:'fixture_response_lost'});};
 await assert.rejects(continueEntry(f.a.directory,'register',lost),{code:'fixture_response_lost'});
 const original=(await f.query('SELECT id,project_id FROM correspondence_vf10_registrations')).rows[0];assert.equal((await f.counts()).pools,0);
 await delay(300);await f.restart();f.mount.receiver.begin=()=>{throw new Error('begin_must_not_repeat');};
 const continued=await f.a.run('reconcile');assert.equal(continued.status,200);assert.equal(continued.body.registrationId,original.id);assert.equal(continued.body.projectId,original.project_id);
 assert.deepEqual(await readFile(path.join(f.a.directory,'attempt.json')),attempt);assert.deepEqual(await readFile(path.join(f.a.directory,'registration.secret')),proof);
 assert.deepEqual(await f.counts(),{charged:1,registrations:1,projects:1,grants:3,admissions:1,allocated:1,pools:1,attempts:0,invocations:0});
});
test('expired reservation and malformed bindings preserve charged allocation history',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f);const auth=await f.authority();
 await f.restart();
 await f.query("UPDATE correspondence_vf10_registrations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[p.input.registrationId]);
 const refused=await f.a.run('reconcile');assert.equal(refused.status,410);assert.equal(refused.body.error.code,'workspace_expired');assert.equal((await f.counts()).pools,0);
 await assert.rejects(f.mount.receiver.recover({...p.input,projectId:'wrong-project'},{reservedOnly:true}),{code:'entry_binding_mismatch'});
 assert.equal(await f.mount.receiver.recover(p.input,{reservedOnly:true}),'declined');assert.equal((await f.counts()).allocated,1);assert.deepEqual(await f.authority(),auth);
});
test('canonical client refuses HTTP202-as-ready and changed saved registration/project without replacing continuation',async()=>{
 const f=await fixture({legacy:true}),p=await pending(f),saved=await readFile(path.join(f.a.directory,'continuation.json'));
 const safe=p.first.body,proof=(await readFile(path.join(f.a.directory,'registration.secret'),'utf8')).trim();
 const response=(status,changes={})=>{const body={...safe,...changes,grants:Object.fromEntries(['reader','writer'].map(role=>[role,{...safe.grants[role],token:grantToken(proof,changes.registrationId ?? safe.registrationId,role)}]))};return async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});};
 await assert.rejects(continueEntry(f.a.directory,'reconcile',response(202,{status:'ready',receiver:{state:'ready'},nextAction:'use_private_correspondence'})),{code:'invalid_entry_response'});
 await assert.rejects(continueEntry(f.a.directory,'reconcile',response(202,{projectId:'prj_1234567890abcdef'})),{code:'invalid_entry_response'});
 await assert.rejects(continueEntry(f.a.directory,'reconcile',response(202,{registrationId:'ven_1234567890abcdef'})),{code:'invalid_entry_response'});
 assert.deepEqual(await readFile(path.join(f.a.directory,'continuation.json')),saved);assert.equal((await f.counts()).registrations,1);
});
test('pinned caller continues partial A through restart, contribution/verification/use and later B; no replacement registration',async()=>{
 const f=await fixture({legacy:true});f.mount.receiver.afterReservation=()=>delay(1200);
 const qaDir=path.join(f.privateDir,'owner-qa');await mkdir(qaDir,{mode:0o700});const d=await f.mount.entry.describe();
 const configFile=path.join(f.privateDir,'owner-qa.json');await writeFile(configFile,JSON.stringify({schema:'sds.foundry.remote-owner-qa.v1',directory:qaDir,baseUrl:f.baseUrl,
  expectedHostConfigId:f.mount.receiver.config.configId,expectedEntryTermsHash:d.profile.termsHash,authority:{profileId:d.profile.profileId,entryTerms:d.profile.termsHash,
  contributionTerms:d.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
 const harness=(stage,exit=0)=>command(['server/foundry/activation/remote-private-journey.mjs',stage,configFile],root,exit);
 await harness('a-reconcile',2);assert.equal((await f.counts()).registrations,0);
 const partial=await harness('a-contribute',2);assert.equal(partial.status,'partial');assert.equal(partial.httpStatus,202);assert.equal(partial.contributionStarted,false);assert.equal(partial.nextAction,'reconcile_same_attempt');
 const firstAttempt=await readFile(path.join(qaDir,'visitor-a/attempt.json')),firstProof=await readFile(path.join(qaDir,'visitor-a/registration.secret'));
 const again=await harness('a-reconcile',2);assert.equal(again.projectId,partial.projectId);assert.equal(again.registrationId,partial.registrationId);assert.equal((await f.counts()).registrations,1);assert.equal((await f.counts()).pools,0);
 await f.restart();f.mount.receiver.begin=()=>{throw new Error('begin_must_not_repeat');};
 const ready=await harness('a-reconcile');assert.equal(ready.projectId,partial.projectId);assert.equal(ready.registrationId,partial.registrationId);assert.equal(ready.receiverState,'ready');assert.equal(ready.contributionStarted,false);
 assert.deepEqual(await readFile(path.join(qaDir,'visitor-a/attempt.json')),firstAttempt);assert.deepEqual(await readFile(path.join(qaDir,'visitor-a/registration.secret')),firstProof);
 const contributed=await harness('a-contribute');assert.equal(contributed.projectId,partial.projectId);
 const observed=await f.observe(contributed.projectId);const dispatch={schema:PASS_SCHEMA,intentId:'retained-a-dispatch',action:'dispatch',projectId:contributed.projectId,
  expectedHostConfigId:f.mount.receiver.config.configId,expectedEntryTermsHash:d.profile.termsHash,expectedVerificationId:observed.readback.verificationId,
  candidateId:contributed.candidateId,expectedGeneration:1,reconcileIntentId:null};
 const dispatched=await runPrivatePass(f.mount.extension.integration,f.mount.receiver,dispatch);assert.equal(dispatched.state,'completed');assert.equal(dispatched.readback.publications[0].state,'published');
 const a=await harness('a-use');assert.equal(a.uses.length,3);assert.equal(a.changedRefused,true);const before=await f.authority();await f.restart({legacy:true});f.mount.receiver.afterReservation=()=>delay(1200);
 await writeFile(path.join(qaDir,'actual-http-restart.json'),JSON.stringify({schema:'sds.foundry.actual-restart.v1',receiptId:'disposable-same-port-restart',stoppedAt:'2026-10-05T22:00:00Z',startedAt:'2026-10-05T22:00:01Z',
  expectedHostConfigId:dispatch.expectedHostConfigId,expectedEntryTermsHash:dispatch.expectedEntryTermsHash}),{mode:0o600});
 const partialB=await harness('b-use',2);assert.equal(partialB.httpStatus,202);assert.equal(partialB.status,'partial');assert.equal((await f.counts()).invocations,3);assert.equal((await f.counts()).registrations,2);
 const bAttempt=await readFile(path.join(qaDir,'visitor-b/attempt.json')),bProof=await readFile(path.join(qaDir,'visitor-b/registration.secret'));await delay(300);await f.restart();f.mount.receiver.begin=()=>{throw new Error('begin_must_not_repeat');};
 const b=await harness('b-use');assert.equal(b.projectId,partialB.projectId);assert.deepEqual(await readFile(path.join(qaDir,'visitor-b/attempt.json')),bAttempt);assert.deepEqual(await readFile(path.join(qaDir,'visitor-b/registration.secret')),bProof);
 assert.equal(b.candidateId,contributed.candidateId);assert.equal(b.uses.length,3);assert.equal(b.changedRefused,true);
 const aRead=await f.observe(contributed.projectId),bRead=await f.observe(b.projectId),readbackFile=path.join(f.privateDir,'canonical-readbacks.json');await writeFile(readbackFile,JSON.stringify({a:aRead,b:bRead}),{mode:0o600});
 const {remoteJourney}=await import('../foundry/activation/remote-private-journey.mjs');const proof=await remoteJourney('check',configFile,readbackFile);
 assert.equal(proof.observations.length,6);assert.equal(proof.hostingerMeasuredByCaller,false);assert.equal(aRead.readback.outstandingPhysical,0);assert.equal(bRead.readback.outstandingPhysical,0);
 assert.equal((await f.counts()).registrations,2);assert.equal((await f.counts()).allocated,2);assert.equal((await f.counts()).charged,2);assert.equal((await f.counts()).pools,2);assert.equal((await f.counts()).attempts,1);assert.equal((await f.counts()).invocations,6);
 assert.deepEqual((await f.authority()).host,before.host);assert.deepEqual((await f.authority()).installation[0].record.profile,before.installation[0].record.profile);
 const correspondence=JSON.parse(await readFile(path.join(qaDir,'a-after-restart-correspondence.json')));assert.equal(correspondence.eventCount,1);
 evidence.retainedJourney={initialStatus:partial.httpStatus,laterVisitorPartialStatus:partialB.httpStatus,continuedRegistrationSame:true,privateCorrespondenceEvents:correspondence.eventCount,registrations:2,admissions:2,pools:2,
  verificationAttempts:1,invocations:6,canonicalObservations:proof.observations.length,changedRefused:proof.changedRefused,outstandingPhysical:0,actualHost:false,runtimePin:proof.observations[0].runtimePin};
});
