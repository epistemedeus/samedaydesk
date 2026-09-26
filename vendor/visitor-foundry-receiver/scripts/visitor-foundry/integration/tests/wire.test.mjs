import test from 'node:test';
import assert from 'node:assert/strict';
import { vectors } from '../wire/vectors.mjs';
import { exactRef, identity, toValidationIdentity, fromValidationIdentity, toNativeRef, toGapBinding, fromGapBinding, validateAdmission, UnsupportedWire, wireSchema } from '../src/wire.mjs';
import { validateGap, validateVersion, hash, createSnapshot } from '../../capabilities/src/index.mjs';
import { harness, candidate as fixtureCandidate } from '../../validation/fixtures/example-config.mjs';
import { Candidate, validate, schemaId } from '../../validation/src/index.mjs';
import { gapSchema } from '../../../../services/correspondence/dist/visitor-work-cells/contracts.js';
const v=vectors();
test('full VF01 domain: 512 UTF-16 coordinates, non-ASCII/punctuation and 100 exact dependencies round trip through native VF03 and JSON',()=>{
  validateVersion(v.maximum.manifest);
  for(const r of [v.maximum.identity.target,...v.maximum.identity.dependencies]) {
    assert.equal(r.capabilityId.length,512);assert.equal(r.version.length,512);exactRef(r);
  }
  const binding=JSON.parse(JSON.stringify(toValidationIdentity(v.maximum.identity)));
  assert.deepEqual(fromValidationIdentity(binding),v.maximum.identity);
  validate(Candidate,{schema:schemaId('candidate'),id:'candidate:maximum',scope:'scope:conformance',...binding.native,
    sourceRevision:hash('source'),artifactDigest:hash('artifact'),artifactRef:'https://fixtures.invalid/artifact',taskId:'task:maximum',
    rights:{license:'MIT',permissionRef:'source:permission'},claimed:{summary:'Conformance only',evidenceRefs:[],limitations:[]},supersedes:null});
  assert.equal(binding.native.dependencies.length,100);
  assert.equal(new Set(binding.native.dependencies.map(d=>d.id)).size,100);
  assert.throws(()=>exactRef(v.malformed.overlong));
  assert.throws(()=>identity(v.maximum.identity.target,[...v.maximum.identity.dependencies,v.maximum.identity.dependencies[0]]));
});
test('original exact pins are verified; same-coordinate different-content conflicts and alias substitution fail',()=>{
  const changed=structuredClone(v.maximum.binding);changed.native.capability.revision=hash('forged');
  assert.throws(()=>fromValidationIdentity(changed),{code:'IDENTITY_BINDING_MISMATCH'});
  changed.native=v.maximum.binding.native;changed.original.target.version='some other version';
  assert.throws(()=>fromValidationIdentity(changed),{code:'IDENTITY_BINDING_MISMATCH'});
  assert.equal(toNativeRef(v.conflictingTarget).id,toNativeRef(v.maximum.identity.target).id);
  assert.notDeepEqual(toNativeRef(v.conflictingTarget),toNativeRef(v.maximum.identity.target));
  assert.throws(()=>identity(v.maximum.identity.target,[v.conflictingTarget]),{code:'COORDINATE_CONTENT_CONFLICT'});
  const different={...v.maximum.manifest,provenance:{...v.maximum.manifest.provenance,original:'changed'}};
  delete different.contentId;different.contentId=hash(different);
  assert.throws(()=>createSnapshot({versions:[v.maximum.manifest,different],observations:[],mutations:[],coverage:{outcomes:['normalize'],complete:true,sourceRefs:['fixture:maximum'],asOf:'2026-09-26T12:00:00.000Z'}}));
});
test('immutable gap, projection and workflow revision have distinct shapes and full-domain round trips',()=>{
  validateGap(v.gap.gap);gapSchema.parse(v.gap.cellGap);
  assert.notEqual(v.gap.gap.schema,v.gap.cellGap.schema);
  assert.equal(v.gap.gap.revision,1);assert.equal(v.gap.cellGap.contentId,v.gap.gap.contentId);
  assert.deepEqual(fromGapBinding(JSON.parse(JSON.stringify(v.gap))),v.gap.gap);
  assert.throws(()=>gapSchema.parse({...v.gap.cellGap,schema:v.gap.gap.schema}));
  assert.throws(()=>gapSchema.parse({...v.gap.cellGap,revision:v.gap.gap.contentId}));
  const changed=structuredClone(v.gap);changed.cellGap.contentId=hash('changed');
  assert.throws(()=>fromGapBinding(changed),{code:'IDENTITY_BINDING_MISMATCH'});
  const funded={...v.gap.gap,funding:{kind:'funded',ref:'funding:separately-owned'}};delete funded.contentId;funded.contentId=hash(funded);
  assert.throws(()=>toGapBinding(funded,v.gap.cellGap.reproducer),e=>e instanceof UnsupportedWire&&e.result.accepted===false&&e.result.original.contentId===funded.contentId);
});
test('external admission preserves maximum domain; authority fields and internal aliases are refused',()=>{
  const body={schema:wireSchema('candidate-admission'),cellId:'cell:one',workflowRevision:4,fence:1,identity:v.maximum.identity,artifact:{kind:'preflight-engine-v1',maxRangeLength:128}};
  assert.deepEqual(validateAdmission(body),body);
  for(const field of ['accepted','allocation','budget','evaluator','receipt','native'])assert.throws(()=>validateAdmission({...body,[field]:true}));
  assert.throws(()=>validateAdmission({...body,identity:v.maximum.binding.native}));
});
test('VF01 lone-surrogate identity round trips unchanged; PostgreSQL operations refuse it explicitly',()=>{
  const original=identity({capabilityId:'fixture:\ud800',version:'v\udfff',contentId:hash('lone-surrogate')});
  assert.deepEqual(fromValidationIdentity(toValidationIdentity(original)),original);
  assert.throws(()=>validateAdmission({schema:wireSchema('candidate-admission'),cellId:'cell:one',workflowRevision:1,fence:1,identity:original,artifact:{}}),
    e=>e instanceof UnsupportedWire&&e.result.reason==='postgres_json_unicode_unavailable'&&JSON.stringify(e.result.original)===JSON.stringify(original));
});

test('actual VF03 dispatch admits all 100 mapped dependencies and does not promote on submission',()=>{
  const binding=toValidationIdentity(v.maximum.identity);
  const h=harness({dependencies:binding.native.dependencies.map(ref=>({ref,active:true}))});
  const c=fixtureCandidate('maximum',{...binding.native});
  const result=h.command('contributor','submit',c);assert.equal(result.ok,true,JSON.stringify(result));
  const persisted=JSON.parse(JSON.stringify(h.service.snapshot().candidates[c.id]));
  assert.equal(persisted.acceptance,'pending');assert.equal(persisted.promotion,'not_promoted');
  assert.equal(persisted.candidate.dependencies.length,100);
  assert.deepEqual(fromValidationIdentity({...binding,native:{capability:persisted.candidate.capability,dependencies:persisted.candidate.dependencies}}),v.maximum.identity);
  assert.equal(h.service.snapshot().charged.costUnits,'0');
  const forged=h.service.dispatch({...h.handles.operator},{schema:schemaId('validation_command'),id:'command:forged',expectedRevision:1,type:'assign',payload:{}});
  assert.equal(forged.ok,false);assert.equal(forged.code,'unauthenticated');assert.equal(h.service.snapshot().charged.costUnits,'0');
});
