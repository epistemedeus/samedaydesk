// Authoritative executable external receiving contract. No native VF03 aliases
// are accepted from callers. VF01's UTF-16 lengths and complete syntax apply.
import { safeData, object, check, ref, refOf, array, hash, versionKey, validateGap,
  str, environment, digest, iso, choice } from '../../capabilities/src/contracts.mjs';
export const wireSchema = name => `neomorphic.foundry.${name}.v1`;
export const WIRE_LIMITS = Object.freeze({ coordinateCodeUnits:512, dependencies:100, admissionBytes:524288, installedDependencies:32 });
export function exactRef(value) { safeData(value); ref(value); return structuredClone(value); }
export function identity(target, dependencies = []) {
  return validateIdentity({schema:wireSchema('candidate-identity'),target:refOf(target),dependencies});
}
export function validateIdentity(value) {
  safeData(value); object(value,['schema','target','dependencies'],'candidate identity');
  check(value.schema===wireSchema('candidate-identity'),'candidate identity schema');
  ref(value.target); array(value.dependencies,'dependencies',100); value.dependencies.forEach(d=>ref(d));
  const coordinates=new Map();
  for(const r of [value.target,...value.dependencies]) {
    const k=versionKey(r), old=coordinates.get(k);
    check(!old || old.contentId===r.contentId,'same coordinate has different content','COORDINATE_CONTENT_CONFLICT');
    check(!old,'duplicate target/dependency coordinate'); coordinates.set(k,r);
  }
  return structuredClone(value);
}
export const coordinateKey = r => { ref(r); return hash([r.capabilityId,r.version]); };
export function toNativeRef(value) {
  const r=exactRef(value);
  return {id:`capability:${coordinateKey(r).slice(7)}`,revision:r.contentId};
}
export function toValidationIdentity(value) {
  const original=validateIdentity(value);
  return {schema:wireSchema('validation-identity-binding'),original,
    native:{capability:toNativeRef(original.target),dependencies:original.dependencies.map(toNativeRef)}};
}
export function fromValidationIdentity(binding) {
  safeData(binding); object(binding,['schema','original','native'],'validation identity binding');
  check(binding.schema===wireSchema('validation-identity-binding'),'binding schema');
  const expected=toValidationIdentity(binding.original);
  check(hash(expected)===hash(binding),'native identity binding mismatch','IDENTITY_BINDING_MISMATCH');
  return expected.original;
}
function artifact(r) {
  object(r,['uri','digest'],'artifact'); str(r.uri,'artifact uri',2048); digest(r.digest);
  const u=new URL(r.uri); check(u.protocol==='https:'&&!u.username&&!u.password,'artifact must be credential-free HTTPS');
}
export class UnsupportedWire extends Error {
  constructor(reason, original, limit=null) {
    super(reason); this.code='unsupported_domain'; this.status=422;
    this.result={schema:wireSchema('unsupported'),status:'unsupported',reason,original:structuredClone(original),limit,accepted:false};
  }
}
// PostgreSQL jsonb cannot encode NUL or lone UTF-16 surrogates. VF01 JSON
// can represent the latter; preserve that wire domain and refuse this storage
// operation explicitly, before any identity is rewritten or partly committed.
export function ensurePostgresJson(value,original=value) {
  function unsupported(v) {
    if(typeof v==='string')return /[\u0000\uD800-\uDFFF]/u.test(v);
    if(v&&typeof v==='object')return Object.entries(v).some(([k,x])=>unsupported(k)||unsupported(x));
    return false;
  }
  if(unsupported(value))throw new UnsupportedWire('postgres_json_unicode_unavailable',original);
}
export function toGapBinding(gap, reproducer) {
  validateGap(gap); artifact(reproducer);
  if(gap.funding.kind==='funded') throw new UnsupportedWire('work_cells_have_no_funded_execution',gap);
  const cellGap={schema:wireSchema('work-cell-gap'),id:gap.id,contentId:gap.contentId,
    resolverSnapshot:{uri:`https://foundry.invalid/snapshots/${gap.resolver.snapshotId.slice(7)}`,digest:gap.resolver.snapshotId},
    reproducer:structuredClone(reproducer),permission:gap.reproducer.permission==='authorized'?'authorized-reusable':'synthetic',fundingKind:gap.funding.kind};
  return {schema:wireSchema('gap-binding'),gap:structuredClone(gap),cellGap};
}
export function fromGapBinding(binding) {
  safeData(binding); object(binding,['schema','gap','cellGap'],'gap binding');
  check(binding.schema===wireSchema('gap-binding'),'gap binding schema');
  const expected=toGapBinding(binding.gap,binding.cellGap.reproducer);
  check(hash(binding)===hash(expected),'gap projection mismatch','IDENTITY_BINDING_MISMATCH');
  return expected.gap;
}
export function validateAdmission(body) {
  safeData(body); object(body,['schema','cellId','workflowRevision','fence','identity','artifact'],'candidate admission');
  check(body.schema===wireSchema('candidate-admission'),'candidate admission schema');
  check(typeof body.cellId==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/.test(body.cellId),'cellId');
  for(const k of ['workflowRevision','fence'])check(Number.isInteger(body[k])&&body[k]>0&&body[k]<=2147483646,k);
  validateIdentity(body.identity);
  ensurePostgresJson(body,body.identity);
  if(Buffer.byteLength(JSON.stringify(body))>WIRE_LIMITS.admissionBytes)
    throw new UnsupportedWire('admission_byte_limit',body.identity,{field:'bytes',maximum:WIRE_LIMITS.admissionBytes});
  return structuredClone(body);
}
export function validateEnvironmentEvidence(value) {
  safeData(value); object(value,['schema','target','scope','evidence','observedAt','claim','permission'],'environment evidence');
  check(value.schema===wireSchema('environment-evidence-submission'),'environment evidence schema'); ref(value.target);
  object(value.scope,['outcome','environment','inputDigest'],'evidence scope');
  str(value.scope.outcome,'outcome'); environment(value.scope.environment); digest(value.scope.inputDigest);
  artifact(value.evidence); iso(value.observedAt); str(value.claim,'claim');
  choice(value.permission,['synthetic','authorized-reusable'],'permission');
  ensurePostgresJson(value);
  return structuredClone(value);
}
export const ports=Object.freeze({schema:wireSchema('receiving-ports'),contract:'src/wire.mjs',limits:WIRE_LIMITS,
  identities:{external:'candidate-identity.v1: target/dependencies are exact {capabilityId,version,contentId}',
    internal:'validation-identity-binding.v1 retains original; native id hashes full coordinate, revision is exact contentId'},
  gaps:{immutable:'gap.v1 revision=1 is format revision; contentId hashes full immutable gap',
    projection:'work-cell-gap.v1 contentId pins original; gap-binding.v1 retains full original',
    workflow:'work-cell-command.v1 expectedRevision and candidate-admission.v1 workflowRevision are CAS integers; contribution.gapRevision is immutable contentId'},
  routes:{candidates:'POST candidate-admission.v1; only installed recipe identity; unsupported returns HTTP 422 unsupported.v1, no partial acceptance',
    gap:'POST capability-request.v1 -> gap-binding.v1',
    environmentEvidence:'POST environment-evidence-submission.v1 -> environment-evidence-observation.v1; GET lists project evidence; no graph promotion'},
  ownership:{VF05:'participation only; existing authenticated work-cell ports',VF06:'composition proposal only; exact dependencies; installed evaluator decides support',
    VF07:'allocation advisory only; no reservation, verifier or budget authority'},
  storage:'PostgreSQL jsonb: valid wire strings containing lone surrogates or NUL return explicit unsupported; no Unicode replacement/normalization',
  authority:'VF02/VF04 reserve work; VF03/VF04 assign verifiers and budget; wire data grants no authority'});

export { validateGap };
// One dispatch point for the shared data schemas. HTTP authority remains in
// the receiving stores; passing this validator never grants execution rights.
export function validateWire(value) {
  safeData(value);
  switch(value?.schema) {
    case wireSchema('candidate-identity'): return validateIdentity(value);
    case wireSchema('candidate-admission'): return validateAdmission(value);
    case wireSchema('validation-identity-binding'): fromValidationIdentity(value); return structuredClone(value);
    case wireSchema('gap'): validateGap(value); return structuredClone(value);
    case wireSchema('gap-binding'): fromGapBinding(value); return structuredClone(value);
    case wireSchema('environment-evidence-submission'): return validateEnvironmentEvidence(value);
    default: check(false,'unknown receiving wire schema');
  }
}
