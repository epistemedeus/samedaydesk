// Independently authored receiver. Only cluster lifecycle is reused from ROOT404.
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
test('ROOT410 independent real createSdsApp receiving over verified TLS and disposable PostgreSQL', async t=>{
  const cluster=await startCluster(),scratch=mkdtempSync(join(tmpdir(),'root410-journey-'));
  const url=new URL(cluster.connectionString),hba=join(cluster.dataDir,'pg_hba.conf');
  const database='contributor_journey_staging_root410_'+randomBytes(3).toString('hex');
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
  const origin=`https://127.0.0.1:${port}`,tenant='root410-real',earnedSchema='cj227_earned_work';
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
      let text='';res.on('data',part=>text+=part);res.on('end',()=>resolveReq({status:res.statusCode,body:JSON.parse(text),headers:res.headers}));
    });request.on('error',reject);request.setTimeout(20000,()=>request.destroy());request.end(data);
  });
  const cli=(command,args=[],requestOrigin=origin)=>new Promise(resolveRun=>execFile(process.execPath,['cold-requester.mjs',command,'--origin',requestOrigin,
    '--ca-file',join(scratch,'tls.crt'),...args],{cwd:scratch,encoding:'utf8',timeout:30000},(error,stdout,stderr)=>{
      let value;try{value=JSON.parse(stdout);}catch{}
      resolveRun({exit:error?.code??0,value,stdout,stderr});
    }));
  const accountArgs=(name,role)=>['--secret-file',file(name),'--display-name','Receiver '+name,'--role',role];
  const auth=(value,key='root410-operation')=>({origin,cookie:value.cookie,'x-cj-csrf':value.csrf,'idempotency-key':key});
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
    await t.test('closed default remains mounted; wrong wire and malformed capability refuse',async()=>{
      await boot('');assert.equal((await req('/v1/market/profile')).status,404);assert.equal((await req('/v1/market/discover?limit=1')).status,404);
      assert.equal((await req('/v1/market/profile',{headers:{'x-ae-wire-version':'1'}})).status,409);await closeMount();
      await assert.rejects(()=>boot('1'),/machine_profile_refused/);await closeMount();
      await assert.rejects(()=>boot('source-bound:'+canonicalMachineProfile(doc),{machineAuthority:{networkClass:'sandbox'}}),/machine_authority_refused/);await closeMount();
    });
    await boot('source-bound:'+canonicalMachineProfile(doc));
    await t.test('verified HTTPS exposes unfunded discovery without money authority',async()=>{
      await assert.rejects(()=>req('/v1/market/profile',{caValue:Buffer.alloc(0)}),/self-signed certificate/);
      const profile=await req('/v1/market/profile');assert.equal(profile.status,200);assert.equal(profile.body.value.capability.money,'unfunded');
      const health=(await req('/healthz')).body.value;
      assert.equal(health.publicEnabled,false);assert.equal(health.paymentsActivation,false);assert.equal(health.fundedTasks,'off');assert.equal(health.humanAssets,'off');
      assert.equal(health.machineCapability.signerAuthority,false);assert.equal(health.machineCapability.publicMoney,false);
    });
    await t.test('lost signup response retains the proof; stored readback performs no second signup POST',async()=>{
      const before=await count('journey_account_operations'),posts=postCounts.get('/v1/account/signup')||0;
      drop.add('/v1/account/signup');const lost=await cli('signup',accountArgs('lost','requester'));
      assert.equal(lost.exit,2);assert.equal(existsSync(file('lost')),true);assert.equal(statSync(file('lost')).mode&0o777,0o600);
      assert.equal(await count('journey_account_operations'),before+1);
      const recovered=await cli('readback',['--secret-file',file('lost'),'--operation','signup']);assert.equal(recovered.exit,0);
      assert.equal(postCounts.get('/v1/account/signup'),posts+1);assert.equal(await count('journey_account_operations'),before+1);
      assert.equal(Boolean(secret('lost').accountId&&secret('lost').recoveryCode&&secret('lost').cookie),true);
    });
    const signup=await cli('signup',accountArgs('requester','requester'));assert.equal(signup.exit,0);requester=secret('requester');
    const title='Find a reusable dependency inventory method',summary='Share a public example of detecting undeclared runtime dependencies. Interest only; no commission or payout is offered.';
    const post=await cli('post',['--secret-file',file('requester'),'--title',title,'--summary',summary,'--criterion','public-example']);
    assert.equal(post.exit,0);requester=secret('requester');taskId=requester.taskId;
    await t.test('ordinary post and anonymous discovery expose usable listing IDs and next actions',async()=>{
      assert.equal(post.value.taskId,taskId);assert.equal(post.value.state,'unfunded_interest');
      const discover=await cli('discover');assert.equal(discover.exit,0);assert.equal(discover.value.moneyQualified,false);
      assert.equal(discover.value.items.some(item=>item.taskId===taskId&&item.title===title&&item.fundingState==='unfunded_interest'),true);
    });
    await t.test('identical and conflicting signup/post replays preserve a single effect',async()=>{
      const signups=await count('journey_account_operations'),tasks=await count('ae14_market_tasks');
      assert.equal((await cli('replay-signup',['--secret-file',file('requester')])).exit,0);
      const signupOp=secret('requester').operations.signup;
      const conflict=await req('/v1/account/signup',{body:{password:requester.password,displayName:'Changed Receiver',role:'requester'},
        headers:{origin,'idempotency-key':signupOp.idempotencyKey,'x-account-operation-proof':signupOp.proof}});
      assert.equal(conflict.status,409);assert.equal(conflict.body.code,'immutable_operation_input_changed');
      assert.equal((await cli('replay-post',['--secret-file',file('requester')])).exit,0);
      assert.equal((await cli('conflict-post',['--secret-file',file('requester')])).value.code,'operation_conflict');
      assert.equal(await count('journey_account_operations'),signups);assert.equal(await count('ae14_market_tasks'),tasks);requester=secret('requester');
    });
    assert.equal((await cli('signup',accountArgs('contributor','contributor'))).exit,0);contributor=secret('contributor');
    await t.test('a contributor can express interest using only an anonymously discovered task ID',async()=>{
      const interest=await cli('interest',['--secret-file',file('contributor'),'--task-id',taskId,'--note','I can share a public example; this is interest only.']);
      assert.equal(interest.exit,0);assert.equal(interest.value.state,'unfunded_interest');assert.equal(interest.value.commissioned,false);
    });
    await t.test('CSRF, origin, role and forbidden fund attempts create no financial records',async()=>{
      const body={title,summary,criteria:['public-example'],payableKinds:['usable']};
      const csrf=auth(requester,'root410-csrf');delete csrf['x-cj-csrf'];assert.equal((await req('/v1/market/post',{body,headers:csrf})).body.code,'csrf_required');
      assert.equal((await req('/v1/market/post',{body,headers:{...auth(requester),'origin':'https://wrong.example.test'}})).body.code,'origin_required');
      assert.equal((await req('/v1/market/post',{body,headers:auth(contributor)})).body.code,'requester_required');
      assert.equal((await req('/v1/market/interest',{body:{taskId,note:'interest'},headers:auth(requester)})).body.code,'contributor_required');
      const fund=await cli('fund',['--secret-file',file('requester')]);assert.equal(fund.exit,1);assert.notEqual(fund.value.status,200);
      assert.equal(await count('ae14_market_funding'),0);assert.equal(await count('ae14_market_quotes'),0);assert.equal(feeAt('10000'),'500');
      assert.throws(()=>feeAt('10000',100),/fee_policy/);
    });
    for(const operation of ['login','recover'])await t.test(`lost ${operation} result reads the stored operation and preserves credentials`,async()=>{
      drop.add('/v1/account/'+operation);const before=postCounts.get('/v1/account/'+operation)||0;
      const lost=await cli(operation,['--secret-file',file('requester')]);assert.equal(lost.exit,2);
      assert.equal((await cli('readback',['--secret-file',file('requester'),'--operation',operation])).exit,0);
      assert.equal(postCounts.get('/v1/account/'+operation),before+1);
      assert.equal((await cli('login',['--secret-file',file('requester')])).exit,0);requester=secret('requester');
    });
    await t.test('ordinary recovery works and public output contains no session or recovery material',async()=>{
      assert.equal((await cli('recover',['--secret-file',file('requester')])).exit,0);
      const logged=await cli('login',['--secret-file',file('requester')]);assert.equal(logged.exit,0);requester=secret('requester');
      for(const value of [requester.password,requester.recoveryCode,requester.cookie])assert.equal(logged.stdout.includes(value),false);
    });
    await t.test('a stored secret is bound to its original HTTPS origin',async()=>{
      const changed=await cli('login',['--secret-file',file('contributor')],'https://127.0.0.1:1');
      assert.equal(changed.value.code,'secret_origin_refused');
    });
    // Populate interest even on a red client so measurement can be received independently.
    await req('/v1/market/interest',{body:{taskId,note:'Receiver interest only'},headers:auth(contributor,'root410-recorded-interest')});
    assert.equal((await cli('signup',accountArgs('abandoned','requester'))).exit,0);
    await req('/v1/market/discover?limit=20');await req('/v1/market/discover?limit=20');
    await t.test('existing-store funnel counts abandonment and transitions without claiming independent acquisition',async()=>{
      const snapshot=await unfundedFunnelSnapshot(db,{earnedSchema,tenant});
      assert.equal(snapshot.cohort,'unknown');assert.equal(snapshot.unfundedListings,1);assert.equal(snapshot.interests,1);
      assert.equal(snapshot.requesterSignupsWithoutListing>=1,true);assert.equal(snapshot.discoveryImpressions>=2,true);
      assert.equal(snapshot.impressionIdentity,'listing_event');assert.equal(snapshot.paidWork,false);
      const transitions=(await db.query("SELECT payload->>'action' action FROM ae14_market_measures WHERE kind='transition'")).rows;
      assert.equal(transitions.some(row=>row.action==='post'),true);assert.equal(transitions.some(row=>row.action==='interest'),true);
    });
    await t.test('private account and signup-operation exclusions propagate to that account listing and its observations',async()=>{
      const before=await count('ae14_market_tasks');
      for(const exclude of [{accountIds:[requester.accountId]},{operationIds:[requester.operations.signup.idempotencyKey]}]) {
        const snapshot=await unfundedFunnelSnapshot(db,{earnedSchema,tenant,exclude});
        assert.equal(snapshot.unfundedListings,0);assert.equal(snapshot.interests,0);assert.equal(snapshot.discoveryImpressions,0);
      }
      assert.equal(await count('ae14_market_tasks'),before);
    });
    await t.test('private post-operation exclusions remove the listing observations',async()=>{
      const snapshot=await unfundedFunnelSnapshot(db,{earnedSchema,tenant,exclude:{operationIds:[requester.operations.post.idempotencyKey]}});
      assert.equal(snapshot.unfundedListings,0);assert.equal(snapshot.interests,0);assert.equal(snapshot.discoveryImpressions,0);
    });
    await t.test('a funding metadata row does not establish settled paid work',async()=>{
      // Seed only existing metadata tables in this disposable database, no money authority.
      await db.query("INSERT INTO ae14_market_quotes VALUES($1,'fixture-quote',$2,'fixture-allocation','fixture-command','{}')",[tenant,taskId]);
      await db.query("INSERT INTO ae14_market_funding VALUES('fixture-chain','fixture-token','fixture-proof',$1,'fixture-allocation','{}')",[tenant]);
      const funded=await unfundedFunnelSnapshot(db,{earnedSchema,tenant});assert.equal(funded.funding,1);assert.equal(funded.paidWork,null);
    });
    await t.test('legacy obligations and terms survive the unfunded journey and capability rollback',async()=>{
      assert.deepEqual((await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows,preserved);
      const accounts=await count('journey_accounts'),tasks=await count('ae14_market_tasks');
      await closeMount();await boot('');assert.equal((await req('/v1/market/profile')).status,404);
      assert.equal(await count('journey_accounts'),accounts);assert.equal(await count('ae14_market_tasks'),tasks);
      assert.deepEqual((await db.query('SELECT id,reward_amount,terms_version,payout_state FROM earned_work_obligations ORDER BY id')).rows,preserved);
      await closeMount();await boot('source-bound:'+canonicalMachineProfile(doc));assert.equal((await req('/v1/market/profile')).status,200);
    });
  }finally{await closeMount();await db?.end();await new Promise(r=>rpc.close(r));await cluster.stop();rmSync(scratch,{recursive:true,force:true});}
});
