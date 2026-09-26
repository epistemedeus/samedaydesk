// Owner-controlled local fixtures. Distinct handles/groups simulate host assignment;
// they are not real independent operators or a hosted identity provider.
import { ValidationService, createFixtureJsonRunner, digest, schemaId } from '../src/index.mjs';
export const artifact = { kind: 'capability-card-check', requiredFields: ['name', 'description'], maxDescriptionLength: 240 };
export const environmentDigest = digest({ nodeMajor: 22, recipe: 'fixture-json-card-v1' });
export const evaluator = { id: 'evaluator:exchange-card', revision: 'git:28924aac2a33cdf58bc9049a2198ab1ce9866f0f/fixture-recipe-v1' };
export const brief = { taskId: 'task:visitor-a', objectiveChecks: [
  { id: 'check:kind', check: { kind: 'json_path_equals', path: 'kind', equals: artifact.kind } },
  { id: 'check:fields', check: { kind: 'json_path_equals', path: 'requiredFields', equals: artifact.requiredFields } },
  { id: 'check:limit', check: { kind: 'json_path_equals', path: 'maxDescriptionLength', equals: 240 } },
], subjectiveCriteria: [] };
export const candidate = (suffix = 'a', overrides = {}) => ({
  schema: schemaId('candidate'), id: `candidate:${suffix}`, scope: 'scope:demo',
  capability: { id: `capability:card-${suffix}`, revision: digest(artifact) }, sourceRevision: 'fixture:card-r1',
  artifactDigest: digest(artifact), artifactRef: 'fixture:card-rule.json', taskId: `task:author-${suffix}`,
  dependencies: [], rights: { license: 'MIT', permissionRef: 'fixture:owner-authorized-synthetic-data' },
  claimed: { summary: 'Contributor says all checks pass; this is not observed verification.', evidenceRefs: [], limitations: [] }, supersedes: null, ...overrides,
});
export const defaultPolicy = { schema: schemaId('validation_policy'), id: 'policy:demo', revision: 'fixture:v1', scope: 'scope:demo', evaluator, environmentDigest, risk: 'low', deterministic: true,
  requiredChecks: brief.objectiveChecks.map(x => x.id), attempt: { cpuMs: 1000, wallMs: 10000, memoryMb: 64, cost: { currency: 'USD_MICROS', units: '1000' } }, maxAttempts: 2, retryDelayMs: 1000, reviewMs: 30000 };
