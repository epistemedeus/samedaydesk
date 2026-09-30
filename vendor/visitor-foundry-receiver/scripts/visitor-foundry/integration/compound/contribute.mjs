import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {invoke as localInvoke} from '../../execution/src/supervisor.mjs';
import {packageModule,bindingFor} from '../../execution/example/package.mjs';
import {createVersion} from '../../capabilities/src/index.mjs';
import {createArtifact,bytesHash} from '../../execution/src/contracts.mjs';
export async function contribute(client,config,request,{loadIntent=()=>null,persistIntent=async(operation,intent)=>writeFile(`${config.stateDir}/${operation}.json`,JSON.stringify(intent),{mode:0o600})}={}){
 const start=performance.now();
  if(config.standingScope!=='synthetic-reusable-components'||!config.stateDir)throw new Error('explicit standing reusable contribution scope required');
  await mkdir(config.stateDir,{recursive:true,mode:0o700});
  const terms=await client.call('participation/terms');
  const task=await client.call('task',{request,negotiation:{accepts:['neomorphic.foundry.participation.v1'],modes:['adapt-artifact'],budgetSeconds:300},sharing:{scope:config.standingScope,termsVersion:terms.id}});
  if(!task.continuation)throw new Error('no qualified contribution opportunity');
  execFileSync(process.execPath,['scripts/visitor-foundry/execution/example/build.mjs'],{stdio:'pipe'});
  const sourceText=await readFile(new URL('../../execution/example/structured-result.c',import.meta.url),'utf8');
  const bytes=await readFile(new URL('../../execution/.build/structured-result.wasm',import.meta.url));
  const old=packageModule(bytes,{sourceRevision:bytesHash(Buffer.from(sourceText)).slice(7)});const {contentId,...cap}=structuredClone(old.capability);
  cap.rights.ref='permission:vf09-owner-qa';cap.provenance.refs=[old.module.digest,terms.evaluation.suiteDigest,bytesHash(Buffer.from(sourceText))];
  const {id,schema,...base}=old;const descriptor=createArtifact({...base,capability:createVersion(cap),evaluation:terms.evaluation});
  const artifact={kind:'portable-structured-result-v1',descriptor,moduleBase64:bytes.toString('base64'),sourceText};
  const privateResult=await localInvoke({artifact:descriptor,moduleBytes:bytes,input:request.input,binding:bindingFor(descriptor)});
  if(privateResult.observation.status!=='ok')throw new Error('local-task-execution-incomplete');
  const uploaded=await client.call('components',{artifact,termsVersion:terms.id},`upload:${descriptor.id}`);
  let cellId=null,current;
  const perform=async(operation,body)=>{
   const intent=await loadIntent(operation)??client.session.prepare({mode:'adapt-artifact',operation,cellId,termsVersion:terms.id,body,consent:true});
   await persistIntent(operation,intent);
   const result=await client.session.execute(intent);if(result.status!=='committed')throw new Error(`${operation}:${result.status}:${client.metrics.lastError?.code??'receipt-binding'}`);
   cellId=result.receipt.cellId;current=(await client.session.resume({schema:'neomorphic.foundry.participation-hint.v1',cellId})).current;
   return result;
  };
  await perform('create',{proposalRef:task.continuation.proposalRef,resolverRef:task.continuation.resolverRef,reproducerRef:task.continuation.reproducerRef,fundingKind:'voluntary'});
  await perform('claim',{expectedRevision:current.revision,ttlSeconds:60,voluntaryOptIn:true});
  await perform('checkpoint',{expectedRevision:current.revision,fence:current.cell.fence,checkpointRef:uploaded.componentRef});
  const submitted=await perform('submit',{expectedRevision:current.revision,fence:current.cell.fence,contributionRef:uploaded.componentRef});
  return {purpose:'owner_qa',original:task.original,privateResult,submission:submitted.receipt,continuation:{schema:'neomorphic.foundry.participation-hint.v1',cellId},moduleBytes:bytes.length,sourceBytes:Buffer.byteLength(sourceText),artifactId:descriptor.id,build:JSON.parse(await readFile(new URL('../../execution/.build/build.json',import.meta.url),'utf8')),metrics:client.metrics,elapsedMs:performance.now()-start};

}
