import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rm,lstat,readlink,appendFile,symlink,realpath,readdir,truncate,chmod} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {runBounded} from '../foundry/bounded-child.mjs';
import {materializeReferenceRuntime,CPYTHON_SHA256,WHEEL_SHA256,download,WHEEL_URL} from '../foundry/materialize-runtime.mjs';
import {runtimeContentIdentity,verifyOfflineRuntime,auditOfflineTree} from '../foundry/runtime-layout.mjs';
import {withoutHostUtilities,npmCli} from '../foundry/activation/receiving-100502/namespace.mjs';
import {verifyFoundrySource} from './fixtures/verify-foundry-source.mjs';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {original,task,cases} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
const root=process.cwd(),base='e6b6bcba8316c395199312a1580ec9eae1770738';
const vendor='vendor/visitor-foundry-receiver',execution=`${vendor}/scripts/visitor-foundry/execution`;
const inherited={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'};
const sentinel='PRIVATE_PROSE_SENTINEL_100508 postgres://credential@private/db';
let dir,build,delivery,packed,wheel,cluster,admin,legacyPins,packedPins;
const pools=new Set(),servers=new Set();
const evidence={schema:'sds.foundry.runtime-layout-replay.v1',base,actualHost:false,cases:[]};
async function bounded(command,args,{cwd=root,env={},exit=0,timeoutMs=90000,stdoutLimit=1000000}={}){
 const r=await runBounded(command,args,{cwd,env:{...inherited,...env},capture:true,stdoutLimit,outputLimit:4000000,timeoutMs});
 assert.equal(r.reason,null);assert.equal(r.code,exit,`bounded exit ${r.code} for ${path.basename(command)}`);assert.equal(r.exited,true);
 assert.doesNotMatch(r.stdout,/PRIVATE_PROSE_SENTINEL_100508|postgres:\/\/credential/);return r;
}
async function command(args,options={}){const r=await bounded(process.execPath,args,options);return r.stdout.trim()?JSON.parse(r.stdout.trim().split('\n').at(-1)):null;}
async function pins(cwd){return command(['--input-type=module','-e',`import {installation} from './${execution}/src/supervisor.mjs';console.log(JSON.stringify(installation()));`],{cwd});}
before(async()=>{
 await verifyFoundrySource(root);
 evidence.sourcePinSha256=createHash('sha256').update(await readFile(path.join(root,vendor,'SOURCE-PIN.json'))).digest('hex');
 evidence.controlPinSha256=createHash('sha256').update(await readFile(path.join(root,'server/foundry/activation/private-control-pin.json'))).digest('hex');
 dir=await mkdtemp(path.join(tmpdir(),'sds-runtime-layout-'));build=path.join(dir,'build');delivery=path.join(dir,'delivery');packed=path.join(dir,'packed');await mkdir(build);
 // Tracked source only: never copy ignored environment or credential files.
 const archive=path.join(dir,'source.tar');await bounded('git',['archive','--format=tar',`--output=${archive}`,'HEAD','server','vendor','client','tools','packs','package.json','package-lock.json']);
 await bounded('tar',['-xf',archive,'-C',build]);
 const control=JSON.parse(await readFile(path.join(root,'server/foundry/activation/private-control-pin.json')));
 for(const f of [...Object.keys(control.files),'server/foundry/activation/private-control-pin.json'])await cp(path.join(root,f),path.join(build,f));
 await bounded(process.execPath,[await npmCli(),'ci'],{cwd:build,timeoutMs:90000});
 const made=await withoutHostUtilities(['server/scripts/fixtures/managed-layout-build.mjs',build],{timeoutMs:240000});
 assert.equal(made.reason,null);assert.equal(made.code,0,made.stdout);evidence.build=JSON.parse(made.stdout.trim());
 assert.equal(evidence.build.materializer.deployable,true);assert.equal(evidence.build.probe.python3,false);assert.equal(evidence.build.probe.prlimit,false);
 assert.equal(evidence.build.probe.bundledPython,true);assert.equal(evidence.build.probe.runtimeLayout,'self-contained-regular-v1');
 assert.equal(evidence.build.probe.referenceRuntime,true);assert.equal(evidence.build.probe.osLimitsEnforced,true);
 packedPins=await pins(build);evidence.runtime=packedPins;await cp(path.join(build,execution,'.runtime'),packed,{recursive:true});
 wheel=path.join(dir,'wasmtime.whl');await writeFile(wheel,await download(WHEEL_URL,11*1024*1024),{mode:0o600});
 // Exact accepted producer control, not a hand-built imitation of venv.
 const old=await bounded('git',['show',`${base}:server/foundry/materialize-runtime.mjs`]);
 await writeFile(path.join(build,'server/foundry/materialize-received.mjs'),old.stdout);
 await rm(path.join(build,execution,'.runtime'),{recursive:true});
 const madeLegacy=await command(['--input-type=module','-e',`import {materializeReferenceRuntime} from './server/foundry/materialize-received.mjs';console.log(JSON.stringify(await materializeReferenceRuntime({forceStandalone:true,tarball:'/tmp/cpython-standalone.tar.gz',wheelPath:process.env.DISPOSABLE_WHEEL})));`],{cwd:build,env:{DISPOSABLE_WHEEL:wheel}});
 assert.equal(madeLegacy.action,'cpython-standalone');legacyPins=await pins(build);assert.deepEqual(legacyPins,packedPins);
 const legacyPython=path.join(build,execution,'.runtime/bin/python');assert.equal((await lstat(legacyPython)).isSymbolicLink(),true);
 assert.equal(path.isAbsolute(await readlink(path.join(path.dirname(legacyPython),await readlink(legacyPython)))),true);
 cluster=await startDisposablePg();admin=new pg.Pool({connectionString:cluster.url});
});
after(async()=>{
 for(const s of servers)await s.stop();for(const p of pools)await p.end();await admin?.end();await cluster?.stop();
 if(process.env.FOUNDRY_RUNTIME_LAYOUT_RECEIPT)await writeFile(process.env.FOUNDRY_RUNTIME_LAYOUT_RECEIPT,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 if(dir)await rm(dir,{recursive:true,force:true});
});
const opts=runtimeDir=>({runtimeDir,deployable:true,tarball:'/tmp/cpython-standalone.tar.gz',wheelPath:wheel});
const pinsOptions={archiveSha256:CPYTHON_SHA256,wheelSha256:WHEEL_SHA256};
test('managed build with no system Python/prlimit packs the exact accepted runtime with no links',async()=>{
 assert.deepEqual(legacyPins,packedPins);assert.equal((await lstat(path.join(packed,'bin/python'))).isFile(),true);
 const audit=await auditOfflineTree(packed);assert.ok(audit.files>1000);assert.ok(audit.bytes<256*1024*1024);
 assert.deepEqual(await verifyOfflineRuntime(packed,pinsOptions),{layout:'self-contained-regular-v1',deployable:true});
 evidence.cases.push({case:'missing-utilities-build',pinsEqual:true,runtimePin:packedPins.runtimePin,...audit});
});
test('readable legacy receipt preserves byte pins; bad wheel and changed incoming interpreter never replace it',async()=>{
 const legacy=path.join(dir,'legacy-conversion');await cp(path.join(build,execution,'.runtime'),legacy,{recursive:true,verbatimSymlinks:true});
 const before=await runtimeContentIdentity(legacy),cfg=await readFile(path.join(legacy,'pyvenv.cfg'));
 const bad=path.join(dir,'bad-wheel');await writeFile(bad,'different bytes');
 await assert.rejects(materializeReferenceRuntime({...opts(legacy),wheelPath:bad}),{code:'wheel_checksum'});
 assert.deepEqual(await readFile(path.join(legacy,'pyvenv.cfg')),cfg);assert.equal((await lstat(path.join(legacy,'bin/python'))).isSymbolicLink(),true);
 const received=await materializeReferenceRuntime(opts(legacy));assert.equal(received.contentPreserved,true);assert.equal(received.action,'layout-received');
 assert.deepEqual(await runtimeContentIdentity(legacy),before);
 const changed=path.join(dir,'legacy-changed');await cp(path.join(build,execution,'.runtime'),changed,{recursive:true,verbatimSymlinks:true});
 const oldPython=await readFile(path.join(changed,'bin/python'));await rm(path.join(changed,'bin/python'));await writeFile(path.join(changed,'bin/python'),Buffer.concat([oldPython,Buffer.from('changed')]),{mode:0o755});
 const changedBefore=await runtimeContentIdentity(changed);await assert.rejects(materializeReferenceRuntime(opts(changed)),{code:'runtime_identity_changed'});
 assert.deepEqual(await runtimeContentIdentity(changed),changedBefore);
 await truncate(path.join(changed,'bin/python'),65*1024*1024);await assert.rejects(materializeReferenceRuntime(opts(changed)),{code:'runtime_incomplete'});
 assert.deepEqual((await readdir(dir)).filter(s=>s.startsWith('.runtime-stage-')),[]);
 evidence.cases.push({case:'legacy-receiving',contentPreserved:true,changedIncomingRefused:true,badWheelRetained:true});
});
test('ordinary copy, relocation and removed source tree execute offline; missing/broken/changed artifacts fail closed',async()=>{
 const copy=path.join(dir,'relocated');await cp(packed,copy,{recursive:true});
 const python=path.join(copy,'bin/python');const ran=await bounded(python,['-I','-c',"import sys,wasmtime as w; e=w.Engine();m=w.Module(e,b'\\x00asm\\x01\\x00\\x00\\x00');w.Instance(w.Store(e),m,[]);print('offline')"]);
 assert.equal(ran.stdout.trim(),'offline');await verifyOfflineRuntime(copy,pinsOptions);
 for(const f of ['bin/python','lib/python3.12/site-packages/wasmtime/linux-x86_64/_libwasmtime.so']){
  const bytes=await readFile(path.join(copy,f));await appendFile(path.join(copy,f),'changed');
  await assert.rejects(materializeReferenceRuntime(opts(copy)),{code:'runtime_content_changed'});await writeFile(path.join(copy,f),bytes);
 }
 await rm(python);await symlink('/absent-transient-build/python',python);await assert.rejects(materializeReferenceRuntime(opts(copy)),{code:'runtime_layout_link'});
 await rm(path.join(copy,'runtime-layout.json'));await assert.rejects(materializeReferenceRuntime(opts(copy)),{code:'runtime_incomplete'});
 evidence.cases.push({case:'offline-copy',exited:ran.exited,pipesClosed:true,changedInterpreterAndNativeRefused:true,brokenRefused:true});
});
async function fixture(){
 const db=`layout_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE DATABASE "${db}"`);
 const privateDir=path.join(dir,'private');await mkdir(privateDir,{mode:0o700});
 const env={CORRESPONDENCE_DATABASE_URL:cluster.url.replace('/correspondence',`/${db}`),CORRESPONDENCE_PG_SCHEMA:'pilot_correspondence',FOUNDRY_PRIVATE_DIR:privateDir,
  FOUNDRY_HOST_PROFILE_FILE:path.join(privateDir,'host.json'),FOUNDRY_PRIVATE_PROFILE_FILE:path.join(privateDir,'private.json'),FOUNDRY_PARTICIPATION_KEY_FILE:path.join(privateDir,'key')};
 for(const [name,file]of [['host-profile.example.json',env.FOUNDRY_HOST_PROFILE_FILE],['private-profile.example.json',env.FOUNDRY_PRIVATE_PROFILE_FILE]])await writeFile(file,await readFile(path.join(build,vendor,'scripts/visitor-foundry/integration/entry',name)),{mode:0o600});
 await writeFile(env.FOUNDRY_PARTICIPATION_KEY_FILE,'disposable-layout-purpose-key-32',{mode:0o600});
 const runtimeBuild=path.join(build,execution,'.runtime'),legacyControl=path.join(dir,'legacy-control');
 await cp(runtimeBuild,legacyControl,{recursive:true,verbatimSymlinks:true});
 await rm(runtimeBuild,{recursive:true});await cp(packed,runtimeBuild,{recursive:true});
 await command(['server/foundry/install.mjs','--migrate','--install'],{cwd:build,env});
 // Installer itself receives a readable legacy layout, so preserve the exact old
 // producer separately and deliver it only as the failing control after install.
 await rm(runtimeBuild,{recursive:true});await cp(legacyControl,runtimeBuild,{recursive:true,verbatimSymlinks:true});
 // A normal archive preserves both legacy folders, yet their absolute references
 // still point at the now-deleted build. No checkout symlinks support delivery.
 const archive=path.join(dir,'delivery.tar');await bounded('tar',['-cf',archive,'-C',build,'.'],{timeoutMs:60000});await mkdir(delivery);await bounded('tar',['-xf',archive,'-C',delivery],{timeoutMs:60000});await rm(build,{recursive:true});
 await assert.rejects(realpath(path.join(delivery,execution,'.runtime/bin/python')),{code:'ENOENT'});
 assert.ok((await realpath(path.join(delivery,'node_modules/@neomorphic/correspondence'))).startsWith(delivery+'/vendor/'));
 const pool=new pg.Pool({connectionString:env.CORRESPONDENCE_DATABASE_URL});pools.add(pool);
 const query=async(sql,args)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO pilot_correspondence');const r=await c.query(sql,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 let server;
 async function boot(port=0){
  const child=spawn(process.execPath,['--import',path.join(delivery,'server/scripts/fixtures/hosted-startup-preload.mjs'),'server/index.js'],{cwd:delivery,
   env:{...inherited,...env,NODE_ENV:'production',PORT:String(port),FOUNDRY_HOST_OPT_IN:'1',CORRESPONDENCE_STORE:'postgres',CORRESPONDENCE_POOL_MAX:'1',CORRESPONDENCE_ADMIN_TOKEN:'disposable-layout-admin-never-issued',
    SUPABASE_URL:'https://local-baseline.example',SUPABASE_SERVICE_ROLE_KEY:'local-baseline-stub',STRIPE_SECRET_KEY:'local-baseline-stub',RESEND_API_KEY:'local-baseline-stub'},stdio:['ignore','pipe','pipe','ipc']});
  let bytes=0;const drain=b=>{bytes+=b.length;if(bytes>200000)child.kill('SIGKILL');};child.stdout.on('data',drain);child.stderr.on('data',drain);
  const closed=once(child,'close'),lifetime=setTimeout(()=>child.kill('SIGKILL'),180000);let stopped=false;
  const s={async stop(){if(stopped)return;stopped=true;if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),6500);const[code,signal]=await closed;clearTimeout(timer);clearTimeout(lifetime);servers.delete(s);assert.equal(code,0);assert.equal(signal,null);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});}};servers.add(s);
  const m=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('fixture_listener_deadline'));},20000);child.once('message',v=>{clearTimeout(timer);resolve(v);});child.once('error',()=>{clearTimeout(timer);reject(new Error('fixture_spawn_failed'));});child.once('exit',()=>{clearTimeout(timer);reject(new Error('fixture_startup_failed'));});});
  server=Object.assign(s,{origin:`http://127.0.0.1:${m.port}`,port:m.port});
  assert.equal((await fetch(`${server.origin}/api/health`,{signal:AbortSignal.timeout(3000)})).status,200);return server;
 }
 await boot();const described=await fetch(`${server.origin}/api/correspondence/v1/visitor-entry`);assert.equal(described.status,200);const descriptor=await described.json();
 async function visitor(name){const file=path.join(privateDir,`${name}.json`);await writeFile(file,JSON.stringify({baseUrl:`${server.origin}/api/correspondence`,directory:path.join(privateDir,name),authority:{profileId:descriptor.profile.profileId,entryTerms:descriptor.profile.termsHash,contributionTerms:descriptor.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}}),{mode:0o600});
  const run=async(mode,input,exit=0)=>{const args=['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,file,'--json-result'];if(input!==undefined){const inputFile=path.join(privateDir,`${name}-${randomUUID()}.json`);await writeFile(inputFile,JSON.stringify(input),{mode:0o600});args.push(inputFile);}return command(args,{cwd:path.join(delivery,vendor),exit});};return{run,file};}
 const request=projectId=>({schema:'sds.foundry.private-pass.v1',intentId:'layout-observe',action:'observe',projectId,expectedHostConfigId:descriptor.profile.contribution.binding.hostConfigId,expectedEntryTermsHash:descriptor.profile.termsHash,expectedVerificationId:null,candidateId:null,expectedGeneration:null,reconcileIntentId:null});
 const pass=r=>command(['server/foundry/private-pass.mjs'],{cwd:delivery,env:{...env,FOUNDRY_PRIVATE_PASS_JSON:JSON.stringify(r)}});
 const counts=async()=>(await query(`SELECT (SELECT charged FROM correspondence_vf10_installation) charged,(SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,(SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,(SELECT count(*)::int FROM correspondence_vf04_pools) pools,(SELECT count(*)::int FROM correspondence_vf04_attempts) attempts`)).rows[0];
 const retained=async()=>({installation:(await query('SELECT to_jsonb(t) row FROM correspondence_vf10_installation t')).rows,host:(await query('SELECT config FROM correspondence_vf12_host')).rows,
  registrations:(await query('SELECT id,project_id,request_hash,entry_profile,created_at,expires_at,receiver_started FROM correspondence_vf10_registrations')).rows,
  grants:(await query('SELECT id,project_id,role,token_hash,expires_at,revoked_at FROM correspondence_grants ORDER BY id')).rows,
  history:(await query('SELECT scope,project_id,key,request_hash,status_code,response_json,created_at FROM correspondence_idempotency WHERE scope<>$1 ORDER BY scope,project_id,key',['vf12:entry-progress:v1'])).rows.map(({response_json,...r})=>({...r,responseDigest:createHash('sha256').update(JSON.stringify(response_json)).digest('hex')}))});
 return {env,query,visitor,pass,request,counts,retained,get server(){return server;},async restart(){const port=server.port;await server.stop();await boot(port);}};
}
test('copied normal production serving retains original pending A, then same-attempt recovery and A/restart/B execute the packed generation', {timeout:240000},async()=>{
 const f=await fixture(),a=await f.visitor('a'),registered=await a.run('register');assert.equal(registered.status,202,JSON.stringify({status:registered.body.status,state:registered.body.receiver?.state,code:registered.body.error?.code,reason:registered.body.receiver?.reason}));assert.equal(registered.body.receiver.state,'pending');
 await a.run('checkpoint',{text:'disposable private correspondence retained across delivery repair'});const privateCorrespondence=await a.run('correspondence');assert.equal(privateCorrespondence.eventCount,1);
 const projectId=registered.body.projectId,retained=await f.retained(),counts=await f.counts();assert.deepEqual(counts,{charged:1,registrations:1,admissions:1,pools:0,attempts:0});
 const diag=async expected=>{const v=await f.pass(f.request(projectId)),p=v.readback.entry.progress.phases.find(p=>p.phase==='recover');assert.equal(v.mutated,false);assert.equal(v.readback.outstandingPhysical,0);assert.equal(v.readback.entry.poolReady,false);for(const[k,x]of Object.entries(expected))assert.equal(p[k],x);assert.doesNotMatch(JSON.stringify(v),/PRIVATE_PROSE_SENTINEL_100508|"path"|"message"|\/tmp\//);return p;};
 const broken=await diag({code:'filesystem_missing',resource:'interpreter',interpreterEntry:'unreachable_external_absolute_link'});
 const runtime=path.join(delivery,execution,'.runtime');await rm(runtime,{recursive:true});await f.restart();assert.equal((await a.run('reconcile')).status,202);
 const missing=await diag({code:'filesystem_missing',resource:'runtime_config',interpreterEntry:null});
 await cp(packed,runtime,{recursive:true});await rm(path.join(runtime,'bin/python'));await f.restart();assert.equal((await a.run('reconcile')).status,202);
 const missingEntry=await diag({code:'filesystem_missing',resource:'interpreter',interpreterEntry:'missing_entry'});
 await cp(path.join(packed,'bin/python'),path.join(runtime,'bin/python'));await rm(path.join(delivery,execution,'.python-standalone'),{recursive:true});await f.restart();
 const progressed=await Promise.all([a.run('reconcile'),a.run('reconcile')]);for(const r of progressed){assert.equal(r.status,200);assert.equal(r.body.projectId,projectId);assert.equal(r.body.registrationId,registered.body.registrationId);assert.equal(r.body.receiver.state,'ready');}
 assert.deepEqual(await f.retained(),retained);assert.deepEqual(await f.counts(),{...counts,pools:1});assert.deepEqual(await pins(delivery),packedPins);
 await command(['server/foundry/install.mjs','--migrate','--install'],{cwd:delivery,env:f.env});
 assert.deepEqual(await f.retained(),retained);assert.deepEqual(await f.counts(),{...counts,pools:1});
 const beforeGeneration=(await f.query('SELECT config,verification FROM correspondence_vf04_pools')).rows;
 for(const file of ['bin/python','lib/python3.12/site-packages/wasmtime/linux-x86_64/_libwasmtime.so']){
  const full=path.join(runtime,file),bytes=await readFile(full);await appendFile(full,'changed');
  const probe=await command(['server/foundry/managed-node-probe.mjs'],{cwd:delivery,exit:2});assert.equal(probe.runtimeLayoutFailure,'runtime_content_changed');assert.equal(probe.installedPython,false);assert.equal(probe.referenceRuntime,false);
  const refusal=await a.run('reconcile');assert.equal(refusal.status,202);assert.equal(refusal.body.receiver.state,'unknown');
  assert.deepEqual((await f.query('SELECT config,verification FROM correspondence_vf04_pools')).rows,beforeGeneration);await writeFile(full,bytes);assert.equal((await a.run('reconcile')).status,200);
 }
 const submitted=await a.run('contribute',original()),candidateId=submitted.submission.admission.candidateId;
 const verification=(await f.query('SELECT verification FROM correspondence_vf04_pools WHERE project_id=$1',[projectId])).rows[0].verification;
 const dispatch={...f.request(projectId),intentId:'layout-dispatch-a',action:'dispatch',expectedVerificationId:verification.id,candidateId,expectedGeneration:1};
 const verified=await f.pass(dispatch);assert.equal(verified.state,'completed');assert.equal(verified.readback.publications[0].state,'published');
 assert.equal((await f.pass(dispatch)).replayed,true);assert.equal((await f.counts()).attempts,1);
 // A real serving spawn failure after successful build/probe/private validation.
 // This is a falsifiable EACCES control, not a diagnosis of the actual provider.
 const originalRequest=task(cases[0].input,'task:owner-a-use-useful');
 const interpreter=path.join(runtime,'bin/python'),mode=(await lstat(interpreter)).mode&0o777;
 let failed;
 try{await chmod(interpreter,0o644);failed=await a.run('use',originalRequest,1);}finally{await chmod(interpreter,mode);}
 assert.equal(failed.error.code,'invocation_no_launch');assert.deepEqual(failed.error.diagnostic,{stage:'invoke',status:409,contentClass:'json',applicationMarked:true});
 const invRow=async()=>(await f.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2',[projectId,originalRequest.taskId])).rows[0];
 const prior=await invRow();assert.equal(prior.state,'completed');assert.equal(prior.result,null);assert.equal(prior.execution.sample.observation.termination.noLaunch,true);assert.equal(prior.execution.identity,null);
 assert.equal(prior.execution.launchEvidence.failure.code,'spawn_permission');assert.equal(prior.execution.launchEvidence.interpreterEntry,'regular_not_executable');
 const intentFiles=(await readdir(path.join(f.env.FOUNDRY_PRIVATE_DIR,'a'))).filter(x=>x.startsWith('invoke-'));assert.equal(intentFiles.length,1);
 const intentFile=path.join(f.env.FOUNDRY_PRIVATE_DIR,'a',intentFiles[0]),intentBytes=await readFile(intentFile);
 const receipt=await a.run('prepare-no-launch',{intentId:'layout-receive-original-a',expectedHostConfigId:dispatch.expectedHostConfigId,request:originalRequest});
 const received=await f.pass(receipt);assert.equal(received.receipt.chargedBefore,1);assert.equal(received.receipt.chargedAfter,2);assert.equal(received.physicalLaunched,false);
 assert.equal((await f.pass(receipt)).replayed,true);
 await f.restart();const continued=await a.run('use',originalRequest);assert.deepEqual(continued.invocation.output,cases[0].expected);
 assert.deepEqual(await readFile(intentFile),intentBytes);const current=await invRow();assert.equal(current.manifest_id,prior.manifest_id);assert.equal(current.input_digest,prior.input_digest);
 assert.deepEqual(current.execution.priorAttempts,[prior.execution]);assert.equal(current.execution.requestId,prior.execution.requestId);assert.equal(current.execution.grantId,prior.execution.grantId);assert.equal(current.execution.binding.moduleDigest,prior.execution.binding.moduleDigest);
 assert.equal(current.execution.sample.observation.termination.exited,true);assert.equal(current.execution.sample.observation.termination.drained,true);assert.equal(current.execution.sample.observation.termination.code,0);
 for(const c of [cases[1],cases[3]])assert.deepEqual((await a.run('use',task(c.input))).invocation.output,c.expected);
 assert.deepEqual(await pins(delivery),packedPins);assert.deepEqual((await f.query('SELECT config,verification FROM correspondence_vf04_pools WHERE project_id=$1',[projectId])).rows,beforeGeneration);
 const aView=await f.pass({...f.request(projectId),intentId:'observe-a-use'});assert.equal(aView.readback.invocations.length,3);
 await f.restart();assert.deepEqual(await a.run('correspondence'),privateCorrespondence);const b=await f.visitor('b'),bReg=await b.run('register');assert.equal(bReg.status,200);
 for(const c of [cases[0],cases[1],cases[3]]){const used=await b.run('use',task(c.input));assert.deepEqual(used.invocation.output,c.expected);}
 const bView=await f.pass({...f.request(bReg.body.projectId),intentId:'observe-b-use'});
 for(const view of[aView,bView]){assert.equal(view.readback.outstandingPhysical,0);for(const i of view.readback.invocations){assert.deepEqual(i.sample.phases,['compile','instantiate','execute']);assert.equal(i.sample.termination.exited,true);assert.equal(i.sample.termination.drained,true);assert.equal(i.candidateId,candidateId);}}
 assert.deepEqual(await f.counts(),{charged:2,registrations:2,admissions:2,pools:2,attempts:1});
 // Explicit installer replay observes the same durable enrollment; startup never
 // ran migrations, receiving, budget refill or verification maintenance.
 evidence.cases.push({case:'archived-serving',buildRemoved:true,noCheckoutLinks:true,broken,missing,missingEntry,pinsEqual:true,sameAttemptReady:true,originalAuthorityRetained:true,privateCorrespondenceRetained:true,grantsAndHistoryRetained:true,installerReplayUnchanged:true,concurrentRecoveries:2,verificationRenewed:false,candidateId,invocations:6,chargedAInvocations:4,terminationExitedDrained:true,noLaunchControl:{code:'spawn_permission',actualProviderCause:false,originalIntentRetained:true,priorChargedObservationRetained:true,explicitOwnerReceiving:true,chargedBefore:1,chargedAfter:2,continuedAfterHttpRestart:true}});
 await f.server.stop();
});
test('closed private metadata evidence excludes error prose/paths and never traverses an external link',async()=>{
 const file=path.join(delivery,execution,'.runtime/bin/python'),mod=path.join(delivery,vendor,'scripts/visitor-foundry/entry/src/progress.mjs');
 await rm(file);
 const check=async expected=>{const v=await command(['--input-type=module','-e',`import {phaseFailure,progressView} from ${JSON.stringify('file://'+mod)};const e=Object.assign(new Error(${JSON.stringify(sentinel)}),{code:'ENOENT',path:${JSON.stringify(file)}});console.log(JSON.stringify({safe:phaseFailure(e),forged:progressView({schema:'neomorphic.foundry.entry-progress.v1',phases:[{phase:'recover',outcome:'error',interpreterEntry:${JSON.stringify(sentinel)},message:${JSON.stringify(sentinel)}}]})}));`]);assert.equal(v.safe.interpreterEntry,expected);assert.equal(v.forged.phases[0].interpreterEntry,null);};
 await check('missing_entry');await symlink('../missing',file);await check('unreachable_internal_relative_link');await rm(file);
 await symlink(path.join(delivery,execution,'.runtime/missing'),file);await check('unreachable_internal_absolute_link');await rm(file);
 await symlink('/never/read/external/credential',file);await check('unreachable_external_absolute_link');await rm(file);
 await symlink('../../../../private/credential',file);await check('unreachable_external_relative_link');await rm(file);
 await symlink('python',file);await check('link_depth_exceeded');await rm(file);
 await writeFile(file,'changed since error');await check('changed_since_failure');
 await rm(path.dirname(file),{recursive:true});await symlink('/never/read/external/private',path.dirname(file));await check('unreadable_entry');
});
