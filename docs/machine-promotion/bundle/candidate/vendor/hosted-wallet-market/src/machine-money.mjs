// Versioned source admission plus separately supplied closed principal authority.
import {readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPublicClient,http,defineChain,encodeFunctionData,keccak256,parseTransaction,recoverTransactionAddress} from 'viem';
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
const uintText=(value,digits)=>typeof value==='string'&&new RegExp(`^(0|[1-9][0-9]{0,${digits}})$`).test(value);
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
// Trust producer: the signing frame writes pilot.retained-intent.v1 in the same
// committed transition as the raw bytes. A legacy row has no such record. Its
// proof is authority.historicalRetainedIntents, retained from the original
// signing observation. Recovery reads that proof. It does not rebuild the payer
// signature, operation, quote, or approval from the candidate row. A missing
// proof stays unknown and leaves debt, holds, nonce, allocations, funding, and payment.
export const RETAINED_INTENT_SCHEMA='pilot.retained-intent.v1';
const RETAINED_ENVELOPE=['schema','intentId','txId','authorityDigest','to','data','nonce','configuredChain','feeLimits','value','type'];
const RETAINED_BUSINESS=['proofId','operationId','quoteDigest','approvalDigest','payerSignature','collector','gross','payment'];
const RETAINED_PAYMENT=['operator','payer','receiver','token','feeReceiver','maxAmount','salt','preApprovalExpiry','authorizationExpiry','refundExpiry','minFeeBps','maxFeeBps'];
const txHash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value);
const byteHex=value=>typeof value==='string'&&/^0x[0-9a-f]*$/.test(value)&&value.length%2===0&&value.length<=16386;
const sameHex= (left,right)=>typeof left==='string'&&typeof right==='string'&&left.toLowerCase()===right.toLowerCase();
const feeTrio=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3)return null;
 const fees={};
 for(const key of ['gasLimit','maxFeePerGas','maxPriorityFeePerGas']){
  if(!decimalText(value[key],29))return null;
  fees[key]=value[key];
 }
 return fees;
};
function retainedPayment(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==RETAINED_PAYMENT.length)return null;
 if(RETAINED_PAYMENT.some(key=>!Object.hasOwn(value,key)))return null;
 const payment={};
 for(const key of ['operator','payer','receiver','token','feeReceiver']){
  if(!lineageAddress(value[key]))return null;
  payment[key]=value[key];
 }
 for(const key of ['maxAmount','salt']){
  if(!uintText(value[key],77))return null;
  payment[key]=value[key];
 }
 for(const key of ['preApprovalExpiry','authorizationExpiry','refundExpiry','minFeeBps','maxFeeBps']){
  if(!Number.isSafeInteger(value[key])||value[key]<0)return null;
  payment[key]=value[key];
 }
 return payment;
}
export function normalizeRetainedIntent(record){
 if(!record||typeof record!=='object'||Array.isArray(record)||record.schema!==RETAINED_INTENT_SCHEMA)return null;
 const keys=Object.keys(record);
 const business=RETAINED_BUSINESS.some(key=>keys.includes(key));
 const allowed=business?RETAINED_ENVELOPE.length+RETAINED_BUSINESS.length:RETAINED_ENVELOPE.length;
 if(keys.length!==allowed||RETAINED_ENVELOPE.some(key=>!keys.includes(key)))return null;
 if(business&&RETAINED_BUSINESS.some(key=>!keys.includes(key)))return null;
 if(typeof record.intentId!=='string'||record.intentId.length<6||record.intentId.length>300||/[\u0000-\u001f]/.test(record.intentId))return null;
 if(!txHash(record.txId)||!hex64(record.authorityDigest)||!lineageAddress(record.to)||!byteHex(record.data))return null;
 if(!Number.isSafeInteger(record.nonce)||record.nonce<0)return null;
 if(typeof record.configuredChain!=='string'||!/^eip155:[1-9][0-9]*$/.test(record.configuredChain))return null;
 const fees=feeTrio(record.feeLimits);
 if(!fees||record.value!=='0'||record.type!=='eip1559')return null;
 const normalized={schema:RETAINED_INTENT_SCHEMA,intentId:record.intentId,txId:record.txId,authorityDigest:record.authorityDigest,to:record.to,data:record.data,nonce:record.nonce,configuredChain:record.configuredChain,feeLimits:fees,value:'0',type:'eip1559'};
 if(!business)return normalized;
 if(typeof record.proofId!=='string'||typeof record.operationId!=='string'||record.proofId.length<1||record.operationId.length<1||record.proofId.length>300||record.operationId.length>300)return null;
 if(!hex64(record.quoteDigest)||!hex64(record.approvalDigest)||!byteHex(record.payerSignature)||record.payerSignature.length<4)return null;
 if(!lineageAddress(record.collector)||!uintText(record.gross,77))return null;
 const payment=retainedPayment(record.payment);
 if(!payment)return null;
 return {...normalized,proofId:record.proofId,operationId:record.operationId,quoteDigest:record.quoteDigest,approvalDigest:record.approvalDigest,payerSignature:record.payerSignature,collector:record.collector,gross:record.gross,payment};
}
export function retainedIntentFromSigning({id,raw,nonce,to,data,identity}){
 if(!identity?.authorityDigest||!identity.feeLimits||!identity.configuredChain||typeof raw!=='string')return null;
 const fees=identity.feeLimits;
 const record={schema:RETAINED_INTENT_SCHEMA,intentId:id,txId:keccak256(raw),authorityDigest:identity.authorityDigest,to:String(to).toLowerCase(),data,nonce,configuredChain:identity.configuredChain,
  feeLimits:{gasLimit:String(fees.gasLimit),maxFeePerGas:String(fees.maxFeePerGas),maxPriorityFeePerGas:String(fees.maxPriorityFeePerGas)},value:'0',type:'eip1559'};
 const commitment=identity.fundCommitment;
 if(commitment)Object.assign(record,{proofId:commitment.proofId,operationId:commitment.operationId,quoteDigest:commitment.quoteDigest,approvalDigest:commitment.approvalDigest,payerSignature:commitment.payerSignature,collector:String(commitment.collector).toLowerCase(),gross:String(commitment.gross),payment:commitment.payment});
 return normalizeRetainedIntent(record);
}
export function currentGenerationWitness(witness,network){
 if(!witnessComplete(witness)||!network)return false;
 return witness.grantEpoch===network.grantEpoch&&witness.authorityDigest===network.authorityDigest&&witness.configuredChain===network.configuredChain&&witness.networkClass===network.networkClass&&witness.abiDigest===network.abiDigest&&witness.identityDigest===network.identityDigest;
}
function manifestRecord(entries,intentId){
 if(!Array.isArray(entries)||entries.length>64)return {record:null,refused:Array.isArray(entries)&&entries.length>64};
 const matches=[];
 for(const entry of entries){
  const normalized=normalizeRetainedIntent(entry);
  if(normalized?.intentId===intentId)matches.push(normalized);
 }
 if(matches.length>1)return {record:null,refused:true};
 return {record:matches[0]??null,refused:false};
}
export function selectRetainedIntent(generation,intentId,journalRecord,manifestEntries){
 const journal=journalRecord?normalizeRetainedIntent(journalRecord):null;
 const journalFit=journal?.intentId===intentId?journal:null;
 if(generation==='current')return journalFit;
 if(generation!=='historical')return null;
 const manifest=manifestRecord(manifestEntries,intentId);
 if(manifest.refused)return null;
 if(journalFit&&manifest.record)return digest(journalFit)===digest(manifest.record)?manifest.record:null;
 return manifest.record||journalFit||null;
}
function feesEqual(recordFees,expected){
 if(!expected)return false;
 try{return ['gasLimit','maxFeePerGas','maxPriorityFeePerGas'].every(key=>BigInt(recordFees[key])===BigInt(expected[key]));}
 catch{return false;}
}
export async function retainedEnvelopeAccepts(record,raw,intent,identity){
 if(!record||typeof raw!=='string'||!intent?.witness)return false;
 let parsed;
 try{parsed=parseTransaction(raw);}catch{return false;}
 let from='';
 try{from=(await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase();}catch{return false;}
 const operator=typeof identity?.operator==='string'?identity.operator.toLowerCase():'';
 if(!lineageAddress(operator)||from!==operator)return false;
 if(keccak256(raw)!==record.txId||!sameHex(intent.txId,record.txId))return false;
 if(`eip155:${parsed.chainId}`!==record.configuredChain||record.configuredChain!==identity.configuredChain||intent.witness.configuredChain!==record.configuredChain)return false;
 if(parsed.type!=='eip1559'||(parsed.value??0n)!==0n)return false;
 if(parsed.nonce!==record.nonce||(intent.nonce!==undefined&&intent.nonce!==record.nonce))return false;
 if(!feesEqual(record.feeLimits,{gasLimit:parsed.gas,maxFeePerGas:parsed.maxFeePerGas,maxPriorityFeePerGas:parsed.maxPriorityFeePerGas}))return false;
 const escrow=identity.escrow?String(identity.escrow).toLowerCase():record.to;
 if(!sameHex(parsed.to,record.to)||record.to!==escrow||!sameHex(parsed.data,record.data))return false;
 if(record.authorityDigest!==intent.witness.authorityDigest)return false;
 if(currentGenerationWitness(intent.witness,identity))return record.authorityDigest===identity.authorityDigest&&feesEqual(record.feeLimits,identity.feeLimits);
 const entry=historicalLineageAccepts(identity.historicalLineage,intent.witness);
 if(!entry||from!==entry.bound.operator||!feesEqual(record.feeLimits,entry.bound.feeLimits))return false;
 return record.authorityDigest===historicalAuthorityDigest(entry.bound);
}
export function retainedBusinessAccepts(record,input){
 if(!record?.proofId||!input?.abi)return false;
 if(input.operationId!==record.operationId)return false;
 if(!input.fundingOperation||input.fundingOperation.operationId!==record.operationId)return false;
 if(input.proofId!==record.proofId||!input.quote||digest(input.quote)!==record.quoteDigest||String(input.quote.gross)!==record.gross)return false;
 if(!input.payment||digest(input.payment)!==record.approvalDigest)return false;
 if(!input.allocation||input.allocation.proofId!==record.proofId||input.allocation.quoteDigest!==record.quoteDigest)return false;
 if(String(input.collector||'').toLowerCase()!==record.collector)return false;
 let expected='';
 try{
  const payment={...record.payment,maxAmount:BigInt(record.payment.maxAmount),salt:BigInt(record.payment.salt)};
  expected=encodeFunctionData({abi:input.abi,functionName:'authorize',args:[payment,BigInt(record.gross),record.collector,record.payerSignature]});
 }catch{return false;}
 return sameHex(expected,record.data);
}
export async function machineBroadcastPermitted(identity,intent){
 if(typeof identity?.authorizeIntent!=='function')return true;
 if(!intent?.witness||typeof intent.raw!=='string')return false;
 const generation=currentGenerationWitness(intent.witness,identity)?'current':historicalLineageAccepts(identity.historicalLineage,intent.witness)?'historical':null;
 if(!generation)return false;
 const journal=identity.broadcastStore?.get?.('retained-intent',intent.id)??null;
 const record=selectRetainedIntent(generation,intent.id,journal,identity.historicalRetainedIntents);
 if(!record)return false;
 return retainedEnvelopeAccepts(record,intent.raw,intent,identity);
}
export async function retainedFundRecoveryAccepts(input){
 const intent=input?.intent,identity=input?.identity;
 if(!intent?.witness||typeof intent.raw!=='string')return false;
 const generation=currentGenerationWitness(intent.witness,identity)?'current':historicalLineageAccepts(identity?.historicalLineage,intent.witness)?'historical':null;
 if(!generation)return false;
 const journal=input.store?.get?.('retained-intent',intent.id)??null;
 const record=selectRetainedIntent(generation,intent.id,journal,identity?.historicalRetainedIntents);
 if(!record)return false;
 if(!await retainedEnvelopeAccepts(record,intent.raw,intent,identity))return false;
 return retainedBusinessAccepts(record,{...input,abi:input.abi});
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
   grantEpoch:authority.grantEpoch,authorityDigest,attestation,authorizeIntent,feeLimits,operator,feeQuoteProvider:data=>candidateFeeQuote(client,feeLimits,data,mode),nativeBudgetKey:budgetKey,
   ...(Array.isArray(authority.historicalLineage)?{historicalLineage:authority.historicalLineage}:{}),
   ...(Array.isArray(authority.historicalRetainedIntents)?{historicalRetainedIntents:authority.historicalRetainedIntents}:{}),
   ...(typeof authority.withOperation==='function'?{withOperation:authority.withOperation}:{})};
  const rail=new CommercePaymentsRail(journal,client,authority.operator,'machine-commerce-v1',{...contracts,network},approve,1n,assets);
  return {journal,rail,asset,assets,contracts,operator:authority.operator,networkClass:mode,candidate};
 }catch(e){journal.close();throw e;}
}
