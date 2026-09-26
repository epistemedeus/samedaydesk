import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReceivingPorts, installedPolicy, verificationResult, toVF03Receipt } from '../src/ports.mjs';
import { cases, evaluation, bindingFor } from '../example/package.mjs';
import { packaged, realModule, wasm, execute, limits } from './helpers.mjs';
import { invoke } from '../src/supervisor.mjs';
import { hash, copy, createArtifact, refOf, bytesHash, validateArtifact, DEFAULT_LIMITS } from '../src/contracts.mjs';
import { createVersion } from '../../capabilities/src/contracts.mjs';
function setup(artifact=packaged()) {
  const policy=installedPolicy({evaluator:evaluation,cases,environment:{platform:'linux',arch:'x64',purpose:'owner_qa'}});
  const assignment={id:'assignment:verify-1',candidateId:'candidate:submitted-1',artifactDigest:artifact.id,
    sourceRevision:hash(artifact.capability.source),capability:{id:artifact.capability.capabilityId,revision:artifact.capability.contentId},
    dependencyDigest:hash([]),evaluator:{id:evaluation.id,revision:evaluation.revision},environmentDigest:policy.environmentDigest,
    requiredChecks:cases.map(c=>c.id),deadline:new Date(Date.now()+60000).toISOString(),
    reservation:{cpuMs:12000,wallMs:24000,memoryMb:512}};
  const attempt={artifact,moduleBytes:realModule,assignment,fence:'durable-attempt-fence'};
  const ports=createReceivingPorts({enabled:true,policy,loadVerification:async()=>attempt});
  return {ports,attempt,policy,assignment,request:{projectId:'project:owned',assignmentId:assignment.id,fence:attempt.fence}};
}
test('opt-in assigned verifier checks independent oracle and emits explicit legacy projection',async()=>{
  const s=setup();const launched=[];
  const r=await s.ports.verify({...s.request,onSpawn:record=>launched.push(record)});
  assert.equal(r.outcome,'sample_checks_passed');assert.equal(r.checks.length,6);assert.equal(launched.length,6);
  assert.equal(r.applicability.kind,'exact-inputs-only');assert.ok(r.applicability.inputDigests.every(Boolean));
  assert.equal(r.binding.capability.version,s.attempt.artifact.capability.version);
  const receipt=toVF03Receipt(r,{assignment:s.assignment,fence:s.attempt.fence,observedAt:new Date().toISOString()});
  assert.ok(receipt.observed.checks.every(c=>c.status==='pass'));assert.equal(receipt.usage.cost,null);
  assert.throws(()=>toVF03Receipt(r,{assignment:s.assignment,fence:'wrong',observedAt:new Date().toISOString()}),/binding mismatch/);
});
test('stale fence, candidate, runtime, evaluator, coverage and inadequate reservations are refused before spawn',async()=>{
  const s=setup();await assert.rejects(s.ports.verify({...s.request,fence:'old'}),/stale/);
  for(const mutate of [a=>a.artifactDigest=hash('other'),a=>a.capability.revision=hash('other'),
    a=>a.environmentDigest=hash('other'),a=>a.evaluator.revision='other',a=>a.requiredChecks=[],
    a=>a.reservation.cpuMs=1,a=>a.deadline='2020-01-01T00:00:00Z']) {
    const t=setup();mutate(t.attempt.assignment);await assert.rejects(t.ports.verify(t.request));
  }
  const artifact=packaged();const binding=bindingFor(artifact,{runtimePin:hash('other')});
  await assert.rejects(invoke({artifact,moduleBytes:realModule,input:cases[0].input,binding}),/runtime binding mismatch/);
  await assert.rejects(createReceivingPorts({}).verify({}),/disabled/);
});
test('candidate test proposals cannot select tests or expand applicability',async()=>{
  const s=setup();s.attempt.assignment.requiredChecks=['case:contributor-always-pass'];
  await assert.rejects(s.ports.verify(s.request),/coverage/);
  const artifact=copy(packaged());artifact.evaluation.suiteDigest=hash([{id:'case:easy'}]);
  const {id,...body}=artifact;const custom=createArtifact(body);const t=setup(custom);
  await assert.rejects(t.ports.verify(t.request),/installation mismatch/);
});
test('unknown resource result cannot pass, become a legacy receipt or launch another case',async()=>{
  const s=setup();const binding=bindingFor(s.attempt.artifact,{environmentDigest:s.policy.environmentDigest});
  const unknown={status:'unknown',termination:{exited:false,noLaunch:false},binding,usage:{cpuMs:null,wallMs:10}};
  const r=verificationResult({artifact:s.attempt.artifact,binding,policy:s.policy,samples:cases.map(()=>({observation:unknown,output:{}}))});
  assert.equal(r.outcome,'not_verified');assert.ok(r.checks.every(c=>c.status==='incomplete'));
  const bound=copy(r);bound.binding={...bound.binding,assignmentId:s.assignment.id,candidateId:s.assignment.candidateId,fence:s.attempt.fence};
  const {id,...body}=bound;bound.id=hash(body);
  assert.throws(()=>toVF03Receipt(bound,{assignment:s.assignment,fence:s.attempt.fence,observedAt:new Date().toISOString()}),/termination unknown/);
  const a=new AbortController();let spawned=0;
  const cancelled=await s.ports.verify({...s.request,signal:a.signal,onSpawn:()=>{spawned++;a.abort();}});
  assert.equal(spawned,1);assert.equal(cancelled.outcome,'not_verified');
  assert.ok(cancelled.checks.every(c=>c.status==='incomplete'));
});
test('full VF01 reference/source domain survives portable packaging; legacy narrowing is explicit',async()=>{
  const original=packaged();const {contentId,...v}=copy(original.capability);
  v.capabilityId='namespace:'+('x'.repeat(470));v.version='版本 '+('v'.repeat(450));
  const cap=createVersion(v);const {id,...body}=copy(original);body.capability=cap;
  const artifact=createArtifact(body);assert.equal(artifact.capability.version,v.version);validateArtifact(artifact,realModule);
  const s=setup(artifact);s.attempt.moduleBytes=realModule;const r=await s.ports.verify(s.request);
  assert.equal(r.outcome,'sample_checks_passed');assert.equal(r.binding.capability.capabilityId,v.capabilityId);
  assert.throws(()=>toVF03Receipt(r,{assignment:s.assignment,fence:s.attempt.fence,observedAt:new Date().toISOString()}),/legacy_receipt_domain_unsupported/);
});
test('content, shape, module/input size and profile drift fail closed',async()=>{
  const artifact=packaged();const binding=bindingFor(artifact);
  await assert.rejects(invoke({artifact,moduleBytes:Buffer.concat([realModule,Buffer.from([0])]),input:{},binding}),/bytes mismatch/);
  await assert.rejects(invoke({artifact,moduleBytes:realModule,input:{text:'a'.repeat(17000)},binding}),/input size/);
  await assert.rejects(invoke({artifact,moduleBytes:realModule,input:[],binding}),/input shape/);
  for(const mutate of [a=>a.profile.version='0',a=>a.limits.fuel=DEFAULT_LIMITS.fuel*100,a=>a.capability.source.revision='main']) {
    const a=copy(artifact);mutate(a);assert.throws(()=>validateArtifact(a));
  }
});
test('invoke loader must return exact currently authorized immutable manifest',async()=>{
  const artifact=packaged();const s=setup(artifact);
  const request={taskId:'task:cold-b',input:cases[0].input};
  const manifest={id:'manifest:owned',requestId:hash(request),target:refOf(artifact.capability)};
  const permit={manifest,artifact,moduleBytes:realModule,binding:bindingFor(artifact,{environmentDigest:s.policy.environmentDigest})};
  const ports=createReceivingPorts({enabled:true,policy:s.policy,loadInvocation:async()=>permit});
  const result=await ports.invoke({projectId:'project:owned',manifestId:manifest.id,request});assert.deepEqual(result.output,cases[0].expected);
  await assert.rejects(ports.invoke({projectId:'project:owned',manifestId:manifest.id,request:{...request,input:{}}}),/manifest mismatch/);
  permit.manifest.target={...permit.manifest.target,contentId:hash('other')};
  await assert.rejects(ports.invoke({projectId:'project:owned',manifestId:manifest.id,request}),/manifest mismatch/);
});
