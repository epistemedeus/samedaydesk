import { createHash } from 'node:crypto';

export const schemaId = name => `neomorphic.foundry.${name}.v1`;
export class FoundryError extends Error {
  constructor(code, nextAction) { super(code); this.code = code; this.nextAction = nextAction; }
}
export function requireThat(value, code, nextAction = 'Correct the request and retry with the current revision.') {
  if (!value) throw new FoundryError(code, nextAction);
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = value => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
export const clone = value => structuredClone(value);
const string = (maxLength = 256) => ({ type: 'string', minLength: 1, maxLength });
const integer = (maximum = Number.MAX_SAFE_INTEGER, minimum = 0) => ({ type: 'integer', minimum, maximum });
const enumeration = (...values) => ({ enum: values });
const array = (items, maxItems = 64) => ({ type: 'array', items, maxItems });
const nullable = rule => ({ anyOf: [rule, { type: 'null' }] });
const object = (properties, optional = []) => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false });
const id = { ...string(160), pattern: '^[a-zA-Z0-9][a-zA-Z0-9._/-]*:[a-zA-Z0-9._:/@+-]+$' };
const sha = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' };
const atomic = { type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' };
const time = { type: 'string', format: 'date-time', pattern: '^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{3})?Z$' };
const ref = object({ id, revision: string() });
const money = object({ currency: string(32), units: atomic });
const resources = object({ cpuMs: integer(86400000), wallMs: integer(86400000), memoryMb: integer(1048576, 1), cost: money });
const source = object({ ref: string(512), revision: string() });
const relationship = enumeration('owner', 'affiliated', 'sponsored', 'independent', 'unknown');
const cohort = object({ experimentId: id, holdoutRevision: string(), taskClass: id, metricVersion: id, arm: enumeration('baseline', 'reuse_only', 'contribution'), caseId: id });

export const Candidate = object({
  schema: { const: schemaId('candidate') }, id, scope: id, capability: ref,
  sourceRevision: string(), artifactDigest: sha, artifactRef: string(512), taskId: id,
  // Host adapters retain original exact refs beside checked internal aliases.
  dependencies: array(ref, 100), rights: object({ license: string(), permissionRef: string(512) }),
  claimed: object({ summary: string(2048), evidenceRefs: array(source, 16), limitations: array(string(512), 16) }),
  supersedes: nullable(id),
});
export const Receipt = object({
  schema: { const: schemaId('verification_receipt') }, id, assignmentId: id,
  candidateId: id, capability: ref, sourceRevision: string(), artifactDigest: sha,
  dependencyDigest: sha, evaluator: ref, environmentDigest: sha,
  observedAt: time, observed: object({ checks: array(object({ id, status: enumeration('pass', 'fail', 'skip', 'incomplete'), evidence: source }), 32), limitations: array(string(512), 16) }),
  usage: object({ cpuMs: nullable(integer()), wallMs: nullable(integer()), cost: nullable(money) }),
});
export const ReuseObservation = object({
  schema: { const: schemaId('reuse_observation') }, id, scope: id, candidateId: id,
  capability: ref, taskId: id, environmentDigest: sha, taskInputDigest: sha,
  occurredAt: time, relationship, purpose: enumeration('owner_qa', 'sponsored_evaluation', 'external_task', 'unknown'),
  outcome: enumeration('useful', 'not_useful', 'failed', 'unknown'), outcomeSource: source,
  adaptation: string(2048), effortMs: nullable(integer()), cost: nullable(money),
  cohort, supersedes: nullable(id),
});
export const Attestation = object({
  observationId: id, observationDigest: sha, evidence: source,
  outcome: enumeration('useful', 'not_useful', 'failed', 'unknown'),
  independence: enumeration('established', 'not_independent', 'unknown'),
});
export const Policy = object({
  schema: { const: schemaId('validation_policy') }, id, revision: string(), scope: id,
  evaluator: ref, environmentDigest: sha, risk: enumeration('low', 'ambiguous', 'high'),
  deterministic: { type: 'boolean' }, requiredChecks: array(id, 32),
  attempt: resources, maxAttempts: integer(8, 1), retryDelayMs: integer(86400000),
  reviewMs: integer(86400000, 1),
});
export const Limits = object({
  maxOutstanding: integer(10000, 1), maxPerScope: integer(10000, 1),
  maxRunning: integer(1000, 1), maxRunningPerScope: integer(1000, 1),
  maxRecords: integer(100000, 1), maxCommands: integer(1000000, 1),
  maxCpuMs: integer(), maxWallMs: integer(), maxMemoryMb: integer(1048576, 1),
  maxCost: money, maxReviewMs: integer(), maxReviews: integer(),
});
export const commands = {
  submit: Candidate,
  assign: object({}),
  configurePolicy: Policy,
  revalidate: object({candidateId:id,expectedGeneration:integer(8,1),reason:string(512)}),
  finishUnknown: object({candidateId:id,assignmentId:nullable(id),reason:string(512),evidence:source}),
  receipt: Receipt,
  expire: object({}),
  review: object({ candidateId: id, receiptId: id, decision: enumeration('accept', 'reject'), evidence: source }),
  promote: object({ candidateId: id, receiptId: id, evidence: source }),
  invalidate: object({ scope: id, target: enumeration('candidate', 'receipt', 'dependency'), candidateId: nullable(id), receiptId: nullable(id), dependency: nullable(ref), reason: string(512), evidence: source }),
  observe: ReuseObservation,
  attest: Attestation,
  retractObservation: object({ observationId: id, reason: string(512), evidence: source }),
};
export const Command = object({ schema: { const: schemaId('validation_command') }, id, expectedRevision: integer(), type: enumeration(...Object.keys(commands)), payload: { type: 'object' } });
Command.allOf = Object.entries(commands).map(([type, payload]) => ({ if: { properties: { type: { const: type } } }, then: { properties: { payload } } }));
export const Assignment = object({
  schema: { const: schemaId('verification_assignment') }, id, candidateId: id,
  capability: ref, sourceRevision: string(), artifactDigest: sha, dependencyDigest: sha,
  evaluator: ref, environmentDigest: sha, requiredChecks: array(id, 32), runner: id,
  assignmentEvidence: string(512), mode: enumeration('fixture', 'trusted_runner'),
  attempt: integer(8, 1), assignedAt: time, deadline: time, reservation: resources,
});
export const CohortManifest = object({ schema: { const: schemaId('cohort_manifest') }, scope: id, experimentId: id, holdoutRevision: string(), taskClass: id, metricVersion: id, capability: ref, environmentDigest: sha, purpose: enumeration('owner_qa', 'sponsored_evaluation', 'external_task', 'unknown'), relationship, cases: array(object({ id, taskInputDigest: sha }), 256), arms: array(enumeration('baseline', 'reuse_only', 'contribution'), 3), baselineSource: source });
export const BaselineTrial = object({ id, scope: id, capability: ref, environmentDigest: sha, taskId: id, taskInputDigest: sha, purpose: enumeration('owner_qa', 'sponsored_evaluation', 'external_task', 'unknown'), relationship, cohort, outcome: enumeration('useful', 'not_useful', 'failed', 'unknown'), outcomeSource: source, effortMs: nullable(integer()), cost: nullable(money) });
export const schemas = { candidate: Candidate, verification_receipt: Receipt, verification_assignment: Assignment, reuse_observation: ReuseObservation, validation_policy: Policy, validation_limits: Limits, validation_command: Command, cohort_manifest: CohortManifest, baseline_trial: BaselineTrial };

// The same closed schemas are exported as JSON for HTTP adapters. No coercion/defaults.
export function validate(rule, value, path = '$') {
  if (rule.anyOf) {
    const ok = rule.anyOf.some(r => { try { validate(r, value, path); return true; } catch { return false; } });
    requireThat(ok, `invalid:${path}`); return;
  }
  if ('const' in rule) requireThat(value === rule.const, `invalid:${path}`);
  if (rule.enum) requireThat(rule.enum.includes(value), `invalid:${path}`);
  if (rule.type === 'null') requireThat(value === null, `invalid:${path}`);
  if (rule.type === 'boolean') requireThat(typeof value === 'boolean', `invalid:${path}`);
  if (rule.type === 'integer') requireThat(Number.isSafeInteger(value) && value >= rule.minimum && value <= rule.maximum, `invalid:${path}`);
  if (rule.type === 'string') {
    requireThat(typeof value === 'string', `invalid:${path}`);
    if (rule.minLength) requireThat(value.length >= rule.minLength && value.length <= rule.maxLength, `invalid:${path}`);
    if (rule.pattern) requireThat(new RegExp(rule.pattern).test(value), `invalid:${path}`);
    if (rule.format) requireThat(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z'), `invalid:${path}`);
  }
  if (rule.type === 'array') {
    requireThat(Array.isArray(value) && value.length <= rule.maxItems, `invalid:${path}`);
    value.forEach((v, i) => validate(rule.items, v, `${path}[${i}]`));
  }
  if (rule.type === 'object') {
    requireThat(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, `invalid:${path}`);
    if (rule.properties) {
      requireThat(Object.keys(value).every(k => Object.hasOwn(rule.properties, k)), `unknown_field:${path}`);
      requireThat(rule.required.every(k => Object.hasOwn(value, k)), `missing_field:${path}`);
      for (const [k, v] of Object.entries(value)) validate(rule.properties[k], v, `${path}.${k}`);
    }
  }
}
export function jsonBounded(value, maxBytes = 65536) {
  const inspect = (v, depth = 0) => {
    requireThat(depth <= 32, 'json_depth_exceeded');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { requireThat(Number.isFinite(v), 'non_json_value'); return; }
    requireThat(typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype), 'non_json_value');
    for (const child of Object.values(v)) inspect(child, depth + 1);
  };
  inspect(value);
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw new FoundryError('invalid_json', 'Send bounded JSON data.'); }
  requireThat(encoded && Buffer.byteLength(encoded) <= maxBytes, 'payload_too_large');
  // Reject undefined/NaN/prototypes/cycles instead of silently changing signed material.
  requireThat(canonical(value) === canonical(JSON.parse(encoded)), 'non_json_value');
  return JSON.parse(encoded);
}
export const sameRef = (a, b) => a.id === b.id && a.revision === b.revision;
export const refKey = ref => canonical(ref);
