// Versioned source admission plus separately supplied closed principal authority.
import {readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,defineChain} from 'viem';
import {digest,AssetRegistry} from '../runtime/agent-economy-foundation/dist/index.js';
import {versionedSource,attestCandidate,candidateFeeQuote,RailStore,CommercePaymentsRail} from '../runtime/agent-economy-rail/dist/index.js';
import {machineNetworkSource} from './machine-network-source.mjs';
export {machineNetworkSource} from './machine-network-source.mjs';
const refuse=code=>{throw Object.assign(Error(code),{code,codeName:code,http:409});};
export function operationGrantAccepted(grant, expected){
 if(!grant||grant.schema!=='pilot.machine-rail-authority.v1'||grant.revoked!==false)return false;
 if(grant.origin!==expected.origin||grant.tenant!==expected.tenant||grant.profile!=='machine-market')return false;
 if(grant.executionClass!==expected.executionClass)return false;
 if(expected.executionClass==='owned-fork'&&grant.forkId!==expected.forkId)return false;
 if(grant.sourceSha256!==expected.sourceSha256||grant.hostSha256!==expected.hostSha256)return false;
 if(grant.networkIdentityDigest!==expected.networkIdentityDigest||grant.operator!==expected.operator)return false;
 if(grant.feeRecipient!==expected.feeRecipient||grant.epoch!==expected.grantEpoch)return false;
 const expiry=Date.parse(grant.expiresAt);
 if(!Number.isFinite(expiry)||expiry<=expected.now)return false;
 if(expected.witness&&(expected.witness.grantEpoch!==grant.epoch||expected.witness.authorityDigest!==expected.authorityDigest))return false;
 return true;
}
// The native budget is a store ceiling, not part of the signed transaction identity.
// A lower restart grant cannot raise a stored remaining balance and cannot leave
// remaining above spent plus outstanding holds. Holds, spent, and unknown stay.
export function applyNativeBudgetCeiling(stored, ceilingText){
 const ceiling=BigInt(ceilingText);
 if(!stored)return {remaining:ceilingText,spent:'0',holds:{},unknown:[]};
 const spent=BigInt(stored.spent||'0');
 const held=Object.values(stored.holds||{}).reduce((sum,value)=>sum+BigInt(value),0n);
 const committed=spent+held;
 const under=ceiling>committed?ceiling-committed:0n;
 const current=BigInt(stored.remaining);
 const remaining=under<current?under:current;
 return {...stored,remaining:remaining.toString(),spent:String(stored.spent),holds:stored.holds||{},unknown:[...(stored.unknown||[])]};
}
export async function openQualifiedMoney({capability,authority,profile,assertCurrent,assertFundingConsent,approve,now=()=>Date.now()}){
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
  const cappedBudget=applyNativeBudgetCeiling(journal.get('native-budget',budgetKey),authority.nativeBudget);
  const priorBudget=journal.get('native-budget',budgetKey);
  if(!priorBudget||priorBudget.remaining!==cappedBudget.remaining)journal.put('native-budget',budgetKey,cappedBudget);
  const authorityDigest=digest({origin:profile.origin,tenant:profile.tenant,profile:capability.profile,source:capability.sourceSha256,host:capability.hostSha256,
   network:candidate.identityDigest,executionClass:mode,forkId:authority.forkId??null,operator,feeRecipient:profile.feeRecipient,epoch:authority.grantEpoch,
   feeLimits:Object.fromEntries(Object.entries(feeLimits).map(([key,value])=>[key,String(value)]))});
  async function authorizeIntent(phase,id,witness){
   await assertFundingConsent(id);
   assertCurrent();const a=await authority.readAuthorization({phase,operationId:id});
   if(!operationGrantAccepted(a,{origin:profile.origin,tenant:profile.tenant,executionClass:mode,forkId:authority.forkId,
    sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256,networkIdentityDigest:candidate.identityDigest,
    operator,feeRecipient:profile.feeRecipient,grantEpoch:authority.grantEpoch,authorityDigest,now:now(),witness}))refuse('machine_signing_authority_refused');
  }
  const abi=JSON.parse(readFileSync(new URL('../runtime/agent-economy-foundation/interfaces/commerce-payments-v1.1.0.abi.json',import.meta.url),'utf8'));
  const contracts={chain:candidate.chain,escrow:candidate.escrow,collector:candidate.collector,refundCollector:candidate.refundCollector,token:candidate.token,
   abi,abiDigest:candidate.abiDigest,contractVersion:candidate.candidateId,codeHashes:candidate.codeHashes};
  if(authority.contracts){
   const {abi:providedAbi,...provided}=authority.contracts,{abi:acceptedAbi,...accepted}=contracts;
   if(!Array.isArray(providedAbi)||digest(Object.fromEntries(providedAbi.map(e=>[`${e.type}:${e.name}`,e])))!==candidate.abiDigest||digest(provided)!==digest(accepted))refuse('machine_contract_substitution');
  }
  const network={networkClass:mode,forkId:authority.forkId,candidate,identityDigest:candidate.identityDigest,abiDigest:candidate.abiDigest,
   grantEpoch:authority.grantEpoch,authorityDigest,attestation,authorizeIntent,feeLimits,feeQuoteProvider:data=>candidateFeeQuote(client,feeLimits,data,mode),nativeBudgetKey:budgetKey,
   ...(typeof authority.withOperation==='function'?{withOperation:authority.withOperation}:{})};
  const rail=new CommercePaymentsRail(journal,client,authority.operator,'machine-commerce-v1',{...contracts,network},approve,1n,assets);
  return {journal,rail,asset,assets,contracts,operator:authority.operator,networkClass:mode,candidate};
 }catch(e){journal.close();throw e;}
}