export const defaultLimits = { maxOutstanding: 8, maxPerScope: 4, maxRunning: 2, maxRunningPerScope: 1, maxRecords: 128, maxCommands: 1024, maxCpuMs: 100000, maxWallMs: 1000000, maxMemoryMb: 256, maxCost: { currency: 'USD_MICROS', units: '100000' }, maxReviewMs: 120000, maxReviews: 4 };
export function harness(options = {}) {
  const handles = Object.fromEntries(['contributor', 'runner', 'operator', 'reviewer', 'beneficiary', 'evidence', 'outsider'].map(k => [k, Object.freeze({ label: `fixture:${k}` })]));
  let now = '2026-09-26T12:00:00.000Z'; let sequence = 0;
  const policies = options.policies ?? [{ ...defaultPolicy, ...options.policy }];
  const scopes = policies.map(p => p.scope);
  const principals = [
    { handle: handles.contributor, subject: 'actor:contributor', group: 'organization:author', roles: ['contributor', 'beneficiary'], scopes },
    { handle: handles.runner, subject: 'actor:runner', group: options.runnerGroup ?? 'organization:verifier', roles: ['runner'], scopes, evaluators: [evaluator], assignmentEvidence: 'fixture:operator-assignment-1' },
    { handle: handles.operator, subject: 'actor:operator', group: 'organization:host', roles: ['operator'], scopes },
    { handle: handles.reviewer, subject: 'actor:reviewer', group: 'organization:review', roles: ['reviewer'], scopes },
    { handle: handles.beneficiary, subject: 'actor:beneficiary', group: 'organization:unknown-visitor', roles: ['beneficiary'], scopes },
    { handle: handles.evidence, subject: 'actor:evidence', group: 'organization:evidence-adapter', roles: ['evidence_reader'], scopes },
    { handle: handles.outsider, subject: 'actor:outsider', group: 'organization:other', roles: ['runner'], scopes, evaluators: [evaluator], assignmentEvidence: 'fixture:other-runner' },
  ];
  // Sort picks actor:runner; fixture outsider has no compatible installed evaluator.
  principals.at(-1).evaluators = [];
  const service = new ValidationService({ principals, policies, limits: { ...defaultLimits, ...options.limits }, dependencies: options.dependencies ?? [], clock: () => now, mode: options.mode ?? 'fixture' });
  const command = (who, type, payload, extra = {}) => service.dispatch(handles[who], { schema: schemaId('validation_command'), id: `command:${++sequence}`, expectedRevision: service.snapshot().revision, type, payload, ...extra });
  const run = createFixtureJsonRunner({ evaluator, environmentDigest, brief });
  const receipt = (assignment, extra = {}) => ({ ...run({ assignment: { ...assignment, mode: 'fixture' }, artifact, receiptId: `receipt:${assignment.id.split(':')[1]}`, observedAt: now }), ...extra });
  const accept = (c = candidate()) => {
    const submitted = command('contributor', 'submit', c); if (!submitted.ok) throw new Error(JSON.stringify(submitted));
    const assigned = command('operator', 'assign', {}); if (!assigned.ok) throw new Error(JSON.stringify(assigned));
    const r = receipt(assigned.result.assignment); const result = command('runner', 'receipt', r);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return { candidate: c, assignment: assigned.result.assignment, receipt: r, result };
  };
  return { service, handles, command, receipt, accept, setTime: value => { now = value; }, advance: ms => { now = new Date(Date.parse(now) + ms).toISOString(); }, now: () => now };
}
export const observation = (overrides = {}) => ({
  schema: schemaId('reuse_observation'), id: 'reuse:b', scope: 'scope:demo', candidateId: 'candidate:a', capability: candidate().capability,
  taskId: 'task:cold-b', environmentDigest, taskInputDigest: digest({ name: 'cold-task', description: 'A later card.' }),
  occurredAt: '2026-09-26T12:01:00.000Z', relationship: 'owner', purpose: 'owner_qa', outcome: 'useful', outcomeSource: { ref: 'fixture:cold-card-result', revision: 'fixture:v1' },
  adaptation: 'No change to the pinned JSON rule.', effortMs: null, cost: null,
  cohort: { experimentId: 'experiment:card-holdout', holdoutRevision: 'fixture:frozen-1', taskClass: 'task-class:card-boundary', metricVersion: 'metric:expected-issues-v1', arm: 'reuse_only', caseId: 'case:long-description' }, supersedes: null, ...overrides,
});
export const manifest = () => ({ schema: schemaId('cohort_manifest'), scope: 'scope:demo', experimentId: 'experiment:card-holdout', holdoutRevision: 'fixture:frozen-1', taskClass: 'task-class:card-boundary', metricVersion: 'metric:expected-issues-v1', capability: candidate().capability, environmentDigest, purpose: 'owner_qa', relationship: 'owner', cases: [{ id: 'case:long-description', taskInputDigest: observation().taskInputDigest }], arms: ['baseline', 'reuse_only'], baselineSource: { ref: 'fixture:baseline-no-network', revision: 'fixture:legacy-card-rule-v0' } });
export const baseline = () => {
  const o = observation();
  return { id: 'baseline:a', scope: o.scope, capability: o.capability, environmentDigest, taskId: 'task:baseline-cold', taskInputDigest: o.taskInputDigest, purpose: o.purpose, relationship: o.relationship, cohort: { ...o.cohort, arm: 'baseline' }, outcome: 'failed', outcomeSource: { ref: 'fixture:baseline-result', revision: 'fixture:v1' }, effortMs: null, cost: null };
};
