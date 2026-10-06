import {createHmac} from 'node:crypto';
import {join} from 'node:path';
import {openSync,closeSync,fsyncSync,readdirSync} from 'node:fs';
import {readPrivateJson,readPrivateSecret,writeJsonNoClobber,canonicalOperatorOrigin} from '../../../../services/correspondence/bin/safe-io.mjs';
import {prepare,continueEntry,entryRequest} from '../../entry/src/client.mjs';
import {grantToken,need,exact} from '../../entry/src/contract.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {participationClient} from '../compound/client.mjs';
import {contribute} from '../compound/contribute.mjs';
import {checkUploadIntent,checkUploadReceipt} from '../compound/upload.mjs';
import {decodeComponent,encodeComponent,COMPONENT_WIRE} from '../src/portable-upload-wire.mjs';
import {portableArtifact} from '../src/portable-profile.mjs';
import {continuationView} from '../src/execution-view.mjs';
import {clientFailure} from '../compound/transport.mjs';
const sync=dir=>{const fd=openSync(dir,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
export function durable(directory,name,value){const file=join(directory,name),old=readPrivateJson(file);if(old)need(hash(old)===hash(value),409,'local_intent_mismatch','restore_exact_attempt');else writeJsonNoClobber(file,value);sync(directory);return value;}
export function standing(config){
 exact(config,['baseUrl','directory','authority']);const a=config.authority;
 exact(a,['profileId','entryTerms','contributionTerms','scope']);
 need(a.scope==='synthetic-reusable-components'&&[a.entryTerms,a.contributionTerms].every(x=>/^sha256:[a-f0-9]{64}$/.test(x)),400,'standing_authority_required');
 return a;
}
export async function enroll(config,action='register'){
 const a=standing(config);
 const old=readPrivateJson(join(config.directory,'attempt.json'));
 if(!old){const d=await entryRequest(config.baseUrl,'');need(d.status===200&&d.body.profile.profileId===a.profileId&&d.body.profile.termsHash===a.entryTerms&&d.body.profile.contribution?.binding.contributionTerms===a.contributionTerms,409,'standing_terms_mismatch','continue_original');}
 prepare(config.directory,config.baseUrl,a.profileId,a.entryTerms);
 durable(config.directory,'authority.json',{...a,baseUrl:canonicalOperatorOrigin(config.baseUrl)});
 return continueEntry(config.directory,action);
}
export function resumed(config){
 const a=standing(config),saved=readPrivateJson(join(config.directory,'authority.json'));
 need(hash(saved)===hash({...a,baseUrl:canonicalOperatorOrigin(config.baseUrl)}),409,'standing_terms_mismatch','restore_exact_attempt');
 const attempt=readPrivateJson(join(config.directory,'attempt.json')),receipt=readPrivateJson(join(config.directory,'continuation.json'));
 need(attempt?.baseUrl===canonicalOperatorOrigin(config.baseUrl)&&attempt.body.termsHash===a.entryTerms&&receipt?.requestId===attempt.body.requestId,409,'continuation_required');
 const proof=readPrivateSecret(join(config.directory,'registration.secret'));
 // Purpose separation also binds every VF05 replay seal to both exact terms.
 const identityKey=createHmac('sha256',Buffer.from(proof,'base64url')).update(JSON.stringify(['vf12:participation',receipt.registrationId,a.entryTerms,a.contributionTerms])).digest('hex');
 return {receipt,client:participationClient({baseUrl:attempt.baseUrl,projectId:receipt.projectId,token:grantToken(proof,receipt.registrationId,'writer'),identityKey,
  headers:{'x-foundry-entry-terms':a.entryTerms,'x-foundry-contribution-terms':a.contributionTerms}})};
}
export async function contributeFromEntry(config,request){
 const {client,receipt}=resumed(config);need(receipt.receiver.state==='ready',409,'receiver_not_ready','use_private_correspondence');
 const a=standing(config);durable(config.directory,'contribution-task.json',request);
 const terms=await client.call('participation/terms');need(terms.id===a.contributionTerms,409,'standing_terms_mismatch','continue_original');
 return contribute(client,{standingScope:a.scope,stateDir:config.directory},request,{loadIntent:async operation=>{const saved=readPrivateJson(join(config.directory,`${operation}.json`));if(!saved)return null;need(saved.entryTerms===a.entryTerms&&saved.contributionTerms===a.contributionTerms,409,'local_intent_mismatch');return saved.intent;},persistIntent:async(operation,intent)=>{
  durable(config.directory,`${operation}.json`,{entryTerms:a.entryTerms,contributionTerms:a.contributionTerms,intent});
 }});
}
export async function reconcileContribution(config,operation){
 need(['create','claim','checkpoint','submit'].includes(operation),400,'invalid_operation');
 const {client}=resumed(config),saved=readPrivateJson(join(config.directory,`${operation}.json`)),a=standing(config);
 need(saved&&saved.entryTerms===a.entryTerms&&saved.contributionTerms===a.contributionTerms,409,'local_intent_mismatch');
 return client.session.reconcile(saved.intent);
}

export async function reconcileUpload(config){
 const {client,receipt}=resumed(config),a=standing(config);
 need(receipt.receiver.state==='ready',409,'receiver_not_ready');
 const saved=readPrivateJson(join(config.directory,'upload.json'));
 need(saved?.entryTerms===a.entryTerms && saved.contributionTerms===a.contributionTerms,409,'local_intent_mismatch');
 const intent=saved.intent,artifact=portableArtifact(decodeComponent(intent?.body?.artifact));checkUploadIntent(intent,artifact,a.contributionTerms);
 const started=readPrivateJson(join(config.directory,'upload-started.json'));
 need(started?.entryTerms===a.entryTerms && started.contributionTerms===a.contributionTerms && started.intent?.intentDigest===hash(intent),409,'local_intent_mismatch');
 const existing=readPrivateJson(join(config.directory,'upload-receipt.json'));
 if(existing){need(existing.entryTerms===a.entryTerms && existing.contributionTerms===a.contributionTerms,409,'local_intent_mismatch');return {reconciled:true,receipt:checkUploadReceipt(existing.intent,artifact)};}
 const terms=await client.call('participation/terms');need(terms.id===a.contributionTerms,409,'standing_terms_mismatch');
 const result=checkUploadReceipt(await client.submitComponent(intent,terms),artifact);
 durable(config.directory,'upload-receipt.json',{entryTerms:a.entryTerms,contributionTerms:a.contributionTerms,intent:result});
 return {reconciled:true,receipt:result};
}
// Always invalid before authentication/SQL. Measures route reachability, not upload acceptance.
export async function uploadCanary(config){
 const {client,receipt}=resumed(config),a=standing(config);need(receipt.receiver.state==='ready',409,'receiver_not_ready');
 const terms=await client.call('participation/terms');need(terms.id===a.contributionTerms,409,'standing_terms_mismatch');
 try{await client.call('components',{artifact:{schema:COMPONENT_WIRE},termsVersion:terms.id},'component-wire-validation-canary');}
 catch(error){const observation=clientFailure(error);return {purpose:'owner_qa',mutated:false,routeValidationObserved:observation.code==='invalid-input' && observation.diagnostic?.applicationMarked===true,observation};}
 throw Object.assign(new Error(),{code:'client_outcome_unknown'});
}

// Full-metadata reachability only: the decoded schema is deliberately invalid.
// The mounted component parser rejects it before any authentication or SQL.
export async function uploadFullCanary(config){
 const a=standing(config),saved=readPrivateJson(join(config.directory,'upload.json'));
 need(saved?.entryTerms===a.entryTerms && saved.contributionTerms===a.contributionTerms,409,'local_intent_mismatch');
 const artifact=portableArtifact(decodeComponent(saved.intent?.body?.artifact));checkUploadIntent(saved.intent,artifact,a.contributionTerms);
 const {client,receipt}=resumed(config);need(receipt.receiver.state==='ready',409,'receiver_not_ready');
 const terms=await client.call('participation/terms');need(terms.id===a.contributionTerms && terms.componentTransport?.schema===COMPONENT_WIRE,409,'standing_terms_mismatch');
 const body={artifact:encodeComponent({...artifact,schema:'neomorphic.foundry.invalid-component-canary.v1'},terms.componentTransport),termsVersion:terms.id};
 try{await client.call('components',body,'component-full-wire-validation-canary');}
 catch(error){const observation=clientFailure(error);return {purpose:'owner_qa',mutated:false,transport:COMPONENT_WIRE,routeValidationObserved:observation.code==='invalid-input' && observation.diagnostic?.applicationMarked===true,observation};}
 throw Object.assign(new Error(),{code:'client_outcome_unknown'});
}

// Root's private receiving request is prepared from the exact saved invocation,
// original registration/terms, and canonical read-only status. No grant is emitted.
export async function prepareNoLaunch(config,{intentId,expectedHostConfigId,request}){
 const {client,receipt}=resumed(config),a=standing(config);
 const saved=readPrivateJson(join(config.directory,`invoke-${hash(request).slice(7)}.json`));
 need(saved && hash(saved.request)===hash(request),409,'local_intent_mismatch');
 const status=await client.call('status'),row=status.portableExecution?.invocations.find(x=>x.taskId===request.taskId);
 need(row?.state==='completed' && row.termination?.noLaunch===true && row.manifestId===saved.manifestId
  && row.requestDigest===hash(request),409,'invocation_no_launch');
 const received={schema:'sds.foundry.private-pass.v2',intentId,action:'receive-no-launch',projectId:receipt.projectId,
  expectedHostConfigId,expectedEntryTermsHash:a.entryTerms,expectedVerificationId:row.verificationId,candidateId:row.candidateId,
  expectedGeneration:row.generation,reconcileIntentId:null,registrationId:receipt.registrationId,taskId:request.taskId,manifestId:saved.manifestId,
  expectedExecutionId:row.executionId,expectedFence:row.fence,expectedObservationId:row.observationId,request};
 return received;
}

// Immutable local lineage: the first intent is never rewritten. Only an explicit
// authenticated status reconciliation can seal an owner-received successor.
function savedInvocation(config,request){
 const prefix=`invoke-${hash(request).slice(7)}`,first=readPrivateJson(join(config.directory,`${prefix}.json`));
 if(!first)return null;
 need(hash(first.request)===hash(request),409,'local_intent_mismatch');
 const names=readdirSync(config.directory).filter(n=>n.startsWith(`${prefix}-continuation-`)&&n.endsWith('.json'));
 need(names.length<=4,409,'local_intent_mismatch');
 const transitions=names.map(n=>{const t=readPrivateJson(join(config.directory,n)),{id,...body}=t??{};
  need(continuationView(t) && hash(body)===id && n===`${prefix}-continuation-${id.slice(7)}.json` && t.requestDigest===hash(request),409,'local_intent_mismatch');return t;});
 let current=first;
 const consumed=new Set();
 for(let i=0;i<4;i++){
  const next=transitions.filter(t=>t.predecessorManifestId===current.manifestId&&!consumed.has(t.id));need(next.length<=1,409,'local_intent_mismatch');
  if(!next.length)break;consumed.add(next[0].id);current={manifestId:next[0].successorManifestId,request};
 }
 need(consumed.size===transitions.length,409,'local_intent_mismatch');return current;
}
export async function prepareContinuation(config,{intentId,expectedHostConfigId,request}){
 const {client,receipt}=resumed(config),a=standing(config),saved=savedInvocation(config,request);
 need(saved,409,'local_intent_mismatch');
 const status=await client.call('status'),row=status.portableExecution?.invocations.find(x=>x.taskId===request.taskId);
 need(row?.state==='completed' && row.termination?.noLaunch===true && row.manifestId===saved.manifestId && row.requestDigest===hash(request),409,'invocation_no_launch');
 need(status.verification.id===row.verificationId && row.sourceProject===receipt.projectId,409,'standing_terms_mismatch');
 const common={schema:'sds.foundry.private-pass.v1',projectId:receipt.projectId,expectedHostConfigId,expectedEntryTermsHash:a.entryTerms,
  expectedVerificationId:row.verificationId,candidateId:row.candidateId,expectedGeneration:row.generation,reconcileIntentId:null};
 const renewalIntentId=`${intentId}:evidence`;
 return {renew:{...common,intentId:renewalIntentId,action:'renew-evidence'},
  dispatch:{...common,intentId:`${intentId}:dispatch`,action:'dispatch',expectedGeneration:row.generation+1},
  receive:{...common,schema:'sds.foundry.private-pass.v3',intentId:`${intentId}:receive`,action:'receive-no-launch',
   registrationId:receipt.registrationId,taskId:request.taskId,manifestId:saved.manifestId,expectedExecutionId:row.executionId,
   expectedFence:row.fence,expectedObservationId:row.observationId,request,renewalIntentId,successorGeneration:row.generation+1}};
}
export async function reconcileInvocation(config,request){
 const {client,receipt}=resumed(config),saved=savedInvocation(config,request);
 need(saved,409,'local_intent_mismatch');
 const status=await client.call('status'),row=status.portableExecution?.invocations.find(x=>x.taskId===request.taskId),t=continuationView(row?.continuation);
 const {id,...body}=t??{};
 need(t?.schema==='neomorphic.foundry.invocation-continuation.v1' && id===hash(body) && t.projectId===receipt.projectId && t.registrationId===receipt.registrationId
  && t.taskId===request.taskId && t.requestDigest===hash(request) && [t.predecessorManifestId,t.successorManifestId].includes(saved.manifestId)
  && row.manifestId===t.successorManifestId && row.executionId===t.executionId && row.fence===t.fence && row.generation===t.generation
  && row.verificationId===t.verificationId && status.verification.id===t.verificationId
  && row.priorAttempts.some(p=>p.executionId===t.priorExecutionId && p.observationId===t.priorObservationId && p.noLaunch===true),409,'continuation_required');
 need(['reserved','completed'].includes(row.state),409,'invocation_outcome_unknown');
 durable(config.directory,`invoke-${hash(request).slice(7)}-continuation-${id.slice(7)}.json`,t);
 return {reconciled:true,transition:t,state:row.state,nextAction:'invoke_same_saved_intent',physicalLaunched:false};
}
export async function useFromEntry(config,request){
 const {client,receipt}=resumed(config);
 if(receipt.receiver.state!=='ready')return {original:request.input,invocation:null,nextAction:'use_private_correspondence'};
 const name=`invoke-${hash(request).slice(7)}.json`;
 let discovery=null,body=savedInvocation(config,request);
 if(!body){discovery=await client.call('task',{request,negotiation:{accepts:[]},sharing:null});if(!discovery.manifest)return {discovery,invocation:null};body={manifestId:discovery.manifest.id,request};durable(config.directory,name,body);}
 return {discovery,invocation:await client.call('invoke',body)};
}
