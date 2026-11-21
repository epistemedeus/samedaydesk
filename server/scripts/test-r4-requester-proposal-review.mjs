// R4-J01 receiving on the installed createSdsApp / verified-TLS PG path.
// Only fixture setup is adapted from ROOT410; the cold client bytes are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';
import {installedSourceSha256,hostSourceSha256} from '../../vendor/hosted-wallet-market/src/native-debt.mjs';
import {canonicalMachineProfile} from '../../vendor/hosted-wallet-market/src/machine-profile-document.mjs';
import {versionedSource} from '../../vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/index.js';

const sds=resolve(import.meta.dirname,'../..'),prefix='/api/neomorphic-contributor-journey';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('R4-J01 requester proposal review on real HTTPS and verified-TLS PostgreSQL', async t=>{
  const cluster=await startCluster({username:'r4_proposals'}),scratch=mkdtempSync(join(tmpdir(),'r4-proposals-journey-'));
  // Include the Node test runner/CLI descendants and the owned PG daemon,
  // which pg_ctl detaches. Shared PG pages may be counted more than once.
  let fixturePeakKiB=0;
  function sampleRss(){
    const seen=new Set();
    function visit(pid){
      if(seen.has(pid))return;seen.add(pid);
      try{for(const child of readFileSync(`/proc/${pid}/task/${pid}/children`,'utf8').trim().split(/\s+/).filter(Boolean))visit(Number(child));}catch{}
    }
    visit(process.ppid);visit(cluster.pid);
    let total=0;for(const pid of seen){try{total+=Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`,'utf8'))?.[1]||0);}catch{}}
    fixturePeakKiB=Math.max(fixturePeakKiB,total);
  }
  const rssSampler=setInterval(sampleRss,50);rssSampler.unref();
  t.after(async()=>{clearInterval(rssSampler);sampleRss();await cluster.stop();rmSync(scratch,{recursive:true,force:true});
    t.diagnostic(`Owned fixture sampled peak summed RSS: ${fixturePeakKiB} KiB (Node runner/CLI plus disposable PG; excludes native controller).`);
    assert.ok(fixturePeakKiB<2097152);
  });
  const url=new URL(cluster.connectionString),hba=join(cluster.dataDir,'pg_hba.conf');
  const database='contributor_journey_staging_r4_proposals_'+randomBytes(3).toString('hex');
  const admin=new pg.Client({connectionString:cluster.connectionString});await admin.connect();
  try{await admin.query('CREATE DATABASE '+database);}finally{await admin.end();}url.pathname='/'+database;
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
  const origin=`https://127.0.0.1:${port}`,tenant='r4-proposals-real',earnedSchema='cj227_earned_work';
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
  const postCounts=new Map(),drop=new Set();
  const file=name=>join(scratch,name+'.json'),secret=name=>JSON.parse(readFileSync(file(name),'utf8'));
  const req=(path,{body,headers={},caValue=ca}={})=>new Promise((resolveReq,reject)=>{
    const data=body===undefined?null:JSON.stringify(body);
    const request=https.request(origin+prefix+path,{method:data?'POST':'GET',ca:caValue,
      headers:{'x-ae-wire-version':'c0-1',...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{}),...headers}},res=>{
      let text='';res.on('data',part=>text+=part);res.on('end',()=>resolveReq({status:res.statusCode,body:JSON.parse(text),raw:text,headers:res.headers}));
    });request.on('error',reject);request.setTimeout(20000,()=>request.destroy());request.end(data);
  });
  const cli=(command,args=[],requestOrigin=origin)=>new Promise(resolveRun=>execFile(process.execPath,['cold-requester.mjs',command,'--origin',requestOrigin,
    '--ca-file',join(scratch,'tls.crt'),...args],{cwd:scratch,encoding:'utf8',timeout:30000},(error,stdout,stderr)=>{
      let value;try{value=JSON.parse(stdout);}catch{}
      resolveRun({exit:error?.code??0,value,stdout,stderr});
    }));
  const accountArgs=(name,role)=>['--secret-file',file(name),'--display-name','Receiver '+name,'--role',role];
  const auth=(value,key='r4-proposals-operation')=>({origin,cookie:value.cookie,'x-cj-csrf':value.csrf,'idempotency-key':key});
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
        if(drop.delete(path))response.end=function(){response.destroy();return response;};
        app(request,response);
      });await new Promise(r=>server.listen(port,'127.0.0.1',r));
    }
    await boot('source-bound:'+canonicalMachineProfile(doc));
    const sourceClient=readFileSync(join(sds,'vendor/hosted-wallet-market/examples/cold-requester.mjs'));
    assert.deepEqual(readFileSync(join(scratch,'cold-requester.mjs')),sourceClient);
    const receipts={schema:'pilot.machine-market.cold-mutation-receipt.v1',actions:['post','interest'],readback:'/v1/market/readback'};
    assert.deepEqual((await req('/v1/market/profile')).body.value.mutationReceipts,receipts);
    assert.equal((await cli('signup',accountArgs('requester','requester'))).exit,0);
    requester=secret('requester');
    drop.add('/v1/market/post');
    assert.equal((await cli('post',['--secret-file',file('requester'),'--title','Proposal review fixture',
      '--summary','An unfunded disposable proposal-review task.','--criterion','example'])).exit,2);
    assert.equal((await cli('readback',['--secret-file',file('requester'),'--operation','post'])).exit,0);
    requester=secret('requester');taskId=requester.taskId;
    assert.equal((await cli('signup',accountArgs('contributor','contributor'))).exit,0);
    const originalNote='I can supply a dependency inventory and explain its omissions.';
    drop.add('/v1/market/interest');
    assert.equal((await cli('interest',['--secret-file',file('contributor'),'--task-id',taskId,'--note',originalNote])).exit,2);
    assert.equal((await cli('readback',['--secret-file',file('contributor'),'--operation','interest'])).exit,0);
    contributor=secret('contributor');
    const originalInterest=structuredClone(contributor.operations.interest);
    const originalReceipt=originalInterest.receipt;
    const oldRead=await req('/v1/market/read',{body:{taskId},headers:auth(requester)});
    assert.equal(oldRead.status,200);
    assert.equal(oldRead.body.value.result.measures.some(row=>row.actor_id===contributor.accountId&&row.payload.action==='interest'),true);
    assert.equal(oldRead.raw.includes(originalNote),false);

    // Hash every row of both authoritative schemas; no secrets or note bytes
    // leave this process. Every proposal read, including refusals, is compared.
    async function snapshot(){
      const tables=(await db.query(`SELECT table_schema,table_name FROM information_schema.tables
        WHERE table_schema IN ('cj227_earned_work','hosted_wallet_market','hosted_wallet_market_guard')
        AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
      const result={};
      for(const {table_schema,table_name} of tables){
        const quote=value=>'"'+value.replaceAll('"','""')+'"';
        const value=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text value
          FROM ${quote(table_schema)}.${quote(table_name)} t`)).rows[0].value;
        result[table_schema+'.'+table_name]=hash(value);
      }
      return result;
    }
    async function read(body={taskId},headers=auth(requester)){
      // A proposal reader needs no operation key and writes no transition.
      headers={...headers};delete headers['idempotency-key'];
      const before=await snapshot();
      const response=await req('/v1/market/interests',{body,headers});
      assert.deepEqual(await snapshot(),before);
      return response;
    }
    function result(response){assert.equal(response.status,200);return response.body.value.result;}
    function noNote(response,code,status=400){
      assert.equal(response.status,status);assert.equal(response.body.code,code);
      assert.equal(response.raw.includes(originalNote),false);assert.equal(response.body.value,undefined);
    }
    if(process.env.R4_EXPECT_BASELINE==='1'){
      await t.test('installed baseline exposes the actor/digest but cannot return the current note',async()=>{
        noNote(await read(),'not_found',404);
        assert.equal(oldRead.body.value.result.quote,null);
        assert.equal(oldRead.body.value.result.state,'unfunded_interest');
        t.diagnostic('Acceptance gap reproduced: POST /v1/market/interests = 404; existing task read has actor/digest only.');
      });
      return;
    }
    await t.test('requester reads the actual current note and stored identity without contributor credentials',async()=>{
      const response=await read(),value=result(response);
      assert.deepEqual(value,{taskId,items:[{taskId,contributorId:contributor.accountId,note:originalNote}],nextCursor:null});
      assert.match(response.headers['content-type'],/^application\/json/);
      assert.equal(response.headers['cache-control'],'no-store');
      assert.equal((await db.query('SELECT note FROM ae14_market_interests WHERE tenant_id=$1 AND task_id=$2',[tenant,taskId])).rows[0].note,originalNote);
      assert.equal((await cli('conflict-post',['--secret-file',file('requester')])).value.code,'operation_conflict');
    });
    await t.test('later interest updates current content without rewriting the original receipt',async()=>{
      const updated='Revised scope: supply the inventory plus a bounded limitations note.';
      assert.equal((await cli('interest',['--secret-file',file('contributor'),'--task-id',taskId,'--note',updated])).exit,0);
      contributor=secret('contributor');
      assert.equal(result(await read()).items[0].note,updated);
      const replay=await req('/v1/market/readback',{body:{action:'interest',input:originalInterest.body},
        headers:auth(contributor,originalInterest.idempotencyKey)});
      assert.equal(replay.status,200);assert.deepEqual(replay.body.value.result.receipt,originalReceipt);
      const conflict=await req('/v1/market/interest',{body:{taskId,note:'A changed body under the original key'},
        headers:auth(contributor,originalInterest.idempotencyKey)});
      assert.equal(conflict.status,409);assert.equal(conflict.body.code,'operation_conflict');
      assert.equal(result(await read()).items[0].note,updated);
    });
    let second,firstPage,secondPage,foreign;
    const hostile='<script>globalThis.proposalExecuted=true</script>\u0001\n\r\t"\\</script>\u2028🚀';
    await t.test('two contributors paginate deterministically; hostile proposal bytes stay exact JSON data',async()=>{
      assert.equal((await cli('signup',accountArgs('second','contributor'))).exit,0);second=secret('second');
      assert.equal((await cli('interest',['--secret-file',file('second'),'--task-id',taskId,'--note',hostile])).exit,0);
      firstPage=result(await read({taskId,limit:1}));assert.equal(firstPage.items.length,1);assert.ok(firstPage.nextCursor);
      secondPage=result(await read({taskId,limit:1,cursor:firstPage.nextCursor}));
      assert.equal(secondPage.items.length,1);assert.equal(secondPage.nextCursor,null);
      const items=[...firstPage.items,...secondPage.items];
      assert.deepEqual(items.map(row=>row.contributorId),[contributor.accountId,second.accountId].sort());
      assert.equal(items.find(row=>row.contributorId===second.accountId).note,hostile);
      assert.equal(globalThis.proposalExecuted,undefined);
      const logs=[],previousLog=console.log;
      const previousLimit=process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT;
      const previousExpiry=process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_EXPIRES;
      try{
        await closeMount();console.log=(...args)=>logs.push(args.map(String).join(' '));
        process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT='32';
        process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_EXPIRES=new Date(Date.now()+60000).toISOString();
        await boot('source-bound:'+canonicalMachineProfile(doc));
        assert.equal(result(await read()).items.find(row=>row.contributorId===second.accountId).note,hostile);
        await closeMount();
      }finally{
        console.log=previousLog;
        if(previousLimit===undefined)delete process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT;
        else process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT=previousLimit;
        if(previousExpiry===undefined)delete process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_EXPIRES;
        else process.env.HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_EXPIRES=previousExpiry;
      }
      assert.ok(logs.some(line=>line.includes('installed_response_completion')));
      assert.equal(logs.some(line=>line.includes('<script>')||line.includes(originalNote)),false);
      await boot('source-bound:'+canonicalMachineProfile(doc));
      assert.deepEqual(result(await read({taskId,limit:1})),firstPage);
      assert.deepEqual(result(await read()).items,items);
      assert.equal((await req('/v1/market/profile')).raw.includes(hostile),false);
      assert.equal((await req('/v1/market/read',{body:{taskId},headers:auth(requester)})).raw.includes(hostile),false);
      const measured=(await db.query('SELECT payload::text text FROM ae14_market_measures')).rows;
      assert.equal(measured.some(row=>row.text.includes('<script>')),false);
    });
    await t.test('foreign requester, contributor, anonymous, forged identity and missing CSRF/origin refuse',async()=>{
      assert.equal((await cli('signup',accountArgs('foreign','requester'))).exit,0);foreign=secret('foreign');
      noNote(await read({taskId},auth(secret('foreign'))),'forbidden',403);
      noNote(await read({taskId},auth(contributor)),'requester_required',403);
      noNote(await read({taskId},{}),'unauthenticated',401);
      noNote(await read({taskId,actorId:requester.accountId},auth(secret('foreign'))),'body_refused');
      noNote(await read({taskId,requesterId:requester.accountId}),'body_refused');
      const headers=auth(requester);delete headers['x-cj-csrf'];noNote(await read({taskId},headers),'csrf_required',401);
      noNote(await read({taskId},{...auth(requester),origin:'https://foreign.invalid'}),'origin_required',401);
    });
    await t.test('foreign tenant tasks and same-task IDs never cross the configured tenant',async()=>{
      const foreignTask='market-foreign-tenant';
      await db.query(`INSERT INTO ae14_market_tasks(tenant_id,id,requester_id,spec,request_digest)
        VALUES('foreign-tenant',$1,$3,'{}','fixture'),('foreign-tenant',$2,$3,'{}','fixture')`,[foreignTask,taskId,requester.accountId]);
      await db.query(`INSERT INTO ae14_market_interests VALUES('foreign-tenant',$1,$2,'foreign private proposal')`,[taskId,second.accountId]);
      noNote(await read({taskId:foreignTask}),'forbidden',403);
      assert.equal(JSON.stringify(result(await read())).includes('foreign private proposal'),false);
      noNote(await read({taskId,tenantId:'foreign-tenant'}),'body_refused');
      noNote(await read({taskId:'missing-task'}),'forbidden',403);
    });
    await t.test('malformed or cross-task cursor and invalid page sizes refuse without effects',async()=>{
      for(const limit of [0,51,-1,1.5,'1',null,1e9])noNote(await read({taskId,limit}),'page_refused');
      for(const cursor of [null,1,'!','a'.repeat(1025),firstPage.nextCursor+'=',Buffer.from('{}').toString('base64url')])
        noNote(await read({taskId,cursor}),'page_refused');
      assert.equal((await cli('post',['--secret-file',file('requester'),'--title','Empty proposal task',
        '--summary','No interest submitted.','--criterion','empty'])).exit,0);
      const emptyTask=secret('requester').taskId;
      assert.deepEqual(result(await read({taskId:emptyTask})),{taskId:emptyTask,items:[],nextCursor:null});
      noNote(await read({taskId:emptyTask,cursor:firstPage.nextCursor}),'page_refused');
      noNote(await read({taskId:null}),'body_refused');
    });
    await t.test('maximum stored note and page are bounded; oversized historical rows refuse rather than truncate',async()=>{
      const maxNote='🚀'.repeat(1024);
      assert.equal((await cli('interest',['--secret-file',file('second'),'--task-id',taskId,'--note',maxNote])).exit,0);
      assert.equal(result(await read()).items.find(row=>row.contributorId===second.accountId).note,maxNote);
      const before=await snapshot();
      const rejected=await req('/v1/market/interest',{body:{taskId,note:maxNote+'x'},headers:auth(second,'r4-oversized-note')});
      assert.equal(rejected.status,409);assert.deepEqual(await snapshot(),before);
      await db.query('UPDATE ae14_market_interests SET note=$1 WHERE tenant_id=$2 AND task_id=$3 AND actor_id=$4',
        ['x'.repeat(4097),tenant,taskId,second.accountId]);
      noNote(await read(),'proposal_note_refused',409);
      await db.query('UPDATE ae14_market_interests SET note=$1 WHERE tenant_id=$2 AND task_id=$3 AND actor_id=$4',[hostile,tenant,taskId,second.accountId]);
      // Additional authoritative fixture rows test the hard 50-row cap, not a
      // second client or a synthetic response. No fixture account is enrolled.
      for(let n=0;n<51;n++)await db.query('INSERT INTO ae14_market_interests VALUES($1,$2,$3,$4)',[tenant,taskId,'fixture-'+String(n).padStart(3,'0'),'x'.repeat(4096)]);
      const response=await read({taskId,limit:50}),page=result(response);
      assert.equal(page.items.length,50);assert.ok(page.nextCursor);assert.ok(Buffer.byteLength(response.raw)<260000);
      assert.equal(result(await read({taskId,limit:50,cursor:page.nextCursor})).items.length,3);
      await db.query("DELETE FROM ae14_market_interests WHERE tenant_id=$1 AND task_id=$2 AND actor_id LIKE 'fixture-%'",[tenant,taskId]);
    });
    await t.test('current account/task membership, role, expiry and explicit session revocation are enforced',async()=>{
      await db.query('UPDATE ae14_market_tasks SET requester_id=$1 WHERE tenant_id=$2 AND id=$3',[foreign.accountId,tenant,taskId]);
      noNote(await read(),'forbidden',403);
      await db.query('UPDATE ae14_market_tasks SET requester_id=$1 WHERE tenant_id=$2 AND id=$3',[requester.accountId,tenant,taskId]);
      assert.equal(result(await read()).items.length,2);
      await db.query('DELETE FROM hosted_wallet_market.roles WHERE account_id=$1',[requester.accountId]);
      noNote(await read(),'unauthenticated',401);
      await db.query("INSERT INTO hosted_wallet_market.roles VALUES($1,'contributor')",[requester.accountId]);
      noNote(await read(),'requester_required',403);
      await db.query("UPDATE hosted_wallet_market.roles SET role='requester' WHERE account_id=$1",[requester.accountId]);
      const tokenHash=hash(requester.cookie.slice(requester.cookie.indexOf('=')+1));
      const saved=(await db.query('SELECT expires_at FROM journey_account_sessions WHERE token_hash=$1',[tokenHash])).rows[0];
      assert.ok(saved);
      await db.query("UPDATE journey_account_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[tokenHash]);
      noNote(await read(),'revoked',401);
      await db.query('UPDATE journey_account_sessions SET expires_at=$2,revoked_at=now() WHERE token_hash=$1',[tokenHash,saved.expires_at]);
      noNote(await read(),'revoked',401);
      assert.equal((await cli('login',['--secret-file',file('requester')])).exit,0);requester=secret('requester');
      assert.equal(result(await read()).items.length,2);
    });
    await t.test('lost read response retries with identical data and no new receipt or transition',async()=>{
      const expected=result(await read()),before=await snapshot();
      drop.add('/v1/market/interests');await assert.rejects(()=>read(),/socket hang up/);
      assert.deepEqual(await snapshot(),before);
      assert.deepEqual(result(await read()),expected);
    });
    await t.test('restart, login and account recovery retain current notes and task without resubmitting interest',async()=>{
      const expected=result(await read()),before=await snapshot();
      const interestPosts=postCounts.get('/v1/market/interest');
      await closeMount();await boot('source-bound:'+canonicalMachineProfile(doc));
      assert.deepEqual(await snapshot(),before);assert.deepEqual(result(await read()),expected);
      const stale=structuredClone(requester);
      assert.equal((await cli('recover',['--secret-file',file('requester')])).exit,0);requester=secret('requester');
      assert.equal(requester.accountId,stale.accountId);
      noNote(await read({taskId},auth(stale)),'unauthenticated',401);
      assert.deepEqual(result(await read()),expected);
      assert.equal((await cli('login',['--secret-file',file('requester')])).exit,0);requester=secret('requester');
      assert.deepEqual(result(await read()),expected);assert.equal(postCounts.get('/v1/market/interest'),interestPosts);
      assert.deepEqual((await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows,preserved);
      assert.equal(await count('ae14_market_quotes'),0);assert.equal(await count('ae14_market_assents'),0);assert.equal(await count('ae14_market_funding'),0);
      assert.deepEqual(readFileSync(join(sds,'vendor/hosted-wallet-market/examples/cold-requester.mjs')),sourceClient);
      t.diagnostic('Every proposal HTTP read preserved all row hashes across the authoritative schemas.');
    });
  }finally{await closeMount();await db?.end();await new Promise(r=>rpc.close(r));}
});
