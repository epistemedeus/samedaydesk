import { readFileSync } from 'node:fs';
import { SCHEMAS, createVersion, createSnapshot, appendSnapshot, refOf, resolve, createGap,
  dependencyImpact, adaptPackage, adaptS04, adaptPreflight } from '../src/index.mjs';
import { createSeedCatalog } from '../../../scale-lab/capability-market/src/catalog.mjs';
export const SOURCE_PIN = '28924aac2a33cdf58bc9049a2198ab1ce9866f0f';
export const NOW = '2026-09-26T12:00:00.000Z';
export const BEFORE = '2026-09-25T12:00:00.000Z';
export const AFTER = '2026-09-27T12:00:00.000Z';
export const ENV = Object.freeze({ nodeMajor: 22, platform: 'linux' });
export const source = { repository: 'https://github.com/epistemedeus/neomorphic-io', revision: SOURCE_PIN, path: 'packs/capability-preflight' };
export const rights = { status: 'allowed', license: 'MIT', ref: 'source:packs/capability-preflight/LICENSE' };
export const shape = properties => ({ type: 'object', required: Object.keys(properties), properties });
export function version(overrides = {}) {
  return createVersion({ schema: SCHEMAS['capability-version'], capabilityId: 'fixture:normalize', version: 'synthetic-1',
    source, outcomes: ['normalize'], input: shape({ value: { type: 'string' } }), output: shape({ result: { type: 'string' } }),
    dependencies: [], rights: { status: 'allowed', license: null, ref: 'fixture:permission' }, environment: { nodeMajor: [22], platform: ['linux', 'darwin'] },
    provenance: { refs: ['fixture:vf01-owner-controlled'], origin: 'operator:root', maintainer: 'operator:root', classification: 'demo',
      funding: 'voluntary', actionability: 'not-actionable', original: null }, ...overrides });
}
export function request(overrides = {}) {
  return { schema: SCHEMAS['capability-request'], taskId: 'fixture:later-task', outcome: 'normalize', input: { value: 'synthetic' },
    environment: { ...ENV }, output: null, capabilityId: null, ...overrides };
}
export function observation(v, overrides = {}) {
  return { schema: SCHEMAS['compatibility-observation'], id: 'fixture:positive', target: refOf(v),
    scope: { outcome: v.outcomes[0], environment: { ...ENV }, inputDigest: null }, verdict: 'compatible', observedAt: BEFORE,
    expiresAt: AFTER, observerId: 'runner:owner-controlled-fixture', receiptRef: 'receipt:synthetic-positive', ...overrides };
}
export function mutation(target, kind, overrides = {}) {
  return { schema: SCHEMAS['capability-mutation'], id: 'mutation:one', kind, target: typeof target === 'string' ? target : refOf(target),
    replacementId: null, revision: 1, previousId: null, at: NOW, reason: 'Owner-controlled synthetic regression', provenanceRef: 'receipt:maintenance', ...overrides };
}
export function snapshot(versions, observations = [], mutations = [], coverage = {}) {
  return createSnapshot({ versions, observations, mutations, coverage: { outcomes: ['normalize', 'genuine-gap', 'node-engine-compatibility'],
    complete: true, sourceRefs: ['fixture:bounded-catalog'], asOf: NOW, ...coverage } });
}
export const policyFor = s => ({ policyRef: 'policy:owner-controlled-fixture-v1', admittedObservationIds: s.observations.map(o => o.id) });
export const options = s => ({ now: NOW, policy: policyFor(s) });
export function packageFixture() {
  const manifest = JSON.parse(readFileSync(new URL('../../../../packs/capability-preflight/package.json', import.meta.url), 'utf8'));
  const capability = adaptPackage({ manifest, source, outcomes: ['node-engine-compatibility'],
    input: shape({ range: { type: 'string' }, nodeVersion: { type: 'string' } }),
    output: shape({ status: { type: 'string', enum: ['compatible', 'incompatible', 'unknown'] } }),
    rights, environment: { nodeMajor: [22], platform: ['linux'] },
    provenance: { refs: ['git:' + SOURCE_PIN, 'source:packs/capability-preflight/SOURCE.txt'], origin: 'source:pilot-capability-preflight',
      maintainer: 'operator:neomorphic', classification: 'demo', funding: 'voluntary', actionability: 'not-actionable', original: { boundExport: 'src/probes.mjs#satisfiesEnginesNode',
        adaptation: 'map true/false/null to compatible/incompatible/unknown', permissionScope: 'MIT sample allowlist only', note: 'Owner-controlled demonstration; not hosted acceptance.' } } });
  const s = snapshot([capability], [observation(capability, { id: 'fixture:package-engine-probe', receiptRef: 'receipt:synthetic-package-engine-probe' })]);
  return { capability, snapshot: s, policy: policyFor(s) };
}
export function demo() {
  const dep = version({ capabilityId: 'fixture:dependency' });
  const dep2 = version({ capabilityId: 'fixture:dependency', version: 'synthetic-2' });
  const v = version({ dependencies: [refOf(dep)] });
  const v2 = version({ version: 'synthetic-2', dependencies: [refOf(dep2)] });
  const positive = observation(v), positive2 = observation(v2, { id: 'fixture:positive-v2' });
  const s = snapshot([dep, dep2, v, v2], [positive, positive2]);
  const scopedRequest = request({ capabilityId: v.capabilityId });
  const missRequest = request({ outcome: 'genuine-gap' });
  const negative = observation(v, { id: 'fixture:negative', verdict: 'incompatible', receiptRef: 'receipt:synthetic-negative' });
  const expired = observation(v, { id: 'fixture:expired', verdict: 'incompatible', observedAt: '2026-09-24T12:00:00.000Z', expiresAt: BEFORE });
  const add = (base, changes) => appendSnapshot(base, { ...changes, expectedSnapshotId: base.snapshotId });
  const conflict = add(s, { observations: [negative] });
  const stale = add(s, { observations: [expired] });
  const replacement = observation(v, { id: 'fixture:corrected-positive', observedAt: NOW });
  const corrected = add(conflict, { observations: [replacement], mutations: [mutation(negative.id, 'correct-observation', { replacementId: replacement.id })] });
  const retracted = add(conflict, { mutations: [mutation(negative.id, 'retract-observation')] });
  const revoked = add(s, { mutations: [mutation(dep, 'revoke-version')] });
  const deprecated = add(s, { mutations: [mutation(v, 'deprecate-version')] });
  const resolveOne = (graph, req = scopedRequest) => resolve(graph, req, options(graph));
  const s04 = adaptS04(createSeedCatalog().find(c => c.id === 'fixture-demo-echo'), { source: { ...source, path: 'scripts/scale-lab/capability-market/src/catalog.mjs' }, rights: { status: 'unknown', license: null, ref: 'source:website-rights-unresolved' }, now: NOW });
  return {
    schema: 'neomorphic.foundry.capability-demo.v1', sourcePin: SOURCE_PIN, clock: NOW, classification: 'owner-controlled-synthetic',
    compatibleReuse: resolveOne(s), genuineMiss: resolveOne(s, missRequest), unknownEnvironment: resolveOne(s, request({ capabilityId: v.capabilityId, environment: { nodeMajor: 22 } })),
    conflictingEvidence: resolveOne(conflict), expiredEvidence: resolveOne(stale), correctedEvidence: resolveOne(corrected), retractedEvidence: resolveOne(retracted),
    revokedDependency: resolveOne(revoked), deprecation: resolveOne(deprecated), dependencyImpact: dependencyImpact(revoked, refOf(dep)),
    gap: createGap(s, missRequest, options(s), { gapId: 'gap:synthetic-miss', reproducer: { ref: 'fixture:permission-cleared-reproducer', permission: 'synthetic' }, funding: { kind: 'voluntary', ref: null } }),
    adapters: { s04, package: packageFixture().capability, preflight: adaptPreflight({ advertised: true, binding: { status: 'content_bound' }, executionVerified: true, accepted: true }, { target: refOf(v), receiptRef: 'receipt:supplied-preflight-claim' }) },
    limitations: ['Compatibility does not establish actionability, registry acceptance, useful outcome or payment.', 'All evidence admission in this demonstration is owner-controlled; no independent operator or external demand is claimed.'],
  };
}
