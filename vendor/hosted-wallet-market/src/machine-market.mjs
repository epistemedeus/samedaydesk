// Joins the existing account/kernel, requester market and money adapter.
// No account, obligation, balance or settlement ledger is implemented here.
import {readFileSync,lstatSync} from 'node:fs';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,defineChain,keccak256,recoverMessageAddress} from 'viem';
import pg from 'pg';
import {digest,AssetRegistry,BASE_USDC,PRODUCTION_ASSETS,COMMERCE_PAYMENTS_PIN} from '../runtime/agent-economy-foundation/dist/index.js';
import {CommercePaymentsRail,RailStore,REVIEW_WINDOW_SECONDS,CAPTURE_MARGIN_SECONDS} from '../runtime/agent-economy-rail/dist/index.js';
import {RequesterMarket} from '../runtime/agent-economy-market/src/market.mjs';
import {MarketStore} from '../runtime/agent-economy-market/src/store.mjs';
import {requesterMoneyFromRail} from '../runtime/agent-economy-market/src/a-money-adapter.mjs';
import {installedSourceSha256,hostSourceSha256} from './native-debt.mjs';
import {openQualifiedMoney,machineNetworkSource} from './machine-money.mjs';

const refuse=(code,http=409)=>{throw Object.assign(Error(code),{code,codeName:code,http});};
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&v!=='0x'+'0'.repeat(40);
const sha=value=>createHash('sha256').update(value).digest('hex');
export function readMachineCapability(input,{sdsRoot,origin,tenant}){
 if(!input)return null;
 if(typeof input==='string'){
  const st=lstatSync(input);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>65536)refuse('machine_profile_refused');
  input=JSON.parse(readFileSync(input,'utf8'));
 }
 if(input.schema!=='pilot.machine-market.capability.v1'||input.profile!=='machine-market'||input.origin!==origin||input.tenant!==tenant||
  input.sourceSha256!==installedSourceSha256()||input.hostSha256!==hostSourceSha256(sdsRoot)||
  input.discovery!=='qualified-source'||!['unfunded','sandbox','qualified'].includes(input.money))refuse('machine_profile_refused');
 if(input.networkSource)machineNetworkSource(input.networkSource);
 if(input.money==='qualified'&&!input.networkSource)refuse('machine_profile_refused');
 if(input.money==='qualified'&&(!['public','owned-fork'].includes(input.execution?.class)||(input.execution.class==='owned-fork'&&!/^[-a-zA-Z0-9_.]{1,64}$/.test(input.execution.forkId||''))))refuse('machine_profile_refused');
 return Object.freeze({...input});
}
export async function openMachineMarket({capability,authority,sdsRoot,profile,authenticate,withClient,now=()=>Date.now()}){
 if(!address(profile.feeRecipient))refuse('fee_recipient_refused');
 function assertCurrent(){if(capability.sourceSha256!==installedSourceSha256()||capability.hostSha256!==hostSourceSha256(sdsRoot))refuse('machine_profile_refused');}
 const source=pathToFileURL(join(sdsRoot,'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/earned-work/src/store/postgres.js'));
 const {createPostgresStore}=await import(source.href);
 const {ContributorAccountService}=await import(pathToFileURL(join(sdsRoot,'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services/contributor-journey/account/service.js')).href);
 const kernel=await createPostgresStore(profile.databaseUrl,{schema:profile.earnedSchema,poolMax:4});
 const accountService=new ContributorAccountService({database:kernel,kernel,enabled:true,replayKey:Buffer.from(profile.replayKey,'hex'),allowedKernelProvenance:['test','fixture']});
 const pool=new pg.Pool({connectionString:profile.databaseUrl,max:6,connectionTimeoutMillis:10000});
 let journal,rail,market,networkSource,contracts,operator,networkClass='sandbox';
 const moneyUnavailable=()=>refuse('machine_authority_required');
 try{
  const columns=(await withClient(c=>c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='hosted_wallet_market' AND table_name='wallets'"))).rows.map(r=>r.column_name);
  if(['control_epoch','control_digest','control_challenge'].some(name=>!columns.includes(name)))refuse('machine_schema_required');
  let assets=PRODUCTION_ASSETS,asset=BASE_USDC;
  if(capability.networkSource){
   networkSource=machineNetworkSource(capability.networkSource);
   if(profile.chain!==networkSource.chain||profile.settlementToken!==networkSource.token)refuse('machine_authority_required');
   asset={chain:networkSource.chain,token:networkSource.token,decimals:6,symbol:'USDC'};
   const environment=capability.execution?.class==='owned-fork'?'sandbox':'production';
   assets=new AssetRegistry(environment,[{asset,environment,canonical:{asset:'USDC',network:environment==='production'&&networkSource.chainId===8453?'base':networkSource.chain}}]);
  }
  let money={qualification:'unavailable',authorityId:'unqualified',protocol:COMMERCE_PAYMENTS_PIN,
    readProof:moneyUnavailable,captureOutcome:moneyUnavailable,capture:moneyUnavailable};
  if(capability.money==='qualified'){
   const opened=await openQualifiedMoney({capability,authority,profile,assertCurrent,approve:request=>{assertCurrent();return market.authorizeCaptureRequest(request);},now});
   ({journal,rail,assets,asset,contracts,operator,networkClass}=opened);networkSource=opened.candidate;money=requesterMoneyFromRail(rail);
  }else if(capability.money==='sandbox'){
   if(!authority||authority.networkClass!=='sandbox'||authority.contracts?.chain!=='eip155:31337'||profile.chain!==authority.contracts.chain||profile.settlementToken!==authority.contracts.token||!authority.operator?.signTransaction)refuse('machine_authority_required');
   const u=new URL(authority.rpcUrl);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.hash)refuse('machine_authority_required');
   const chain=defineChain({id:31337,name:'disposable machine-market',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[u.href]}}});
   const client=createPublicClient({chain,transport:http(u.href,{retryCount:0}),cacheTime:0,pollingInterval:25});
   if(await client.getChainId()!==31337)refuse('chain_identity_mismatch');
   for(const [target,hash] of Object.entries(authority.contracts.codeHashes)){
    if(keccak256(await client.getCode({address:target}))!==hash)refuse('contract_runtime_pin');
   }
   asset={chain:'eip155:31337',token:authority.contracts.token,decimals:6,symbol:'USDC'};
   assets=new AssetRegistry('sandbox',[{asset,environment:'sandbox',canonical:{asset:'USDC',network:'eip155:31337'}}]);
   journal=new RailStore(authority.journalPath);
   rail=new CommercePaymentsRail(journal,client,authority.operator,'machine-commerce-v1',authority.contracts,
     request=>{assertCurrent();return market.authorizeCaptureRequest(request);},1n,assets);
   money=requesterMoneyFromRail(rail);
   contracts=authority.contracts;operator=authority.operator;
  }else if(authority)refuse('machine_authority_refused');
  const store=new MarketStore(pool,profile.earnedSchema,assets);
  const query=(sql,args)=>withClient(c=>c.query(sql,args));
  const member=async(tenant,id)=>{
   if(tenant!==profile.tenant)return null;
   const row=(await query(`SELECT a.id,r.role,w.address,w.revocation_epoch,w.control_epoch,w.control_digest
     FROM journey_accounts a JOIN hosted_wallet_market.roles r ON r.account_id=a.id
     LEFT JOIN hosted_wallet_market.wallets w ON w.account_id=a.id WHERE a.id=$1`,[id])).rows[0];
   return row?{tenantId:tenant,actorId:row.id,role:row.role,payoutDestination:row.control_epoch===row.revocation_epoch&&row.control_digest?row.address:null,
     epoch:row.revocation_epoch,controlDigest:row.control_digest,cohort:'unknown'}:null;
  };
  const accounts={
   async principal(tenant,id,allocation){
    const m=await member(tenant,id);if(!m)return null;
    const binding=(await query(`SELECT token_hash FROM journey_account_kernel_bindings WHERE account_id=$1 AND earned_task_id=$2 AND kernel_scope=$2`,[id,allocation])).rows[0];
    if(binding)return kernel.findContributorByTokenHash(binding.token_hash);
    if(!m.payoutDestination)refuse('wallet_control_required');
    const q=(await pool.query(`SELECT binding FROM "${profile.earnedSchema}".ae14_market_quotes WHERE tenant_id=$1 AND allocation_id=$2`,[tenant,allocation])).rows[0]?.binding?.quote;
    if(!q||q.contributorId!==id||q.payoutDestination!==m.payoutDestination)refuse('principal_binding');
    // Stable private token identity; only the existing kernel owns creation and
    // claim. An INSERT race re-reads the same canonical token after a restart.
    const tokenHash=sha(createHmac('sha256',Buffer.from(profile.replayKey,'hex'))
      .update('machine-market-principal:'+digest({tenant,id,allocation})).digest('base64url'));
    let p=await kernel.findContributorByTokenHash(tokenHash);
    if(!p){try{await kernel.createContributorToken({publicId:'market-'+digest({tenant,id,allocation}).slice(0,32),payoutDestination:q.payoutDestination,
      taskScope:allocation,provenance:networkClass==='public'?'production':'test',tokenHash,expiresAt:null});}catch(e){if(e.code!=='conflict'&&e.code!=='23505')throw e;}
      p=await kernel.findContributorByTokenHash(tokenHash);}
    await query(`INSERT INTO journey_account_kernel_bindings(account_id,kernel_scope,earned_task_id,public_id,token_hash,principal_id,source,created_at)
      VALUES($1,$2,$2,$3,$4,$5,'created',now()) ON CONFLICT DO NOTHING`,[id,allocation,p.publicId,tokenHash,p.id]);return p;
   }
  };
  const partyTerms=async(a,contributor)=>{
   const payer=await member(a.tenantId,a.actorId);
   if(!payer?.payoutDestination||!contributor.payoutDestination)refuse('wallet_control_required');
   return {origin:capability.origin,sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256,profile:capability.profile,money:capability.money,...(networkSource?{networkIdentityDigest:networkSource.identityDigest}:{}),
    payer:payer.payoutDestination,payerEpoch:payer.epoch,payerControl:payer.controlDigest,
    receiver:contributor.payoutDestination,receiverEpoch:contributor.epoch,receiverControl:contributor.controlDigest};
  };
  market=new RequesterMarket({store,kernel,accounts,members:{resolve:member},authenticate:async req=>{
    const a=await authenticate(req);return {tenantId:profile.tenant,actorId:a.accountId};},money,assets,asset,
    feeRecipient:profile.feeRecipient,fundingTarget:rail?contracts.escrow:capability.networkSource?.escrow??'0xbdea0d1bcc5966192b070fdf62ab4ef5b4420cff',
    settlementAuthorityId:'machine-requester-review-v1',partyTerms,kernelProvenance:networkClass==='public'?'production':'test',now:()=>new Date(now())});
  await market.prepare();
  async function issueSession(operation,req,body,client){
   const input=operation==='signup'?{password:body.password,displayName:body.displayName}:body;
   // C0 effect keys contain '#step'; the native authority admits opaque keys.
   // Preserve the original operation identity through a deterministic adapter.
   const result=await accountService[operation](input,{idempotencyKey:'machine-'+sha(req.headers['idempotency-key']),proof:req.headers['x-account-operation-proof']},{clientAddress:req.socket.remoteAddress});
   if(!result.ok)refuse(result.error.code,result.error.status);
   const receipt=result.value,accountId=receipt.account.accountId,cookie='__Host-neo_contributor='+receipt.sessionToken,csrf=randomBytes(32).toString('hex');
   if(operation==='signup')await client.query('INSERT INTO hosted_wallet_market.roles(account_id,role) VALUES($1,$2) ON CONFLICT DO NOTHING',[accountId,body.role]);
   const role=(await client.query('SELECT role FROM hosted_wallet_market.roles WHERE account_id=$1',[accountId])).rows[0]?.role;
   if(!role)refuse('role_required',403);
   await client.query(`INSERT INTO hosted_wallet_market.session_delivery(account_id,cookie_hash,csrf) VALUES($1,$2,$3)
     ON CONFLICT(account_id) DO UPDATE SET cookie_hash=EXCLUDED.cookie_hash,csrf=EXCLUDED.csrf`,[accountId,sha(cookie),csrf]);
   return {accountId,proofHash:sha(req.headers['x-account-operation-proof']),cookie,csrf,
    value:{sessionDelivery:'cookie',account:{accountId,role},...(receipt.recoveryCode?{recoveryCode:receipt.recoveryCode}:{})}};
  }
  async function walletChallenge(a,body){
   if(Object.keys(body).length!==1||!address(body.address))refuse('address_refused',400);
   const row=(await query('SELECT address,revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id=$1',[a.accountId])).rows[0];
   if(row&&row.address!==body.address)refuse('wallet_migration_requires_existing_authority');
   const challenge={schema:'pilot.machine-wallet-control.v1',origin:capability.origin,tenant:profile.tenant,accountId:a.accountId,
    address:body.address,epoch:row?.revocation_epoch??0,nonce:randomBytes(32).toString('hex'),expiresAt:new Date(now()+300000).toISOString()};
   await query(`INSERT INTO hosted_wallet_market.wallets(account_id,address,control_challenge) VALUES($1,$2,$3)
      ON CONFLICT(account_id) DO UPDATE SET control_challenge=EXCLUDED.control_challenge`,[a.accountId,body.address,JSON.stringify(challenge)]);
   return {challenge,message:'pilot.machine-wallet-control.v1:'+digest(challenge),bound:false,custody:'principal_controlled'};
  }
  async function walletProve(a,body){
   if(Object.keys(body).length!==2||!body.signature||!body.challengeDigest)refuse('body_refused',400);
   return withClient(async c=>{
    await c.query('BEGIN');try{
     const row=(await c.query('SELECT * FROM hosted_wallet_market.wallets WHERE account_id=$1 FOR UPDATE',[a.accountId])).rows[0],challenge=row?.control_challenge;
     if(!challenge||digest(challenge)!==body.challengeDigest||challenge.epoch!==row.revocation_epoch||Date.parse(challenge.expiresAt)<=now())refuse('wallet_challenge_stale');
     if((await recoverMessageAddress({message:'pilot.machine-wallet-control.v1:'+digest(challenge),signature:body.signature})).toLowerCase()!==row.address)refuse('wallet_control_required');
     await c.query('UPDATE hosted_wallet_market.wallets SET control_epoch=revocation_epoch,control_digest=$2 WHERE account_id=$1',[a.accountId,digest(challenge)]);
     await c.query('COMMIT');return {address:row.address,epoch:row.revocation_epoch,controlProved:true,custody:'principal_controlled'};
    }catch(e){await c.query('ROLLBACK');throw e;}
   });
  }
  async function selected(req,input){
   const a=await market.actor(req);
   return market.selected(a,input.taskId,input.quoteDigest,'requester');
  }
  async function fundingIntent(req,input){
   if(!rail)moneyUnavailable();
   if(Object.keys(input).length!==2)refuse('body_refused',400);
   const {binding:b}=await selected(req,input),q=b.quote,parties=b.parties;
   const previous=journal.all('funding').find(x=>digest(x.quote)===digest(q));
   const payer=await member(q.tenantId,q.requesterId),receiver=await member(q.tenantId,q.contributorId);
   if(!parties)refuse('wallet_authority_changed');
   if(!previous?.authorizationTx&&(parties.sourceSha256!==capability.sourceSha256||parties.hostSha256!==capability.hostSha256||parties.profile!==capability.profile||parties.money!==capability.money||parties.networkIdentityDigest!==networkSource?.identityDigest))refuse('machine_profile_refused');
   if(!previous?.authorizationTx&&(payer.controlDigest!==parties.payerControl||payer.epoch!==parties.payerEpoch||payer.payoutDestination!==parties.payer||
    receiver.controlDigest!==parties.receiverControl||receiver.epoch!==parties.receiverEpoch||receiver.payoutDestination!==parties.receiver))refuse('wallet_authority_changed');
   const expiry=Math.floor(Date.parse(q.expiresAt)/1000),authorizationExpiry=expiry+REVIEW_WINDOW_SECONDS+CAPTURE_MARGIN_SECONDS+1;
   const payment={operator:operator.address,payer:parties.payer,receiver:q.payoutDestination,token:q.asset.token,maxAmount:BigInt(q.gross),
    preApprovalExpiry:expiry,authorizationExpiry,refundExpiry:authorizationExpiry,minFeeBps:500,maxFeeBps:500,feeReceiver:q.feeRecipient,salt:BigInt('0x'+digest(q))};
   const proofId=await rail.bindQuote(q,payment),typedData=await rail.authorizationTypedData(proofId);
   return JSON.parse(JSON.stringify({schema:'pilot.machine-funding-intent.v1',networkClass,chain:q.asset.chain,...(networkSource?{networkSource,execution:capability.execution}:{}),
    quote:q,quoteDigest:digest(q),proofId,payment,typedData,contracts,origin:capability.origin,
    profile:capability.profile,sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256},(_,v)=>typeof v==='bigint'?v.toString():v));
  }
  async function fundingSubmitted(req,input){
   if(!rail)moneyUnavailable();
   if(Object.keys(input).length!==4||!/^0x[0-9a-f]{64}$/.test(input.transactionHash||''))refuse('body_refused',400);
   const {binding:{quote:q}}=await selected(req,input);
   const saved=journal.all('funding').find(x=>x.proofId===input.proofId);
   if(!saved||digest(saved.quote)!==digest(q))refuse('funding_proof_binding');
   await rail.submitted(input.proofId,input.transactionHash);
   return market.fund(req,{taskId:input.taskId,quoteDigest:input.quoteDigest,proofId:input.proofId});
  }
  async function fundingAuthorize(req,input,operationId){
   if(!rail)moneyUnavailable();
   if(Object.keys(input).length!==4||!/^0x[0-9a-fA-F]{130}$/.test(input.signature||'')||!/^[-a-zA-Z0-9_.:/]{8,160}$/.test(operationId||''))refuse('body_refused',400);
   const {binding:b}=await selected(req,input),saved=journal.all('funding').find(x=>x.proofId===input.proofId);
   if(!saved||digest(saved.quote)!==digest(b.quote))refuse('funding_proof_binding');
   // Revocation blocks a fresh authorization. An existing broadcast remains
   // the original on-chain operation and can only be observed/recovered.
   if(!saved.authorizationTx){
    const intent=await fundingIntent(req,{taskId:input.taskId,quoteDigest:input.quoteDigest});
    if(intent.proofId!==input.proofId)refuse('funding_proof_binding');
   }
   await rail.authorize(input.proofId,input.signature,'authorize-'+digest({taskId:input.taskId,operationId}));
   return market.fund(req,{taskId:input.taskId,quoteDigest:input.quoteDigest,proofId:input.proofId});
  }
  const readActions=new Set(['list','read','retained','measurement','payoutDisposition','reconcile']);
  const methods=new Set(['post','list','interest','quote','select','assent','fund','claim','deliver','review','approve','reconcile','payoutDisposition','read','grantConsumer','retained','downstreamUse','serviceCost','repeatPurchase','measurement']);
  async function dispatch(req,action,input,operationId){
   assertCurrent();
   if(!input||typeof input!=='object'||Array.isArray(input))refuse('body_refused',400);
   const account=await authenticate(req,{write:true});
   if(['post','quote','select','fund','review','approve','fundingIntent','fundingSubmitted','fundingAuthorize','reclaim'].includes(action)&&account.role!=='requester')refuse('requester_required',403);
   if(['interest','assent','claim','deliver'].includes(action)&&account.role!=='contributor')refuse('contributor_required',403);
   if(action==='walletChallenge')return walletChallenge(account,input);
   if(action==='walletProve')return walletProve(account,input);
   if(action==='fundingIntent')return fundingIntent(req,input);
   if(action==='fundingSubmitted')return fundingSubmitted(req,input);
   if(action==='fundingAuthorize')return fundingAuthorize(req,input,operationId);
   if(action==='reclaim'){
    if(!rail)moneyUnavailable();const {binding:{quote:q}}=await selected(req,input);
    const saved=journal.all('funding').find(x=>digest(x.quote)===digest(q));if(!saved)refuse('funding_absent');
    // Reclaim is submitted by the payer on chain. This route only reads its
    // terminal outcome through the original capture journal.
    return market.reconcile(req,{taskId:input.taskId});
   }
   if(!methods.has(action))refuse('not_found',404);
   if(!readActions.has(action)&&!/^[-a-zA-Z0-9_.:/]{8,160}$/.test(operationId||''))refuse('idempotency_required',400);
   const result=action==='select'?await market.select(req,input,operationId):await market[action](req,input,operationId);
   if(action==='measurement'){
    const {row,binding}=await market.bound(await market.actor(req),input.taskId);
    const registration=(await query(`SELECT a.id,a.created_at,o.idempotency_key FROM journey_accounts a
      LEFT JOIN journey_account_operations o ON o.account_id=a.id AND o.operation='signup' WHERE a.id=ANY($1)`,[[row.requester_id,binding?.quote.contributorId].filter(Boolean)])).rows;
    return {...result,registration:registration.map(r=>({accountId:r.id,createdAt:r.created_at,operation:r.idempotency_key,verification:'server_observed'})),
     transitions:(await store.measures(profile.tenant,input.taskId)).filter(r=>r.kind==='transition'||r.kind==='discovery'),
     acquisition:{observed:'unknown',selfReported:'unknown'},profit:null,coverage:'observed_records_only'};
   }
   const taskId=input.taskId||result?.taskId;
   if(taskId&&methods.has(action)&&action!=='measurement'){
    await store.measure(profile.tenant,taskId,'transition',digest({actor:account.accountId,action,operationId:operationId??digest(input)}),account.accountId,
     {action,verification:'server_observed',source:'hosted-machine-market',operationId:operationId??null,moneyProvenance:money.qualification,acquisition:'unknown'});
   }
   return result;
  }
  // Each capture can hold a task transaction and an approval transaction
  // while making receipt queries. Reserve those queries in the six-slot pool.
  let activeRequests=0;const waiting=[];
  async function invoke(...args){
   if(activeRequests>=2){
    if(waiting.length>=64)refuse('market_busy',503);
    await new Promise(resolve=>waiting.push(resolve));
   }else activeRequests++;
   try{return await dispatch(...args);}
   finally{if(waiting.length)waiting.shift()();else activeRequests--;}
  }
  async function discover({limit=50,cursor=''}={}){
   assertCurrent();
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||typeof cursor!=='string'||cursor.length>200)refuse('page_refused',400);
   const rows=(await pool.query(`SELECT t.id,t.spec,t.selected_quote,EXISTS(SELECT 1 FROM "${profile.earnedSchema}".ae14_market_funding f
     JOIN "${profile.earnedSchema}".ae14_market_quotes q ON q.allocation_id=f.allocation_id AND q.tenant_id=f.tenant_id
     WHERE q.tenant_id=t.tenant_id AND q.task_id=t.id) AS funding_started
     FROM "${profile.earnedSchema}".ae14_market_tasks t WHERE tenant_id=$1 AND id>$2 ORDER BY id LIMIT $3`,[profile.tenant,cursor,limit])).rows;
   const items=rows.map(r=>({taskId:r.id,title:r.spec.title,summary:r.spec.summary,criteria:r.spec.criteria,payableKinds:r.spec.payableKinds,assigned:Boolean(r.selected_quote),fundingState:r.funding_started?'funding_started':'unfunded_interest'}));
   for(const r of rows)await store.measure(profile.tenant,r.id,'discovery',randomBytes(16).toString('hex'),'anonymous',
    {verification:'server_observed',source:capability.sourceSha256,operation:'anonymous-page-read',acquisition:'unknown',uniquePrincipal:null});
   return {items,nextCursor:rows.length===limit?rows.at(-1).id:null,publicEnabled:true,moneyQualified:Boolean(networkSource&&rail),signerAuthority:false,provenance:money.qualification};
  }
  function publicProfile(){
   assertCurrent();const fields=['schema','profile','origin','tenant','sourceSha256','hostSha256','discovery','money','networkSource','execution'];
   return {capability:Object.fromEntries(fields.filter(k=>capability[k]!==undefined).map(k=>[k,capability[k]])),signerAuthority:false};
  }
  return {invoke,discover,publicProfile,issueSession,market,rail,readActions,
   descriptor:{profile:capability.profile,discovery:true,moneyQualification:money.qualification,sourceQualified:Boolean(networkSource),publicMoney:networkClass==='public'?'authority_checked_per_operation':false,signerAuthority:false},
   async close(){journal?.close();await pool.end();await kernel.close();}};
 }catch(e){journal?.close();await pool.end();await kernel.close();throw e;}
}
