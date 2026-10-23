// Disposable configured-path receiver. Child processes below are HTTP fixtures,
// never model workers. No production URL, key, account, or signing route is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, fork, spawnSync} from 'node:child_process';
import {randomBytes, createHash} from 'node:crypto';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import {privateKeyToAccount} from 'viem/accounts';
import {startCluster,stopCluster} from './root404-pg-cluster.mjs';

const root=resolve(import.meta.dirname,'../..');
const prefix='/api/neomorphic-contributor-journey';
const hash=value=>createHash('sha256').update(value).digest('hex');
const importAt=(base,name)=>import(pathToFileURL(join(base,name)).href);

async function fixtureServer() {
  let app,server,fault,origin,clockOffset=0;
  const originalQuery=pg.Client.prototype.query;
  pg.Client.prototype.query=async function(...args) {
    const sql=typeof args[0]==='string'?args[0]:args[0]?.text||'';
    if(fault && /UPDATE hosted_wallet_market.wallets\s+SET address/.test(sql)) {
      fault.client=this;
      if(fault.stage==='before-update') {
        process.send({phase:fault.stage});await new Promise(()=>{});
      }
    }
    if(fault?.client===this && sql==='COMMIT' && fault.stage==='before-commit') {
      process.send({phase:fault.stage});await new Promise(()=>{});
    }
    const result=await originalQuery.apply(this,args);
    if(fault?.client===this && sql==='COMMIT' && fault.stage==='after-commit') {
      process.send({phase:fault.stage});await new Promise(()=>{});
    }
    return result;
  };
  process.on('message',async message=>{
    try {
      if(message.arm) {fault={stage:message.arm};process.send({armed:true});return;}
      if(message.clockOffset!==undefined) {clockOffset=message.clockOffset;process.send({clockSet:true});return;}
      if(message.stop) {
        if(server)await new Promise(r=>server.close(r));
        await app?.get('hostedWalletMarket')?.close();
        await app?.get('neoContributorJourney')?.close();
        process.send({stopped:true});process.disconnect();return;
      }
      if(!message.boot)return;
      const {candidate,env,options,port,tls,machineProfile}=message.boot;origin=options.origin;
      const {createSdsApp}=await importAt(candidate,'server/app.js');
      app=createSdsApp({hostedWalletMarket:{...options,env,machineProfile,now:()=>Date.now()+clockOffset},neomorphicContributorJourney:{env},
        neomorphicOpportunity:{env:{}},correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}});
      await app.get('hostedWalletMarket').opened;await app.get('neoContributorJourney').ensure();
      server=https.createServer({key:readFileSync(tls.keyFile),cert:readFileSync(tls.certFile)},(req,res)=>{
        if(req.headers['x-r4-drop-response']==='1')res.end=function(){res.destroy();return res;};
        app(req,res);
      });
      await new Promise((r,j)=>server.once('error',j).listen(port,'127.0.0.1',r));
      process.send({ready:true,rss:process.memoryUsage().rss});
    }catch(error){process.send({failed:error.codeName||error.code||error.message,
      detail:error.code==='ERR_MODULE_NOT_FOUND'?error.message:undefined});}
  });
}

