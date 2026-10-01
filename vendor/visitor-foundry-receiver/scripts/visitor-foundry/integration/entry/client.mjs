import {createHmac} from 'node:crypto';
import {join} from 'node:path';
import {openSync,closeSync,fsyncSync} from 'node:fs';
import {readPrivateJson,readPrivateSecret,writeJsonNoClobber,canonicalOperatorOrigin} from '../../../../services/correspondence/bin/safe-io.mjs';
import {prepare,continueEntry,entryRequest} from '../../entry/src/client.mjs';
import {grantToken,need,exact} from '../../entry/src/contract.mjs';
import {hash} from '../../capabilities/src/index.mjs';
import {participationClient} from '../compound/client.mjs';
import {contribute} from '../compound/contribute.mjs';
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

export async function useFromEntry(config,request){
 const {client,receipt}=resumed(config);
 if(receipt.receiver.state!=='ready')return {original:request.input,invocation:null,nextAction:'use_private_correspondence'};
 const name=`invoke-${hash(request).slice(7)}.json`,saved=readPrivateJson(join(config.directory,name));
 let discovery=null,body=saved;
 if(!body){discovery=await client.call('task',{request,negotiation:{accepts:[]},sharing:null});if(!discovery.manifest)return {discovery,invocation:null};body={manifestId:discovery.manifest.id,request};durable(config.directory,name,body);}
 return {discovery,invocation:await client.call('invoke',body)};
}
