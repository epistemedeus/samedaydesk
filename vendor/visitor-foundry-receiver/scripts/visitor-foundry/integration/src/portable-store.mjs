// Receiver-owned joins over the existing transactional pool/attempt/outbox lifecycle.
import {randomUUID} from 'node:crypto';
import {hash,refOf,createGap} from '../../capabilities/src/index.mjs';
import {requireThat as need,jsonBounded,digest} from '../../validation/src/index.mjs';
import {poolConfig} from './store.mjs';
import {verificationFor,checkInstalledVerification} from './verification.mjs';
import {PORTABLE_KIND,PORTABLE_ENV,PORTABLE_OUTCOME,PORTABLE_RIGHTS,portableArtifact,portablePolicy,cases,portableEvaluation} from './portable-profile.mjs';
import {resolutionManifest,recheckManifest} from './manifest.mjs';
import {identity,toGapBinding,toNativeRef,ensurePostgresJson} from './wire.mjs';
import {createReceivingPorts,verificationResult,toVF03Receipt} from '../../execution/src/ports.mjs';
import {assessVF01} from '../../participation/src/core.mjs';
import {jsonBoundary} from '../../participation/src/adapters.mjs';
import {semanticIdentity} from '../../participation/src/reproducer.mjs';
import {receivingStep} from '../../entry/src/progress.mjs';
const ref=id=>({uri:`https://foundry.invalid/approved/${id.slice(7)}`,digest:id});
const exact=(x,fields)=>need(Object.keys(x).sort().join(',')===fields.sort().join(','),'invalid_participation_input');
const source=(a)=>a.descriptor.capability;
const safeExit=o=>o?.termination&&(o.termination.exited===true||o.termination.noLaunch===true);
export const portableMethods={
 async enrollPortable(projectId,{validityMs=3600000,maxInvocations=64,maxValidationCostUnits='256000',entryBounds=null}={},installedClient=null) {
  const config=await receivingStep('pool_configuration',()=>{
   need(Number.isInteger(maxInvocations)&&maxInvocations>=1&&maxInvocations<=64,'invalid_invocation_cap');
   return poolConfig(projectId,{maxValidationCostUnits});
  });config.kind=PORTABLE_KIND;
  config.limits.maxMemoryMb=512;config.limits.maxReviews=64;config.limits.maxReviewMs=64000;config.invocationLimits={maxRecords:maxInvocations,maxRunning:1,cpuMs:2000,wallMs:4000,memoryMb:512,costCapUsdMicros:'1000'};
  const p=await receivingStep('portable_policy',()=>portablePolicy());config.policies=[{...config.policies[0],id:'policy:portable-structured-result',revision:'vf09:v1',evaluator:{id:p.evaluator.id,revision:p.evaluator.revision},environmentDigest:p.environmentDigest,requiredChecks:cases.map(c=>c.id),attempt:{cpuMs:2000*cases.length,wallMs:4000*cases.length,memoryMb:512,cost:{currency:'USD_MICROS',units:'4000'}}}];
  if(entryBounds){
   const attempts=Number(maxValidationCostUnits)/4000;config.entryBounds=entryBounds;config.entryHost=entryBounds.hostConfigId;
   Object.assign(config.limits,{maxRecords:entryBounds.maxCandidates,maxOutstanding:entryBounds.maxCandidates,maxPerScope:entryBounds.maxCandidates,maxCommands:entryBounds.maxNativeCommands,maxCpuMs:attempts*8000,maxWallMs:attempts*16000,maxReviews:attempts,maxReviewMs:attempts*1000});
  }
  const verification=await receivingStep('portable_verification',()=>verificationFor(config,{validityMs}));
  const participation={revision:'terms:vf09-owner-qa-v1',scope:'synthetic-reusable-components',funding:'voluntary',rights:PORTABLE_RIGHTS};participation.id=hash(participation);
  const install=async c=>{
   await receivingStep('pool_insert',()=>c.query('INSERT INTO correspondence_vf04_pools(project_id,config,verification,participation) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[projectId,config,verification,participation]));
   await receivingStep('pool_identity',async()=>{
    const prior=(await c.query('SELECT config FROM correspondence_vf04_pools WHERE project_id=$1 FOR UPDATE',[projectId])).rows[0];need(hash(prior.config)===hash(config),'immutable_pool_configuration');
   });
   const experiment={id:'experiment:vf09-cold-reuse',purpose:'owner_qa',cases,oracleDigest:portableEvaluation.suiteDigest,originalTask:{taskId:'task:visitor-a',input:{structuredContent:{event:{id:'evt_original',kind:'artifact'},replayed:false},content:[{type:'text',text:'redundant rendering'}]}}};
   await receivingStep('experiment_insert',()=>c.query('INSERT INTO correspondence_vf04_experiments(project_id,id,digest,record) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[projectId,experiment.id,hash(experiment),experiment]));
  };await (installedClient?install(installedClient):this.db.tx(install));return {verification,participation};
 },
 async participationTerms(ctx){return this.authenticated(ctx,false,async(c,_g,{config})=>{
  need(config.kind===PORTABLE_KIND,'participation_unavailable');const p=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].participation;
  return {...p,evaluation:portableEvaluation,environment:PORTABLE_ENV,outcome:PORTABLE_OUTCOME};
 });},
 async configureParticipation(projectId,{expectedTerms,revision},key){return this.db.tx(async c=>{
  await this.lock(c,projectId);return this.maintenanceOnce(c,projectId,key,{type:'participation-terms',expectedTerms,revision},async()=>{
   const prior=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[projectId])).rows[0].participation;
   need(prior?.id===expectedTerms,'stale_terms');need(typeof revision==='string'&&revision.length>0&&revision.length<256,'invalid_terms');
   const {id,...body}=prior,next={...body,revision};next.id=hash(next);await c.query('UPDATE correspondence_vf04_pools SET participation=$2 WHERE project_id=$1',[projectId,next]);return next;
  });
 });},
 async putPackage(c,ctx,grant,kind,id,record,cap=256){
  const config=(await c.query('SELECT config FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].config;cap=config.entryBounds?.maxPackages??cap;
  const old=(await c.query('SELECT kind,record FROM correspondence_vf04_packages WHERE project_id=$1 AND id=$2',[ctx.projectId,id])).rows[0];
  if(old){need(old.kind===kind&&hash(old.record)===hash(record),'immutable_package_conflict');return ref(id);}
  need((await c.query('SELECT count(*)::int AS n FROM correspondence_vf04_packages WHERE project_id=$1',[ctx.projectId])).rows[0].n<cap,'package_capacity');
  await c.query('INSERT INTO correspondence_vf04_packages(project_id,id,kind,record,grant_id) VALUES($1,$2,$3,$4,$5)',[ctx.projectId,id,kind,record,grant.id]);return ref(id);
 },
 async loadPackage(c,ctx,r,kind){
  need(r&&hash(r)===hash(ref(r.digest)),'unapproved_reference');const row=(await c.query('SELECT kind,record FROM correspondence_vf04_packages WHERE project_id=$1 AND id=$2',[ctx.projectId,r.digest])).rows[0];
  need(row?.kind===kind,'package_not_found');need(kind==='component'?portableArtifact(row.record).descriptor.id===r.digest:hash(row.record)===r.digest,'package_content_mismatch');return row.record;
 },
 async uploadComponent(ctx,raw,key){const body=jsonBounded(raw,490000);exact(body,['artifact','termsVersion']);const artifact=portableArtifact(body.artifact);ensurePostgresJson(body);
  return this.authenticated(ctx,true,async(c,g,locked)=>{
   const current=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].participation;need(current?.id===body.termsVersion,'stale_terms');
   return this.once(c,ctx.projectId,g,key,body,async()=>{
   need(locked.config.kind===PORTABLE_KIND,'portable_execution_disabled');checkInstalledVerification(locked.verification,locked.config);
   const terms=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].participation;need(terms?.id===body.termsVersion,'stale_terms');
   return {componentRef:await this.putPackage(c,ctx,g,'component',artifact.descriptor.id,artifact),identity:identity(source(artifact)),bytes:Buffer.from(artifact.moduleBase64,'base64').length};
  });});
 },
 async task(ctx,raw){const body=jsonBounded(raw,24576);exact(body,['request','negotiation','sharing']);ensurePostgresJson(body);
  return this.authenticated(ctx,false,async(c,g,{sources,config,verification})=>{
   const graph=await this.graph(c,sources),original=resolutionManifest(graph.snapshot,body.request,graph.options);
   if(original.manifest)await this.saveManifest(c,ctx.projectId,original.manifest,config);
   const terms=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].participation;
   if(config.kind!==PORTABLE_KIND||!terms)return original;
   let assessment,proposal=null;
   if(body.sharing?.scope==='synthetic-reusable-components'&&body.sharing.termsVersion===terms.id&&g.role!=='reader'&&body.request.outcome===PORTABLE_OUTCOME&&hash(body.request.environment)===hash(PORTABLE_ENV)) {
    checkInstalledVerification(verification,config);exact(body.sharing,['scope','termsVersion']);
    need(this.participationKey,'participation_host_key_unavailable');
    const semantic=semanticIdentity({tenantId:ctx.projectId,identityKey:this.participationKey,proposal:{outcome:body.request.outcome,input:body.request.input,environment:body.request.environment}});
    const gapArgs={gapId:`gap:${semantic.slice(9)}`,reproducer:{ref:'synthetic:vf09-cleared-request',permission:'synthetic'},funding:{kind:'voluntary',ref:null}};
    assessment=assessVF01({snapshot:graph.snapshot,request:body.request,options:graph.options,gap:gapArgs,permission:{provenance:'synthetic',authorizationRef:'permission:vf09-owner-qa'}});
    if(assessment.status==='genuine-miss'&&body.negotiation?.accepts?.includes('neomorphic.foundry.participation.v1')){
     if(config.entryBounds&&!(await c.query('SELECT 1 FROM correspondence_vf04_gaps WHERE project_id=$1 AND id=$2',[ctx.projectId,assessment.gap.id])).rowCount)need((await c.query('SELECT count(*)::int AS n FROM correspondence_vf04_gaps WHERE project_id=$1',[ctx.projectId])).rows[0].n<config.entryBounds.maxPackages,'entry_gap_capacity');
     await c.query('INSERT INTO correspondence_vf04_gaps(project_id,id,record) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[ctx.projectId,assessment.gap.id,assessment.gap]);
     const stored=(await c.query('SELECT record FROM correspondence_vf04_gaps WHERE project_id=$1 AND id=$2',[ctx.projectId,assessment.gap.id])).rows[0].record;
     proposal={schema:'neomorphic.foundry.approved-proposal.v1',gap:stored,request:body.request,termsVersion:terms.id};
    }
   }
   const result=jsonBoundary(original,body.negotiation,{assessment,condition:'resolved',disclosure:{actionability:'not-actionable',rights:{status:'allowed',ref:'permission:vf09-owner-qa'},funding:{kind:'voluntary',ref:null},cost:null,termsVersion:terms.id}});
   if(proposal&&result.participation?.modes.length){const r=await this.putPackage(c,ctx,g,'proposal',hash(proposal),proposal);return {...result,continuation:{termsVersion:terms.id,proposalRef:r,resolverRef:toGapBinding(proposal.gap,ref(hash(proposal.request.input))).cellGap.resolverSnapshot,reproducerRef:ref(hash(proposal.request.input))}};}
   return result;
  },!!body.sharing);
 },
 async participationRead(ctx,cellId){return this.authenticated(ctx,false,async c=>{const cell=(await c.query('SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2',[ctx.projectId,cellId])).rows[0]?.state;need(cell,'cell_not_found');return {cellId:cell.id,revision:cell.revision,cell};});},
 async participate(ctx,raw,key){const x=jsonBounded(raw,24576);exact(x,['cellId','requestId','termsVersion','body','operation']);need(key===x.requestId,'request_key_mismatch');
  return this.authenticated(ctx,true,async(c,g,locked)=>{
   const terms=(await c.query('SELECT participation FROM correspondence_vf04_pools WHERE project_id=$1',[ctx.projectId])).rows[0].participation;need(terms?.id===x.termsVersion,'stale_terms');
   return this.once(c,ctx.projectId,g,key,x,async()=>{
    need(this.workCells,'installed_cells_unavailable');let command,coalesced=false;
    const b=x.body;
    if(x.operation==='create'){
     exact(b,['proposalRef','resolverRef','reproducerRef','fundingKind']);need(x.cellId===null&&b.fundingKind==='voluntary','invalid_create');
     const p=await this.loadPackage(c,ctx,b.proposalRef,'proposal');need(p.termsVersion===terms.id,'stale_terms');const binding=toGapBinding(p.gap,b.reproducerRef);
     need(hash(b.reproducerRef)===hash(ref(hash(p.request.input)))&&hash(b.resolverRef)===hash(binding.cellGap.resolverSnapshot),'proposal_reference_mismatch');
     const graph=await this.graph(c,locked.sources);createGap(graph.snapshot,p.request,graph.options,{gapId:p.gap.id,reproducer:p.gap.reproducer,funding:p.gap.funding});
     command={schema:'neomorphic.foundry.work-cell-command.v1',action:'create',expectedRevision:0,gap:binding.cellGap,workScope:'scope:portable-structured-result'};
     const old=(await c.query('SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1 AND gap_id=$2 AND work_scope=$3',[ctx.projectId,p.gap.id,command.workScope])).rows[0]?.state;
     if(old)return {schema:'neomorphic.foundry.participation-receipt.v1',requestId:key,operation:x.operation,termsVersion:terms.id,cellId:old.id,revision:1,currentRevision:old.revision,coalesced:true,replayed:true};
    }else{
     need(['claim','checkpoint','submit'].includes(x.operation),'invalid_operation');
     exact(b,x.operation==='claim'?['expectedRevision','ttlSeconds','voluntaryOptIn']:['expectedRevision','fence',x.operation==='checkpoint'?'checkpointRef':'contributionRef']);
     command={schema:'neomorphic.foundry.work-cell-command.v1',action:x.operation,expectedRevision:b.expectedRevision};
     if(x.operation==='claim')Object.assign(command,{ttlSeconds:b.ttlSeconds,voluntaryOptIn:b.voluntaryOptIn});
     else {const artifact=await this.loadPackage(c,ctx,b[x.operation==='checkpoint'?'checkpointRef':'contributionRef'],'component');const descriptor=artifact.descriptor;
      const cell=(await c.query('SELECT state FROM correspondence_vf02_work_cells WHERE project_id=$1 AND id=$2',[ctx.projectId,x.cellId])).rows[0]?.state;need(cell,'cell_not_found');command.fence=b.fence;
      if(x.operation==='checkpoint')command.checkpoint={schema:'neomorphic.foundry.checkpoint.v1',summary:'Reusable portable source and exact module retained; submitted tests remain declarations.',artifact:ref(descriptor.id),nextStep:'Submit exact component under current terms and lease.'};
      else command.contribution={schema:'neomorphic.foundry.contribution.v1',operatorScope:'Voluntary synthetic reusable component under current scoped project grant.',gapId:cell.gap.id,gapRevision:cell.gap.contentId,checkpointRevision:cell.checkpoint?.revision,sourceRevision:hash(descriptor.capability.source),artifact:ref(descriptor.id),rights:PORTABLE_RIGHTS,testProposal:'Run installed independent structured-result oracle; this proposal grants no verification authority.',limitations:'Exact independently verified inputs only; owner QA.',};
     }
    }
    await this.entryCellCapacity(c,ctx.projectId,locked.config,command.action);
    const changed=await this.workCells.mutate(ctx,x.cellId,command,key,c);const cell=changed.receipt.cell;
    let admission;
    if(x.operation==='submit'){
     const artifact=await this.loadPackage(c,ctx,b.contributionRef,'component');
     admission=await this.admit(ctx,{schema:'neomorphic.foundry.candidate-admission.v1',cellId:cell.id,workflowRevision:cell.revision,fence:cell.fence,identity:identity(source(artifact)),artifact},`admit:${key}`,{c,grant:g,locked});
    }
    return {schema:'neomorphic.foundry.participation-receipt.v1',requestId:key,operation:x.operation,termsVersion:terms.id,cellId:cell.id,revision:cell.revision,replayed:changed.replayed,...(admission?{admission}:{})};
   });
  });
 },
 async loadPortableAttempt(projectId,id,supervisor,fence){return this.db.tx(async c=>{
  const {config,verification,sources}=await this.lock(c,projectId);checkInstalledVerification(verification,config);
  const a=(await c.query('SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];
  need(a&&a.supervisor===supervisor&&a.fence===fence&&a.state==='running'&&a.verification.id===verification.id,'stale_attempt_fence');
  const candidate=(await c.query('SELECT * FROM correspondence_vf04_candidates WHERE project_id=$1 AND id=$2',[projectId,a.candidate_id])).rows[0];
  need(candidate.generation===a.generation,'stale_attempt_generation');await this.eligibleForVerification(c,projectId,candidate,sources);
  const artifact=portableArtifact(candidate.artifact);return {...a,artifact:artifact.descriptor,moduleBytes:Buffer.from(artifact.moduleBase64,'base64')};
 });},
 async portableChild(projectId,id,supervisor,fence,caseId,update){return this.db.tx(async c=>{
  await this.lock(c,projectId);const a=(await c.query('SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2 FOR UPDATE',[projectId,id])).rows[0];
  need(a&&a.supervisor===supervisor&&a.fence===fence&&a.state!=='reconciled','stale_attempt_fence');need(a.assignment.requiredChecks.includes(caseId),'unassigned_case');
  let child=a.children.find(x=>x.caseId===caseId);
  if(update.planned){need(a.state==='running'&&!child&&a.children.length<16&&a.children.every(x=>safeExit(x.sample?.observation)),'physical_child_held');child={caseId,planned:true,identity:null,sample:null};a.children.push(child);}
  else {need(child,'child_not_planned');for(const name of ['identity','sample'])if(update[name]){need(!child[name]||hash(child[name])===hash(update[name]),'immutable_child_evidence');child[name]=update[name];}}
  if(child.sample?.observation?.processIdentity)need(hash(child.identity)===hash(child.sample.observation.processIdentity),'child_identity_mismatch');
  await c.query('UPDATE correspondence_vf04_attempts SET children=$3 WHERE project_id=$1 AND id=$2',[projectId,id,JSON.stringify(a.children)]);return {recorded:true};
 });},
 async finishPortableAttempt(projectId,id,supervisor,fence,{result,receipt,error}){return this.db.tx(async c=>{
  await this.lock(c,projectId);const a=(await c.query('SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2 FOR UPDATE',[projectId,id])).rows[0];
  need(a&&a.supervisor===supervisor&&a.fence===fence&&a.state!=='reconciled','stale_attempt_fence');
  if(a.portable_result)return {assignmentId:id,terminationObserved:!!a.termination?.exited,duplicate:true,resultId:a.portable_result.id};
  const exited=a.children.every(x=>safeExit(x.sample?.observation));
  if(result)need(result.observations.filter(Boolean).every(o=>a.children.some(x=>x.sample?.observation.id===o.id)),'unpersisted_execution_evidence');
  const termination=exited?{exited:true,noLaunch:a.children.length===0,proof:'all_planned_children_witnessed',errorReason:error?.code??error,children:a.children.map(x=>({caseId:x.caseId,identity:x.identity,termination:x.sample.observation.termination})),witnessedBy:supervisor,observedAt:await this.db.now(c)}:null;
  await c.query('UPDATE correspondence_vf04_attempts SET state=$3,portable_result=$4,result=$5,termination=$6 WHERE project_id=$1 AND id=$2',[projectId,id,exited?'result':'unknown',result,exited?receipt:null,termination]);
  return {assignmentId:id,terminationObserved:exited,error,resultId:result?.id??null};
 });},
 async recoverPortableAttempt(projectId,id){
  const data=await this.db.tx(async c=>{await this.lock(c,projectId);const a=(await c.query('SELECT * FROM correspondence_vf04_attempts WHERE project_id=$1 AND id=$2',[projectId,id])).rows[0];
   need(a&&a.children.length===a.assignment.requiredChecks.length&&a.children.every(x=>safeExit(x.sample?.observation)),'termination_unknown');
   const candidate=(await c.query('SELECT artifact FROM correspondence_vf04_candidates WHERE project_id=$1 AND id=$2',[projectId,a.candidate_id])).rows[0];return {a,artifact:portableArtifact(candidate.artifact).descriptor};});
  const {a,artifact}=data;const result=verificationResult({artifact,binding:a.children[0].sample.observation.binding,samples:cases.map(k=>a.children.find(x=>x.caseId===k.id).sample),policy:portablePolicy()});
  const receipt=toVF03Receipt(result,{assignment:a.assignment,fence:a.fence,observedAt:result.observations.map(o=>o.observedAt).sort().at(-1),referenceAdapter:toNativeRef});
  return this.finishPortableAttempt(projectId,id,a.supervisor,a.fence,{result,receipt,error:null});
 },
 async invocationPermit(c,ctx,body,locked){
  const manifest=(await c.query('SELECT record FROM correspondence_vf04_manifests WHERE project_id=$1 AND id=$2',[ctx.projectId,body.manifestId])).rows[0]?.record;
  need(manifest&&manifest.requestId===hash(body.request),'manifest_request_mismatch');const graph=await this.graph(c,locked.sources);
  recheckManifest(manifest,graph.snapshot,graph.options.now,graph.options.policy,body.request);
  const candidate=(await c.query("SELECT * FROM correspondence_vf04_candidates WHERE project_id=ANY($1) AND manifest->>'contentId'=$2",[locked.sources,manifest.target.contentId])).rows[0];
  need(candidate?.artifact.kind===PORTABLE_KIND,'portable_invocation_unavailable');await this.eligibleForVerification(c,candidate.project_id,candidate,locked.sources);
  const pool=(await c.query('SELECT config,verification FROM correspondence_vf04_pools WHERE project_id=$1',[candidate.project_id])).rows[0];checkInstalledVerification(pool.verification,pool.config);
  need(candidate.verification.id===pool.verification.id,'installed_runtime_changed');const artifact=portableArtifact(candidate.artifact);
  return {manifest,candidate,artifact:artifact.descriptor,moduleBytes:Buffer.from(artifact.moduleBase64,'base64'),verification:pool.verification};
 },
 async invokePortable(ctx,raw){const body=jsonBounded(raw,24576);exact(body,['manifestId','request']);ensurePostgresJson(body);
  const plan=await this.authenticated(ctx,false,async(c,g,locked)=>{
   // Write lock serializes reservation with validation dispatch; runtime runs after commit.
   locked=await this.lock(c,ctx.projectId,true);const permit=await this.invocationPermit(c,ctx,body,locked);
   const old=(await c.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2',[ctx.projectId,body.request.taskId])).rows[0];
   if(old){need(old.manifest_id===body.manifestId&&old.input_digest===hash(body.request.input)&&old.execution.grantId===g.id,'task_reuse_conflict');need(old.state==='completed'&&old.result,'invocation_outcome_unknown');return {result:{...old.result,replayed:true}};}
   need(!(await c.query("SELECT 1 FROM correspondence_vf04_attempts WHERE project_id=$1 AND state<>'reconciled' UNION ALL SELECT 1 FROM correspondence_vf04_invocations WHERE project_id=$1 AND state<>'completed' LIMIT 1",[ctx.projectId])).rows.length,'physical_reservation_held');
   need((await c.query('SELECT count(*)::int AS n FROM correspondence_vf04_invocations WHERE project_id=$1',[ctx.projectId])).rows[0].n<locked.config.invocationLimits.maxRecords,'invocation_budget_exhausted');
   await this.entryPhysicalCapacity(c,ctx.projectId,locked.config);
   const id=`invocation:${randomUUID()}`,fence=randomUUID();const p=portablePolicy();
   const binding={assignmentId:id,candidateId:permit.candidate.id,fence,capability:permit.manifest.target,sourceDigest:hash(permit.artifact.capability.source),artifactId:permit.artifact.id,moduleDigest:permit.artifact.module.digest,dependencyDigest:hash([]),evaluator:portableEvaluation,environmentDigest:p.environmentDigest,runtimePin:p.runtimePin};
   const execution={id,fence,grantId:g.id,sourceProject:permit.candidate.project_id,generation:permit.candidate.generation,verification:permit.verification,binding,requestId:hash(body.request),reservation:locked.config.invocationLimits,supervisor:null,identity:null,sample:null};
   await c.query("INSERT INTO correspondence_vf04_invocations(project_id,task_id,manifest_id,input_digest,result,state,execution) VALUES($1,$2,$3,$4,NULL,'reserved',$5)",[ctx.projectId,body.request.taskId,body.manifestId,hash(body.request.input),execution]);return {execution};
  },true);if(plan.result)return plan.result;
  await this.onInvocationReserved?.(plan.execution);
  const supervisor=`supervisor:${randomUUID()}`;
  const ports=createReceivingPorts({enabled:true,policy:portablePolicy(),loadInvocation:()=>this.authenticated(ctx,false,async(c,g,locked)=>{
   locked=await this.lock(c,ctx.projectId,true);const permit=await this.invocationPermit(c,ctx,body,locked);
   const row=(await c.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2 FOR UPDATE',[ctx.projectId,body.request.taskId])).rows[0];
   need(row.state==='reserved'&&row.execution.fence===plan.execution.fence&&row.execution.grantId===g.id,'invocation_already_claimed');
   row.execution.supervisor=supervisor;await c.query("UPDATE correspondence_vf04_invocations SET state='running',execution=$3 WHERE project_id=$1 AND task_id=$2",[ctx.projectId,body.request.taskId,row.execution]);
   return {...permit,binding:row.execution.binding};
  },true)});
  let sample;
  try{sample=await ports.invoke({projectId:ctx.projectId,manifestId:body.manifestId,request:body.request,onSpawn:identity=>this.invocationWrite(ctx.projectId,body.request.taskId,plan.execution.fence,supervisor,{identity})});}
  catch{throw Object.assign(new Error('invocation_outcome_unknown'),{code:'invocation_outcome_unknown',status:409});}
  await this.invocationWrite(ctx.projectId,body.request.taskId,plan.execution.fence,supervisor,{sample});
  return this.authenticated(ctx,false,async(c,g,locked)=>{
   await this.invocationPermit(c,ctx,body,locked);need(safeExit(sample.observation)&&sample.observation.status==='ok','invocation_outcome_unknown');
   return (await c.query('SELECT result FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2',[ctx.projectId,body.request.taskId])).rows[0].result;
  });
 },
 // Only the durable unclaimed state proves no child could have received bytes.
 async reconcileUnlaunchedInvocation(projectId,taskId){return this.db.tx(async c=>{
  await this.lock(c,projectId);const row=(await c.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2 FOR UPDATE',[projectId,taskId])).rows[0];
  need(row&&row.state==='reserved'&&row.execution.supervisor===null&&!row.execution.identity&&!row.execution.sample,'invocation_launch_not_excluded');
  row.execution.noLaunchProof={reason:'durable_unclaimed_reservation',at:await this.db.now(c)};
  await c.query("UPDATE correspondence_vf04_invocations SET state='completed',execution=$3 WHERE project_id=$1 AND task_id=$2",[projectId,taskId,row.execution]);
  return {taskId,noLaunch:true,budgetRefunded:false,outcome:'unknown'};
 });},
 async invocationWrite(projectId,taskId,fence,supervisor,update){return this.db.tx(async c=>{
  await this.lock(c,projectId);const row=(await c.query('SELECT * FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2 FOR UPDATE',[projectId,taskId])).rows[0];
  need(row&&row.execution.fence===fence&&row.execution.supervisor===supervisor&&['running','unknown'].includes(row.state),'stale_invocation_fence');
  for(const name of ['identity','sample'])if(update[name]){need(!row.execution[name]||hash(row.execution[name])===hash(update[name]),'immutable_invocation_evidence');row.execution[name]=update[name];}
  if(update.sample){need(hash(update.sample.observation.binding)===hash(row.execution.binding),'invocation_binding_mismatch');if(update.sample.observation.processIdentity)need(hash(row.execution.identity)===hash(update.sample.observation.processIdentity),'invocation_identity_mismatch');}
  const state=update.sample?(safeExit(update.sample.observation)?'completed':'unknown'):row.state;
  let result=row.result;
  if(state==='completed'&&update.sample.observation.status==='ok')result={schema:'neomorphic.foundry.invocation.v1',target:row.execution.binding.capability,taskId,manifestId:row.manifest_id,inputDigest:row.input_digest,output:update.sample.output,invokedAt:update.sample.observation.observedAt,outcome:'observed_output',purpose:'owner_qa',relationship:'owner',cost:null,effortMs:null,beneficiaryGrantId:row.execution.grantId,environmentDigest:row.execution.binding.environmentDigest,executionObservation:update.sample.observation.id};
  await c.query('UPDATE correspondence_vf04_invocations SET state=$3,execution=$4,result=$5 WHERE project_id=$1 AND task_id=$2',[projectId,taskId,state,row.execution,result]);return {recorded:true};
 });},
};
