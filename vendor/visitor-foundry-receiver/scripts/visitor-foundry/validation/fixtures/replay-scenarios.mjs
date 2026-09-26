// Scenario data and host-installed fixture principals only. All transitions,
// receipts and validation come from the pinned canonical fixture/reducer.
import assert from 'node:assert/strict';
export function fixtureConfig(f,h,options={}){
  const policies=options.policies??[{...f.defaultPolicy,...options.policy}],scopes=policies.map(p=>p.scope);
  const declarations={contributor:['organization:author',['contributor','beneficiary']],runner:[options.runnerGroup??'organization:verifier',['runner']],
    operator:['organization:host',['operator']],reviewer:['organization:review',['reviewer']],beneficiary:['organization:unknown-visitor',['beneficiary']],
    evidence:['organization:evidence-adapter',['evidence_reader']],outsider:['organization:other',['runner']]};
  return {principals:Object.entries(declarations).map(([name,[group,roles]])=>({handle:h.handles[name],subject:`actor:${name}`,group,roles,scopes,
    ...(name==='runner'?{evaluators:[f.evaluator],assignmentEvidence:'fixture:operator-assignment-1'}:name==='outsider'?{evaluators:[],assignmentEvidence:'fixture:other-runner'}:{})})),
    policies,limits:{...f.defaultLimits,...options.limits},dependencies:options.dependencies??[],clock:()=>h.now(),mode:options.mode??'fixture'};
}
export function trace(api,build,options={}){
  const f=api.fixtures,h=f.harness(options),config=fixtureConfig(f,h,options),entries=[];
  assert.equal(new api.ValidationService(config).snapshot().configDigest,h.service.snapshot().configDigest);
  const dispatch=h.service.dispatch.bind(h.service);
  h.service.dispatch=(handle,command)=>{const at=h.now(),result=dispatch(handle,command);entries.push({actor:Object.entries(h.handles).find(([,value])=>value===handle)?.[0]??null,
    at,command:structuredClone(command),response:structuredClone(result)});return result;};
  build(h,f,api);
  return {h,config,entries,state:h.service.snapshot(),digest:api.digest(entries)};
}
export function bind(entries,handles){return entries.map(e=>({...structuredClone(e),handle:handles[e.actor]??{uninstalled:true}}));}
export function referenceReplay(api,config,entries){
  let now;const service=new api.ValidationService({...config,clock:()=>now});const responses=[];
  for(let index=0;index<entries.length;index++){
    const e=entries[index];now=e.at;let response;
    try{response=service.dispatch(e.handle,e.command);}catch(error){return {service,responses,failure:{index,code:error.code??error.message,exception:true}};}
    responses.push(response);
    if(!response.ok||api.digest(response)!==api.digest(e.response))return {service,responses,failure:{index,code:response.ok?'response_mismatch':response.code}};
  }
  return {service,responses,failure:null};
}
export const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.result;};
export const invalidate=(h,id='candidate:a')=>ok(h.command('operator','invalidate',{scope:'scope:demo',target:'candidate',candidateId:id,receiptId:null,dependency:null,
  reason:'fixture withdrawal',evidence:{ref:'fixture:withdrawal',revision:'fixture:1'}}));
export const scenarios={
  duplicates(h,f){const c=f.candidate();ok(h.command('contributor','submit',c,{id:'command:stable'}));ok(h.command('contributor','submit',c,{id:'command:stable',expectedRevision:0}));
    ok(h.command('contributor','submit',c));const a=ok(h.command('operator','assign',{})).assignment,r=h.receipt(a);ok(h.command('runner','receipt',r));
    ok(h.command('runner','receipt',r));ok(h.command('runner','receipt',{...r,id:'receipt:renamed'}));},
  transitive(h,f){const a=h.accept();h.accept(f.candidate('b',{dependencies:[a.candidate.capability]}));h.accept(f.candidate('c',{dependencies:[f.candidate('b').capability]}));h.accept(f.candidate('unrelated'));invalidate(h);},
  correction(h,f){const a=h.accept();h.accept(f.candidate('b',{dependencies:[a.candidate.capability]}));h.accept(f.candidate('corrected',{capability:{...a.candidate.capability,revision:'fixture:corrected'},sourceRevision:'fixture:corrected',supersedes:a.candidate.id}));},
  observations(h,f,api){h.accept();h.advance(60000);const o=f.observation();ok(h.command('beneficiary','observe',o));h.advance(1000);
    const corrected=f.observation({id:'reuse:corrected',supersedes:o.id,occurredAt:h.now(),outcome:'not_useful'});ok(h.command('beneficiary','observe',corrected));
    ok(h.command('evidence','attest',{observationId:corrected.id,observationDigest:api.digest(corrected),evidence:{ref:'fixture:independent-observation',revision:'fixture:1'},outcome:'not_useful',independence:'not_independent'}));
    ok(h.command('beneficiary','retractObservation',{observationId:corrected.id,reason:'fixture retraction',evidence:{ref:'fixture:retract',revision:'fixture:1'}}));},
  generations(h,f){const a=h.accept();ok(h.command('operator','configurePolicy',{...f.defaultPolicy,revision:'fixture:v2'}));
    ok(h.command('operator','revalidate',{candidateId:a.candidate.id,expectedGeneration:1,reason:'expired'},{id:'command:renew'}));
    ok(h.command('operator','revalidate',{candidateId:a.candidate.id,expectedGeneration:1,reason:'expired'},{id:'command:renew',expectedRevision:0}));
    const second=ok(h.command('operator','assign',{})).assignment;ok(h.command('runner','receipt',h.receipt(second)));
    ok(h.command('operator','revalidate',{candidateId:a.candidate.id,expectedGeneration:2,reason:'maintenance'}));
    const third=ok(h.command('operator','assign',{})).assignment;
    ok(h.command('operator','finishUnknown',{candidateId:a.candidate.id,assignmentId:third.id,reason:'witnessed termination',evidence:{ref:'fixture:supervisor',revision:'fixture:3'}}));},
  retries(h,f){ok(h.command('contributor','submit',f.candidate()));ok(h.command('operator','assign',{}));h.advance(10000);ok(h.command('operator','expire',{}));h.advance(1000);ok(h.command('operator','expire',{}));
    ok(h.command('operator','assign',{}));h.advance(10000);ok(h.command('operator','expire',{}));},
  review(h,f){ok(h.command('operator','configurePolicy',{...f.defaultPolicy,revision:'fixture:high',risk:'high'}));const a=h.accept();
    ok(h.command('reviewer','review',{candidateId:a.candidate.id,receiptId:a.receipt.id,decision:'accept',evidence:{ref:'fixture:review',revision:'fixture:1'}}));
    ok(h.command('operator','promote',{candidateId:a.candidate.id,receiptId:a.receipt.id,evidence:{ref:'fixture:promote',revision:'fixture:1'}}));},
};
export function history(api,length){return trace(api,h=>{h.accept();while(h.service.snapshot().revision<length)ok(h.command('operator','expire',{}));},
  {limits:{maxCommands:4096}});}
