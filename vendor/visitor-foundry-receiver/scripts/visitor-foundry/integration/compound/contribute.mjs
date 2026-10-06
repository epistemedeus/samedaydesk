import {readFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {invoke as localInvoke} from '../../execution/src/supervisor.mjs';
import {packageModule,bindingFor} from '../../execution/example/package.mjs';
import {createVersion,hash} from '../../capabilities/src/index.mjs';
import {createArtifact,bytesHash} from '../../execution/src/contracts.mjs';
import {readPrivateJson,writeJsonNoClobber} from '../../../../services/correspondence/bin/safe-io.mjs';
import {upload} from './upload.mjs';
import {failure} from './transport.mjs';
export async function contribute(client,config,request,{loadIntent=operation=>readPrivateJson(`${config.stateDir}/${operation}.json`),persistIntent=async(operation,intent)=>{const file=`${config.stateDir}/${operation}.json`,prior=readPrivateJson(file);if(prior){if(hash(prior)!==hash(intent))throw failure('local_intent_mismatch');}else writeJsonNoClobber(file,intent);}}={}){
 const start=performance.now();
  if(config.standingScope!=='synthetic-reusable-components'||!config.stateDir)throw new Error('explicit standing reusable contribution scope required');
  await mkdir(config.stateDir,{recursive:true,mode:0o700});
  if(await loadIntent('upload-started') && !await loadIntent('upload-receipt'))throw failure('upload_outcome_unknown');
  const terms=await client.call('participation/terms');
  const task=await client.call('task',{request,negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:config.standingScope,termsVersion:terms.id}});
  if(!task.continuation)throw failure('no_contribution_opportunity');
  execFileSync(process.execPath,['scripts/visitor-foundry/execution/example/build.mjs'],{stdio:'pipe'});
  const sourceText=await readFile(new URL('../../execution/example/structured-result.c',import.meta.url),'utf8');
  const bytes=await readFile(new URL('../../execution/.build/structured-result.wasm',import.meta.url));
  const old=packageModule(bytes,{sourceRevision:bytesHash(Buffer.from(sourceText)).slice(7)});const {contentId,...cap}=structuredClone(old.capability);
  cap.rights.ref='permission:vf09-owner-qa';cap.provenance.refs=[old.module.digest,terms.evaluation.suiteDigest,bytesHash(Buffer.from(sourceText))];
  const {id,schema,...base}=old;const descriptor=createArtifact({...base,capability:createVersion(cap),evaluation:terms.evaluation});
  const artifact={kind:'portable-structured-result-v1',descriptor,moduleBase64:bytes.toString('base64'),sourceText};
  const privateResult=await localInvoke({artifact:descriptor,moduleBytes:bytes,input:request.input,binding:bindingFor(descriptor)});
  if(privateResult.observation.status!=='ok')throw failure('local_execution_incomplete');
  const uploaded=await upload(client,artifact,terms,{loadIntent,persistIntent});
  let cellId=null,current;
  const perform=async(operation,body)=>{
   const intent=await loadIntent(operation)??client.session.prepare({mode:'adapt-artifact',operation,cellId,termsVersion:terms.id,body,consent:true});
   await persistIntent(operation,intent);
   const result=await client.session.execute(intent);if(result.status!=='committed')throw failure('participation_incomplete',client.metrics.lastError?.diagnostic);
   cellId=result.receipt.cellId;current=(await client.session.resume({schema:'neomorphic.foundry.participation-hint.v1',cellId})).current;
   return result;
  };
  await perform('create',{proposalRef:task.continuation.proposalRef,resolverRef:task.continuation.resolverRef,reproducerRef:task.continuation.reproducerRef,fundingKind:'voluntary'});
  await perform('claim',{expectedRevision:current.revision,ttlSeconds:60,voluntaryOptIn:true});
  await perform('checkpoint',{expectedRevision:current.revision,fence:current.cell.fence,checkpointRef:uploaded.componentRef});
  const submitted=await perform('submit',{expectedRevision:current.revision,fence:current.cell.fence,contributionRef:uploaded.componentRef});
  return {purpose:'owner_qa',original:task.original,privateResult,submission:submitted.receipt,continuation:{schema:'neomorphic.foundry.participation-hint.v1',cellId},moduleBytes:bytes.length,sourceBytes:Buffer.byteLength(sourceText),artifactId:descriptor.id,build:JSON.parse(await readFile(new URL('../../execution/.build/build.json',import.meta.url),'utf8')),metrics:client.metrics,elapsedMs:performance.now()-start};

}
