// Disposable namespace only: mount one copied fixture publication read-only and
// exercise the ordinary executable server entry. No production paths or SQL.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBounded} from '../../foundry/bounded-child.mjs';
const runtime=process.argv[2],root=fileURLToPath(new URL('../../../',import.meta.url));
assert.ok(runtime?.startsWith('/tmp/sds-runtime-layout-')&&runtime.endsWith('/readonly-runtime'));
const target=path.join(root,'vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime');
for(const args of [['--bind',runtime,target],['-o','remount,bind,ro',target]]){const r=await runBounded('mount',args,{timeoutMs:3000});assert.equal(r.code,0);assert.equal(r.reason,null);}
const privateDir=await mkdtemp(path.join(tmpdir(),'sds-readonly-private-'));
let child,timer,closed;let output='',diagnostic='';
try{
 const vendor=path.join(root,'vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry');
 await writeFile(path.join(privateDir,'host.json'),await readFile(path.join(vendor,'host-profile.example.json')),{mode:0o600});
 await writeFile(path.join(privateDir,'key'),'disposable-readonly-fixture-key-32',{mode:0o600});
 child=spawn(process.execPath,['--import',path.join(root,'server/scripts/fixtures/hosted-startup-preload.mjs'),'server/index.js'],{cwd:root,env:{...process.env,
  NODE_ENV:'production',PORT:'0',FOUNDRY_HOST_OPT_IN:'1',CORRESPONDENCE_DATABASE_URL:'postgres://127.0.0.1:9/disposable_absent',CORRESPONDENCE_ADMIN_TOKEN:'disposable-readonly-admin-32',
  CORRESPONDENCE_STORE:'postgres',CORRESPONDENCE_PG_SCHEMA:'pilot_correspondence',FOUNDRY_HOST_PROFILE_FILE:path.join(privateDir,'host.json'),FOUNDRY_PARTICIPATION_KEY_FILE:path.join(privateDir,'key'),
  SUPABASE_URL:'https://local-baseline.example',SUPABASE_SERVICE_ROLE_KEY:'fixture-stub',STRIPE_SECRET_KEY:'fixture-stub',RESEND_API_KEY:'fixture-stub'},stdio:['ignore','pipe','pipe','ipc']});
 closed=once(child,'close');timer=setTimeout(()=>child.kill('SIGKILL'),20000);
 child.stdout.on('data',b=>{output+=b;if(output.length>20000)child.kill('SIGKILL');});
 child.stderr.on('data',b=>{diagnostic+=b;if(diagnostic.length>20000)child.kill('SIGKILL');});
 const {port}=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',()=>reject(new Error('fixture_startup_failed')));});
 const origin='http://127.0.0.1:'+port;
 const product=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(3000)}),health=await(await fetch(origin+'/api/correspondence/healthz',{signal:AbortSignal.timeout(3000)})).json();
 assert.equal(health.ok,false);assert.match(diagnostic,/foundry_runtime_startup_refused/);assert.match(diagnostic,/runtime_startup_denied/);assert.match(diagnostic,/EROFS/);
 assert.doesNotMatch(diagnostic,/disposable-readonly-admin|disposable-readonly-fixture-key|postgres:\/\//);
 child.kill('SIGTERM');const [code,signal]=await closed;clearTimeout(timer);assert.equal(code,0);assert.equal(signal,null);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
 console.log(JSON.stringify({failure:{code:'runtime_startup_denied',nativeCode:'EROFS',resource:'runtime_publication'},productStatus:product.status,foundryEnabled:health.ok,exitedDrained:true}));
}finally{if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await closed;}clearTimeout(timer);await rm(privateDir,{recursive:true,force:true});}
