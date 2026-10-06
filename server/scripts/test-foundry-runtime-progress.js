import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,symlink,rm,appendFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {runBounded} from '../foundry/bounded-child.mjs';
import {verifyFoundrySource} from './fixtures/verify-foundry-source.mjs';
import {receivingStep,phaseFailure,progressView,PROGRESS_SCOPE} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/progress.mjs';
const root=process.cwd(),vendor='vendor/visitor-foundry-receiver',execution=`${vendor}/scripts/visitor-foundry/execution`;
const base='d9025af2cffc38a5d6eb551fe20ac9d99c45704c',sentinel='ARBITRARY_PROSE_SECRET postgres://credential@private/db SELECT private_payload_secret_100507';
const inherited={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'};
let dir,cluster,admin;
const fixtures=new Set(),servers=new Set();
const evidence={schema:'sds.foundry.runtime-progress-replay.v1',base,actualHost:false,cases:[]};
async function command(args,{cwd=root,env={},exit=0}={}) {
 const r=await runBounded(process.execPath,args,{cwd,env:{...inherited,...env},capture:true,stdoutLimit:100000,outputLimit:200000,timeoutMs:60000});
 assert.equal(r.reason,null);assert.equal(r.code,exit);assert.equal(r.exited,true);
 assert.doesNotMatch(r.stdout,/ARBITRARY_PROSE_SECRET|postgres:\/\/credential|private_payload_secret_100507/);
 return r.stdout.trim()?JSON.parse(r.stdout.trim().split('\n').at(-1)):null;
}
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'sds-runtime-progress-'));cluster=await startDisposablePg();admin=new pg.Pool({connectionString:cluster.url});
});
after(async()=>{
 for(const s of servers)await s.stop();for(const f of fixtures)await f.close();await admin?.end();await cluster?.stop();
 if(process.env.FOUNDRY_RUNTIME_PROGRESS_RECEIPT)await writeFile(process.env.FOUNDRY_RUNTIME_PROGRESS_RECEIPT,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 if(dir)await rm(dir,{recursive:true,force:true});
});
async function fixture({runtime='present',control=false}={}) {
 const id=randomUUID().replaceAll('-',''),db=`runtimeprogress_${id}`;await admin.query(`CREATE DATABASE "${db}"`);
 const privateDir=path.join(dir,`private-${id}`),delivery=path.join(dir,`delivery-${id}`);await mkdir(privateDir,{mode:0o700});await mkdir(delivery);
 await cp(path.join(root,'server'),path.join(delivery,'server'),{recursive:true});
 await cp(path.join(root,vendor),path.join(delivery,vendor),{recursive:true,filter:p=>!['.runtime','.python-standalone','.build','node_modules'].includes(path.basename(p))});
 await cp(path.join(root,'package.json'),path.join(delivery,'package.json'));
 // Existing product imports/static assets only. Mutations below stay in the copied receiver.
 for(const name of ['node_modules','tools','packs','client'])await symlink(path.join(root,name),path.join(delivery,name));
 if(control)for(const f of ['entry/src/progress.mjs','entry/src/store.mjs','integration/entry/receiver.mjs','integration/src/portable-store.mjs']){
  const file=`${vendor}/scripts/visitor-foundry/${f}`,received=await runBounded('git',['show',`${base}:${file}`],{cwd:root,capture:true,stdoutLimit:100000});
  assert.equal(received.code,0);await writeFile(path.join(delivery,file),received.stdout);
 }
 const env={CORRESPONDENCE_DATABASE_URL:cluster.url.replace('/correspondence',`/${db}`),CORRESPONDENCE_PG_SCHEMA:'pilot_correspondence',FOUNDRY_PRIVATE_DIR:privateDir,
  FOUNDRY_HOST_PROFILE_FILE:path.join(privateDir,'host.json'),FOUNDRY_PRIVATE_PROFILE_FILE:path.join(privateDir,'private.json'),FOUNDRY_PARTICIPATION_KEY_FILE:path.join(privateDir,'key')};
 for(const [name,file] of [['host-profile.example.json',env.FOUNDRY_HOST_PROFILE_FILE],['private-profile.example.json',env.FOUNDRY_PRIVATE_PROFILE_FILE]])await writeFile(file,await readFile(path.join(root,vendor,'scripts/visitor-foundry/integration/entry',name)),{mode:0o600});
 await writeFile(env.FOUNDRY_PARTICIPATION_KEY_FILE,'disposable-runtime-progress-purpose-key-32',{mode:0o600});
 // Explicit fixture installation occurs once, in the complete build tree. Serving does not install/migrate.
 await command(['server/foundry/install.mjs','--migrate','--install'],{env});
 const pool=new pg.Pool({connectionString:env.CORRESPONDENCE_DATABASE_URL});
 const query=async(sql,args)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO pilot_correspondence');const result=await c.query(sql,args);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const runtimePath=path.join(delivery,execution,'.runtime');
 // A real delivery owns its runtime directory. An external checkout link is
 // deliberately refused by normal startup's no-follow publication receiving.
 async function setRuntime(kind){await rm(runtimePath,{recursive:true,force:true});if(kind==='present')await cp(path.join(root,execution,'.runtime'),runtimePath,{recursive:true});else if(kind==='invalid'){await mkdir(runtimePath);await writeFile(path.join(runtimePath,'pyvenv.cfg'),'version=invalid\n');}}
 await setRuntime(runtime);
 let server;
 async function boot(port=0){
  const child=spawn(process.execPath,['--import',path.join(delivery,'server/scripts/fixtures/hosted-startup-preload.mjs'),'server/index.js'],{cwd:delivery,
   env:{...inherited,...env,NODE_ENV:'production',PORT:String(port),FOUNDRY_HOST_OPT_IN:'1',CORRESPONDENCE_STORE:'postgres',CORRESPONDENCE_POOL_MAX:'1',CORRESPONDENCE_ADMIN_TOKEN:'disposable-runtime-admin-never-issued',
    SUPABASE_URL:'https://local-baseline.example',SUPABASE_SERVICE_ROLE_KEY:'local-baseline-stub',STRIPE_SECRET_KEY:'local-baseline-stub',RESEND_API_KEY:'local-baseline-stub'},stdio:['ignore','pipe','pipe','ipc']});
  let bytes=0;const drain=b=>{bytes+=b.length;if(bytes>200000)child.kill('SIGKILL');};child.stdout.on('data',drain);child.stderr.on('data',drain);
  const lifetime=setTimeout(()=>child.kill('SIGKILL'),90000),closed=once(child,'close');
  const s={pid:child.pid,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),6500);const [code,signal]=await closed;clearTimeout(kill);clearTimeout(lifetime);servers.delete(s);assert.equal(code,0);assert.equal(signal,null);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});}};servers.add(s);
  const message=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('fixture_listener_deadline'));},20000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.once('error',()=>{clearTimeout(timer);reject(new Error('fixture_spawn_failure'));});child.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture_startup_failure'));});});
  s.origin=`http://127.0.0.1:${message.port}`;s.port=message.port;server=s;
  const descriptor=await(await fetch(`${s.origin}/api/correspondence/v1/visitor-entry`,{signal:AbortSignal.timeout(10000)})).json();
  assert.equal(descriptor.profile.contribution.standingScopeRequired,true);return descriptor;
 }
 const descriptor=await boot(),clientFile=path.join(privateDir,'visitor.json'),clientDir=path.join(privateDir,'visitor-a');
 await writeFile(clientFile,JSON.stringify({baseUrl:`${server.origin}/api/correspondence`,directory:clientDir,authority:{profileId:descriptor.profile.profileId,entryTerms:descriptor.profile.termsHash,contributionTerms:descriptor.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
 const visitor=mode=>command([`${vendor}/scripts/visitor-foundry/integration/entry/visitor.mjs`,mode,clientFile]);
 const observe=async(projectId)=>command(['server/foundry/private-pass.mjs'],{env:{...env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify({schema:'sds.foundry.private-pass.v1',intentId:'runtime-observe',action:'observe',projectId,
  expectedHostConfigId:descriptor.profile.contribution.binding.hostConfigId,expectedEntryTermsHash:descriptor.profile.termsHash,expectedVerificationId:null,candidateId:null,expectedGeneration:null,reconcileIntentId:null})}});
 const counts=async()=>(await query(`SELECT (SELECT charged FROM correspondence_vf10_installation) charged,(SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,
  (SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,(SELECT count(*)::int FROM correspondence_vf12_admissions WHERE charged) allocated,
  (SELECT count(*)::int FROM correspondence_vf04_pools) pools,(SELECT count(*)::int FROM correspondence_vf04_experiments) experiments,
  (SELECT count(*)::int FROM correspondence_vf04_attempts) attempts,(SELECT count(*)::int FROM correspondence_vf04_invocations) invocations`)).rows[0];
 const retained=async()=>({allocation:(await query('SELECT to_jsonb(t) row FROM correspondence_vf10_installation t')).rows,host:(await query('SELECT config FROM correspondence_vf12_host')).rows,
  registration:(await query('SELECT id,project_id,request_hash,entry_profile,created_at,expires_at,receiver_id,receiver_started FROM correspondence_vf10_registrations')).rows,
  history:(await query('SELECT scope,project_id,key,request_hash,status_code,response_json,created_at FROM correspondence_idempotency WHERE scope<>$1 ORDER BY scope,project_id,key',[PROGRESS_SCOPE])).rows});
 const f={delivery,env,query,visitor,observe,counts,retained,setRuntime,get server(){return server;},
  async restart(){const port=server.port;await server.stop();await boot(port);},async close(){await server.stop();await pool.end();fixtures.delete(f);}};fixtures.add(f);return f;
}
function pending(result){assert.equal(result.status,202);assert.equal(result.body.status,'partial');assert.equal(result.body.receiver.state,'pending');assert.doesNotMatch(JSON.stringify(result),/filesystem|sqlState|errorClass|portable_policy|progress|ARBITRARY_PROSE_SECRET/);}
async function phase(f,r,expected){const view=await f.observe(r.body.projectId),entry=view.readback.entry,p=entry.progress.phases.find(p=>p.phase==='recover');
 assert.equal(view.ok,true);assert.equal(view.mutated,false);assert.equal(entry.poolReady,false);assert.equal(entry.progress.budgetExpired,false);assert.equal(entry.admission.charged,true);
 for(const [key,value]of Object.entries(expected))assert.equal(p[key],value);assert.doesNotMatch(JSON.stringify(view),/ARBITRARY_PROSE_SECRET|postgres:\/\/credential|private_payload_secret_100507/);
 assert.deepEqual(await f.counts(),{charged:1,registrations:1,admissions:1,allocated:1,pools:0,experiments:0,attempts:0,invocations:0});
 const trace=(await f.query('SELECT response_json FROM correspondence_idempotency WHERE scope=$1',[PROGRESS_SCOPE])).rows;
 assert.doesNotMatch(JSON.stringify(trace),/ARBITRARY_PROSE_SECRET|postgres:\/\/credential|private_payload_secret_100507|"message"|"stack"|"detail"|"path"/);
 assert.equal((await fetch(`${f.server.origin}/api/health`,{signal:AbortSignal.timeout(3000)})).status,200);
 return p;
}
async function readySame(f,r,original){const result=await f.visitor('reconcile');assert.equal(result.status,200);assert.equal(result.body.receiver.state,'ready');assert.equal(result.body.registrationId,r.body.registrationId);assert.equal(result.body.projectId,r.body.projectId);
 assert.deepEqual(await f.retained(),original);assert.deepEqual(await f.counts(),{charged:1,registrations:1,admissions:1,allocated:1,pools:1,experiments:1,attempts:0,invocations:0});
 const again=await f.visitor('reconcile');assert.equal(again.status,200);assert.equal(again.body.registrationId,r.body.registrationId);return result;
}
test('closed error aliases rethrow identity, prefer inner stage, exclude arbitrary prose and forged stage/class/SQLSTATE',async()=>{
 await verifyFoundrySource(root);evidence.sourcePinSha256=createHash('sha256').update(await readFile(path.join(root,vendor,'SOURCE-PIN.json'))).digest('hex');
 for(const [code,alias,klass]of [['ENOENT','filesystem_missing','filesystem'],['ENOTDIR','filesystem_not_directory','filesystem'],['EACCES','filesystem_permission','filesystem'],['23514','sql_check','sql'],['42703','sql_column_missing','sql'],['22P05','sql_untranslatable_character','sql'],['INVALID_INPUT','validation_failed','validation'],[sentinel,'port_error','unknown']]){
  const error=Object.assign(new Error(sentinel),{code,name:sentinel,path:sentinel,detail:sentinel,query:sentinel,stage:sentinel});
  await assert.rejects(receivingStep('receiver_transaction',()=>receivingStep('portable_policy',()=>{throw error;})),e=>e===error);
  const safe=phaseFailure(error);assert.equal(safe.code,alias);assert.equal(safe.errorClass,klass);assert.equal(safe.stage,'portable_policy');assert.doesNotMatch(JSON.stringify(safe),/ARBITRARY_PROSE_SECRET|credential|private_payload_secret_100507/);
 }
 assert.deepEqual(phaseFailure({code:'UNKNOWN',stage:'portable_policy',errorClass:'sql'}),{code:'port_error',errorClass:'unknown',sqlState:null,stage:null,resource:null,interpreterEntry:null});
 const filtered=progressView({schema:'neomorphic.foundry.entry-progress.v1',phases:[{phase:sentinel,outcome:sentinel,code:sentinel,errorClass:sentinel,sqlState:sentinel,stage:sentinel,state:sentinel,ms:1e9,message:sentinel}]});
 assert.doesNotMatch(JSON.stringify(filtered),/ARBITRARY_PROSE_SECRET|credential|private_payload_secret_100507/);assert.equal(filtered.phases[0].ms,20000);assert.equal(filtered.phases[0].stage,null);
});
test('complete build probe does not establish runtime in delivery: exact received port_error control and new same-attempt filesystem evidence',async()=>{
 const probe=await command(['server/foundry/managed-node-probe.mjs']);assert.equal(probe.referenceRuntime,true);assert.equal(probe.osLimitsEnforced,true);
 const f=await fixture({runtime:'absent',control:true}),r=await f.visitor('register');pending(r);const original=await f.retained();
 const control=await phase(f,r,{code:'port_error',stage:null,errorClass:null});
 for(const file of ['entry/src/progress.mjs','entry/src/store.mjs','integration/entry/receiver.mjs','integration/src/portable-store.mjs'])await cp(path.join(root,vendor,'scripts/visitor-foundry',file),path.join(f.delivery,vendor,'scripts/visitor-foundry',file));
 await f.restart();const changed=await f.visitor('reconcile');pending(changed);assert.equal(changed.body.registrationId,r.body.registrationId);
 const diagnostic=await phase(f,r,{code:'filesystem_missing',stage:'portable_policy',errorClass:'filesystem',sqlState:null,resource:'runtime_config'});assert.deepEqual(await f.retained(),original);
 // Only the disposable delivery is repaired. No producer/Hostinger diagnosis is inferred.
 await f.setRuntime('present');await f.restart();await readySame(f,r,original);
 evidence.cases.push({case:'build-vs-delivery-control',probePassed:true,control,diagnostic,restoredDeliveryReady:true,sameRegistration:true,authorityHistoryPreserved:true,actualHost:false});
});
test('invalid delivered runtime is validation at portable policy, retains admission until the same delivery is restored',async()=>{
 const f=await fixture({runtime:'invalid'}),r=await f.visitor('register');pending(r);const original=await f.retained();const diagnostic=await phase(f,r,{code:'validation_failed',stage:'portable_policy',errorClass:'validation',sqlState:null});
 await f.setRuntime('present');await f.restart();await readySame(f,r,original);evidence.cases.push({case:'invalid-runtime',diagnostic,restoredDeliveryReady:true});
});
for(const [table,stage,sqlState,alias]of [['correspondence_vf04_pools','pool_insert','23514','sql_check'],['correspondence_vf04_experiments','experiment_insert','23503','sql_foreign_key']])test(`real SQL ${sqlState} at ${stage} rolls back enrollment and sanitizes all error prose`,async()=>{
 const f=await fixture();await f.query(`CREATE FUNCTION fail_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='${sqlState}',MESSAGE='${sentinel}'; END $$; CREATE TRIGGER fail_enrollment BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_enrollment()`);
 const r=await f.visitor('register');pending(r);const original=await f.retained(),diagnostic=await phase(f,r,{code:alias,stage,errorClass:'sql',sqlState});
 await f.query(`DROP TRIGGER fail_enrollment ON ${table}; DROP FUNCTION fail_enrollment()`);await readySame(f,r,original);evidence.cases.push({case:stage,diagnostic,rollbackPoolAbsent:true,sameAttemptReady:true});
});
test('actual missing pool column is distinguishable from filesystem failure without printing SQL or column names',async()=>{
 const f=await fixture();await f.query('ALTER TABLE correspondence_vf04_pools RENAME COLUMN participation TO unavailable_fixture_column');
 const r=await f.visitor('register');pending(r);const original=await f.retained(),diagnostic=await phase(f,r,{code:'sql_column_missing',stage:'pool_insert',errorClass:'sql',sqlState:'42703'});
 await f.query('ALTER TABLE correspondence_vf04_pools RENAME COLUMN unavailable_fixture_column TO participation');await readySame(f,r,original);evidence.cases.push({case:'missing-column',diagnostic,sameAttemptReady:true});
});
test('source changed after mount refuses verification before pool insertion and preserves original attempt',async()=>{
 const f=await fixture(),file=path.join(f.delivery,vendor,'scripts/visitor-foundry/integration/src/portable-profile.mjs'),bytes=await readFile(file);await appendFile(file,'\n// changed disposable source\n');
 const r=await f.visitor('register');pending(r);const original=await f.retained(),diagnostic=await phase(f,r,{code:'installed_source_changed',stage:'portable_verification',errorClass:'validation',sqlState:null});
 await writeFile(file,bytes);await readySame(f,r,original);evidence.cases.push({case:'changed-source',diagnostic,sameAttemptReady:true});
});
test('ready pool rejects changed launcher generation; old evidence is retained and never silently renewed',async()=>{
 const f=await fixture(),r=await f.visitor('register');assert.equal(r.status,200);const original=await f.retained(),counts=await f.counts();
 const poolBefore=(await f.query('SELECT config,verification FROM correspondence_vf04_pools')).rows;
 const file=path.join(f.delivery,execution,'src/launcher.py'),bytes=await readFile(file);await appendFile(file,'\n# changed disposable launcher\n');
 const refused=await f.visitor('reconcile');assert.equal(refused.status,202);assert.equal(refused.body.receiver.state,'unknown');assert.equal(refused.body.registrationId,r.body.registrationId);
 const view=await f.observe(r.body.projectId);assert.equal(view.readback.entry.acknowledgedState,'ready');assert.equal(view.readback.entry.progress.observedState,'unknown');
 const read=view.readback.entry.progress.phases.find(p=>p.phase==='read');assert.equal(read.code,'installed_verification_changed');assert.equal(read.errorClass,'validation');
 // This explicit observer runs in the complete build tree, so its current read
 // can succeed. That never replaces the failed serving-process trace/readback.
 assert.equal(view.readback.entry.poolReady,true);assert.equal(view.readback.installedVerificationMatches,true);assert.equal(view.readback.entry.readFailureCode,null);
 assert.deepEqual((await f.query('SELECT config,verification FROM correspondence_vf04_pools')).rows,poolBefore);assert.deepEqual(await f.counts(),counts);assert.deepEqual(await f.retained(),original);
 await writeFile(file,bytes);await readySame(f,r,original);evidence.cases.push({case:'changed-launcher',staleVerificationRefused:true,oldEvidenceRetained:true,renewed:false});
});