if(process.env.R4_WALLET_FIXTURE==='1') {
  await fixtureServer();
} else test('R4-J02 future binding through createSdsApp, verified HTTPS and PostgreSQL', {timeout:180000}, async t=>{
  const scratch=mkdtempSync(join(tmpdir(),'root4433-wallet-')),candidate=join(scratch,'candidate');
  let cluster,db,rpc,child,memorySampler,peakOwnedRssKiB=0;
  const rpcMethods=[],contractAddresses=new Set(),receipts=new Map(),blocks=new Map();
  let rpcChain='0x2105',rpcDelayMs=0,contractCode='0x6000';
  let messageWaiters=[];
  let childError='';
  const key=()=>randomBytes(16).toString('hex');
  const waitMessage=predicate=>new Promise((r,j)=>{
    const timer=setTimeout(()=>{messageWaiters=messageWaiters.filter(w=>w.resolve!==done);j(Error('fixture_message_timeout: '+childError));},20000);
    const done=value=>{clearTimeout(timer);r(value);};messageWaiters.push({predicate,resolve:done});
  });
  async function stop(crash=false) {
    if(!child)return;
    const owned=child;child=null;
    const exited=new Promise(r=>owned.once('exit',r));
    if(crash)owned.kill('SIGKILL');
    else {owned.send({stop:true});}
    await exited;messageWaiters=[];
  }
  try {
    // Only the candidate's generated closure changes. The admitted tree's
    // shared pins, source metadata, lockfiles and manifests are never rewritten.
    mkdirSync(candidate);
    for(const name of ['server','vendor','tools','data','client','package.json','package-lock.json'])
      cpSync(join(root,name),join(candidate,name),{recursive:true});
    const pin=JSON.parse(readFileSync(join(root,'server/foundry/activation/private-control-pin.json')));
    for(const name of Object.keys(pin.files)) {
      const target=join(candidate,name);mkdirSync(resolve(target,'..'),{recursive:true});cpSync(join(root,name),target);
    }
    const historical=process.env.R4_WALLET_BASELINE==='1'||process.env.R4_WALLET_HISTORY_BASELINE==='1';
    if(historical) {
      // Select the complete exact authority graph, including retained-outcome,
      // rather than combining old server.mjs with the repaired current reader.
      rmSync(candidate,{recursive:true});mkdirSync(candidate);
      const archive=execFileSync('git',['archive','79fbd37d31aabdc790248443c576a2f0017e55f0'],{cwd:root,maxBuffer:64*1024*1024});
      execFileSync('tar',['-x','-C',candidate],{input:archive});
      for(const name of ['vendor/hosted-wallet-market/src/server.mjs','vendor/hosted-wallet-market/src/retained-outcome.mjs',
        'vendor/hosted-wallet-market/src/machine-market.mjs','vendor/hosted-wallet-market/SOURCE.json','server/foundry/activation/private-control-pin.json']) {
        const expected=execFileSync('git',['show','79fbd37d31aabdc790248443c576a2f0017e55f0:'+name],{cwd:root});
        assert.deepEqual(readFileSync(join(candidate,name)),expected);
        t.diagnostic(JSON.stringify({historicalAuthority:name,sha256:hash(expected)}));
      }
    }
    symlinkSync(join(root,'node_modules'),join(candidate,'node_modules'),'dir');
    if(!historical && process.env.R4_WALLET_DIRECT_SOURCE!=='1') {
      const refreshed=JSON.parse(execFileSync(process.execPath,['server/scripts/refresh-installed-receiving-source.mjs'],{cwd:candidate,encoding:'utf8'}));
      assert.equal(refreshed.qualified,false);
    }
    // Direct receiving copies the composed canonical files verbatim and does
    // not manufacture a scratch pin before the actual HTTP/PG mount.
    if(process.env.R4_WALLET_DIRECT_SOURCE==='1')for(const name of ['vendor/hosted-wallet-market/SOURCE.json','server/foundry/activation/private-control-pin.json'])
      assert.deepEqual(readFileSync(join(candidate,name)),readFileSync(join(root,name)));
    if(process.env.R4_WALLET_REGRESSION==='1') {
      const args=['--test','--test-concurrency=1','vendor/hosted-wallet-market/test/account-delivery.test.mjs',
        'vendor/hosted-wallet-market/test/machine-profile-receiving.test.mjs'];
      t.diagnostic('Candidate-only regression command: node '+args.join(' '));
      const regressionEnv={...process.env};delete regressionEnv.NODE_TEST_CONTEXT;
      const result=spawnSync(process.execPath,args,{cwd:candidate,env:regressionEnv,encoding:'utf8',timeout:60000,maxBuffer:1048576});
      process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0);
      assert.doesNotMatch(result.stderr,/skipping running files/);
      assert.match(result.stdout,/cookie-only login delivery/);assert.match(result.stdout,/runtime and release bind/);return;
    }
    cluster=await startCluster();
    memorySampler=setInterval(()=>{
      const rows=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
      const nativeOwners=String(process.env.R4_WALLET_OWNER_PIDS||'').split(',').filter(v=>/^[1-9][0-9]*$/.test(v)).map(Number);
      const owned=new Set([process.pid,cluster.pid,...nativeOwners]);let changed=true;
      while(changed){changed=false;for(const [pid,ppid] of rows)if(owned.has(ppid)&&!owned.has(pid)){owned.add(pid);changed=true;}}
      peakOwnedRssKiB=Math.max(peakOwnedRssKiB,rows.filter(([pid])=>owned.has(pid)).reduce((n,row)=>n+row[2],0));
    },200);
    const url=new URL(cluster.connectionString);
    const admin=new pg.Client({connectionString:cluster.connectionString});await admin.connect();
    const database='contributor_journey_staging_r4_'+randomBytes(3).toString('hex');
    await admin.query('CREATE DATABASE '+database);await admin.end();url.pathname='/'+database;
    const hba=join(cluster.dataDir,'pg_hba.conf');
    writeFileSync(hba,readFileSync(hba,'utf8').replaceAll(' clientcert=verify-full',''));
    execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'reload'],{stdio:'ignore'});
    url.searchParams.delete('sslcert');url.searchParams.delete('sslkey');
    const databaseUrl=url.href;
    const {writeStagingCerts}=await importAt(candidate,'vendor/hosted-wallet-market/src/tls.mjs');
    const tls=writeStagingCerts(join(scratch,'https'));
    const lease=http.createServer();await new Promise(r=>lease.listen(0,'127.0.0.1',r));
    const port=lease.address().port;await new Promise(r=>lease.close(r));
    const origin=`https://127.0.0.1:${port}`,tenant='root4433-wallet';
    const env={CONTRIBUTOR_JOURNEY_MODE:'staging',CONTRIBUTOR_JOURNEY_INSTALLED:'1',CONTRIBUTOR_JOURNEY_TRUST_PROXY:'0',
      CONTRIBUTOR_JOURNEY_DATABASE_URL:databaseUrl,CONTRIBUTOR_JOURNEY_OWNER_TOKEN:randomBytes(18).toString('hex'),
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:randomBytes(18).toString('hex'),CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:origin,
      CONTRIBUTOR_JOURNEY_REPLAY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_CURSOR_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:'[]',
      CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX:'10000',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0'};
    const journey=await importAt(candidate,'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js');
    await journey.prepareJourneyDeployment({env,enroll:false});
    db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query('SET search_path TO cj227_earned_work');
    const migration=await importAt(candidate,'vendor/hosted-wallet-market/src/migrate.mjs');
    await migration.applyAdditiveSchema(db);
    await (await importAt(candidate,'vendor/hosted-wallet-market/src/seed.mjs')).seedStaging(db);
    assert.equal((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
    rpc=http.createServer(async(req,res)=>{
      let text='';for await(const chunk of req)text+=chunk;const input=JSON.parse(text);
      rpcMethods.push(input.method);
      assert.ok(['eth_chainId','eth_blockNumber','eth_call','eth_getCode','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getTransactionByHash'].includes(input.method),'read-only RPC');
      if(input.method==='eth_getCode' && rpcDelayMs)await new Promise(r=>setTimeout(r,rpcDelayMs));
      const result=input.method==='eth_chainId'?rpcChain:input.method==='eth_call'?'0x'+(6n).toString(16).padStart(64,'0'):
        input.method==='eth_getCode'?(contractAddresses.has(input.params[0])?contractCode:'0x'):
        input.method==='eth_getTransactionReceipt'?receipts.get(input.params[0])??null:
        input.method==='eth_getBlockByNumber'?blocks.get(input.params[0])??null:
        input.method==='eth_getTransactionByHash'?((r)=>r?{hash:r.transactionHash,blockHash:r.blockHash,blockNumber:r.blockNumber,from:r.from}:null)(receipts.get(input.params[0])):'0x100';
      res.end(JSON.stringify({jsonrpc:'2.0',id:input.id,result}));
    });await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
    const registryRoot=join(scratch,'registry');mkdirSync(registryRoot,{mode:0o700});
    const options={mode:'private',label:'PRIVATE',chain:'eip155:8453',payments:'off',publicReads:'0',fundedTasks:'off',humanAssets:'off',
      tls:'verified-edge',origin,tenant,earnedSchema:'cj227_earned_work',schemaName:'hosted_wallet_market',databaseUrl,
      rpcUrl:`http://127.0.0.1:${rpc.address().port}`,feeRecipient:'0x'+'1'.repeat(40),
      settlementToken:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',replayKey:env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
      ownerToken:env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN,dischargeRegistry:registryRoot};
    const {installedSourceSha256,hostSourceSha256}=await importAt(candidate,'vendor/hosted-wallet-market/src/native-debt.mjs');
    const {canonicalMachineProfile}=await importAt(candidate,'vendor/hosted-wallet-market/src/machine-profile-document.mjs');
    const {versionedSource}=await importAt(candidate,'vendor/hosted-wallet-market/runtime/agent-economy-rail/dist/index.js');
    const doc={schema:'pilot.machine-market.capability.v1',profile:'machine-market',origin,tenant,sourceSha256:installedSourceSha256(),
      hostSha256:hostSourceSha256(candidate),discovery:'qualified-source',money:'unfunded',networkSource:versionedSource('eip155:8453')};
    t.diagnostic(JSON.stringify({sourceKind:process.env.R4_WALLET_BASELINE==='1'||process.env.R4_WALLET_HISTORY_BASELINE==='1'?'pinned-original':(process.env.R4_WALLET_DIRECT_SOURCE==='1'?'composed-canonical-direct':'job-local-candidate'),
      candidateSourceSha256:doc.sourceSha256,candidateHostSha256:doc.hostSha256,qualified:false,installed:false}));
    async function boot(profile='source-bound:'+canonicalMachineProfile(doc)) {
      childError='';child=fork(new URL(import.meta.url),[],{execArgv:['--max-old-space-size=384'],
        env:{...process.env,R4_WALLET_FIXTURE:'1'},stdio:['ignore','pipe','pipe','ipc']});
      child.stdout.on('data',()=>{});child.stderr.on('data',b=>{childError=(childError+b).slice(-1000);});
      child.on('message',message=>{
        for(const waiter of [...messageWaiters])if(waiter.predicate(message)){
          messageWaiters=messageWaiters.filter(w=>w!==waiter);waiter.resolve(message);
        }
      });
      const ready=waitMessage(m=>m.ready||m.failed);child.send({boot:{candidate,env,options,port,tls,machineProfile:profile}});
      const received=await ready;assert.equal(received.failed,undefined,'fixture startup: '+received.failed+' '+received.detail+' '+childError);
    }
    const ask=(path,{body,headers={},method=body===undefined?'GET':'POST'}={})=>new Promise((r,j)=>{
      const bytes=body===undefined?null:JSON.stringify(body);
      const request=https.request(origin+prefix+path,{method,ca:tls.ca,headers:{'x-ae-wire-version':'c0-1',connection:'close',
        ...(bytes?{'content-type':'application/json','content-length':Buffer.byteLength(bytes)}:{}),...headers}},res=>{
        let text='';res.on('data',b=>text+=b);res.on('error',j);res.on('end',()=>{
          try{r({status:res.statusCode,body:JSON.parse(text),headers:res.headers});}catch{j(Error('non_json_response'));}
        });
      });request.on('error',j);request.setTimeout(15000,()=>request.destroy(Error('request_timeout')));request.end(bytes);
    });
    const auth=(a,id=key())=>({origin,cookie:a.cookie,'x-cj-csrf':a.csrf,'idempotency-key':id});
    async function signup(role='contributor') {
      const password=randomBytes(24).toString('hex');
      const response=await ask('/v1/account/signup',{body:{password,displayName:'Disposable Receiver',role},
        headers:{origin,'idempotency-key':key(),'x-account-operation-proof':randomBytes(32).toString('base64url')}});
      assert.equal(response.status,200,JSON.stringify(response.body));
      return {id:response.body.value.account.accountId,cookie:response.headers['set-cookie'][0].split(';')[0],
        csrf:response.headers['x-cj-csrf'],recoveryCode:response.body.value.recoveryCode,password};
    }
    const old=privateKeyToAccount('0x'+randomBytes(32).toString('hex'));
    const replacement=privateKeyToAccount('0x'+randomBytes(32).toString('hex'));
    const address=a=>a.address.toLowerCase();
    const wallet=async a=>(await db.query('SELECT * FROM hosted_wallet_market.wallets WHERE account_id=$1',[a.id])).rows[0];
    // Receive the existing legacy-issued account contract as well as native
    // machine sessions below. They intentionally retain their original hashes.
    await boot('');
    const foreign=await signup();
    // Keep a real legacy-issued requester session, while the history-owning
    // native account is created by its actual issuer before any work exists.
    let owner=historical?await signup():null;
    await stop();await boot();
    if(!owner)owner=await signup();
    assert.equal((await ask('/v1/wallet/bind',{body:{address:address(old)},headers:auth(owner)})).status,200);
    await stop();await boot();
    await t.test('baseline bind refuses replacement, exit preserves address and current machine challenge refuses migration',async()=>{
      const before=await wallet(owner);
      const refused=await ask('/v1/wallet/bind',{body:{address:address(replacement)},headers:auth(owner)});
      assert.equal(refused.status,409);assert.equal(refused.body.code,'wallet_already_bound');
      const challenge=await ask('/v1/market/walletChallenge',{body:{address:address(replacement)},headers:auth(owner)});
      assert.equal(challenge.body.code,'wallet_migration_requires_existing_authority');
      const exit=await ask('/v1/wallet/exit',{body:{},headers:auth(owner)});assert.equal(exit.status,200);
      assert.equal((await wallet(owner)).address,before.address);assert.equal((await wallet(owner)).revocation_epoch,before.revocation_epoch+1);
      if(process.env.R4_WALLET_BASELINE==='1') {
        const absent=await ask('/v1/wallet/continuation/challenge',{body:{address:address(replacement)},headers:auth(owner)});
        t.diagnostic('Original unsupported continuation: '+JSON.stringify({status:absent.status,body:absent.body}));
        assert.equal(absent.status,403);assert.equal(absent.body.error.code,'csrf_refused');
      }
    });
    if(process.env.R4_WALLET_BASELINE==='1')return;
    const {digest}=await importAt(candidate,'vendor/hosted-wallet-market/src/canonical.mjs');
    const {quoteEconomics}=await importAt(candidate,'vendor/hosted-wallet-market/src/fee.mjs');
    const initialSchema=(await db.query("SELECT table_schema,table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema IN ('hosted_wallet_market','cj227_earned_work') ORDER BY 1,2,ordinal_position")).rows;
    const market=async(a,action,body)=>ask('/v1/market/'+action,{body,headers:auth(a)});
    async function control(a,signer) {
      const issued=await market(a,'walletChallenge',{address:address(signer)});assert.equal(issued.status,200,JSON.stringify(issued.body));
      const proof={challengeDigest:digest(issued.body.value.result.challenge),signature:await signer.signMessage({message:issued.body.value.result.message})};
      const proved=await market(a,'walletProve',proof);assert.equal(proved.status,200,JSON.stringify(proved.body));return proof;
    }
    async function challenge(a,next,operationKey=key()) {
      const response=await ask('/v1/wallet/continuation/challenge',{body:{address:address(next)},headers:auth(a,operationKey)});
      assert.equal(response.status,200,JSON.stringify(response.body));return {...response.body.value,operationKey};
    }
    async function proof(intent,oldSigner,newSigner) {
      return {challengeKey:intent.operationKey,challengeDigest:intent.challengeDigest,
        oldSignature:await oldSigner.signMessage({message:intent.oldMessage}),newSignature:await newSigner.signMessage({message:intent.newMessage})};
    }
    const commit=(a,body,operationKey=key(),extra={})=>ask('/v1/wallet/continuation/commit',{body,headers:{...auth(a,operationKey),...extra}});
    const readback=(a,operationKey)=>ask('/v1/operations?idempotencyKey='+encodeURIComponent(operationKey),{headers:auth(a)});
    const oldProof=await control(owner,old);
    let preserved,paidReview,owedReview,owedPayouts,history,machineQuote,requester;
    async function snapshot() {
      const tables=['earned_work_tasks','earned_work_reservations','earned_work_verdicts','earned_work_obligations','earned_work_terms','earned_work_submissions','earned_work_contributor_tokens','journey_account_kernel_bindings',
        'hosted_wallet_market.quotes','hosted_wallet_market.funding_intents','hosted_wallet_market.grants','hosted_wallet_market.captures',
        'hosted_wallet_market.native_debt_dispositions','hosted_wallet_market.consumer_enrollment','ae14_market_quotes','ae14_market_funding'];
      const rows={};for(const table of tables)rows[table]=(await db.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
      rows.originalUncertainOperation=(await db.query("SELECT to_jsonb(t) value FROM earned_work_idempotency t WHERE key='r4433-uncertain-old' ORDER BY to_jsonb(t)::text")).rows;
      return rows;
    }
    await t.test('existing machine quote binds its original wallet, control epoch and 5% gross terms',async()=>{
      requester=await signup('requester');const payer=privateKeyToAccount('0x'+randomBytes(32).toString('hex'));
      await control(requester,payer);
      const posted=await market(requester,'post',{title:'Disposable future binding task',summary:'Source receiving only',criteria:['bounded'],payableKinds:['usable']});
      assert.equal(posted.status,200,JSON.stringify(posted.body));const taskId=posted.body.value.result.taskId;
      assert.equal((await market(owner,'interest',{taskId,note:'Disposable proposal'})).status,200);
      const quoted=await market(requester,'quote',{taskId,contributorId:owner.id,gross:'100000',railCostCap:'0',expiresAt:new Date(Date.now()+3600000).toISOString()});
      assert.equal(quoted.status,200,JSON.stringify(quoted.body));machineQuote=quoted.body.value.result;
      assert.equal(machineQuote.quote.payoutDestination,address(old));assert.equal(machineQuote.quote.platformFee,'5000');assert.equal(machineQuote.quote.contributorNet,'95000');
      assert.equal(machineQuote.parties.receiverEpoch,(await wallet(owner)).revocation_epoch);
    });
    assert.ok(machineQuote,'machine quote fixture must be ready');
    await t.test('synthetic historical accepted debt and already-paid disposition are usable before continuation',async()=>{
      const stamp=new Date('2026-10-20T10:00:00.000Z'),expiry=new Date(Date.now()+3600000);
      const insert=async(label)=>{
        const suffix='r4433'+label.padEnd(11,'0'),taskId='task_'+suffix,reservationId='rsv_'+suffix,tokenId='tok_'+suffix,
          submissionId='sub_'+suffix,verdictId='ver_'+suffix,obligationId='obl_'+suffix,publicId='pub_'+suffix;
        const terms='sha256:'+hash(label),bytes=Buffer.from('Preserved accepted '+label+' bytes.');
        await db.query(`INSERT INTO earned_work_tasks(id,title,summary,provenance,lifecycle,funding_state,payout_state,current_terms_version,
          terms_revision,schema_version,correction_max_revisions,budget_amount,budget_asset,budget_network,created_at,updated_at)
          VALUES($1,$1,'Disposable preservation fixture','test','accepted','reserved','owed',$2,1,1,1,'0.095000','USDC','eip155:8453',$3,$3)`,[taskId,terms,stamp]);
        await db.query(`INSERT INTO earned_work_terms(task_id,version,terms_revision,schema_version,summary,reward_amount,reward_asset,reward_network,
          claim_ttl_seconds,max_artifact_bytes,allowed_media_types,slot_limit,created_at)
          VALUES($1,$2,1,1,'Fixed old net','0.095000','USDC','eip155:8453',7200,16384,ARRAY['text/plain'],1,$3)`,[taskId,terms,stamp]);
        await db.query(`INSERT INTO earned_work_contributor_tokens(id,public_id,token_hash,payout_destination,task_scope,provenance,created_at)
          VALUES($1,$2,$3,$4,$5,'test',$6)`,[tokenId,publicId,hash(tokenId),address(old),taskId,stamp]);
        await db.query(`INSERT INTO earned_work_reservations(id,task_id,terms_version,contributor_public_id,contributor_token_id,status,expires_at,created_at)
          VALUES($1,$2,$3,$4,$5,'completed',$6,$6)`,[reservationId,taskId,terms,publicId,tokenId,stamp]);
        await db.query(`INSERT INTO earned_work_submissions(id,task_id,reservation_id,terms_version,artifact_ref,artifact_digest_sha256,
          artifact_media_type,artifact_bytes,evidence_bytes,created_at) VALUES($1,$2,$3,$4,'synthetic:preserved',$5,'text/plain',$6,$7,$8)`,
          [submissionId,taskId,reservationId,terms,hash(bytes),bytes.length,bytes,stamp]);
        await db.query(`INSERT INTO earned_work_verdicts(id,task_id,reservation_id,submission_id,terms_version,artifact_digest_sha256,verifier_version,outcome,reasons,ordinal,created_at)
          VALUES($1,$2,$3,$4,$5,$6,'root4433','pass','{"outcome":"pass"}',1,$7)`,[verdictId,taskId,reservationId,submissionId,terms,hash(bytes),stamp]);
        await db.query(`INSERT INTO earned_work_obligations(id,task_id,reservation_id,submission_id,contributor_public_id,payout_destination,reward_amount,
          reward_asset,reward_network,payout_state,terms_version,idempotency_key,adapter,verdict_id,created_at)
          VALUES($1,$2,$3,$4,$5,$6,'0.095000','USDC','eip155:8453','owed',$7,$1,'synthetic',$8,$9)`,
          [obligationId,taskId,reservationId,submissionId,publicId,address(old),terms,verdictId,stamp]);
        await db.query('INSERT INTO hosted_wallet_market_guard.preserved_obligation_ids(id) VALUES($1) ON CONFLICT DO NOTHING',[obligationId]);
        await db.query(`INSERT INTO hosted_wallet_market.quotes(task_id,requester_account_id,fee_recipient,economics,terms_version,authorization_expiry,refund_expiry,
          funding_wire,funded,observations,contributor_account_id,payout_destination,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$6,'unfunded',false,'[]',$7,$8,$9)`,
          [taskId,foreign.id,options.feeRecipient,quoteEconomics({gross:'100000',railCost:'0'}),terms,expiry,owner.id,address(old),stamp]);
        await db.query('INSERT INTO hosted_wallet_market.grants(account_id,task_id,token_id,public_id,created_at) VALUES($1,$2,$3,$4,$5)',[owner.id,taskId,tokenId,publicId,stamp]);
        await db.query(`INSERT INTO journey_account_kernel_bindings(account_id,kernel_scope,earned_task_id,public_id,token_hash,principal_id,source,created_at)
          VALUES($1,$2,$2,$3,$4,$5,'created',$6)`,[owner.id,taskId,publicId,hash(tokenId),tokenId,stamp]);
        await db.query(`INSERT INTO hosted_wallet_market.captures(task_id,reservation_id,obligation_id,gross_atomic,rail_atomic,fee_atomic,net_atomic,fee_bps,chain,block_number,transfer,winner,created_at)
          VALUES($1,$2,$3,100000,0,5000,95000,500,'eip155:31337','42',false,'authorized_capture',$4)`,[taskId,reservationId,obligationId,stamp]);
        return {taskId,reservationId,obligationId,submissionId,verdictId,terms,bytes};
      };
      const paid=await insert('paid'),owed=await insert('owed');history={paid,owed};
      // An uncertain original funding operation remains an immutable fixture
      // journal entry and original destination; the receiver never submits it.
      await db.query(`INSERT INTO hosted_wallet_market.funding_intents(task_id,account_id,tenant,payer,not_before_block,message,authorized,created_at)
        VALUES($1,$2,$3,$4,42,'original uncertain funding intent',true,$5)`,[paid.taskId,owner.id,tenant,address(old),stamp]);
      await db.query(`INSERT INTO earned_work_idempotency(scope,task_id,key,request_hash,status_code,response_json,principal_id,created_at)
        VALUES('hosted-wallet-market','','r4433-uncertain-old',$1,200,$2,$3,$4)`,[hash('old funding operation'),
        {value:{state:'unknown',operationId:'original-funding-identity',destination:address(old),sharedNonce:'17',budgetRemaining:'0',noAutomaticReplay:true}},owner.id,stamp]);
      const discharge=await importAt(candidate,'vendor/hosted-wallet-market/src/native-obligation-discharge.mjs');
      const {nativeEnvelope}=await importAt(candidate,'vendor/hosted-wallet-market/src/retained-award-validate.mjs');
      const txHash='0x'+'31'.repeat(32),blockHash='0x'+'42'.repeat(32),blockTimestamp='2026-10-20T11:00:00.000Z',source='0x'+'2'.repeat(40);
      const intent={obligationId:paid.obligationId,reservationId:paid.reservationId,taskId:paid.taskId,claimId:paid.reservationId,
        submissionId:paid.submissionId,verdictId:paid.verdictId,termsVersion:paid.terms,artifactDigestSha256:hash(paid.bytes),roundId:'synthetic-r4433',
        network:options.chain,token:options.settlementToken,amountAtomic:'95000',source,recipient:address(old)};
      const receipt=discharge.buildDischargeReceipt({authorityClass:'root_received',intent,canonical:{status:'success',exactTransferVerified:true,
        logIndex:7,transactionHash:txHash,blockHash,blockNumber:'42',blockTimestamp,knownFeeWei:'0'}});
      discharge.claimTransferExclusive(registryRoot,{schema:discharge.TRANSFER_SCHEMA,kind:'external_discharge_only',...nativeEnvelope(intent,'root_received'),
        transactionHash:txHash,logIndex:7,receiptId:receipt.receiptId,importContractSha256:receipt.importContractSha256,kernelPaid:false,kernelTransfer:null,noAutomaticReplay:true});
      discharge.writeExclusiveJson(discharge.obligationDischargePath(registryRoot,paid.obligationId),receipt);
      const topic=a=>'0x'+a.slice(2).padStart(64,'0');
      receipts.set(txHash,{status:'0x1',transactionHash:txHash,blockHash,blockNumber:'0x2a',from:source,
        logs:[{address:options.settlementToken,logIndex:'0x7',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(source),topic(address(old))],
          data:'0x'+(95000n).toString(16).padStart(64,'0'),transactionHash:txHash,blockHash,blockNumber:'0x2a',removed:false}]});
      blocks.set('0x2a',{number:'0x2a',hash:blockHash,timestamp:'0x'+BigInt(Date.parse(blockTimestamp)/1000).toString(16)});
      blocks.set('finalized',{number:'0x100',hash:'0x'+'4'.repeat(64),timestamp:'0x'+BigInt(Date.now()/1000|0).toString(16)});
      const authority={authorization:'Bearer '+options.ownerToken,'idempotency-key':key()};
      const enrollment=await ask('/v1/native-debt/enroll',{body:{},headers:authority});assert.equal(enrollment.status,200,JSON.stringify(enrollment.body));
      const imported=await ask('/v1/native-debt/import',{body:{importContractSha256:receipt.importContractSha256,tenant,obligationId:paid.obligationId,
        reservationId:paid.reservationId,taskId:paid.taskId,termsVersion:paid.terms,network:options.chain,token:options.settlementToken,
        transactionHash:txHash,logIndex:7,blockNumber:'42',amountAtomic:'95000',receiptId:receipt.receiptId,receivedAt:'2026-10-20T11:00:01.000Z'},
        headers:{...authority,'idempotency-key':key()}});
      assert.equal(imported.status,200,JSON.stringify(imported.body));assert.equal(imported.body.value.payable,false);
      const review=async item=>ask('/v1/review?taskId='+item.taskId+'&reservationId='+item.reservationId,{headers:auth(owner)});
      paidReview=await review(paid);owedReview=await review(owed);
      assert.equal(paidReview.status,200,JSON.stringify(paidReview.body));assert.equal(paidReview.body.value.entitled.fulfillment.paid,true);
      assert.equal(paidReview.body.value.entitled.disposition.payable,false);assert.equal(paidReview.body.value.entitled.artifact.body,paid.bytes.toString());
      assert.equal(owedReview.status,200,JSON.stringify(owedReview.body));assert.equal(owedReview.body.value.entitled.disposition.payable,true);
      owedPayouts=await ask('/v1/payouts?limit=20',{headers:auth(owner)});
      assert.equal(owedPayouts.body.value.items.length,1);assert.equal(owedPayouts.body.value.items[0].destination,address(old));
      preserved=await snapshot();
    });
    assert.ok(preserved,'old-entitlement fixture must be ready');
    const retainedRead=(account,item=history.owed)=>ask('/v1/review?taskId='+item.taskId+'&reservationId='+item.reservationId,{headers:auth(account)});
    const assertRetained=async()=>{
      assert.deepEqual((await retainedRead(owner,history.paid)).body,paidReview.body);
      assert.deepEqual((await retainedRead(owner,history.owed)).body,owedReview.body);
      assert.deepEqual(await snapshot(),preserved);
    };
    await t.test(historical?'exact SDS79 native hash mismatch remains a historical negative':'native current session reads the SAME existing account membership, accepted bytes and paid/owed dispositions',async()=>{
      const previousCookie=owner.cookie;
      let native=owner;
      if(historical)native=await signup();
      else {
        const login=await ask('/v1/account/login',{body:{accountId:owner.id,password:owner.password},
          headers:{origin,'idempotency-key':key(),'x-account-operation-proof':randomBytes(32).toString('base64url')}});
        assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.value.account.accountId,owner.id);
        owner.cookie=login.headers['set-cookie'][0].split(';')[0];owner.csrf=login.headers['x-cj-csrf'];
      }
      const nativeSession=await db.query(`SELECT s.token_hash=d.cookie_hash AS hashes_equal,d.cookie_hash=$2 AS delivery_matches_pair
        FROM journey_account_sessions s JOIN hosted_wallet_market.session_delivery d ON d.account_id=s.account_id
        WHERE s.account_id=$1 AND s.token_hash=$3`,[native.id,hash(native.cookie),hash(native.cookie.split('=')[1])]);
      assert.equal(nativeSession.rows.length,1);assert.equal(nativeSession.rows[0].hashes_equal,false);
      assert.equal(nativeSession.rows[0].delivery_matches_pair,true);
      if(historical) {
        const refused=await retainedRead(native);assert.equal(refused.status,401);assert.equal(refused.body.code,'unauthenticated');
      } else {
        await assertRetained();
        assert.equal((await retainedRead({...owner,cookie:previousCookie})).status,401);
        // This independently legacy-issued account is the original requester
        // in these same terms. Its existing membership is never reassigned.
        for(const item of [history.paid,history.owed]) {
          const read=await retainedRead(foreign,item);assert.equal(read.status,200);
          assert.equal(read.body.value.entitled.artifact.body,item.bytes.toString());
          assert.equal(read.body.value.entitled.disposition.payable,item===history.owed);
        }
      }
      assert.deepEqual(await snapshot(),preserved);
    });
    if(!historical)await t.test('native retained reads refuse foreign or absent membership, wrong/double/expired/revoked cookie and stale source without details',async()=>{
      const outsider=await signup();
      const secretless=response=>{
        assert.notEqual(response.status,200);
        const body=JSON.stringify(response.body);
        for(const item of [history.paid,history.owed]) {
          assert.ok(!body.includes(item.bytes.toString()));assert.ok(!body.includes(item.obligationId));
        }
        assert.ok(!body.includes('amountAtomic'));assert.ok(!body.includes('payoutDestination'));
      };
      const absent=await retainedRead(outsider);assert.equal(absent.status,404);secretless(absent);
      const grant=await db.query('DELETE FROM hosted_wallet_market.grants WHERE account_id=$1 AND task_id=$2 RETURNING *',[owner.id,history.owed.taskId]);
      try {const refused=await retainedRead(owner);assert.equal(refused.status,404);secretless(refused);}
      finally {const row=grant.rows[0];await db.query('INSERT INTO hosted_wallet_market.grants(account_id,task_id,token_id,public_id,created_at) VALUES($1,$2,$3,$4,$5)',[row.account_id,row.task_id,row.token_id,row.public_id,row.created_at]);}
      for(const cookie of ['',owner.cookie+'wrong',owner.cookie+'; '+owner.cookie]) {
        const refused=await retainedRead({...owner,cookie});assert.equal(refused.status,401);secretless(refused);
      }
      const session=(await db.query('SELECT * FROM journey_account_sessions WHERE token_hash=$1',[hash(owner.cookie.split('=')[1])])).rows[0];
      let clock=waitMessage(m=>m.clockSet);child.send({clockOffset:session.expires_at.getTime()-Date.now()+1000});await clock;
      try {const refused=await retainedRead(owner);assert.equal(refused.status,401);secretless(refused);}
      finally {clock=waitMessage(m=>m.clockSet);child.send({clockOffset:0});await clock;}
      await db.query('UPDATE journey_account_sessions SET revoked_at=$2 WHERE id=$1',[session.id,new Date()]);
      try {const refused=await retainedRead(owner);assert.equal(refused.status,401);secretless(refused);}
      finally {await db.query('UPDATE journey_account_sessions SET revoked_at=$2 WHERE id=$1',[session.id,session.revoked_at]);}
      const member=join(candidate,'vendor/hosted-wallet-market/src/retained-outcome.mjs'),bytes=readFileSync(member);
      writeFileSync(member,Buffer.concat([bytes,Buffer.from('\n// disposable stale reader\n')]));
      try {secretless(await retainedRead(owner,history.paid));}
      finally {writeFileSync(member,bytes);}
      await stop();options.tenant='root4550-foreign';
      try {
        // The existing populated store refuses a different configured tenant
        // before opening HTTP; no foreign namespace can read these rows.
        await assert.rejects(boot('source-bound:'+canonicalMachineProfile({...doc,tenant:options.tenant})),/fixture startup: tenant_refused/);
      } finally {await stop();options.tenant=tenant;await boot();}
      await assertRetained();
    });
    if(process.env.R4_WALLET_HISTORY_BASELINE==='1')return;

    await t.test('intent and commit require account session, origin, CSRF, operation key and both independent EOA signatures',async()=>{
      const before=await wallet(owner),issued=await challenge(owner,replacement),body=await proof(issued,old,replacement);
      assert.equal(issued.intent.origin,origin);assert.equal(issued.intent.accountId,owner.id);assert.equal(issued.intent.network,options.chain);
      assert.equal(issued.intent.oldAddress,address(old));assert.equal(issued.intent.newAddress,address(replacement));
      assert.equal(issued.intent.epoch,before.revocation_epoch);assert.match(issued.intent.nonce,/^[0-9a-f]{64}$/);
      for(const [label,headers] of [['session',{...auth(owner),cookie:''}],['origin',{...auth(owner),origin:'https://wrong.example.test'}],
        ['csrf',{...auth(owner),'x-cj-csrf':''}],['key',{...auth(owner),'idempotency-key':''}]]) {
        const refused=await ask('/v1/wallet/continuation/commit',{body,headers});assert.notEqual(refused.status,200,label);
      }
      assert.equal((await commit(foreign,body)).status,409); // foreign account has no predecessor wallet
      for(const [change,code] of [[{oldSignature:undefined},'old_wallet_control_required'],[{newSignature:undefined},'replacement_wallet_control_required'],
        [{oldSignature:body.newSignature},'old_wallet_control_required'],[{newSignature:body.oldSignature},'replacement_wallet_control_required']]) {
        const refused=await commit(owner,{...body,...change});assert.equal(refused.status,409);assert.equal(refused.body.code,code);
      }
      const next=await challenge(owner,replacement),different=await proof(next,old,replacement);
      assert.equal((await commit(owner,{...body,oldSignature:different.oldSignature})).body.code,'old_wallet_control_required');
      for(const patch of [{origin:'https://wrong.example.test'},{accountId:foreign.id},{network:'eip155:1'},
        {oldAddress:address(replacement)},{newAddress:address(old)},{epoch:0},{nonce:'0'.repeat(64)},{expiresAt:'2000-01-01T00:00:00.000Z'}]) {
        const changed={...issued.intent,...patch};
        const refused=await commit(owner,{...body,oldSignature:await old.signMessage({message:'pilot.wallet-continuation.v1:release-future-binding:'+digest(changed)})});
        assert.equal(refused.body.code,'old_wallet_control_required',JSON.stringify(patch));
      }
      assert.equal((await commit(owner,{...body,challengeDigest:'0'.repeat(64)})).body.code,'wallet_continuation_stale');
      assert.equal((await commit(owner,{...body,payoutDestination:address(replacement)})).body.code,'body_refused');
      assert.deepEqual(await wallet(owner),before);assert.deepEqual(await snapshot(),preserved);
    });
    await t.test('unsupported schemes and either contract wallet hold, without a new row or a lost-key exception',async()=>{
      const before=await wallet(owner);
      assert.equal((await ask('/v1/wallet/continuation/challenge',{body:{address:address(replacement),scheme:'erc1271'},headers:auth(owner)})).body.code,'wallet_scheme_unsupported');
      for(const target of [address(old),address(replacement)]) {
        contractAddresses.add(target);
        assert.equal((await ask('/v1/wallet/continuation/challenge',{body:{address:address(replacement)},headers:auth(owner)})).body.code,'contract_wallet_unsupported');
        contractAddresses.delete(target);
      }
      contractCode='0xef0100'+'33'.repeat(20);
      try {
        for(const target of [address(old),address(replacement)]) {
          contractAddresses.add(target);
          try {assert.equal((await ask('/v1/wallet/continuation/challenge',{body:{address:address(replacement)},headers:auth(owner)})).body.code,'contract_wallet_unsupported');}
          finally {contractAddresses.delete(target);}
        }
      } finally {contractCode='0x6000';}
      const issued=await challenge(owner,replacement),body=await proof(issued,old,replacement);
      for(const target of [address(old),address(replacement)]) {
        contractAddresses.add(target);
        try{assert.equal((await commit(owner,body)).body.code,'contract_wallet_unsupported');}
        finally{contractAddresses.delete(target);}
      }
      rpcChain='0x1';assert.notEqual((await ask('/v1/wallet/continuation/challenge',{body:{address:address(replacement)},headers:auth(owner)})).status,200);rpcChain='0x2105';
      assert.deepEqual(await wallet(owner),before);
    });
    await t.test('expired and exited predecessor intents remain stale',async()=>{
      const issued=await challenge(owner,replacement),body=await proof(issued,old,replacement);
      let received=waitMessage(m=>m.clockSet);child.send({clockOffset:300001});await received;
      assert.equal((await commit(owner,body)).body.code,'wallet_continuation_stale');
      received=waitMessage(m=>m.clockSet);child.send({clockOffset:0});await received;
      assert.equal((await ask('/v1/wallet/exit',{body:{},headers:auth(owner)})).status,200);
      assert.equal((await commit(owner,body)).body.code,'wallet_continuation_stale');
    });
    await t.test('native password recovery revokes the old session and cannot replace old wallet control',async()=>{
      const recoveredOwner=await signup();
      assert.equal((await ask('/v1/wallet/bind',{body:{address:address(old)},headers:auth(recoveredOwner)})).status,200);
      const before=await wallet(recoveredOwner),issued=await challenge(recoveredOwner,replacement),body=await proof(issued,old,replacement),oldAuth=auth(recoveredOwner);
      const recovered=await ask('/v1/account/recover',{body:{accountId:recoveredOwner.id,recoveryCode:recoveredOwner.recoveryCode,newPassword:randomBytes(24).toString('hex')},
        headers:{origin,'idempotency-key':key(),'x-account-operation-proof':randomBytes(32).toString('base64url')}});
      assert.equal(recovered.status,200,JSON.stringify(recovered.body));
      assert.equal((await ask('/v1/wallet/continuation/commit',{body,headers:oldAuth})).status,401);
      recoveredOwner.cookie=recovered.headers['set-cookie'][0].split(';')[0];recoveredOwner.csrf=recovered.headers['x-cj-csrf'];
      assert.equal((await commit(recoveredOwner,{challengeKey:issued.operationKey,challengeDigest:issued.challengeDigest})).body.code,'old_wallet_control_required');
      assert.deepEqual(await wallet(recoveredOwner),before);
      assert.equal((await commit(recoveredOwner,body)).status,200);assert.equal((await wallet(recoveredOwner)).address,address(replacement));
    });
    await t.test('session expiry during configured RPC reads rolls back both binding and receipt',async()=>{
      const expiring=await signup();
      assert.equal((await ask('/v1/wallet/bind',{body:{address:address(old)},headers:auth(expiring)})).status,200);
      const issued=await challenge(expiring,replacement),body=await proof(issued,old,replacement),before=await wallet(expiring),operationKey=key();
      await db.query('UPDATE journey_account_sessions SET expires_at=$2 WHERE account_id=$1',[expiring.id,new Date(Date.now()+600)]);
      rpcDelayMs=800;
      try{const refused=await commit(expiring,body,operationKey);assert.equal(refused.status,401);assert.equal(refused.body.code,'revoked');}
      finally{rpcDelayMs=0;await db.query('UPDATE journey_account_sessions SET expires_at=$2 WHERE account_id=$1',[expiring.id,new Date(Date.now()+86400000)]);}
      assert.deepEqual(await wallet(expiring),before);assert.equal((await readback(expiring,operationKey)).body.value.state,'absent');
    });
    let firstCommit,firstBody,firstKey;
    await t.test('dual control changes only future binding, atomically clears old proof, and preserves old accepted/paid/owed work',async()=>{
      const issued=await challenge(owner,replacement);firstBody=await proof(issued,old,replacement);firstKey=key();
      const before=await wallet(owner);firstCommit=await commit(owner,firstBody,firstKey);
      assert.equal(firstCommit.status,200,JSON.stringify(firstCommit.body));assert.equal(firstCommit.body.value.revocationEpoch,before.revocation_epoch+1);
      const after=await wallet(owner);assert.equal(after.address,address(replacement));assert.equal(after.control_epoch,null);
      assert.equal(after.control_digest,null);assert.equal(after.control_challenge,null);
      assert.deepEqual(await snapshot(),preserved);
      assert.equal((await market(owner,'walletProve',oldProof)).body.code,'wallet_challenge_stale');
      assert.equal((await market(owner,'walletChallenge',{address:address(old)})).body.code,'wallet_migration_requires_existing_authority');
      await control(owner,replacement);await assertRetained();
      const read=await readback(owner,firstKey);assert.deepEqual(read.body.value.response,firstCommit.body.value);
      assert.deepEqual((await commit(owner,firstBody,firstKey)).body.value,firstCommit.body.value);
      assert.equal((await commit(owner,{...firstBody,newSignature:firstBody.oldSignature},firstKey)).body.code,'immutable_operation_input_changed');
      assert.equal((await readback(foreign,firstKey)).status,404);
    });
    await t.test('missing capability and stale current source refuse the legacy continuation route, including cached mutations',async()=>{
      const before=await wallet(owner);await stop();await boot('');
      assert.equal((await commit(owner,firstBody,firstKey)).body.code,'machine_capability_required');
      assert.deepEqual((await readback(owner,firstKey)).body.value.response,firstCommit.body.value);
      await stop();await boot();
      const member=join(candidate,'vendor/hosted-wallet-market/src/wallet-continuation.mjs'),bytes=readFileSync(member);
      writeFileSync(member,Buffer.concat([bytes,Buffer.from('\n// disposable drift\n')]));
      assert.equal((await commit(owner,firstBody,firstKey)).body.code,'machine_profile_refused');
      writeFileSync(member,bytes);assert.deepEqual(await wallet(owner),before);
    });
    await t.test('a freshly admitted successor source cannot consume the predecessor challenge or renew old operations',async()=>{
      const before=await wallet(owner),issued=await challenge(owner,old),body=await proof(issued,replacement,old);
      const members=['vendor/hosted-wallet-market/src/wallet-continuation.mjs','vendor/hosted-wallet-market/SOURCE.json','server/foundry/activation/private-control-pin.json'];
      const originals=members.map(name=>readFileSync(join(candidate,name)));
      await stop();
      try {
        writeFileSync(join(candidate,members[0]),Buffer.concat([originals[0],Buffer.from('\n// disposable source successor\n')]));
        execFileSync(process.execPath,['server/scripts/refresh-installed-receiving-source.mjs'],{cwd:candidate,encoding:'utf8'});
        const successor={...doc,sourceSha256:installedSourceSha256(),hostSha256:hostSourceSha256(candidate)};
        assert.notEqual(successor.sourceSha256,doc.sourceSha256);
        await boot('source-bound:'+canonicalMachineProfile(successor));
        assert.equal((await commit(owner,body)).body.code,'wallet_continuation_stale');
        assert.deepEqual((await readback(owner,firstKey)).body.value.response,firstCommit.body.value);
        assert.deepEqual(await wallet(owner),before);assert.deepEqual(await snapshot(),preserved);
      } finally {
        await stop();members.forEach((name,i)=>writeFileSync(join(candidate,name),originals[i]));await boot();
      }
    });
    await t.test('concurrent distinct replacements consume at most one predecessor, and restoring an old address never restores its epoch',async()=>{
      const alternative=privateKeyToAccount('0x'+randomBytes(32).toString('hex'));
      const i1=await challenge(owner,old),i2=await challenge(owner,alternative),before=await wallet(owner);
      const b1=await proof(i1,replacement,old),b2=await proof(i2,replacement,alternative);
      const responses=await Promise.all([commit(owner,b1),commit(owner,b2)]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      assert.equal((await wallet(owner)).revocation_epoch,before.revocation_epoch+1);
      const winner=responses[0].status===200?old:alternative;
      if(winner!==old)assert.equal((await commit(owner,await proof(await challenge(owner,old),winner,old))).status,200);
      assert.equal((await wallet(owner)).address,address(old));
      assert.ok((await wallet(owner)).revocation_epoch>i1.intent.epoch);
      assert.equal((await market(owner,'walletProve',oldProof)).body.code,'wallet_challenge_stale');
    });
    for(const stage of ['before-update','before-commit','after-commit'])await t.test('real process crash '+stage+' reconciles the same journal key after restart',async()=>{
      const target=privateKeyToAccount('0x'+randomBytes(32).toString('hex'));
      const issued=await challenge(owner,target),body=await proof(issued,old,target),operationKey=key(),before=await wallet(owner);
      let received=waitMessage(m=>m.armed);child.send({arm:stage});await received;
      received=waitMessage(m=>m.phase===stage);
      const pending=commit(owner,body,operationKey).then(()=>({resolved:true}),()=>({lost:true}));
      await received;await stop(true);assert.equal((await pending).lost,true);
      await boot();const stored=await readback(owner,operationKey);
      assert.equal(stored.body.value.state,stage==='after-commit'?'recorded':'absent');
      const result=await commit(owner,body,operationKey);assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal((await wallet(owner)).revocation_epoch,before.revocation_epoch+1);assert.equal((await wallet(owner)).address,address(target));
      if(stage==='after-commit')assert.deepEqual(stored.body.value.response,result.body.value);
      const back=await challenge(owner,old);assert.equal((await commit(owner,await proof(back,target,old))).status,200);
    });
    let lostOperation;
    await t.test('lost HTTP response and ordinary retry/readback survive restart with one epoch increment',async()=>{
      const issued=await challenge(owner,replacement),body=await proof(issued,old,replacement),operationKey=key(),before=await wallet(owner);
      await assert.rejects(commit(owner,body,operationKey,{'x-r4-drop-response':'1'}));
      await stop(true);await boot();
      const stored=await readback(owner,operationKey),again=await commit(owner,body,operationKey);
      assert.deepEqual(stored.body.value.response,again.body.value);assert.equal((await wallet(owner)).revocation_epoch,before.revocation_epoch+1);
      lostOperation={body,operationKey,result:again.body.value};
      await control(owner,replacement);
    });
    await t.test('owned PostgreSQL immediate-stop crash recovers committed binding, epoch and journal through WAL',async()=>{
      const before=await wallet(owner);await stop();await db.end();db=null;
      // Retain the cluster helper's ownership contract across this test-owned
      // postmaster restart. No foreign PID, cluster or service is signalled.
      const ownerFile=join(cluster.scratch,'owned.json'),owned=JSON.parse(readFileSync(ownerFile));
      assert.equal(owned.pid,cluster.pid);assert.equal(owned.dataDir,cluster.dataDir);
      execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'-m','immediate','-w','stop'],{stdio:'ignore'});
      execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'-l',join(cluster.scratch,'postgres.log'),'-w','start'],{stdio:'ignore'});
      cluster.pid=Number(readFileSync(join(cluster.dataDir,'postmaster.pid'),'utf8').split('\n')[0]);
      writeFileSync(ownerFile,JSON.stringify({...owned,pid:cluster.pid}));cluster.stop=()=>stopCluster(cluster);
      assert.match(readFileSync(join(cluster.scratch,'postgres.log'),'utf8'),/database system was interrupted/);
      db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query('SET search_path TO cj227_earned_work');await boot();
      assert.deepEqual(await wallet(owner),before);assert.deepEqual((await readback(owner,lostOperation.operationKey)).body.value.response,lostOperation.result);
      assert.deepEqual((await commit(owner,lostOperation.body,lostOperation.operationKey)).body.value,lostOperation.result);
      assert.deepEqual(await snapshot(),preserved);
    });
    await t.test('native recovery on the original account preserves membership, old artifact bytes and original operation readback',async()=>{
      const previous={...owner},before=await wallet(owner);
      const recovered=await ask('/v1/account/recover',{body:{accountId:owner.id,recoveryCode:owner.recoveryCode,newPassword:randomBytes(24).toString('hex')},
        headers:{origin,'idempotency-key':key(),'x-account-operation-proof':randomBytes(32).toString('base64url')}});
      assert.equal(recovered.status,200,JSON.stringify(recovered.body));assert.equal(recovered.body.value.account.accountId,owner.id);
      owner.cookie=recovered.headers['set-cookie'][0].split(';')[0];owner.csrf=recovered.headers['x-cj-csrf'];
      assert.equal((await retainedRead(previous)).status,401);await assertRetained();
      assert.deepEqual(await wallet(owner),before);
      assert.deepEqual((await readback(owner,firstKey)).body.value.response,firstCommit.body.value);
      await stop();await boot();await assertRetained();
    });
    await t.test('old accepted bytes, fixed net, exact gross fee, payout destinations, paid-once and uncertain old identities survive all restarts',async()=>{
      assert.deepEqual(await snapshot(),preserved);
      const review=async item=>ask('/v1/review?taskId='+item.taskId+'&reservationId='+item.reservationId,{headers:auth(owner)});
      assert.deepEqual((await review(history.paid)).body,paidReview.body);assert.deepEqual((await review(history.owed)).body,owedReview.body);
      assert.deepEqual((await ask('/v1/payouts?limit=20',{headers:auth(owner)})).body,owedPayouts.body);
      const oldQuote=await market(requester,'read',{taskId:machineQuote.quote.taskId});assert.equal(oldQuote.status,200,JSON.stringify(oldQuote.body));
      assert.deepEqual(oldQuote.body.value.result.quote,machineQuote.quote);assert.deepEqual(oldQuote.body.value.result.partyTerms,machineQuote.parties);
      assert.notEqual((await market(requester,'fundingIntent',{taskId:machineQuote.quote.taskId,quoteDigest:digest(machineQuote.quote)})).status,200);
      const oldOperation=await readback(owner,'r4433-uncertain-old');assert.equal(oldOperation.body.value.response.sharedNonce,'17');
      assert.equal(oldOperation.body.value.response.destination,address(old));assert.equal(oldOperation.body.value.response.budgetRemaining,'0');
      assert.equal((await db.query("SELECT table_schema,table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema IN ('hosted_wallet_market','cj227_earned_work') ORDER BY 1,2,ordinal_position")).rows.length,initialSchema.length);
      assert.deepEqual((await db.query("SELECT table_schema,table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema IN ('hosted_wallet_market','cj227_earned_work') ORDER BY 1,2,ordinal_position")).rows,initialSchema);
      assert.ok(rpcMethods.every(m=>!['eth_sendTransaction','eth_sendRawTransaction','personal_sign','eth_sign'].includes(m)));
      t.diagnostic(JSON.stringify({candidateSourceSha256:doc.sourceSha256,candidateHostSha256:doc.hostSha256,
        migrationAdded:false,rpcMutations:0,financialRowsPreserved:true,peakOwnedRssKiB,nativeOwnerIncluded:Boolean(process.env.R4_WALLET_OWNER_PIDS)}));
      if(process.env.R4_FINANCIAL_EVIDENCE)writeFileSync(process.env.R4_FINANCIAL_EVIDENCE,JSON.stringify({synthetic:true,before:preserved,after:await snapshot(),artifacts:Object.fromEntries(Object.entries(history).map(([k,v])=>[k,{sha256:hash(v.bytes),base64:v.bytes.toString('base64')}]))},null,2)+'\n');
      assert.ok(peakOwnedRssKiB<2097152,'entire owned fixture process tree stays within the declared 2 GiB reserve');
    });
  } finally {
    clearInterval(memorySampler);await stop();await db?.end();if(rpc)await new Promise(r=>rpc.close(r));await cluster?.stop();
    rmSync(scratch,{recursive:true,force:true});
  }
});
