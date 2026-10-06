import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {PostgresStore} from '@neomorphic/correspondence';
import {startDisposablePg} from './fixtures/disposable-pg.mjs';
import {runBounded} from '../foundry/bounded-child.mjs';
import {openEntryFacade,closeEntryThenBase} from '../foundry/compose.js';
import {runPrivatePass,PASS_SCHEMA} from '../foundry/private-pass-core.mjs';
import {verifyFoundrySource} from './fixtures/verify-foundry-source.mjs';
import {express} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/deps.mjs';
import {original,task,cases} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
import {checkUploadIntent} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/compound/upload.mjs';
import {hash,createVersion} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/index.mjs';
import {canonical,digest} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/validation/src/index.mjs';
import {resumed} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/client.mjs';
import {participationClient} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/compound/client.mjs';
import {clientFailure,jsonCall} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/compound/transport.mjs';
import {decodeComponent,encodeComponent,componentRequest,parseComponentRequest,COMPONENT_WIRE,LEGACY_COMPONENT_WIRE,COMPONENT_TRANSPORT,MAX_COMPONENT_BYTES} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-upload-wire.mjs';
import {createArtifact} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/src/contracts.mjs';
import {portableArtifact,portableVerification} from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-profile.mjs';
import {callerResult,callerFailure,remoteJourney,verifyCallerClosure} from '../foundry/activation/remote-private-journey.mjs';
const root=process.cwd(),vendor=path.join(root,'vendor/visitor-foundry-receiver'),baseHead='0efa7ec527959281f6de5fa5e16c172a2903ad3f';
const legacyTransport={schema:LEGACY_COMPONENT_WIRE,sourceEncoding:'base64-utf8',moduleEncoding:'base64'};
const secret='ARBITRARY_PROSE_SECRET postgres://credential@private/db SELECT secret_payload';
let cluster,dir,OldClient,oldCatch,OldUploadIntent;
const fixtures=new Set();
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'sds-transport-'));cluster=await startDisposablePg();
 const file=path.join(vendor,'scripts/visitor-foundry/integration/compound/client.mjs');
 const old=await runBounded('git',['show',`${baseHead}:vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/compound/client.mjs`],{capture:true,stdoutLimit:30000});assert.equal(old.code,0);
 const source=old.stdout.replace(/from '(\.\.?\/[^']+)'/g,(_m,p)=>`from '${new URL(p,pathToFileURL(file)).href}'`);
 OldClient=(await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).participationClient;
 const cli=await runBounded('git',['show',`${baseHead}:vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/visitor.mjs`],{capture:true,stdoutLimit:30000});assert.equal(cli.code,0);
 oldCatch=new Function('error','console','process',cli.stdout.match(/catch\(error\)\{(.+)\}\s*$/)[1]);
 const accepted='900c37b6383fa87efead3e56ae52d3973c7fb196',integration=path.join(vendor,'scripts/visitor-foundry/integration');
 const absolute=(source,file)=>source.replace(/from '(\.\.?\/[^']+)'/g,(_m,p)=>`from '${new URL(p,pathToFileURL(file)).href}'`);
 const oldWire=await runBounded('git',['show',`${accepted}:vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/portable-upload-wire.mjs`],{capture:true,stdoutLimit:30000});assert.equal(oldWire.code,0);
 const wireURL=`data:text/javascript;base64,${Buffer.from(absolute(oldWire.stdout,path.join(integration,'src/portable-upload-wire.mjs'))).toString('base64')}`;
 const oldUpload=await runBounded('git',['show',`${accepted}:vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/compound/upload.mjs`],{capture:true,stdoutLimit:30000});assert.equal(oldUpload.code,0);
 const uploadSource=absolute(oldUpload.stdout.replace("'../src/portable-upload-wire.mjs'",`'${wireURL}'`),path.join(integration,'compound/upload.mjs'));
 OldUploadIntent=(await import(`data:text/javascript;base64,${Buffer.from(uploadSource).toString('base64')}`)).uploadIntent;
});
after(async()=>{for(const f of fixtures)await f.close();await cluster?.stop();await rm(dir,{recursive:true,force:true});});
const client=fetchImpl=>participationClient({baseUrl:'https://fixture.invalid',projectId:'fixture',token:secret,identityKey:'f'.repeat(64),fetchImpl,timeoutMs:80});
test('exact accepted source reproduces SyntaxError and omitted CLI code for Forbidden text',async()=>{
 const c=OldClient({baseUrl:'https://fixture.invalid',projectId:'fixture',token:secret,identityKey:'f'.repeat(64),fetchImpl:async()=>new Response('Forbidden\n',{status:403,headers:{'content-type':'text/plain'}})});
 await assert.rejects(c.call('components',{artifact:{}},'same-upload'),SyntaxError);assert.equal(c.metrics.lastError,undefined);
 let output;oldCatch(new SyntaxError(secret),{error:x=>{output=x;}},{});assert.equal(Object.hasOwn(JSON.parse(output).error,'code'),false);
});
for(const [name,status,type,body,code,klass]of [
 ['text refusal',403,'text/plain','Forbidden\n','transport_refused','text'],
 ['HTML unavailable',502,'text/html',`<html>${secret}</html>`,'transport_unavailable','html'],
 ['malformed JSON',200,'application/json',secret,'transport_response_invalid','json'],
 ['unknown object status',202,'application/json','{}','transport_response_invalid','json'],
 ['empty response',204,null,null,'transport_response_invalid','absent'],
 ['array response',200,'application/json','[]','transport_response_invalid','json'],
 ['unknown error prose',403,'application/json',JSON.stringify({error:{code:secret,message:secret,nextAction:secret}}),'transport_refused','json'],
 ['prototype error name',403,'application/json',JSON.stringify({error:{code:'constructor'}}),'transport_refused','json'],
 ['structured forbidden',403,'application/json',JSON.stringify({error:{code:'forbidden',message:secret}}),'forbidden','json'],
 ['invalid UTF8',200,'application/json',Buffer.from([0xff]),'transport_response_invalid','json'],
])test(`bounded diagnosis: ${name}`,async()=>{
 const c=client(async()=>new Response(body,{status,headers:type?{'content-type':type}:{}}));
 await assert.rejects(c.call('components',{artifact:{}},'same-upload'),e=>{
  const result=clientFailure(e);assert.equal(result.code,code);assert.deepEqual(result.diagnostic,{stage:'components',status,contentClass:klass,applicationMarked:false});
  assert.equal(result.nextAction,'reconcile_same_attempt');assert.doesNotMatch(JSON.stringify(result),/ARBITRARY|credential|private\/db|secret_payload/);return true;
 });assert.equal(c.metrics.requests,1);
});
test('JSON success, declared length and streaming byte bounds cancel/drain owned reader',async()=>{
 assert.deepEqual(await client(async()=>Response.json({valid:true})).call('task',{}),{valid:true});
 for(const declared of [true,false]){
  let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(Buffer.alloc(524289));},cancel(){cancelled=true;}});
  await assert.rejects(client(async()=>new Response(stream,{headers:{'content-type':'application/json',...(declared?{'content-length':'524289'}:{})}})).call('components',{}),{code:'transport_response_limit'});
  assert.equal(cancelled,true);
 }
});
test('bounded headers/body/network loss: one mutation attempt, no retry, no exception prose',async()=>{
 for(const mode of ['fetch-hang','body-hang','disconnect']){
  let calls=0,cancelled=false;const start=Date.now();
  const c=client(async()=>{calls++;if(mode==='fetch-hang')return new Promise(()=>{});if(mode==='disconnect')throw new Error(secret);return new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});});
  await assert.rejects(c.call('components',{},'same-key'),e=>{assert.equal(e.code,'transport_outcome_unknown');assert.doesNotMatch(JSON.stringify(clientFailure(e)),/ARBITRARY|credential/);return true;});
  assert.equal(calls,1);assert.ok(Date.now()-start<1000);if(mode==='body-hang')assert.equal(cancelled,true);
 }
});
test('closed CLI/private-child codes cannot be omitted or reflect arbitrary strings/fields',()=>{
 for(const value of [undefined,null,secret,'opaque_credential_sentinel',{toString:()=>secret}]){
  const safe=clientFailure({code:value,nextAction:secret,diagnostic:{stage:secret,contentClass:secret}});assert.equal(safe.code,'client_outcome_unknown');assert.doesNotMatch(JSON.stringify(safe),/ARBITRARY|credential/);
 }
 assert.throws(()=>callerResult({code:1,reason:null,stdout:JSON.stringify({error:{code:'transport_refused',diagnostic:{stage:'components',status:403,contentClass:'text',applicationMarked:false,body:secret}}})}),e=>{assert.deepEqual(callerFailure(e),{code:'transport_refused',nextAction:'reconcile_same_attempt',diagnostic:{stage:'components',status:403,contentClass:'text',applicationMarked:false}});return true;});
 for(const stdout of [secret,JSON.stringify({error:{code:secret}})])assert.throws(()=>callerResult({code:1,reason:null,stdout}),e=>{assert.doesNotMatch(JSON.stringify(callerFailure(e)),/ARBITRARY|credential/);return true;});
});
test('real CLI always emits a closed error code and the diagnostic child exits',async()=>{
 const file=path.join(dir,'invalid-private-config.json');await writeFile(file,secret,{mode:0o600});
 const r=await runBounded(process.execPath,['scripts/visitor-foundry/integration/entry/visitor.mjs','contribute',file,'--json-result'],{cwd:vendor,capture:true,stdoutLimit:8192,timeoutMs:5000});
 assert.equal(r.code,1);assert.equal(r.reason,null);assert.equal(r.exited,true);
 assert.deepEqual(JSON.parse(r.stdout),{error:{code:'client_outcome_unknown',nextAction:'reconcile_same_attempt'}});assert.throws(()=>process.kill(r.pid,0),{code:'ESRCH'});
});
test('declared complete metadata and explicit v1/raw legacy preserve exact canonical bytes',()=>{
 const a={kind:'portable-structured-result-v1',descriptor:{test:'metadata π <script>schema</script>'},sourceText:'\ufeffexact π\n',moduleBase64:'AGFzbQ=='};
 const full=encodeComponent(a,COMPONENT_TRANSPORT),old=encodeComponent(a,legacyTransport);
 assert.deepEqual(decodeComponent(full),a);assert.deepEqual(decodeComponent(old),a);assert.equal(decodeComponent(a),a);assert.equal(encodeComponent(a,null),a);
 assert.equal(Object.hasOwn(old,'descriptor'),true);assert.equal(Object.hasOwn(full,'descriptor'),false);assert.equal(Object.hasOwn(full,'moduleBase64'),false);
 assert.doesNotMatch(JSON.stringify(full),/metadata|<script>|sourceText|moduleBase64/);
 const body={artifact:old,termsVersion:'sha256:'+'a'.repeat(64)};assert.equal(canonical(body)===canonical(componentRequest(body,COMPONENT_TRANSPORT)),false);
 assert.equal(digest({actor:'original-actor',body:componentRequest(body,null)}),digest({actor:'original-actor',body:{artifact:decodeComponent(full),termsVersion:body.termsVersion}}));
 for(const sourceText of ['\ud800','\udfff','x'.repeat(32769),null])for(const transport of [legacyTransport,COMPONENT_TRANSPORT])assert.throws(()=>encodeComponent({...a,sourceText},transport),{code:'invalid_source_encoding'});
 for(const x of [{...old,sourceText:a.sourceText},{...old,schema:'other'},{...old,sourceBase64:'YQ'},{...old,sourceBase64:'YQ==\n'},{...old,sourceBase64:'/w=='},{...old,sourceBase64:Buffer.alloc(32769).toString('base64')}])assert.throws(()=>decodeComponent(x));
});
test('exact supplied hosted synthetic artifact retains descriptor/source/module identity through both declared wires',async()=>{
 const bytes=await readFile('server/scripts/fixtures/hosted-synthetic-upload-100511.json');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'b2956cd3f1c2f4bd2b551d216f7aa2b9a627280f8077b00d13756a26e448664a');
 const saved=JSON.parse(bytes),artifact=portableArtifact(decodeComponent(saved.artifact));
 assert.equal(artifact.descriptor.id,'sha256:075a5bc27569cf79a85061d72692ca3b2101a26b4c74bd17eaf2a16bb45d4b3e');
 assert.equal(artifact.descriptor.module.digest,'sha256:37e04d035231a179a3408e98ab6bc68c54d9a61996554de38e75554465076121');
 for(const representation of [encodeComponent(artifact,legacyTransport),encodeComponent(artifact,COMPONENT_TRANSPORT)]){
  assert.deepEqual(portableArtifact(decodeComponent(representation)),artifact);
  assert.equal(digest({actor:'same-original-actor',body:parseComponentRequest({artifact:representation,termsVersion:saved.termsVersion})}),digest({actor:'same-original-actor',body:{artifact,termsVersion:saved.termsVersion}}));
 }
});
test('invoke application marker and known no-launch/failed/unknown codes survive the closed caller path',async()=>{
 for(const code of ['invocation_no_launch','invocation_failed','invocation_outcome_unknown']){
  let calls=0;const c=client(async()=>{calls++;return Response.json({error:{code,message:secret}},{status:409,headers:{'x-foundry-integration':'neomorphic.foundry.integration.v1'}});});
  await assert.rejects(c.call('invoke',{request:{taskId:'same-original-task'}}),e=>{const safe=clientFailure(e);assert.equal(safe.code,code);assert.deepEqual(safe.diagnostic,{stage:'invoke',status:409,contentClass:'json',applicationMarked:true});assert.doesNotMatch(JSON.stringify(safe),/ARBITRARY|credential|secret_payload/);return true;});assert.equal(calls,1);
 }
});
test('full wire rejects mixed fields, aliases, digest changes, malformed/noncanonical JSON and finite byte bounds',()=>{
 const a={kind:'test',descriptor:{test:true},sourceText:'exact',moduleBase64:'AGFzbQ=='},full=encodeComponent(a,COMPONENT_TRANSPORT);
 for(const x of [{...full,descriptor:a.descriptor},{...full,encoding:'other'},{...full,schema:'unknown'},{...full,digest:'sha256:'+'0'.repeat(64)},
  {...full,payloadBase64:full.payloadBase64+'\n'},{...full,payloadBase64:Buffer.alloc(MAX_COMPONENT_BYTES+1).toString('base64')}])assert.throws(()=>decodeComponent(x));
 const wrap=bytes=>({...full,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),payloadBase64:bytes.toString('base64')});
 for(const bytes of [Buffer.from([0xff]),Buffer.from('{'),Buffer.from(' {"sourceText":"exact"}'),Buffer.from('{"x":1,"x":1}'),Buffer.from('null'),Buffer.from('[]'),Buffer.from('{"schema":"nested"}')])assert.throws(()=>decodeComponent(wrap(bytes)));
 for(const raw of [null,[],false,3,'invalid',{artifact:full,termsVersion:'t',extra:'x'}])assert.throws(()=>parseComponentRequest(raw),{code:'invalid_participation_input'});
 assert.throws(()=>encodeComponent(a,{schema:'unknown'}),{code:'invalid_component_wire'});
 assert.throws(()=>encodeComponent(a,{schema:COMPONENT_WIRE,encoding:'guess'}),{code:'invalid_component_wire'});
 assert.throws(()=>encodeComponent({...a,descriptor:{large:'x'.repeat(MAX_COMPONENT_BYTES)}},COMPONENT_TRANSPORT));
});

