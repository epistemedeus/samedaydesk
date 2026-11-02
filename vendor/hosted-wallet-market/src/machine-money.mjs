// Versioned source admission plus separately supplied closed principal authority.
import {readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,defineChain,recoverTransactionAddress} from 'viem';
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
 // Replay permission is the current grant. It does not re-prove the old digest.
 if(expected.replay)return expected.historicalAuthority===true;
 if(expected.witness&&(expected.witness.grantEpoch!==grant.epoch||expected.witness.authorityDigest!==expected.authorityDigest))return false;
 return true;
}
const LINEAGE_SCHEMA='pilot.historical-authority-lineage.v1';
const BOUND_KEYS=['origin','tenant','profile','source','host','network','executionClass','forkId','operator','feeRecipient','epoch','feeLimits'];
const hex64=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const lineageAddress=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/.test(value)&&value!=='0x'+'0'.repeat(40);
const decimalText=(value,digits)=>typeof value==='string'&&new RegExp(`^[1-9][0-9]{0,${digits}}$`).test(value);
// Recompute the predecessor closure. nativeBudget is part of that closure only
// when the retained bound carried it. The known commits are not an allowlist.
export function historicalAuthorityDigest(bound){
 if(!bound||typeof bound!=='object'||Array.isArray(bound))return null;
 const keys=Object.keys(bound);
 const withBudget=Object.hasOwn(bound,'nativeBudget');
 if(keys.length!==BOUND_KEYS.length+(withBudget?1:0)||BOUND_KEYS.some(key=>!keys.includes(key)))return null;
 if(withBudget&&!keys.includes('nativeBudget'))return null;
 if(bound.profile!=='machine-market'||(bound.executionClass!=='public'&&bound.executionClass!=='owned-fork'))return null;
 if(bound.executionClass==='owned-fork'){if(typeof bound.forkId!=='string'||!/^[-a-zA-Z0-9_.]{1,64}$/.test(bound.forkId))return null;}
 else if(bound.forkId!==null)return null;
 if(!hex64(bound.source)||!hex64(bound.host)||!hex64(bound.network))return null;
 if(!lineageAddress(bound.operator)||!lineageAddress(bound.feeRecipient)||bound.operator===bound.feeRecipient)return null;
 if(!Number.isSafeInteger(bound.epoch)||bound.epoch<1||typeof bound.origin!=='string'||typeof bound.tenant!=='string')return null;
 const fees=bound.feeLimits;
 if(!fees||typeof fees!=='object'||Array.isArray(fees)||Object.keys(fees).length!==3)return null;
 if(!['gasLimit','maxFeePerGas','maxPriorityFeePerGas'].every(key=>decimalText(fees[key],29)))return null;
 const body={origin:bound.origin,tenant:bound.tenant,profile:bound.profile,source:bound.source,host:bound.host,
  network:bound.network,executionClass:bound.executionClass,forkId:bound.forkId,operator:bound.operator,feeRecipient:bound.feeRecipient,
  epoch:bound.epoch,feeLimits:{gasLimit:fees.gasLimit,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}};
 if(withBudget){if(!decimalText(bound.nativeBudget,39))return null;body.nativeBudget=bound.nativeBudget;}
 return digest(body);
}
function witnessComplete(witness){
 if(!witness||typeof witness!=='object'||Array.isArray(witness))return false;
 if(!hex64(witness.identityDigest)||!hex64(witness.authorityDigest)||!hex64(witness.abiDigest))return false;
 if(!Number.isSafeInteger(witness.grantEpoch)||witness.grantEpoch<0)return false;
 if(typeof witness.configuredChain!=='string'||!/^eip155:[1-9][0-9]*$/.test(witness.configuredChain))return false;
 if(witness.networkClass!=='public'&&witness.networkClass!=='owned-fork')return false;
 if(typeof witness.attestationRef!=='string')return false;
 return true;
}
// The lineage is the trusted retained closure. The witness is evidence, not the authority.
export function historicalLineageAccepts(lineage,witness){
 if(!Array.isArray(lineage)||lineage.length===0||lineage.length>16||!witnessComplete(witness))return null;
 for(const entry of lineage){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||entry.schema!==LINEAGE_SCHEMA)continue;
  const keys=Object.keys(entry);
  if(keys.length!==4||!['schema','configuredChain','abiDigest','bound'].every(key=>keys.includes(key)))continue;
  if(entry.configuredChain!==witness.configuredChain||!hex64(entry.abiDigest)||entry.abiDigest!==witness.abiDigest)continue;
  const proved=historicalAuthorityDigest(entry.bound);
  if(!proved||witness.identityDigest!==entry.bound.network||witness.grantEpoch!==entry.bound.epoch)continue;
  if(witness.networkClass!==entry.bound.executionClass||witness.authorityDigest!==proved)continue;
  return entry;
 }
 return null;
}
export async function historicalReplayPermitted(lineage,witness,raw){
 const entry=historicalLineageAccepts(lineage,witness);
 if(!entry||typeof raw!=='string')return null;
 let from='';
 try{from=(await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase();}catch{return null;}
 if(from!==entry.bound.operator)return null;
 return entry;
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
   const expected={origin:profile.origin,tenant:profile.tenant,executionClass:mode,forkId:authority.forkId,
    sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256,networkIdentityDigest:candidate.identityDigest,
    operator,feeRecipient:profile.feeRecipient,grantEpoch:authority.grantEpoch,authorityDigest,now:now()};
   // A different generation is replay of retained history, not a new signature.
   // No witness is not that history. The rail leaves it historical_unknown
   // before broadcast, and the broadcaster does not send those bytes.
   if(phase==='broadcast'&&witness){
    const sameGeneration=witness.grantEpoch===authority.grantEpoch&&witness.authorityDigest===authorityDigest;
    if(sameGeneration)expected.witness=witness;
    else{
     if(!historicalLineageAccepts(authority.historicalLineage,witness))refuse('machine_signing_authority_refused');
     expected.replay=true;expected.historicalAuthority=true;
    }
   }else if(witness)expected.witness=witness;
   if(!operationGrantAccepted(a,expected))refuse('machine_signing_authority_refused');
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
   ...(Array.isArray(authority.historicalLineage)?{historicalLineage:authority.historicalLineage}:{}),
   ...(typeof authority.withOperation==='function'?{withOperation:authority.withOperation}:{})};
  const rail=new CommercePaymentsRail(journal,client,authority.operator,'machine-commerce-v1',{...contracts,network},approve,1n,assets);
  return {journal,rail,asset,assets,contracts,operator:authority.operator,networkClass:mode,candidate};
 }catch(e){journal.close();throw e;}
}
