// Versioned source admission plus separately supplied closed principal authority.
import {readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,defineChain} from 'viem';
import {digest,AssetRegistry} from '../runtime/agent-economy-foundation/dist/index.js';
import {versionedSource,attestCandidate,candidateFeeQuote,RailStore,CommercePaymentsRail} from '../runtime/agent-economy-rail/dist/index.js';
const refuse=code=>{throw Object.assign(Error(code),{code,codeName:code,http:409});};
export function machineNetworkSource(value){
 const source=versionedSource(value?.chain);
 if(digest(source)!==digest(value))refuse('candidate_identity_changed');return source;
}
export async function openQualifiedMoney({capability,authority,profile,assertCurrent,approve,now=()=>Date.now()}){
 if(typeof authority==='string'){
  const st=lstatSync(authority);
  if(!authority.startsWith('/')||!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))refuse('machine_authority_required');
  const module=await import(pathToFileURL(authority).href);
  if(typeof module.openMachineAuthority!=='function')refuse('machine_authority_required');
  authority=await module.openMachineAuthority({origin:profile.origin,tenant:profile.tenant,sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256,networkSource:capability.networkSource});
 }
 const candidate=machineNetworkSource(capability.networkSource),mode=authority?.networkClass;
 if(capability.execution?.class!==mode||(mode==='owned-fork'&&capability.execution.forkId!==authority.forkId))refuse('machine_authority_required');
 if(!['public','owned-fork'].includes(mode)||typeof authority.operator?.signTransaction!=='function'||typeof authority.readAuthorization!=='function'||
  !Number.isSafeInteger(authority.grantEpoch)||authority.grantEpoch<1||profile.chain!==candidate.chain||profile.settlementToken!==candidate.token)refuse('machine_authority_required');
 const route=new URL(authority.rpcUrl),loopback=route.protocol==='http:'&&route.hostname==='127.0.0.1';
 if(route.username||route.password||route.hash||(mode==='public'&&(route.protocol!=='https:'||loopback))||(mode==='owned-fork'&&(!loopback||!/^[-a-zA-Z0-9_.]{1,64}$/.test(authority.forkId||''))))refuse('machine_authority_required');
 const chain=defineChain({id:candidate.chainId,name:'versioned machine market',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[route.href]}}});
 const client=createPublicClient({chain,transport:http(route.href,{retryCount:0}),cacheTime:0,pollingInterval:25});
 const attestation=await attestCandidate(client,candidate,now(),3600,mode);
 const asset={chain:candidate.chain,token:candidate.token,decimals:6,symbol:'USDC'};
 const environment=mode==='public'?'production':'sandbox',assets=new AssetRegistry(environment,[{asset,environment,canonical:{asset:'USDC',network:mode==='public'&&candidate.chainId===8453?'base':candidate.chain}}]);
 const journal=new RailStore(authority.journalPath,mode==='owned-fork'?{kind:'fork',forkId:authority.forkId}:{kind:'chain'});
 try{
  const operator=authority.operator.address?.toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(operator)||operator==='0x'+'0'.repeat(40))refuse('machine_authority_required');
  const feeLimits=Object.fromEntries(['gasLimit','maxFeePerGas','maxPriorityFeePerGas'].map(k=>{
   if(!/^[1-9][0-9]{0,29}$/.test(String(authority.feeLimits?.[k]||'')))refuse('fee_limit');return [k,BigInt(authority.feeLimits[k])];
  }));
  if(!/^[1-9][0-9]{0,39}$/.test(authority.nativeBudget||''))refuse('native_budget_required');
  const budgetKey=digest({tenant:profile.tenant,origin:profile.origin,operator,network:candidate.identityDigest,forkId:authority.forkId??null});
  journal.fence('machine-source',budgetKey,{identity:candidate.identityDigest,operator,feeRecipient:profile.feeRecipient},'machine_authority_changed');
  if(!journal.get('native-budget',budgetKey))journal.put('native-budget',budgetKey,{remaining:authority.nativeBudget,spent:'0',holds:{},unknown:[]});
  const authorityDigest=digest({origin:profile.origin,tenant:profile.tenant,profile:capability.profile,source:capability.sourceSha256,host:capability.hostSha256,
   network:candidate.identityDigest,executionClass:mode,forkId:authority.forkId??null,operator,feeRecipient:profile.feeRecipient,epoch:authority.grantEpoch,
   feeLimits:Object.fromEntries(Object.entries(feeLimits).map(([key,value])=>[key,String(value)])),nativeBudget:authority.nativeBudget});
  async function authorizeIntent(phase,id,witness){
   assertCurrent();const a=await authority.readAuthorization({phase,operationId:id});
   if(!a||a.schema!=='pilot.machine-rail-authority.v1'||a.revoked!==false||a.origin!==profile.origin||a.tenant!==profile.tenant||
    a.profile!=='machine-market'||a.executionClass!==mode||(mode==='owned-fork'&&a.forkId!==authority.forkId)||a.sourceSha256!==capability.sourceSha256||a.hostSha256!==capability.hostSha256||a.networkIdentityDigest!==candidate.identityDigest||
    a.operator!==operator||a.feeRecipient!==profile.feeRecipient||a.epoch!==authority.grantEpoch||Date.parse(a.expiresAt)<=now()||!Number.isFinite(Date.parse(a.expiresAt))||
    (witness&&(witness.grantEpoch!==a.epoch||witness.authorityDigest!==authorityDigest)))refuse('machine_signing_authority_refused');
  }
  const abi=JSON.parse(readFileSync(new URL('../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json',import.meta.url),'utf8'));
  const contracts={chain:candidate.chain,escrow:candidate.escrow,collector:candidate.collector,refundCollector:candidate.refundCollector,token:candidate.token,
   abi,abiDigest:candidate.abiDigest,contractVersion:candidate.candidateId,codeHashes:candidate.codeHashes};
  if(authority.contracts){
   const {abi:providedAbi,...provided}=authority.contracts,{abi:acceptedAbi,...accepted}=contracts;
   if(!Array.isArray(providedAbi)||digest(Object.fromEntries(providedAbi.map(e=>[`${e.type}:${e.name}`,e])))!==candidate.abiDigest||digest(provided)!==digest(accepted))refuse('machine_contract_substitution');
  }
  const network={networkClass:mode,forkId:authority.forkId,candidate,identityDigest:candidate.identityDigest,abiDigest:candidate.abiDigest,
   grantEpoch:authority.grantEpoch,authorityDigest,attestation,authorizeIntent,feeLimits,feeQuoteProvider:data=>candidateFeeQuote(client,feeLimits,data,mode),nativeBudgetKey:budgetKey};
  const rail=new CommercePaymentsRail(journal,client,authority.operator,'machine-commerce-v1',{...contracts,network},approve,1n,assets);
  return {journal,rail,asset,assets,contracts,operator:authority.operator,networkClass:mode,candidate};
 }catch(e){journal.close();throw e;}
}