async function fixture({rejectAll=false}={}) {
 const schema=`transport_${randomUUID().replaceAll('-','')}`,privateDir=path.join(dir,schema);await mkdir(privateDir,{mode:0o700});
 const url=cluster.url,config={databaseUrl:url,pgSchema:schema,adminToken:'fixture-only-never-issued',store:'postgres',bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:10000,corsOrigins:[],trustProxyHops:0,poolMax:1,port:0};
 const hostProfile=JSON.parse(await readFile(path.join(vendor,'scripts/visitor-foundry/integration/entry/host-profile.example.json'))),privateProfile=JSON.parse(await readFile(path.join(vendor,'scripts/visitor-foundry/integration/entry/private-profile.example.json')));
 const pool=new pg.Pool({connectionString:url});
 const query=async(sql,args)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO ${schema}`);const r=await c.query(sql,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 let base,mount,server,port=0,componentRequests=0,drop=false,allowLegacy=false,blockAll=rejectAll;
 async function boot(install=false) {
  base=new PostgresStore(url,{schema,poolMax:1});({mounted:mount}=await openEntryFacade({store:base,config,hostProfile,participationKey:'transport-disposable-private-purpose-key-32'}));
  if(install){await base.migrate();await mount.extension.cells.migrate();await mount.extension.integration.migrate();await mount.entry.migrate();await mount.receiver.migrate();mount.entry.receiver=null;const prior=await mount.entry.install(privateProfile);mount.entry.receiver=mount.receiver;await mount.entry.enableContribution({expectedTerms:prior.termsHash,id:'vf10:contribution-v2',binding:mount.receiver.binding()});}
  const app=express();app.get('/product-unrelated-fixture',(_req,res)=>res.json({serving:true}));app.use(express.json({limit:524288}));
  app.use((req,res,next)=>{if(req.path.endsWith('/components')){componentRequests++;if(blockAll || !allowLegacy && (req.body?.artifact?.sourceText!==undefined || req.body?.artifact?.descriptor!==undefined))return res.status(403).type('text').send('Forbidden\n');if(drop){drop=false;res.json=()=>{res.destroy();return res;};}}next();});
  app.use('/api/correspondence',mount.app);server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));port=server.address().port;
 }
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));await closeEntryThenBase(mount,base);}
 await boot(true);
 const baseUrl=`http://127.0.0.1:${port}/api/correspondence`,descriptor=await mount.entry.describe();
 async function visitor(name='a'){
  const configuration={baseUrl,directory:path.join(privateDir,`visitor-${name}`),authority:{profileId:descriptor.profile.profileId,entryTerms:descriptor.profile.termsHash,contributionTerms:descriptor.profile.contribution.binding.contributionTerms,scope:'synthetic-reusable-components'}};
  const file=path.join(privateDir,`visitor-${name}.config.json`);await writeFile(file,JSON.stringify(configuration),{mode:0o600});
  const run=async(mode,input,exit=0)=>{const inputFile=path.join(privateDir,`${randomUUID()}.json`);if(input!==undefined)await writeFile(inputFile,JSON.stringify(input),{mode:0o600});
   const r=await runBounded(process.execPath,['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,file,...(input===undefined?[]:[inputFile]),'--json-result'],{cwd:vendor,env:{PATH:process.env.PATH,LANG:'C',LC_ALL:'C'},capture:true,stdoutLimit:1048576,outputLimit:2097152,timeoutMs:60000});
   assert.equal(r.reason,null);assert.equal(r.code,exit,JSON.stringify(JSON.parse(r.stdout)?.error));assert.equal(r.exited,true);assert.doesNotMatch(r.stdout,/ARBITRARY|credential/);return JSON.parse(r.stdout);};
  const registered=await run('register');assert.equal(registered.body.receiver.state,'ready');return {configuration,file,directory:configuration.directory,run,registration:registered.body};
 }
 const a=await visitor();
 const authority=async()=>({installation:(await query('SELECT to_jsonb(t) record FROM correspondence_vf10_installation t')).rows,host:(await query('SELECT config FROM correspondence_vf12_host')).rows,registration:(await query('SELECT id,project_id,request_hash,created_at,expires_at,receiver_id FROM correspondence_vf10_registrations ORDER BY id')).rows});
 const counts=async()=>(await query(`SELECT (SELECT charged FROM correspondence_vf10_installation) charged,(SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,(SELECT count(*)::int FROM correspondence_vf04_packages WHERE kind='component') components,(SELECT count(*)::int FROM correspondence_vf04_candidates) candidates,(SELECT count(*)::int FROM correspondence_vf04_attempts) attempts`)).rows[0];
 const pass=async(candidateId)=>{const verification=(await query('SELECT verification FROM correspondence_vf04_pools WHERE project_id=$1',[a.registration.projectId])).rows[0].verification;
  return runPrivatePass(mount.extension.integration,mount.receiver,{schema:PASS_SCHEMA,intentId:'transport-explicit-owner-dispatch',action:'dispatch',projectId:a.registration.projectId,expectedHostConfigId:descriptor.profile.contribution.binding.hostConfigId,expectedEntryTermsHash:descriptor.profile.termsHash,expectedVerificationId:verification.id,candidateId,expectedGeneration:1,reconcileIntentId:null});};
 const f={a,visitor,query,authority,counts,pass,descriptor,privateDir,baseUrl,get componentRequests(){return componentRequests;},get store(){return mount.extension.integration;},get entry(){return mount.entry;},get base(){return base;},allowLegacy(){allowLegacy=true;},acceptFull(){blockAll=false;},loseNextUpload(){drop=true;},async restart(){await stop();await boot();},async close(){await stop();await pool.end();fixtures.delete(f);}};fixtures.add(f);return f;
}
test('content refusal reaches canonical CLI and pinned private caller, before participation intent',async()=>{
 const f=await fixture({rejectAll:true}),before=await f.authority();
 const configFile=path.join(f.privateDir,'owner.json');await writeFile(configFile,JSON.stringify({schema:'sds.foundry.remote-owner-qa.v1',baseUrl:f.baseUrl,directory:f.privateDir,authority:f.a.configuration.authority,expectedHostConfigId:f.descriptor.profile.contribution.binding.hostConfigId,expectedEntryTermsHash:f.descriptor.profile.termsHash}),{mode:0o600});
 await assert.rejects(remoteJourney('a-contribute',configFile),e=>{const safe=callerFailure(e);assert.equal(safe.code,'transport_refused');assert.deepEqual(safe.diagnostic,{stage:'components',status:403,contentClass:'text',applicationMarked:false});return true;});
 for(const op of ['create','claim','checkpoint','submit'])await assert.rejects(stat(path.join(f.a.directory,`${op}.json`)),{code:'ENOENT'});
 const refused=await f.a.run('contribute',original(),1);assert.equal(refused.error.code,'upload_outcome_unknown');assert.equal(f.componentRequests,1);assert.deepEqual(await f.authority(),before);
});
test('real mounted route: canary is pre-SQL; negotiated encoded identity/journal and legacy compatibility',async()=>{
 const f=await fixture(),before=await f.authority(),counts=await f.counts();
 const canary=await f.a.run('upload-canary');assert.equal(canary.routeValidationObserved,true);assert.equal(canary.mutated,false);assert.equal(canary.observation.diagnostic.applicationMarked,true);assert.deepEqual(await f.counts(),counts);
 const contributed=await f.a.run('contribute',original()),candidate=contributed.submission.admission.candidateId;
 const saved=JSON.parse(await readFile(path.join(f.a.directory,'upload.json'))).intent;
 assert.equal(Object.hasOwn(saved.body.artifact,'schema'),false);assert.equal(Object.hasOwn(saved.body.artifact,'sourceText'),true);
 const artifact=portableArtifact(decodeComponent(saved.body.artifact));assert.equal(artifact.descriptor.id,contributed.artifactId);
 const originalUpload=JSON.parse(await readFile(path.join(f.a.directory,'upload-receipt.json'))).intent;
 const ctx=resumed(f.a.configuration);
 const keyRow=(await f.query('SELECT request_hash,response_json FROM correspondence_idempotency WHERE key=$1',[saved.key])).rows[0];
 // Same authenticated context through HTTP with explicitly encoded form replays its saved identity.
 assert.deepEqual(await ctx.client.submitComponent(saved,{id:saved.body.termsVersion,componentTransport:COMPONENT_TRANSPORT}),{...originalUpload,replayed:true});
 f.allowLegacy();assert.deepEqual(await ctx.client.call('components',{artifact,termsVersion:saved.body.termsVersion},saved.key),{...originalUpload,replayed:true});
 assert.deepEqual(await ctx.client.call('components',{artifact:encodeComponent(artifact,legacyTransport),termsVersion:saved.body.termsVersion},saved.key),{...originalUpload,replayed:true});
 const prior=await f.counts();
 await assert.rejects(ctx.client.call('components',componentRequest({...saved.body,artifact:{...artifact,sourceText:artifact.sourceText+'\nchanged'}},COMPONENT_TRANSPORT),saved.key),{code:'invalid-input'});
 await assert.rejects(ctx.client.call('components',componentRequest({...saved.body,artifact:{...artifact,moduleBase64:Buffer.from('changed module').toString('base64')}},COMPONENT_TRANSPORT),saved.key),{code:'invalid-input'});
 assert.deepEqual(await f.counts(),prior);
 assert.equal((await f.counts()).components,1);assert.deepEqual((await f.query('SELECT request_hash,response_json FROM correspondence_idempotency WHERE key=$1',[saved.key])).rows[0],keyRow);
 for(const name of ['upload','upload-started','upload-receipt','create','claim','checkpoint','submit'])assert.equal((await stat(path.join(f.a.directory,`${name}.json`))).mode&0o777,0o600);
 const intents=await Promise.all(['upload','upload-started','upload-receipt','create','claim','checkpoint','submit'].map(async name=>[name,await readFile(path.join(f.a.directory,`${name}.json`))]));
 assert.deepEqual(await f.authority(),before);
 const verified=(await f.query('SELECT config,verification FROM correspondence_vf04_pools WHERE project_id=$1',[f.a.registration.projectId])).rows[0];assert.equal(portableVerification(verified.config).id,verified.verification.id);
 const generation=(await f.pass(candidate));assert.equal(generation.state,'completed');assert.equal(generation.readback.publications[0].state,'published');
 const aUse=await f.a.run('use',task(cases[0].input));assert.deepEqual(aUse.invocation.output,cases[0].expected);
 await f.a.run('checkpoint',{text:'private correspondence retained across transport/restart'});await f.restart();
 const b=await f.visitor('b');for(const n of [0,1,3]){const used=await b.run('use',task(cases[n].input));assert.deepEqual(used.invocation.output,cases[n].expected);}
 const rejected=await b.run('use',task({structuredContent:{project:{id:'unmeasured',status:'closed',version:7},nextAction:null}}));assert.equal(rejected.invocation,null);
 assert.ok((await f.query('SELECT text FROM correspondence_events WHERE project_id=$1',[f.a.registration.projectId])).rows.some(x=>x.text==='private correspondence retained across transport/restart'));
 const samples=(await f.query('SELECT execution FROM correspondence_vf04_invocations WHERE state=$1',['completed'])).rows;assert.equal(samples.length,4);
 for(const {execution}of samples){const o=execution.sample.observation;assert.equal(execution.sourceProject,f.a.registration.projectId);assert.equal(execution.binding.candidateId,candidate);assert.equal(execution.generation,1);assert.equal(execution.binding.moduleDigest,artifact.descriptor.module.digest);assert.equal(o.termination.exited,true);assert.equal(o.termination.drained,true);assert.deepEqual(o.phasesObserved.map(p=>p.phase),['compile','instantiate','execute']);}
 for(const [name,bytes]of intents)assert.deepEqual(await readFile(path.join(f.a.directory,`${name}.json`)),bytes);
 assert.equal((await fetch(f.baseUrl.replace('/api/correspondence','/product-unrelated-fixture'))).status,200);
});
test('committed upload loses response: no automatic write replay, restart explicitly reuses original intent',async()=>{
 const f=await fixture(),before=await f.authority();f.loseNextUpload();
 const failed=await f.a.run('contribute',original(),1);assert.equal(failed.error.code,'transport_outcome_unknown');assert.equal(f.componentRequests,1);
 const saved=await readFile(path.join(f.a.directory,'upload.json'));
 assert.deepEqual(await f.counts(),{charged:1,admissions:1,components:1,candidates:0,attempts:0});
 for(const op of ['create','claim','checkpoint','submit'])await assert.rejects(stat(path.join(f.a.directory,`${op}.json`)),{code:'ENOENT'});
 await f.restart();const again=await f.a.run('contribute',original(),1);assert.equal(again.error.code,'upload_outcome_unknown');assert.equal(f.componentRequests,1);
 const received=await f.a.run('reconcile-upload');assert.equal(received.reconciled,true);assert.equal(received.receipt.replayed,true);assert.equal(f.componentRequests,2);assert.deepEqual(await readFile(path.join(f.a.directory,'upload.json')),saved);
 const duplicate=await f.a.run('reconcile-upload');assert.deepEqual(duplicate,received);assert.equal(f.componentRequests,2);
 const contribution=await f.a.run('contribute',original());assert.ok(contribution.submission.admission.candidateId);assert.equal(f.componentRequests,2);
 assert.equal((await f.counts()).components,1);assert.equal((await f.counts()).candidates,1);assert.deepEqual(await f.authority(),before);
});
test('exact accepted v1 saved/upload-started intent continues as v2 without authority or file rewrite',async()=>{
 const f=await fixture({rejectAll:true}),authority=await f.authority();
 const failed=await f.a.run('contribute',original(),1);assert.equal(failed.error.code,'transport_refused');
 const originalFile=path.join(f.a.directory,'upload.json'),startedFile=path.join(f.a.directory,'upload-started.json');
 const wrapper=JSON.parse(await readFile(originalFile)),artifact=portableArtifact(wrapper.intent.body.artifact);
 // Seed the exact received v1 producer's synthetic durable files, before any durable server upload.
 wrapper.intent=OldUploadIntent(artifact,{id:wrapper.contributionTerms,componentTransport:legacyTransport});
 assert.equal(wrapper.intent.body.artifact.schema,LEGACY_COMPONENT_WIRE);checkUploadIntent(wrapper.intent,artifact,wrapper.contributionTerms);
 const started={entryTerms:wrapper.entryTerms,contributionTerms:wrapper.contributionTerms,intent:{intentDigest:hash(wrapper.intent)}};
 await writeFile(originalFile,JSON.stringify(wrapper)+'\n',{mode:0o600});await writeFile(startedFile,JSON.stringify(started)+'\n',{mode:0o600});
 const bytes=await readFile(originalFile),startBytes=await readFile(startedFile);
 const decoded={artifact,termsVersion:wrapper.contributionTerms};
 assert.equal(canonical(parseComponentRequest(wrapper.intent.body)),canonical(parseComponentRequest(componentRequest(wrapper.intent.body,COMPONENT_TRANSPORT))));
 f.acceptFull();await f.restart();
 const automatic=await f.a.run('contribute',original(),1);assert.equal(automatic.error.code,'upload_outcome_unknown');assert.equal(f.componentRequests,1);
 const canary=await f.a.run('upload-full-canary');assert.equal(canary.routeValidationObserved,true);assert.equal(canary.transport,COMPONENT_WIRE);
 const ownerFile=path.join(f.privateDir,'full-canary-owner.json');await writeFile(ownerFile,JSON.stringify({schema:'sds.foundry.remote-owner-qa.v1',baseUrl:f.baseUrl,directory:f.privateDir,authority:f.a.configuration.authority,expectedHostConfigId:f.descriptor.profile.contribution.binding.hostConfigId,expectedEntryTermsHash:f.descriptor.profile.termsHash}),{mode:0o600});
 const ownerCanary=await remoteJourney('a-upload-full-canary',ownerFile);assert.equal(ownerCanary.routeValidationObserved,true);assert.equal(ownerCanary.mutated,false);assert.equal(ownerCanary.pin.base,'eaed1efef1c6b04fc0ba74bd55e25bf424964a34');
 assert.equal((await f.counts()).components,0);for(const op of ['create','claim','checkpoint','submit'])await assert.rejects(stat(path.join(f.a.directory,`${op}.json`)),{code:'ENOENT'});
 // Unknown first explicit v2 acknowledgement: committed exactly once, then restarted same-intent reconciliation.
 f.loseNextUpload();const lost=await f.a.run('reconcile-upload',undefined,1);assert.equal(lost.error.code,'transport_outcome_unknown');assert.equal((await f.counts()).components,1);
 await f.restart();const received=await f.a.run('reconcile-upload');assert.equal(received.receipt.replayed,true);
 assert.deepEqual(await readFile(originalFile),bytes);assert.deepEqual(await readFile(startedFile),startBytes);
 const beforeRequests=f.componentRequests;assert.deepEqual(await f.a.run('reconcile-upload'),received);assert.equal(f.componentRequests,beforeRequests);
 const ctx=resumed(f.a.configuration),key=wrapper.intent.key;
 const row=(await f.query("SELECT request_hash,response_json FROM correspondence_idempotency WHERE scope='vf04:http' AND key=$1",[key])).rows[0];
 await assert.rejects(f.store.db.tx(c=>f.store.once(c,f.a.registration.projectId,{id:'another-actor'},key,decoded,()=>assert.fail('collision executed'))),{code:'idempotency_conflict'});
 await assert.rejects(ctx.client.call('components',componentRequest({...decoded,termsVersion:'sha256:'+'a'.repeat(64)},COMPONENT_TRANSPORT),key),{code:'stale-terms'});
 const {contentId,...cap}=structuredClone(artifact.descriptor.capability);cap.source.repository='https://fixture.invalid/changed-metadata';
 const {id,schema,...descriptor}=structuredClone(artifact.descriptor);
 const changed={...artifact,descriptor:createArtifact({...descriptor,capability:createVersion(cap)})};portableArtifact(changed);
 // Even a different independently valid artifact cannot reuse the original actor/body journal key.
 await assert.rejects(ctx.client.call('components',componentRequest({...decoded,artifact:changed},COMPONENT_TRANSPORT),key),{code:'conflict'});
 const invalidAuth=participationClient({baseUrl:f.baseUrl,projectId:f.a.registration.projectId,token:'synthetic-invalid-token',identityKey:'f'.repeat(64)});
 await assert.rejects(invalidAuth.submitComponent(wrapper.intent,{componentTransport:COMPONENT_TRANSPORT}));
 assert.deepEqual((await f.query("SELECT request_hash,response_json FROM correspondence_idempotency WHERE scope='vf04:http' AND key=$1",[key])).rows[0],row);
 assert.deepEqual(await f.authority(),authority);assert.deepEqual(await f.counts(),{charged:1,admissions:1,components:1,candidates:0,attempts:0});
 const completed=await f.a.run('contribute',original());assert.ok(completed.submission.admission.candidateId);assert.equal((await f.counts()).candidates,1);
 assert.deepEqual(await readFile(originalFile),bytes);assert.deepEqual(await readFile(startedFile),startBytes);assert.deepEqual(await f.authority(),authority);
});
test('full-wire invalid schema refuses before mounted authentication and any SQL, including no credential',async()=>{
 const f=await fixture({rejectAll:true});await f.a.run('contribute',original(),1);f.acceptFull();
 const saved=JSON.parse(await readFile(path.join(f.a.directory,'upload.json'))).intent;
 const wire=encodeComponent({...saved.body.artifact,schema:'neomorphic.foundry.invalid-component-canary.v1'},COMPONENT_TRANSPORT);
 const prior=await f.counts(),authority=await f.authority();let auth=0,sql=0;
 const databaseMethods=[[f.entry.pool,'connect'],[f.store.db,'tx'],[f.base.pool,'connect']].map(([owner,name])=>({owner,name,original:owner[name]}));
 for(const {owner,name}of databaseMethods)owner[name]=()=>{sql++;throw new Error(secret);};
 const isVisitor=f.entry.isVisitorToken;f.entry.isVisitorToken=()=>{auth++;throw new Error(secret);};
 const authenticated=f.store.authenticated;f.store.authenticated=()=>{auth++;throw new Error(secret);};
 try {
  const response=await fetch(`${f.baseUrl}/v1/projects/${f.a.registration.projectId}/foundry/components`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({artifact:wire,termsVersion:saved.body.termsVersion})});
  assert.equal(response.status,409);assert.equal(response.headers.get('x-foundry-component-wire'),COMPONENT_WIRE);assert.equal((await response.json()).error.code,'invalid_portable_package');assert.equal(auth,0);assert.equal(sql,0);
 } finally {f.entry.isVisitorToken=isVisitor;f.store.authenticated=authenticated;for(const {owner,name,original}of databaseMethods)owner[name]=original;}
 assert.deepEqual(await f.counts(),prior);assert.deepEqual(await f.authority(),authority);
});
test('source closure/amendment preserves sealed execution and control pins',async()=>{await verifyFoundrySource(root);assert.equal(verifyCallerClosure().base,'eaed1efef1c6b04fc0ba74bd55e25bf424964a34');});
