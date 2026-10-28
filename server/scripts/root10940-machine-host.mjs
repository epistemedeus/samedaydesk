// Disposable extension of the existing ROOT404 real HTTPS/verify-full PG fixture.
// This helper is never imported by production. No authentication is substituted.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmodSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';

export async function machineHost() {
  const root=resolve(import.meta.dirname,'../..');
  const scratch=mkdtempSync(join(tmpdir(),'root10940-machine-'));
  let cluster,app,listener,rpc;
  try {
    cluster=await startCluster();
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1',
      '-addext','subjectAltName=IP:127.0.0.1','-keyout',join(scratch,'tls.key'),'-out',join(scratch,'tls.crt')],{stdio:'ignore',timeout:20000});
    chmodSync(join(scratch,'tls.key'),0o600);
    const url=new URL(cluster.connectionString),database='contributor_journey_staging_root10940_'+randomBytes(4).toString('hex');
    const adminEnv={...process.env,PGHOST:'127.0.0.1',PGPORT:String(cluster.port),PGUSER:cluster.username,PGDATABASE:'postgres',
      PGSSLMODE:'verify-full',PGSSLROOTCERT:url.searchParams.get('sslrootcert'),PGSSLCERT:url.searchParams.get('sslcert'),PGSSLKEY:url.searchParams.get('sslkey')};
    execFileSync(join(cluster.pgBin,'createdb'),['-h','127.0.0.1','-p',String(cluster.port),'-U',cluster.username,database],{env:adminEnv,stdio:'ignore',timeout:10000});
    // Match the ROOT404 fixture: verify-full server TLS with local fixture-role
    // authentication. The runtime URL never contains a privileged live role.
    const hba=join(cluster.dataDir,'pg_hba.conf');
    writeFileSync(hba,readFileSync(hba,'utf8').replaceAll(' clientcert=verify-full',''));
    execFileSync(join(cluster.pgBin,'pg_ctl'),['-D',cluster.dataDir,'reload'],{stdio:'ignore',timeout:10000});
    url.pathname='/'+database;url.searchParams.delete('sslcert');url.searchParams.delete('sslkey');
    const databaseUrl=url.href;
    const rpcMethods=[];
    rpc=http.createServer((req,res)=>{
      let data='';req.on('data',part=>{data+=part;});req.on('end',()=>{
        const request=JSON.parse(data);rpcMethods.push(request.method);
        const result={eth_chainId:'0x2105',eth_blockNumber:'0x10',eth_call:'0x'+(6n).toString(16).padStart(64,'0')}[request.method];
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,...(result?{result}:{error:{code:-32601,message:'read-only fixture'}})}));
      });
    });
    await new Promise(done=>rpc.listen(0,'127.0.0.1',done));
    const portLease=http.createServer();await new Promise(done=>portLease.listen(0,'127.0.0.1',done));
    const port=portLease.address().port;await new Promise(done=>portLease.close(done));
    const origin=`https://127.0.0.1:${port}`;
    const env={CONTRIBUTOR_JOURNEY_MODE:'staging',CONTRIBUTOR_JOURNEY_INSTALLED:'1',CONTRIBUTOR_JOURNEY_TRUST_PROXY:'0',
      CONTRIBUTOR_JOURNEY_DATABASE_URL:databaseUrl,CONTRIBUTOR_JOURNEY_OWNER_TOKEN:randomBytes(24).toString('hex'),
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN:randomBytes(24).toString('hex'),CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN:origin,
      CONTRIBUTOR_JOURNEY_REPLAY_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_INTEGRITY_KEY:randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_CURSOR_KEY:randomBytes(32).toString('hex'),CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS:'[]',
      CONTRIBUTOR_JOURNEY_PUBLIC_READS:'0',CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX:'10000'};
    const journey=await import('../../vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js');
    await journey.prepareJourneyDeployment({env,enroll:false});
    const admin=new pg.Client({connectionString:databaseUrl});await admin.connect();
    try {
      await admin.query('SET search_path TO cj227_earned_work');
      const {applyAdditiveSchema}=await import('../../vendor/hosted-wallet-market/src/migrate.mjs');
      await applyAdditiveSchema(admin);
      const {seedStaging}=await import('../../vendor/hosted-wallet-market/src/seed.mjs');await seedStaging(admin);
    }finally {await admin.end();}
    const ca=readFileSync(join(scratch,'tls.crt')),key=readFileSync(join(scratch,'tls.key'));
    const {createSdsApp}=await import('../app.js');
    const fault={dropAction:null};
    async function stop() {
      if(listener){listener.closeAllConnections();await new Promise(done=>listener.close(done));listener=null;}
      if(app){await app.get('hostedWalletMarket')?.close?.().catch(()=>{});await app.get('neoContributorJourney')?.close?.().catch(()=>{});app=null;}
    }
    async function boot({participation=true,tenant='root10940-owner-qa-fixture'}={}) {
      await stop();
      const out=join(scratch,'capability-'+randomBytes(4).toString('hex')+'.json');
      const generated=JSON.parse(execFileSync(process.execPath,['--max-old-space-size=256',join(root,'vendor/hosted-wallet-market/bin/machine-profile.mjs'),
        '--sds-root',root,'--origin',origin,'--tenant',tenant,'--money','unfunded','--out',out,
        ...(participation?['--participation','voluntary-artifact-v1']:[])],{encoding:'utf8',timeout:30000,maxBuffer:65536}));
      app=createSdsApp({hostedWalletMarket:{env:{...env,HOSTED_WALLET_MARKET_MACHINE_PROFILE:generated.sourceBound},
        mode:'private',label:'PRIVATE',chain:'eip155:8453',payments:'off',publicReads:'0',fundedTasks:'off',humanAssets:'off',
        tls:'verified-edge',origin,tenant,earnedSchema:'cj227_earned_work',schemaName:'hosted_wallet_market',databaseUrl,
        rpcUrl:`http://127.0.0.1:${rpc.address().port}`,feeRecipient:'0x'+'11'.repeat(20),
        settlementToken:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',replayKey:env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
        ownerToken:env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN},neomorphicContributorJourney:{env},neomorphicOpportunity:{env:{}},
        correspondence:{env:{}},hostedUsefulJourney:{env:{}},managedWatch:{env:{}}});
      await app.get('hostedWalletMarket').opened;
      await app.get('neoContributorJourney').ensure();
      listener=https.createServer({key,cert:ca},(req,res)=>{
        if(fault.dropAction&&req.url===`/api/neomorphic-contributor-journey/v1/market/${fault.dropAction}`){
          fault.dropAction=null;
          // The real router commits before send; only the response transport is
          // lost. Authentication, input checks and storage remain the producer.
          res.end=()=>{res.destroy();return res;};
        }
        app(req,res);
      });
      await new Promise(done=>listener.listen(port,'127.0.0.1',done));
      return generated;
    }
    async function request(path,{role,body,operationId,headers={},method='POST',localAddress}={}) {
      const payload=body===undefined?null:Buffer.from(JSON.stringify(body));
      return new Promise((done,reject)=>{
        const req=https.request(origin+path,{method,ca,timeout:15000,...(localAddress?{localAddress}:{}),headers:{origin,'x-ae-wire-version':'c0-1',
          ...(role?{cookie:role.cookie,'x-cj-csrf':role.csrf}:{}),...(payload?{'content-type':'application/json','content-length':String(payload.length)}:{}),
          ...(operationId?{'idempotency-key':operationId}:{}),...headers}},res=>{
          let bytes='';res.on('data',chunk=>{bytes+=chunk;});res.on('end',()=>{
            let body=null;try{body=JSON.parse(bytes);}catch{}
            done({status:res.statusCode,body});
          });res.on('error',reject);
        });
        req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));req.end(payload);
      });
    }
    // Historical money authority. Voluntary task, interest, measure, grant and
    // idempotency rows are excluded because this journey writes them.
    const unchangedAuthority=[
      ['cj227_earned_work','earned_work_tasks'],['cj227_earned_work','earned_work_terms'],
      ['cj227_earned_work','earned_work_reservations'],['cj227_earned_work','earned_work_submissions'],
      ['cj227_earned_work','earned_work_verdicts'],['cj227_earned_work','earned_work_obligations'],
      ['cj227_earned_work','earned_work_events'],['cj227_earned_work','opportunity_obligations'],
      ['cj227_earned_work','opportunity_events'],['cj227_earned_work','opportunity_submissions'],
      ['cj227_earned_work','opportunity_claims'],['cj227_earned_work','ae14_market_quotes'],
      ['cj227_earned_work','ae14_market_assents'],['cj227_earned_work','ae14_market_funding'],
      ['cj227_earned_work','ae14_market_consumers'],['cj227_earned_work','ae14_capture_approvals'],
      ['cj227_earned_work','ae14_capture_receipt_bindings'],['hosted_wallet_market','quotes'],
      ['hosted_wallet_market','funding_intents'],['hosted_wallet_market','captures'],
      ['hosted_wallet_market','native_debt_dispositions'],['hosted_wallet_market','grants'],
      ['hosted_wallet_market','reviews'],['hosted_wallet_market','delivery'],
      ['hosted_wallet_market_guard','preserved_obligation_ids'],['hosted_wallet_market_guard','obligation_guard_seal'],
    ];
    async function query(sql,args=[]) {
      const c=new pg.Client({connectionString:databaseUrl});await c.connect();
      try {return await c.query(sql,args);} finally {await c.end();}
    }
    async function financialSnapshot() {
      const present=await query(`SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE'`);
      const have=new Set(present.rows.map(row=>row.table_schema+'.'+row.table_name));
      const missing=unchangedAuthority.filter(([schema,name])=>!have.has(schema+'.'+name));
      if(missing.length) throw new Error('authority_table_absent:'+missing.map(item=>item.join('.')).join(','));
      const out={};
      for(const [schema,name] of unchangedAuthority){
        const row=(await query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS digest FROM "${schema}"."${name}" t`)).rows[0];
        out[schema+'.'+name]={count:row.count,digest:row.digest};
      }
      return out;
    }
    return {scratch,origin,databaseUrl,caFile:join(scratch,'tls.crt'),boot,stop,request,query,fault,financialSnapshot,rpcMethods,
      async close(){await stop();await new Promise(done=>rpc.close(done));await cluster.stop();rmSync(scratch,{recursive:true,force:true});}};
  }catch(error){
    if(listener)listener.closeAllConnections();
    if(app){await app.get('hostedWalletMarket')?.close?.().catch(()=>{});await app.get('neoContributorJourney')?.close?.().catch(()=>{});}
    if(rpc)rpc.close();if(cluster)await cluster.stop();rmSync(scratch,{recursive:true,force:true});throw error;
  }
}
