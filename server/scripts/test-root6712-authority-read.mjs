// Real createSdsApp composition, frozen Neo runtime, loopback HTTPS + verify-full PG.
// Probe records fixed operation labels and monotonic durations, never SQL or inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';

const root=resolve(import.meta.dirname,'../..'),prefix='/api/neomorphic-contributor-journey';
const hash=v=>createHash('sha256').update(v).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ok=value=>{assert.equal(value?.ok,true,JSON.stringify(value));return value.value;};
const expectedSetup=Number(process.env.ROOT6712_EXPECT_SETUP_CALLS??1);
const newRecord=()=>({start:performance.now(),events:[],queryCalls:0,logicalStatements:0,setupCalls:0,acquisitions:0,acquisitionFailures:0,releases:0,physicalConnections:0,acquireMs:0,acceptedSourceCalls:0,delayMs:0});

test('ROOT6712 same-phase read setup preserves actual composed authority, refusal and recovery',async t=>{
  const scratch=mkdtempSync(join(tmpdir(),'authority-'));
  let cluster,db,app,server,rpc;
  const als=new AsyncLocalStorage(),records=[];
  const original={query:pg.Client.prototype.query,connect:pg.Pool.prototype.connect,physical:pg.Client.prototype.connect};
  const probe={fault:null,hold:null};
  const labelOf=text=>/^BEGIN READ ONLY/.test(text)?'read_setup':/^BEGIN/.test(text)?'begin':/^SET(?: LOCAL)? /.test(text)?'settings':/^COMMIT/.test(text)?'commit':/^ROLLBACK/.test(text)?'rollback':/information_schema/.test(text)?'schema_lookup':/journey_account_sessions/.test(text)?'session':/consumer_enrollment|source_succession/.test(text)?'source_binding':/opportunity_claims/.test(text)?'claim':/journey_submission_drafts/.test(text)?'frozen_artifact':/correspondence/.test(text)?'decision_history':'authority_join';
  pg.Client.prototype.query=function(...args){
    const scope=als.getStore();if(!scope)return original.query.apply(this,args);
    const text=typeof args[0]==='string'?args[0]:args[0]?.text??'';
    const label=labelOf(text),event={stage:scope.stage,label,startMs:performance.now()-scope.record.start};
    scope.record.events.push(event);scope.record.queryCalls++;
    scope.record.logicalStatements+=text.split(';').filter(v=>v.trim()).length;
    if(scope.stage==='wallet'&&['read_setup','settings'].includes(label))scope.record.setupCalls++;
    if(typeof args.at(-1)==='function'){
      const callback=args.pop();
      args.push(function(...values){event.durationMs=performance.now()-scope.record.start-event.startMs;return callback.apply(this,values);});
      return original.query.apply(this,args);
    }
    return (async()=>{
      try{
        if(scope.record.delayMs)await sleep(scope.record.delayMs);
        if(probe.fault==='setup-sql-error'&&text.includes("SET LOCAL statement_timeout='2500ms'")){
          probe.fault=null;args[0]=text.replace("SET LOCAL statement_timeout='2500ms'",'SELECT 1/0');
        }
        if(probe.inspectSettings&&label==='session'){
          probe.inspectSettings=false;
          const settings=(await this.query("SELECT current_setting('transaction_read_only') ro, current_setting('search_path') path, current_setting('statement_timeout') timeout, current_setting('transaction_isolation') isolation")).rows[0];
          assert.deepEqual(settings,{ro:'on',path:'cj227_earned_work',timeout:'2500ms',isolation:'read committed'});
        }
        if(probe.fault===label){probe.fault=null;throw Object.assign(Error('synthetic'),{code:'08006'});}
        if(probe.hold?.label===label){const hold=probe.hold;probe.hold=null;hold.enter();await hold.wait;}
        return await original.query.apply(this,args);
      }finally{event.durationMs=performance.now()-scope.record.start-event.startMs;}
    })();
  };
  pg.Pool.prototype.connect=function(...args){
    const scope=als.getStore();if(!scope)return original.connect.apply(this,args);
    scope.record.acquisitions++;
    const started=performance.now();
    const acquired=client=>{
      scope.record.acquireMs+=performance.now()-started;
      const release=client.release;
      client.release=function(...values){scope.record.releases++;return release.apply(this,values);};
      return client;
    };
    if(typeof args.at(-1)==='function'){
      const callback=args.pop();
      args.push((error,client)=>error?callback(error):callback(null,acquired(client),client.release));
      return original.connect.apply(this,args);
    }
    return (async()=>{
      if(probe.fault==='acquire'){scope.record.acquisitionFailures++;probe.fault=null;throw Object.assign(Error('synthetic'),{code:'ECONNREFUSED'});}
      return acquired(await original.connect.apply(this,args));
    })();
  };
  pg.Client.prototype.connect=function(...args){
    const scope=als.getStore();if(scope)scope.record.physicalConnections++;
    return original.physical.apply(this,args);
  };
  try{
    cluster=await startCluster({username:'root6712'});
    const url=new URL(cluster.connectionString),database='contributor_journey_staging_root6712';
    db=new pg.Client({connectionString:cluster.connectionString});await db.connect();
    await db.query('CREATE DATABASE '+database);await db.end();
    writeFileSync(join(cluster.dataDir,'pg_hba.conf'),readFileSync(join(cluster.dataDir,'pg_hba.conf'),'utf8').replaceAll(' clientcert=verify-full',''));
    execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'reload'],{stdio:'ignore'});
    url.pathname='/'+database;url.searchParams.delete('sslcert');url.searchParams.delete('sslkey');
    const databaseUrl=url.href;
    db=new pg.Client({connectionString:databaseUrl});await db.connect();
    const {writeStagingCerts}=await import('../../vendor/hosted-wallet-market/src/tls.mjs');
    const tls=writeStagingCerts(join(scratch,'tls'));
    const lease=http.createServer();await new Promise(r=>lease.listen(0,'127.0.0.1',r));const port=lease.address().port;await new Promise(r=>lease.close(r));
    const origin=`https://127.0.0.1:${port}`;
    const env={CONTRIBUTOR_JOURNEY_MODE:'staging',CONTRIBUTOR_JOURNEY_INSTALLED:'1',CONTRIBUTOR_JOURNEY_TRUST_PROXY:'0',
      CONTRIBUTOR_DESK_MANAGED_ENABLED:'1',CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS:'["127.0.0.1"]',
      CONTRIBUTOR_JOURNEY_DATABASE_URL:databaseUrl,CONTRIBUTOR_JOURNEY_OWNER_TOKEN:randomBytes(18).toString('hex'),
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:randomBytes(18).toString('hex'),CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:origin,
      CONTRIBUTOR_JOURNEY_REPLAY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_CURSOR_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:JSON.stringify([{roundKey:'root6712-read',provenance:'test'}]),
      CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX:'10000',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0'};
    const journey=await import('../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js');
    const bootstrapEnv={...env,CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:'[]'};
    await journey.prepareJourneyDeployment({env:bootstrapEnv,enroll:false});
    const bootstrap=await journey.createJourneyRuntime({env:bootstrapEnv});
    let round;
    try {
      const fixture=JSON.parse(readFileSync(join(root,'vendor/neomorphic-opportunity/services/earned-work/fixtures/opportunity/agent-opportunity-221400-v1.round.json'),'utf8'));
      round=await bootstrap.installed.opportunity.createRound({...fixture,roundKey:'root6712-read',provenance:'test',productionAdmission:false,
        submissionDeadline:'2030-01-01T00:00:00.000Z',offers:fixture.offers.map(({ownerReservedSlots,...offer})=>offer)},'root6712-round');
    } finally { await bootstrap.close(); }
    await journey.prepareJourneyDeployment({env,enroll:false});
    await db.query('SET search_path TO cj227_earned_work');
    const {applyAdditiveSchema}=await import('../../vendor/hosted-wallet-market/src/migrate.mjs');await applyAdditiveSchema(db);
    const {seedStaging}=await import('../../vendor/hosted-wallet-market/src/seed.mjs');await seedStaging(db);
    rpc=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;const body=JSON.parse(text);
      res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0x2105':body.method==='eth_call'?'0x'+(6n).toString(16).padStart(64,'0'):'0x10'}));});
    await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
    const {createSdsApp}=await import('../app.js');
    const startup=newRecord();
    app=als.run({record:startup,stage:'startup'},()=>createSdsApp({hostedWalletMarket:{mode:'private',label:'PRIVATE',chain:'eip155:8453',payments:'off',publicReads:'0',fundedTasks:'off',humanAssets:'off',
      tls:'verified-edge',origin,tenant:'root6712-read',earnedSchema:'cj227_earned_work',schemaName:'hosted_wallet_market',databaseUrl,
      rpcUrl:`http://127.0.0.1:${rpc.address().port}`,feeRecipient:'0x'+'1'.repeat(40),settlementToken:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      replayKey:env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,ownerToken:env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN,env},neomorphicContributorJourney:{env},
      neomorphicOpportunity:{env:{}},correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}}));
await app.get('hostedWalletMarket').opened;await app.get('neoContributorJourney').ensure();
    const coldStartupMs=performance.now()-startup.start;
    // Startup includes migration scripts; only count read-path SQL statements.
    startup.logicalStatements=null;

    assert.equal(app.get('neoContributorJourney').state.status,'ready');
    const installed=app.get('neoContributorJourney').state.runtime.installed;
    const actualRead=installed.adapters.review.read.bind(installed.adapters.review);
    installed.adapters.review.read=target=>{
      const scope=als.getStore();if(!scope)return actualRead(target);
      scope.record.acceptedSourceCalls++;
      return als.run({...scope,stage:'accepted_source'},()=>actualRead(target));
    };
    server=https.createServer({key:tls.key,cert:tls.cert},(req,res)=>{
      const record=newRecord();
      if(req.url.startsWith(prefix+'/v1/review?')){
        record.delayMs=Number(req.headers['x-root6712-delay']??0);records.push(record);
        res.on('finish',()=>{record.status=res.statusCode;record.finishMs=performance.now()-record.start;});
        res.on('close',()=>{record.closeMs=performance.now()-record.start;});
        als.run({record,stage:'wallet'},()=>app(req,res));
      }else app(req,res);
    });await new Promise(r=>server.listen(port,'127.0.0.1',r));
    function open(path,{body,headers={}}={}){
      let request;const done=new Promise((resolveResponse,reject)=>{
        const data=body===undefined?undefined:JSON.stringify(body);
        request=https.request(origin+prefix+path,{method:data?'POST':'GET',ca:tls.ca,agent:false,headers:{'x-ae-wire-version':'c0-1',...headers,...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{})}},res=>{
          let raw='';res.on('data',part=>raw+=part);res.on('end',()=>resolveResponse({status:res.statusCode,body:JSON.parse(raw),raw,headers:res.headers}));res.on('error',reject);
        });request.on('error',reject);request.end(data);
      });return {done,get request(){return request;}};
    }
    const ask=(path,options)=>open(path,options).done;
    async function signup(role,name){
      const value=ok(await installed.accounts.signup({password:randomBytes(18).toString('hex'),displayName:name},
        {idempotencyKey:'root6712-signup-'+name,proof:randomBytes(32).toString('base64url')},{clientAddress:'127.0.0.1'}));
      return {cookie:'__Host-neo_contributor='+value.sessionToken,...value.account};
    }
    const requester=await signup('requester','Requester'),contributor=await signup('contributor','Contributor'),foreign=await signup('requester','Foreign');
    const context=account=>new Request(origin,{headers:{cookie:account.cookie}});
    const taskId='root6712-read:discovery-trace';
    await installed.db.enrollTask(taskId,requester.accountId);
    const roundId=(await db.query("SELECT id FROM opportunity_rounds WHERE round_key='root6712-read'")).rows[0].id;
    ok(await installed.accounts.resolveKernelPrincipal(contributor.cookie.split('=')[1],'opportunity:'+roundId));
    const claimed=ok(await installed.claims.claim(context(contributor),{taskId,termsId:'opportunity:test:root6712-read',termsVersion:round.body.termsVersion,acceptTerms:true},'root6712-claim'));
    const reservationId=claimed.reservationId??claimed.claim?.reservationId;
    assert.ok(reservationId,'real claim reservation');
    const actor=ok(await installed.accounts.authenticate(contributor.cookie.split('=')[1]));
    const evidence={kind:'discovery_trace',selfReport:{listingRef:null,encounterAt:null,encounterEstimated:false,route:'unknown',query:null,endpointOrFilter:null,upstreamPublicLink:null,snippetRef:null,pagesFollowed:[],decisionPoint:null,role:null,activeMinutes:null,confidence:'unknown',unknowns:['route']}};
    ok(await installed.submissions.save(actor,{reservationId,termsVersion:round.body.termsVersion,expectedRevision:0,evidence:{format:'json',body:JSON.stringify(evidence),sourceReferences:[]}},'root6712-save'));
    const submitted=ok(await installed.submissions.submit(actor,{reservationId,expectedRevision:1}));assert.equal(submitted.deliveryState,'submitted');
    const view=ok(await installed.review.read(context(requester),{taskId,reservationId}));
    const verdict=ok(await installed.review.verdict(context(requester),{source:view.source,outcome:'pass',idempotencyKey:'root6712-verdict'}));
    ok(await installed.review.decide(context(requester),{source:view.source,decision:'accept',verdictId:verdict.view.verdict.id,idempotencyKey:'root6712-accept'}));
    const path='/v1/review?taskId='+taskId+'&reservationId='+reservationId;
    async function read(account=requester,delayMs=0){return ask(path,{headers:{cookie:account.cookie,'x-root6712-delay':String(delayMs)}});}
    async function snapshot(){
      const tables=(await db.query(`SELECT table_schema,table_name FROM information_schema.tables
        WHERE table_schema IN ('cj227_earned_work','cj227_correspondence','hosted_wallet_market','hosted_wallet_market_guard')
        AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
      const result={};
      for(const {table_schema,table_name} of tables){
        const ident=v=>'"'+v.replaceAll('"','""')+'"';
        result[table_schema+'.'+table_name]=hash((await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text value FROM ${ident(table_schema)}.${ident(table_name)} t`)).rows[0].value);
      }
      return result;
    }
    const initialRows=await snapshot(),measured=[];
    async function drain(){
      for(let i=0;i<200;i++){await sleep(10);if(records.every(row=>row.events.every(e=>e.durationMs!==undefined)))return;}
      assert.fail('owned read failed to drain');
    }
    await t.test('actual installed accepted source: cold connection, fresh reads and delayed round trips agree',async()=>{
      // Let the normal 10s wallet/1s compiled idle eviction yield a cold read.
      await sleep(11000);
      let expected;
      for(const delayMs of [0,0,0,5,5,5]){
        const response=await read(requester,delayMs);assert.equal(response.status,200,JSON.stringify(response.body));
        const value=response.body.value;assert.equal(value.state,'accepted');assert.equal(value.entitled.artifact.body,JSON.stringify(evidence));assert.equal(value.entitled.disposition.projection,'owed');
        if(expected)assert.deepEqual(value,expected);else expected=value;
        const record=records.at(-1);assert.equal(record.setupCalls,expectedSetup);assert.equal(record.acceptedSourceCalls,1);assert.equal(record.acquisitions,record.releases);
        const projected=structuredClone(value);
        const substitute=value=>typeof value==='string'?(value===reservationId?'RESERVATION':value===projected.entitled.disposition.obligationId?'OBLIGATION':value===projected.entitled.verdict.id?'VERDICT':value):Array.isArray(value)?value.map(substitute):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v)])):value;
        measured.push({...record,start:undefined,outputSha256:hash(JSON.stringify(substitute(projected)))});
      }
    });
    await t.test('fresh action sees revoked session and restored authority',async()=>{
      const tokenHash=hash(requester.cookie.split('=')[1]);
      await db.query('UPDATE journey_account_sessions SET revoked_at=now() WHERE token_hash=$1',[tokenHash]);
      assert.equal((await read()).status,401);
      await db.query('UPDATE journey_account_sessions SET revoked_at=NULL WHERE token_hash=$1',[tokenHash]);
      assert.equal((await read()).status,200);
    });
    await t.test('foreign actor cannot read accepted report',async()=>{const r=await read(foreign);assert.equal(r.status,404);assert.equal(r.body.value,undefined);});
    await t.test('pool acquisition and query failure refuse; next fresh invocation recovers',async()=>{
      for(const fault of ['acquire','read_setup','session']){probe.fault=fault;assert.equal((await read()).status,503);assert.equal((await read()).status,200);}
    });
    await t.test('setup keeps read-only, local schema, timeout and isolation; partial SQL failure rolls back',async()=>{
      probe.inspectSettings=true;assert.equal((await read()).status,200);assert.equal(probe.inspectSettings,false);
      probe.fault='setup-sql-error';assert.equal((await read()).status,500);
      const failed=records.at(-1);assert.ok(failed.events.some(event=>event.label==='rollback'));
      probe.inspectSettings=true;assert.equal((await read()).status,200);assert.equal(probe.inspectSettings,false);
    });
    await t.test('changed terms, report bytes, obligation and principal refuse across fresh actions then recover',async()=>{
      const changes=[
        ["UPDATE opportunity_claims SET terms_version=$2 WHERE id=$1",[reservationId,'sha256:'+'f'.repeat(64)],[reservationId,round.body.termsVersion]],
        ["UPDATE journey_submission_drafts SET record=jsonb_set(record,'{frozen,content}',$2::jsonb) WHERE reservation_id=$1",[reservationId,JSON.stringify('changed report')],[reservationId,JSON.stringify(JSON.stringify(evidence))]],
        ["UPDATE opportunity_obligations SET reward_atomic=$2 WHERE claim_id=$1",[reservationId,'1'],[reservationId,String(fixtureReward())]],
      ];
      function fixtureReward(){return round.body.offers.find(v=>v.offerKey==='discovery-trace').rewardAtomic;}
      for(const [sql,changed,restored] of changes){
        if(sql.includes('journey_submission_drafts')||sql.includes('opportunity_obligations')){
          await db.query('BEGIN');
          try{await assert.rejects(db.query(sql,changed),error=>error.code==='P0001');}finally{await db.query('ROLLBACK');}
        }else{
          await db.query(sql,changed);
          try{const response=await read();assert.equal(response.status,409);assert.equal(response.body.value,undefined);}
          finally{await db.query(sql,restored);}
        }
        assert.equal((await read()).status,200);
      }
      const principal=(await db.query('SELECT contributor_token_id FROM opportunity_claims WHERE id=$1',[reservationId])).rows[0].contributor_token_id;
      await db.query('UPDATE earned_work_contributor_tokens SET revoked_at=now() WHERE id=$1',[principal]);
      try{assert.notEqual((await read()).status,200);}finally{await db.query('UPDATE earned_work_contributor_tokens SET revoked_at=NULL WHERE id=$1',[principal]);}
      assert.equal((await read()).status,200);
    });
    await t.test('concurrent revocation before authentication cannot produce a stale successful response',async()=>{
      let enter,release;
      const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
      probe.hold={label:'session',enter,wait};
      const pending=read();await entered;
      const tokenHash=hash(requester.cookie.split('=')[1]);
      try{await db.query('UPDATE journey_account_sessions SET revoked_at=now() WHERE token_hash=$1',[tokenHash]);release();assert.equal((await pending).status,401);}
      finally{release();await db.query('UPDATE journey_account_sessions SET revoked_at=NULL WHERE token_hash=$1',[tokenHash]);}
      assert.equal((await read()).status,200);
    });
    await t.test('disconnect during setup destroys only the owned read; next request re-acquires and succeeds',async()=>{
      let enter,release;
      const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
      probe.hold={label:'read_setup',enter,wait};
      const pending=open(path,{headers:{cookie:requester.cookie}});const outcome=pending.done.catch(()=>null);
      await entered;pending.request.destroy();await outcome;
      // Allow the server to observe the close before releasing the held query.
      for(let i=0;i<200&&!records.at(-1).releases;i++)await sleep(5);
      assert.equal(records.at(-1).releases,1);release();await drain();
      assert.equal((await read()).status,200);
    });
    await t.test('all accepted and refused reads preserve authoritative rows, response closure and released resources',async()=>{
      await drain();assert.deepEqual(await snapshot(),initialRows);
      for(const record of records){assert.equal(record.acquisitions,record.releases+record.acquisitionFailures);assert.ok(record.closeMs!==undefined);}
    });
    const actionCounts={positive:0,failure:0,recovery:0};
    records.forEach((row,i)=>{row.status??=null;actionCounts[row.status===200?(i&&records[i-1].status!==200?'recovery':'positive'):'failure']++;});
    assert.deepEqual(actionCounts,{positive:9,failure:10,recovery:9});
    const provenance={walletServerSha256:hash(readFileSync(join(root,'vendor/hosted-wallet-market/src/server.mjs'))),runtimeManifestSha256:hash(readFileSync(join(root,'vendor/neomorphic-contributor-journey/SOURCE.json'))),deskManifestSha256:hash(readFileSync(join(root,'vendor/neomorphic-contributor-desk/SOURCE.json'))),receiverSha256:hash(readFileSync(import.meta.filename))};
    const readActions=records.map(({start,events,...row})=>row);
    const preservedTableCount=Object.keys(initialRows).length;
    t.diagnostic(JSON.stringify({actionCounts,preservedTableCount,coldStartupMs,startup:{...startup,start:undefined,events:undefined},measured:measured.map(({events,...row})=>row)}));
    if(process.env.ROOT6712_EVIDENCE)writeFileSync(process.env.ROOT6712_EVIDENCE,JSON.stringify({schema:'root6712.synthetic-read.v1',expectedSetup,provenance,actionCounts,preservedTableCount,readActions,coldStartupMs,startup:{...startup,start:undefined},measured},null,2)+'\n');
  }finally{
    const failures=[];
    for(const close of [
      async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}},
      async()=>app?.get('hostedWalletMarket')?.close(),async()=>app?.get('neoContributorJourney')?.close(),
      async()=>db?.end(),async()=>{if(rpc)await new Promise(r=>rpc.close(r));},
      async()=>cluster?.stop(),async()=>rmSync(scratch,{recursive:true,force:true}),
    ])try{await close();}catch(error){failures.push(error);}
    pg.Client.prototype.query=original.query;pg.Pool.prototype.connect=original.connect;pg.Client.prototype.connect=original.physical;
    if(failures.length)throw new AggregateError(failures,'owned fixture cleanup failed');
  }
});
