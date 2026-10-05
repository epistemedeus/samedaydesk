#!/usr/bin/env node
// Root's explicit owner QA caller. No hosting/SQL credentials, owner endpoints or deployment.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readPrivateBytes} from '../private-paths.js';
import {materializePrivateInputs} from '../private-materialize.js';
import {runBounded} from '../bounded-child.mjs';
import {PASS_SCHEMA,need,digest} from '../private-pass-core.mjs';
import {cases,original,task} from '../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
import {hash} from '../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/capabilities/src/index.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),vendor=path.join(root,'vendor/visitor-foundry-receiver');
const pinFile=new URL('./private-control-pin.json',import.meta.url);
const json=file=>JSON.parse(readPrivateBytes(file,{repoRoot:root}).toString('utf8'));
function seal(dir,name,value) {
 return materializePrivateInputs({FOUNDRY_PRIVATE_DIR:dir,VALUE:JSON.stringify(value)},{repoRoot:root,files:[['VALUE','FILE',name,'json']]}).assigned.FILE;
}
export function verifyCallerClosure() {
 const pin=JSON.parse(readFileSync(pinFile));
 for(const [file,expected] of Object.entries(pin.files)) need(createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')===expected,'caller_source_changed');
 return {base:pin.base,sourcePinSha256:pin.files['vendor/visitor-foundry-receiver/SOURCE-PIN.json'],closureDigest:digest(pin)};
}
function privateTree(dir) {
 const s=lstatSync(dir);need(s.isDirectory() && !s.isSymbolicLink() && (s.mode&0o777)===0o700,'caller_private_mode');
 for(const item of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())privateTree(file);else readPrivateBytes(file,{repoRoot:root,limit:1048576});}
}
export async function remoteJourney(stage,file,readbackFile) {
 const pin=verifyCallerClosure(),c=json(file);
 need(c.schema==='sds.foundry.remote-owner-qa.v1' && typeof c.directory==='string' && typeof c.baseUrl==='string'
  && /^sha256:[a-f0-9]{64}$/.test(c.expectedHostConfigId ?? '') && c.expectedEntryTermsHash===c.authority?.entryTerms,'caller_config_invalid');
 need(['a-contribute','a-use','b-use','check'].includes(stage),'caller_arguments_invalid');
 // Canonical client verifies the explicit authority and canonical origin itself.
 const dir=c.directory;
 const aFile=seal(dir,'visitor-a.config.json',{baseUrl:c.baseUrl,directory:path.join(dir,'visitor-a'),authority:c.authority});
 async function cli(mode,config,input,name) {
  const inputFile=input===undefined?null:seal(dir,`${name}.json`,input);
  const result=await runBounded(process.execPath,['scripts/visitor-foundry/integration/entry/visitor.mjs',mode,config,...(inputFile?[inputFile]:[])],
    {cwd:vendor,env:{PATH:process.env.PATH || '',LANG:'C',LC_ALL:'C'},timeoutMs:60000,capture:true,stdoutLimit:1048576,outputLimit:2097152});
  need(!result.reason && result.code===0,'caller_outcome_unknown');
  let body;try{body=JSON.parse(result.stdout);}catch{need(false,'caller_response_invalid');}
  privateTree(dir);return body;
 }
 if(stage==='a-contribute') {
  const registered=await cli('register',aFile),checkpoint=await cli('checkpoint',aFile,{text:'owner QA private correspondence before controlled host restart'},'a-checkpoint');
  need(registered.body?.receiver?.state==='ready','caller_receiver_not_ready');
  const contribution=await cli('contribute',aFile,original(),'a-contribution-input');
  const candidateId=contribution.submission?.admission?.candidateId;
  need(typeof candidateId==='string','caller_contribution_unknown');
  const receipt={schema:'sds.foundry.remote-contribution.v1',purpose:'owner_qa',projectId:registered.body.projectId,candidateId,generation:1,
    hostConfigId:c.expectedHostConfigId,entryTermsHash:c.expectedEntryTermsHash,moduleDigest:contribution.privateResult?.observation?.binding?.moduleDigest,
    localObservationId:contribution.privateResult?.observation?.id,pin};
  seal(dir,'a-contribution-receipt.json',receipt);
  seal(dir,'owner-observe-a.json',{schema:PASS_SCHEMA,intentId:'owner-observe-a',action:'observe',projectId:receipt.projectId,
    expectedHostConfigId:c.expectedHostConfigId,expectedEntryTermsHash:c.expectedEntryTermsHash,expectedVerificationId:null,candidateId:null,expectedGeneration:null,reconcileIntentId:null});
  return {ok:true,stage,...receipt,actualHostVerificationRequired:true};
 }
 const saved=json(path.join(dir,'a-contribution-receipt.json'));
 need(saved.hostConfigId===c.expectedHostConfigId && saved.entryTermsHash===c.expectedEntryTermsHash && isDeepStrictEqual(saved.pin,pin),'caller_binding_conflict');
 if(stage==='check') {
  const controls=json(readbackFile),a=json(path.join(dir,'a-use-receipt.json')),b=json(path.join(dir,'b-use-receipt.json'));
  need(b.restart?.ownerAttested===true,'caller_actual_restart_required');
  const observations=[];
  for(const [visitor,receipt,control] of [['a',a,controls.a],['b',b,controls.b]]) {
   const v=control?.readback;
   need(control?.ok===true && v?.projectId===receipt.projectId && v.hostConfigId===c.expectedHostConfigId && v.entryTermsHash===c.expectedEntryTermsHash
    && v.installedVerificationMatches===true && v.outstandingPhysical===0,'caller_readback_conflict');
   for(const use of receipt.uses) {
    const invocation=v.invocations.find(i=>i.taskId===use.taskId),sample=invocation?.sample;
    need(invocation?.state==='completed' && invocation.manifestId===use.manifestId,'caller_manifest_conflict');
    need(invocation.inputDigest===use.inputDigest,'caller_input_conflict');
    need(invocation.sourceProject===saved.projectId,'caller_source_project_conflict');
    need(invocation.candidateId===saved.candidateId,'caller_candidate_conflict');
    need(invocation.generation===saved.generation,'caller_candidate_generation_conflict');
    need(invocation.binding?.moduleDigest===saved.moduleDigest && sample?.binding?.moduleDigest===saved.moduleDigest,'caller_module_conflict');
    need(sample.outputDigest===use.outputDigest,'caller_output_conflict');
    need(sample.binding.runtimePin===invocation.binding.runtimePin,'caller_runtime_conflict');
    need(isDeepStrictEqual(sample.phases,['compile','instantiate','execute']) && sample.status==='ok','caller_execution_incomplete');
    need(sample.termination?.exited===true && sample.termination.drained===true && sample.termination.code===0 && sample.termination.signal===null,'caller_termination_incomplete');
    observations.push({visitor,taskId:use.taskId,observationId:sample.id,runtimePin:sample.binding.runtimePin,verificationId:invocation.verificationId});
   }
  }
  need(new Set(observations.map(x=>x.runtimePin)).size===1 && new Set(observations.map(x=>x.verificationId)).size===1,'caller_generation_conflict');
  const candidate=controls.a.readback.candidates.find(x=>x.id===saved.candidateId);
  need(candidate?.generation===saved.generation && controls.a.readback.publications.some(x=>x.candidateId===saved.candidateId && x.generation===saved.generation && x.state==='published'),'caller_readback_conflict');
  const result={ok:true,purpose:'owner_qa',stage,candidateId:saved.candidateId,generation:saved.generation,moduleDigest:saved.moduleDigest,
    observations,changedRefused:a.changedRefused && b.changedRefused,restart:b.restart,pin,controlDigest:digest(controls),hostingerMeasuredByCaller:false};
  seal(dir,'canonical-control-check.json',result);return result;
 }
 let config=aFile,restart=null,projectId=saved.projectId;
 if(stage==='b-use') {
  restart=json(path.join(dir,'actual-http-restart.json'));
  need(restart.schema==='sds.foundry.actual-restart.v1' && typeof restart.receiptId==='string' && restart.receiptId.length<=200
    && Number.isFinite(Date.parse(restart.stoppedAt)) && Date.parse(restart.startedAt)>Date.parse(restart.stoppedAt)
    && restart.expectedHostConfigId===c.expectedHostConfigId && restart.expectedEntryTermsHash===c.expectedEntryTermsHash,'caller_actual_restart_required');
  need(json(path.join(dir,'a-use-receipt.json')).candidateId===saved.candidateId,'caller_a_use_required');
  // Owner supplied hosting readback is an attestation, not measured by this caller.
  config=seal(dir,'visitor-b.config.json',{baseUrl:c.baseUrl,directory:path.join(dir,'visitor-b'),authority:c.authority});
  projectId=(await cli('register',config)).body?.projectId;
  const correspondence=await cli('correspondence',aFile);seal(dir,'a-after-restart-correspondence.json',correspondence);
 }
 const uses=[];
 for(const [label,n] of [['useful',0],['changed-admitted',1],['useful-negative',3]]) {
  const request=task(cases[n].input,`task:owner-${stage}-${label}`),result=await cli('use',config,request,`${stage}-${label}`);
  need(isDeepStrictEqual(result.invocation?.output,cases[n].expected),'caller_output_mismatch');
  const target=result.discovery?.manifest?.target;
  const durable=json(path.join(path.dirname(config),stage==='a-use'?'visitor-a':'visitor-b',`invoke-${hash(request).slice(7)}.json`));
  uses.push({label,taskId:request.taskId,inputDigest:digest(request.input),manifestId:durable.manifestId,target:target ?? null,
    outputDigest:digest(result.invocation.output)});
 }
 const changed=task({structuredContent:{project:{id:'unmeasured',status:'closed',version:7},nextAction:null}},`task:owner-${stage}-unmeasured`);
 const refused=await cli('use',config,changed,`${stage}-unmeasured`);need(refused.invocation===null && refused.discovery?.manifest===null,'caller_unmeasured_not_refused');
 const receipt={schema:'sds.foundry.remote-use.v1',purpose:'owner_qa',stage,projectId,candidateId:saved.candidateId,
   expectedGeneration:saved.generation,uses,changedRefused:true,pin,restart:restart?{receiptId:restart.receiptId,ownerAttested:true}:null,
   canonicalSameCandidateReadbackRequired:true};
 seal(dir,stage==='a-use'?'a-use-receipt.json':'b-use-receipt.json',receipt);
 seal(dir,stage==='a-use'?'owner-observe-a-use.json':'owner-observe-b.json',{schema:PASS_SCHEMA,intentId:`owner-observe-${stage}`,action:'observe',projectId,
   expectedHostConfigId:c.expectedHostConfigId,expectedEntryTermsHash:c.expectedEntryTermsHash,expectedVerificationId:null,candidateId:null,expectedGeneration:null,reconcileIntentId:null});
 return {ok:true,...receipt};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const [stage,file,readback,...rest]=process.argv.slice(2);need(file && !rest.length && (stage==='check'?Boolean(readback):!readback),'caller_arguments_invalid');console.log(JSON.stringify(await remoteJourney(stage,file,readback)));}
 catch(error){console.error(JSON.stringify({ok:false,code:/^[a-z_]{1,100}$/.test(error?.code)?error.code:'caller_failed'}));process.exitCode=2;}
}
