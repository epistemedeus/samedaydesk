// ROOT425 independently authored fault/recovery cases; ROOT425 mount/cluster setup reused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';
import {installedSourceSha256,hostSourceSha256} from '../../vendor/hosted-wallet-market/src/native-debt.mjs';
import {canonicalMachineProfile} from '../../vendor/hosted-wallet-market/src/machine-profile-document.mjs';
import {versionedSource} from '../../vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/index.js';
import {unfundedFunnelSnapshot} from '../../vendor/hosted-wallet-market/src/machine-funnel.mjs';
import {feeAt} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/money.js';

const sds=resolve(import.meta.dirname,'../..'),prefix='/api/neomorphic-contributor-journey';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('ROOT425 committed cold mutations, real createSdsApp, PostgreSQL and verified TLS', async t=>{
  const cluster=await startCluster(),scratch=mkdtempSync(join(tmpdir(),'root425-journey-'));
  const url=new URL(cluster.connectionString),hba=join(cluster.dataDir,'pg_hba.conf');
  const database='contributor_journey_staging_root425_'+randomBytes(3).toString('hex');
  const admin=new pg.Client({connectionString:cluster.connectionString});await admin.connect();
  await admin.query('CREATE DATABASE '+database);await admin.end();url.pathname='/'+database;
  // The journey accepts a server-authenticated verify-full URL, not client keys.
  writeFileSync(hba,readFileSync(hba,'utf8').replaceAll(' clientcert=verify-full',''));
  execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'reload'],{stdio:'ignore'});
  url.searchParams.delete('sslcert');url.searchParams.delete('sslkey');
  const databaseUrl=url.href;
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1',
    '-addext','subjectAltName=IP:127.0.0.1','-keyout',join(scratch,'tls.key'),'-out',join(scratch,'tls.crt')],{stdio:'ignore'});
  chmodSync(join(scratch,'tls.key'),0o600);
  const ca=readFileSync(join(scratch,'tls.crt')),key=readFileSync(join(scratch,'tls.key'));
  copyFileSync(join(sds,'vendor/hosted-wallet-market/examples/cold-requester.mjs'),join(scratch,'cold-requester.mjs'));
  const lease=http.createServer();await new Promise(r=>lease.listen(0,'127.0.0.1',r));
  const port=lease.address().port;await new Promise(r=>lease.close(r));
  const origin=`https://127.0.0.1:${port}`,tenant='root425-real',earnedSchema='root425_selected_work';
  const env={CONTRIBUTOR_JOURNEY_MODE:'staging',CONTRIBUTOR_JOURNEY_INSTALLED:'1',CONTRIBUTOR_JOURNEY_TRUST_PROXY:'0',
    CONTRIBUTOR_JOURNEY_DATABASE_URL:databaseUrl,CONTRIBUTOR_JOURNEY_OWNER_TOKEN:randomBytes(18).toString('hex'),
    CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:randomBytes(18).toString('hex'),CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:origin,
    CONTRIBUTOR_JOURNEY_REPLAY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:randomBytes(32).toString('hex'),
    CONTRIBUTOR_JOURNEY_CURSOR_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:'[]',
    CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX:'10000',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0'};
  const rpc=http.createServer(async(req,res)=>{
    let text='';for await(const part of req)text+=part;
    const body=JSON.parse(text),result=body.method==='eth_chainId'?'0x2105':body.method==='eth_call'?'0x'+(6n).toString(16).padStart(64,'0'):'0x10';
    res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
  });await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
  let app,server,db,requester,contributor,taskId;
  const postCounts=new Map(),faults=new Map();
  const file=name=>join(scratch,name+'.json'),secret=name=>JSON.parse(readFileSync(file(name),'utf8'));
  const req=(path,{body,headers={},caValue=ca}={})=>new Promise((resolveReq,reject)=>{
    const data=body===undefined?null:JSON.stringify(body);
    const request=https.request(origin+prefix+path,{method:data?'POST':'GET',ca:caValue,
      headers:{'x-ae-wire-version':'c0-1',...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...headers}},res=>{
      let text='';res.on('data',part=>text+=part);res.on('end',()=>resolveReq({status:res.statusCode,body:JSON.parse(text),headers:res.headers}));
    });request.on('error',reject);request.setTimeout(20000,()=>request.destroy());request.end(data);
  });
  const cli=(command,args=[],requestOrigin=origin)=>new Promise(resolveRun=>execFile(process.execPath,['cold-requester.mjs',command,'--origin',requestOrigin,
    '--ca-file',join(scratch,'tls.crt'),...args],{cwd:scratch,encoding:'utf8',timeout:30000},(error,stdout,stderr)=>{
      let value;try{value=JSON.parse(stdout);}catch{}
      resolveRun({exit:error?.code??0,value,stdout,stderr});
    }));
  const accountArgs=(name,role)=>['--secret-file',file(name),'--display-name','Receiver '+name,'--role',role];
  const auth=(value,key='root425-operation')=>({origin,cookie:value.cookie,'x-cj-csrf':value.csrf,'idempotency-key':key});
  const count=async table=>(await db.query(`SELECT count(*)::int n FROM "${earnedSchema}".${table}`)).rows[0].n;
  async function closeMount(){if(server)await new Promise(r=>server.close(r));server=null;await app?.get('hostedWalletMarket')?.close();await app?.get('neoContributorJourney')?.close();app=null;}
  try {
    const journey=await import('../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js');
    await journey.prepareJourneyDeployment({env,enroll:false});
    db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query('SET search_path TO cj227_earned_work');
    await (await import('../../vendor/hosted-wallet-market/src/migrate.mjs')).applyAdditiveSchema(db);
    await (await import('../../vendor/hosted-wallet-market/src/seed.mjs')).seedStaging(db);
    const preserved=(await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows;
    const tls=(await db.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];
    assert.equal(tls.ssl,true);assert.match(tls.version,/TLSv1\.[23]/);
    // Choose the nondefault canonical schema before first wallet installation, without changing any installed binding.
    await db.query('ALTER SCHEMA cj227_earned_work RENAME TO root425_selected_work');
    await db.query('SET search_path TO root425_selected_work');env.CONTRIBUTOR_JOURNEY_MODE='disabled';
    // Refresh the schema-bound @010 function after the disposable schema rename.
    await (await import('../../vendor/hosted-wallet-market/src/migrate.mjs')).applyAdditiveSchema(db,{earnedSchema});
    const {createSdsApp}=await import('../app.js');
    const doc={schema:'pilot.machine-market.capability.v1',profile:'machine-market',origin,tenant,sourceSha256:installedSourceSha256(),
      hostSha256:hostSourceSha256(sds),discovery:'qualified-source',money:'unfunded',networkSource:versionedSource('eip155:8453')};
    async function boot(machineProfile,extra={}) {
      app=createSdsApp({hostedWalletMarket:{mode:'private',label:'PRIVATE',chain:'eip155:8453',payments:'off',publicReads:'0',fundedTasks:'off',humanAssets:'off',
        tls:'verified-edge',origin,tenant,earnedSchema,schemaName:'hosted_wallet_market',databaseUrl,rpcUrl:`http://127.0.0.1:${rpc.address().port}`,
        feeRecipient:'0x'+'1'.repeat(40),settlementToken:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',replayKey:env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
        ownerToken:env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN,machineProfile,env,...extra},neomorphicContributorJourney:{env},
        neomorphicOpportunity:{env:{}},correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}});
      await app.get('hostedWalletMarket').opened;await app.get('neoContributorJourney').ensure();
      server=https.createServer({key,cert:ca},(request,response)=>{
        const path=new URL(request.url,origin).pathname.slice(prefix.length);
        if(request.method==='POST')postCounts.set(path,(postCounts.get(path)||0)+1);
        const fault=faults.get(path);
        if(fault){faults.delete(path);const end=response.end.bind(response),head=response.writeHead.bind(response);
          response.writeHead=function(status,headers){
            if(status===200&&fault==='legacy-profile'){const {'content-length':ignored,...rest}=headers;return head(status,rest);}
            if(status===200&&fault!=='lost')headers={...headers,'x-private-observation':'private-header-marker','content-length':
              fault==='malformed'?Buffer.byteLength('not-json private-response-marker'):fault==='shape'?Buffer.byteLength('{"ok":true,"value":{"result":{"state":"unfunded_interest"}}}'):fault==='truncated'?147:0};
            return head(status,headers);
          };
          response.end=function(body){
          if(response.statusCode!==200)return end(body);
          if(fault==='lost'){response.destroy();return response;}
          const legacyProfile=fault==='legacy-profile'?JSON.parse(body):null;if(legacyProfile)delete legacyProfile.value.mutationReceipts;
          const bytes=legacyProfile?Buffer.from(JSON.stringify(legacyProfile)):fault==='malformed'?Buffer.from('not-json private-response-marker'):
            fault==='shape'?Buffer.from('{"ok":true,"value":{"result":{"state":"unfunded_interest"}}}'):
            fault==='truncated'?Buffer.from(String(body).slice(0,47)):Buffer.alloc(0);
          if(fault==='truncated'){response.write(bytes);setTimeout(()=>response.destroy(),20);return response;}
          return end(bytes);
        };}

        app(request,response);
      });await new Promise(r=>server.listen(port,'127.0.0.1',r));
    }

    await boot('source-bound:'+canonicalMachineProfile(doc));
    assert.equal((await cli('signup',accountArgs('requester','requester'))).exit,0);requester=secret('requester');
    assert.equal((await cli('signup',accountArgs('contributor','contributor'))).exit,0);contributor=secret('contributor');
    assert.equal((await cli('signup',accountArgs('other','contributor'))).exit,0);
    const postBody={title:'A public dependency example',summary:'Interest only; no commission.',criteria:['public-example'],payableKinds:['usable']};
    const postRaw=async op=>req('/v1/market/post',{body:postBody,headers:auth(requester,op)});
    const readback=(actor,action,input,op)=>req('/v1/market/readback',{body:{action,input},headers:auth(actor,op)});
    const base=await postRaw('root425-base-post');taskId=base.body.value.result.taskId;
    const interestBody={taskId,note:'Original exact note'};
    const original=await req('/v1/market/interest',{body:interestBody,headers:auth(contributor,'root425-original-interest')});
    const notes=async id=>(await db.query('SELECT note FROM ae14_market_interests WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3',[tenant,id,contributor.accountId])).rows;
    const transitions=async()=> (await db.query("SELECT count(*)::int n FROM ae14_market_measures WHERE kind='transition'")).rows[0].n;
    await t.test('ordinary client refuses an older profile before sending any business mutation',async()=>{
      const posts=postCounts.get('/v1/market/post');faults.set('/v1/market/profile','legacy-profile');
      const response=await cli('post',['--secret-file',file('requester'),'--title',postBody.title,'--summary',postBody.summary,'--criterion','public-example']);
      assert.equal(response.exit,2);assert.equal(response.value.code,'mutation_receipts_unavailable');
      assert.equal(postCounts.get('/v1/market/post'),posts);assert.equal(secret('requester').operations.post,undefined);
    });
    await t.test('new post and interest return exact actor/action/body/task bound receipts',async()=>{
      for(const [action,body,response,actor,op] of [['post',postBody,base,requester,'root425-base-post'],['interest',interestBody,original,contributor,'root425-original-interest']]){
        const receipt=response.body.value.result.receipt;assert.ok(receipt);
        assert.equal(receipt.action,action);assert.equal(receipt.actorId,actor.accountId);assert.equal(receipt.operationId,op);
        assert.equal(receipt.taskId,taskId);assert.equal(receipt.tenantId,tenant);assert.equal(receipt.evidence,'atomic_operation');
        assert.equal(receipt.originalBodyRecorded,true);
      }
    });
    await t.test('changed same-key interest is refused before it can replace the stored note',async()=>{
      const changed=await req('/v1/market/interest',{body:{...interestBody,note:'Changed body must not land'},headers:auth(contributor,'root425-original-interest')});
      assert.equal(changed.status,409);assert.equal(changed.body.code,'operation_conflict');
      assert.deepEqual(await notes(taskId),[{note:interestBody.note}]);
    });
    // Reset only the old implementation's test defect so following cases are independent.
    await db.query('UPDATE ae14_market_interests SET note=$4 WHERE tenant_id=$1 AND task_id=$2 AND actor_id=$3',[tenant,taskId,contributor.accountId,interestBody.note]);
    await t.test('contributor-only readback rejects wrong principal/action/body/key and absent operation',async()=>{
      const before=await transitions();
      const good=await readback(contributor,'interest',interestBody,'root425-original-interest');assert.equal(good.status,200);
      assert.deepEqual(good.body.value.result,original.body.value.result);
      for(const [actor,action,input,op] of [
        [secret('other'),'interest',interestBody,'root425-original-interest'],[requester,'interest',interestBody,'root425-original-interest'],
        [contributor,'post',postBody,'root425-original-interest'],[contributor,'interest',{...interestBody,note:'different'},'root425-original-interest'],
        [contributor,'interest',{...interestBody,taskId:'market-'+'a'.repeat(64)},'root425-original-interest'],
        [contributor,'interest',interestBody,'root425-absent-key']])assert.notEqual((await readback(actor,action,input,op)).status,200);
      const noCsrf=auth(contributor,'root425-original-interest');delete noCsrf['x-cj-csrf'];
      assert.equal((await req('/v1/market/readback',{body:{action:'interest',input:interestBody},headers:noCsrf})).body.code,'csrf_required');
      assert.equal(await transitions(),before);
      assert.equal((await readback(contributor,'interest',interestBody,'root425-absent-key')).status,404);
      const secondTask=(await postRaw('root425-key-other-task')).body.value.result.taskId;
      const changedTask=await req('/v1/market/interest',{body:{taskId:secondTask,note:interestBody.note},headers:auth(contributor,'root425-original-interest')});
      assert.equal(changedTask.status,409);assert.deepEqual(await notes(secondTask),[]);
    });
    await t.test('effect, transition and durable receipt roll back together on transition failure',async()=>{
      const rollbackTask=(await postRaw('root425-rollback-post')).body.value.result.taskId;
      await db.query("CREATE FUNCTION fail_cold_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'operationId' LIKE 'root425-fail-%' THEN RAISE EXCEPTION 'fixture transition refused'; END IF; RETURN NEW; END $$");
      await db.query('CREATE TRIGGER fail_cold_transition BEFORE INSERT ON ae14_market_measures FOR EACH ROW EXECUTE FUNCTION fail_cold_transition()');
      try{
        const before=await count('ae14_market_tasks');
        assert.notEqual((await postRaw('root425-fail-post')).status,200);
        assert.equal(await count('ae14_market_tasks'),before);
        assert.notEqual((await req('/v1/market/interest',{body:{taskId:rollbackTask,note:'Cannot survive failed transaction'},headers:auth(contributor,'root425-fail-interest')})).status,200);
        assert.deepEqual(await notes(rollbackTask),[]);
        assert.equal((await db.query("SELECT count(*)::int n FROM earned_work_idempotency WHERE scope='hosted-machine-cold-v1' AND response_json->'receipt'->>'operationId' LIKE 'root425-fail-%'")).rows[0].n,0);
      }finally{await db.query('DROP TRIGGER fail_cold_transition ON ae14_market_measures');await db.query('DROP FUNCTION fail_cold_transition()');}
    });
    for(const action of ['post','interest'])for(const fault of ['lost','empty','malformed','shape','truncated'])await t.test(`${action} committed with ${fault} response recovers via readback, no second business POST`,async()=>{
      const name=action+'-'+fault, actor=action==='post'?'requester':'contributor';
      // Isolate each operation file while preserving the original authenticated actor.
      writeFileSync(file(name),readFileSync(file(actor)),{mode:0o600});
      const value=secret(name);delete value.operations[action];writeFileSync(file(name),JSON.stringify(value));
      const id=action==='interest'?(await postRaw('root425-task-'+fault)).body.value.result.taskId:null;
      const route='/v1/market/'+action,before=postCounts.get(route)||0,rowsBefore=await count(action==='post'?'ae14_market_tasks':'ae14_market_interests');
      const args=['--secret-file',file(name),...(action==='post'?['--title',postBody.title,'--summary',postBody.summary,'--criterion','public-example']:['--task-id',id,'--note','One operation '+fault])];
      faults.set(route,fault);const lost=await cli(action,args),stored=secret(name).operations[action];
      assert.equal(lost.exit,2);assert.equal(lost.value.code,'unknown_outcome');assert.equal(lost.value.nextAction,'readback');
      assert.equal(stored.state,'unknown');assert.ok(stored.observations?.length);assert.equal(statSync(file(name)).mode&0o777,0o600);
      assert.equal(lost.stdout.includes('private-response-marker'),false);assert.equal(lost.stdout.includes('private-header-marker'),false);
      const originalObservation=JSON.stringify(stored.observations[0]);
      if(fault==='truncated'){await closeMount();await boot('source-bound:'+canonicalMachineProfile(doc));}
      if(fault==='malformed')assert.equal(Buffer.from(stored.observations[0].bodyBase64,'base64').toString(),'not-json private-response-marker');
      if(fault==='truncated'){assert.equal(stored.observations[0].status,200);assert.equal(stored.observations[0].complete,false);}
      const again=await cli(action,args);assert.notEqual(again.exit,0);assert.equal(postCounts.get(route),before+1);
      faults.set('/v1/market/readback','truncated');const lostRead=await cli('readback',['--secret-file',file(name),'--operation',action]);
      assert.equal(lostRead.exit,2);assert.equal(secret(name).operations[action].state,'unknown');
      const received=await cli('readback',['--secret-file',file(name),'--operation',action]);assert.equal(received.exit,0);
      const after=secret(name).operations[action];assert.equal(after.state,'received');assert.equal(after.idempotencyKey,stored.idempotencyKey);
      assert.deepEqual(after.body,stored.body);assert.equal(JSON.stringify(after.observations[0]),originalObservation);
      assert.equal(postCounts.get(route),before+1);assert.equal(await count(action==='post'?'ae14_market_tasks':'ae14_market_interests'),rowsBefore+1);
      const events=await db.query("SELECT payload FROM ae14_market_measures WHERE kind='transition' AND payload->>'operationId'=$1",[stored.idempotencyKey]);assert.equal(events.rows.length,1);
    });
    await t.test('cold app restart preserves the identical stored operation receipt and financial/private gates',async()=>{
      const before=await transitions();await closeMount();await boot('source-bound:'+canonicalMachineProfile(doc));
      const response=await readback(contributor,'interest',interestBody,'root425-original-interest');assert.equal(response.status,200);assert.deepEqual(response.body.value.result,original.body.value.result);
      const replay=await req('/v1/market/interest',{body:interestBody,headers:auth(contributor,'root425-original-interest')});assert.equal(replay.status,200);assert.deepEqual(replay.body.value.result,original.body.value.result);
      assert.equal(await transitions(),before);assert.equal((await req('/v1/market/profile')).body.value.signerAuthority,false);
      assert.notEqual((await req('/v1/market/fund',{body:{taskId,quoteDigest:'unfunded',proofId:'unfunded'},headers:auth(requester)})).status,200);
      assert.equal(await count('ae14_market_funding'),0);assert.equal(feeAt('10000'),'500');
      assert.deepEqual((await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows,preserved);
    });
    await t.test('pre-receipt legacy transition is recovered honestly without replay or rewriting history',async()=>{
      const id=(await postRaw('root425-legacy-task')).body.value.result.taskId,op='root425-legacy-interest',note='Existing committed note';
      const {digest}=await import('../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js');
      await db.query('INSERT INTO ae14_market_interests(tenant_id,task_id,actor_id,note) VALUES($1,$2,$3,$4)',[tenant,id,contributor.accountId,note]);
      const payload={action:'interest',verification:'server_observed',source:'hosted-machine-market',operationId:op,moneyProvenance:'unavailable',acquisition:'unknown'};
      await db.query("INSERT INTO ae14_market_measures(tenant_id,task_id,kind,event_id,actor_id,payload) VALUES($1,$2,'transition',$3,$4,$5)",[tenant,id,digest({actor:contributor.accountId,action:'interest',operationId:op}),contributor.accountId,payload]);
      const legacy=secret('contributor');legacy.operations.interest={idempotencyKey:op,body:{taskId:id,note}};delete legacy.marketBinding;
      writeFileSync(file('legacy'),JSON.stringify(legacy),{mode:0o600});
      const before=postCounts.get('/v1/market/interest');const receipt=await cli('readback',['--secret-file',file('legacy'),'--operation','interest']);assert.equal(receipt.exit,0);
      assert.equal(postCounts.get('/v1/market/interest'),before);const saved=secret('legacy').operations.interest.receipt;
      assert.equal(saved.evidence,'legacy_transition_and_current_effect');assert.equal(saved.originalBodyRecorded,false);
      assert.equal((await readback(contributor,'interest',{taskId:id,note:'not current note'},op)).status,409);
      const changed=await req('/v1/market/interest',{body:{taskId:id,note:'must not land'},headers:auth(contributor,op)});assert.equal(changed.status,409);
      assert.deepEqual(await notes(id),[{note}]);
      assert.equal((await db.query("SELECT count(*)::int n FROM earned_work_idempotency WHERE scope='hosted-machine-cold-v1' AND response_json->'receipt'->>'operationId'=$1",[op])).rows[0].n,0);
    });
    await t.test('legacy post readback preserves historical cohort and refuses altered body and mutation',async()=>{
      const {digest}=await import('../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js');
      const op='root425-legacy-post',a={tenantId:tenant,actorId:requester.accountId};
      const id='market-'+digest({actor:a,action:'post',id:op}),spec={...postBody,slotLimit:1,milestoneLimit:1,cohort:'owner_qa'};
      await db.query('INSERT INTO ae14_market_tasks(tenant_id,id,requester_id,spec,request_digest) VALUES($1,$2,$3,$4,$5)',[tenant,id,requester.accountId,spec,digest(spec)]);
      const payload={action:'post',verification:'server_observed',source:'hosted-machine-market',operationId:op,moneyProvenance:'unavailable',acquisition:'unknown'};
      await db.query("INSERT INTO ae14_market_measures(tenant_id,task_id,kind,event_id,actor_id,payload) VALUES($1,$2,'transition',$3,$4,$5)",[tenant,id,digest({actor:requester.accountId,action:'post',operationId:op}),requester.accountId,payload]);
      const good=await readback(requester,'post',postBody,op);assert.equal(good.status,200);
      assert.equal(good.body.value.result.spec.cohort,'owner_qa');assert.equal(good.body.value.result.receipt.originalBodyRecorded,false);
      await closeMount();await boot('source-bound:'+canonicalMachineProfile(doc));
      assert.deepEqual((await readback(requester,'post',postBody,op)).body,good.body);
      assert.equal((await readback(requester,'post',{...postBody,title:'Changed'},op)).status,409);
      assert.equal((await postRaw(op)).body.code,'legacy_operation_readback_required');
      assert.equal(base.body.value.result.spec.cohort,'unknown');
      assert.equal(readFileSync(join(sds,'vendor/hosted-wallet-market/runtime/agent-economy-market/src/market.mjs'),'utf8').includes('acc_8cY03lc065K9iIpk'),false);
    });
    await t.test('the configured schema owns receipt writes and readback without a default-schema fallback',async()=>{
      const recovered=await readback(contributor,'interest',interestBody,'root425-original-interest');assert.equal(recovered.status,200);
      assert.deepEqual(recovered.body.value.result,original.body.value.result);
      const posted=await cli('post',['--secret-file',file('requester'),'--title',postBody.title,'--summary',postBody.summary,'--criterion','public-example']);assert.equal(posted.exit,0);
      assert.equal((await cli('readback',['--secret-file',file('requester'),'--operation','post'])).exit,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.schemata WHERE schema_name='cj227_earned_work'")).rows[0].n,0);
      assert.ok((await db.query("SELECT count(*)::int n FROM root425_selected_work.earned_work_idempotency WHERE scope='hosted-machine-cold-v1'")).rows[0].n>0);
      assert.deepEqual((await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows,preserved);
    });
    await t.test('wrong tenant and a closed capability cannot read an operation from the old tenant',async()=>{
      await closeMount();await assert.rejects(()=>boot('source-bound:'+canonicalMachineProfile({...doc,tenant:'root425-other'}),{tenant:'root425-other'}),/tenant_refused/);
      await closeMount();await boot('');assert.notEqual((await readback(contributor,'interest',interestBody,'root425-original-interest')).status,200);
    });
  }finally{await closeMount();await db?.end();await new Promise(r=>rpc.close(r));await cluster.stop();rmSync(scratch,{recursive:true,force:true});}
});
