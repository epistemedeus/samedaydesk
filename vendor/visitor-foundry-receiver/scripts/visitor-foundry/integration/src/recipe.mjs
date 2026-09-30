// Installed, bounded data interpreter. Never import/eval/fetch a contribution.
import { toNativeRef } from './wire.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { satisfiesEnginesNode } from '../../../../packs/capability-preflight/src/probes.mjs';
import { createVersion, validateVersion, SCHEMAS, hash, refOf } from '../../capabilities/src/index.mjs';
import { digest, requireThat as need, jsonBounded } from '../../validation/src/index.mjs';

export const SOURCE_PIN = '28924aac2a33cdf58bc9049a2198ab1ce9866f0f';
// SHA-256 of SOURCE_PIN:packs/capability-preflight/src/probes.mjs. A changed
// artifact implementation requires a source/version upgrade, never renewal.
export const SOURCE_PROBE_DIGEST='sha256:85dbdc32d1f97715ef06c075b54c42487b8ec156a08857d8cad73e74b24d1c69';
export const ENV = Object.freeze({ nodeMajor: 22, platform: 'linux' });
export const evaluator = { id: 'evaluator:installed-preflight', revision: 'vf04:bounded-recipe-v1' };
const sourceDigest = url => `sha256:${createHash('sha256').update(readFileSync(url)).digest('hex')}`;
export const installationPins = Object.freeze({
  probe: sourceDigest(new URL('../../../../packs/capability-preflight/src/probes.mjs', import.meta.url)),
  evaluator: sourceDigest(new URL('./recipe.mjs', import.meta.url)),
  wire: sourceDigest(new URL('./wire.mjs', import.meta.url)),
  verification: sourceDigest(new URL('./verification.mjs', import.meta.url)),
  node: process.version, arch: process.arch, platform: process.platform,
});
export const sourcePinsMatch = pins => pins.probe===SOURCE_PROBE_DIGEST;
export const runtimePin = digest(installationPins);
export const environmentDigest = digest({ ...ENV, runtimePin, evaluator });
export const requiredChecks = ['check:recipe', 'check:installed-probe', 'check:composition'];
export const shape = properties => ({ type: 'object', required: Object.keys(properties), properties });
export const inputShape = shape({ range: { type: 'string' }, nodeVersion: { type: 'string' } });
export const outputShape = shape({ status: { type: 'string', enum: ['compatible', 'incompatible', 'unknown'] } });
export function validateRecipe(raw) {
  const r = jsonBounded(raw, 4096);
  need(Object.keys(r).sort().join(',') === 'kind,maxRangeLength' && r.kind === 'preflight-engine-v1'
    && Number.isInteger(r.maxRangeLength) && r.maxRangeLength >= 16 && r.maxRangeLength <= 256, 'unsupported_recipe');
  return r;
}
export function invokeRecipe(raw, input) {
  const recipe = validateRecipe(raw); jsonBounded(input, 8192);
  need(typeof input.range === 'string' && typeof input.nodeVersion === 'string', 'invalid_recipe_input');
  // Supported runtime-version grammar is optional v plus three safe decimal
  // components. Pre-release/build tags, partials and malformed tails are unknown.
  const parts=/^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(input.nodeVersion);
  if(!parts || !parts.slice(1).every(n=>Number.isSafeInteger(Number(n))))return {status:'unknown'};
  const result = input.range.length > recipe.maxRangeLength || input.nodeVersion.length > 128
    ? null : satisfiesEnginesNode(input.range, input.nodeVersion);
  return { status: result === true ? 'compatible' : result === false ? 'incompatible' : 'unknown' };
}
export function capabilityFor(recipe, dependencies = []) {
  validateRecipe(recipe);
  return createVersion({ schema: SCHEMAS['capability-version'], capabilityId: 'npm:s180-capability-consumer-kit',
    version: `0.1.0+git.${SOURCE_PIN}.recipe.${digest(recipe).slice(7, 23)}`,
    source: { repository: 'https://github.com/epistemedeus/neomorphic-io', revision: SOURCE_PIN, path: 'packs/capability-preflight' },
    outcomes: ['node-engine-compatibility'], input: inputShape, output: outputShape, dependencies,
    rights: { status: 'allowed', license: 'MIT', ref: 'source:packs/capability-preflight/LICENSE' },
    environment: { nodeMajor: [22], platform: ['linux'] },
    provenance: { refs: ['source:packs/capability-preflight/SOURCE.txt', runtimePin, digest(recipe)],
      origin: 'source:pilot-capability-preflight', maintainer: 'operator:neomorphic', classification: 'demo',
      funding: 'voluntary', actionability: 'not-actionable', original: { purpose: 'owner_qa',
        boundExport: 'src/probes.mjs#satisfiesEnginesNode', recipeDigest: digest(recipe),
        permissionScope: 'MIT sample allowlist only', limitations: 'Installed JSON recipe; not arbitrary contributed code or hosted acceptance.' } } });
}
export const vf03Ref = v => toNativeRef(refOf(v));
export function semanticKey(v, artifact) {
  return digest({ capabilityId: v.capabilityId, source: v.source, artifact, dependencies: v.dependencies,
    input: v.input, output: v.output, outcomes: v.outcomes, environment: v.environment, rights: v.rights });
}
// Creation-runtime provenance is immutable history, not artifact identity or
// authority for a new run. Every other manifest field must match the recipe.
export function matchesInstalledManifest(manifest,artifact) {
  try {
    validateVersion(manifest);
    if(!sourcePinsMatch(installationPins))return false;
    const normalize=v=>{const c=structuredClone(v);delete c.contentId;c.provenance.refs[1]='creation-runtime:historical';return c;};
    return /^sha256:[a-f0-9]{64}$/.test(manifest.provenance.refs[1]) &&
      digest(normalize(manifest))===digest(normalize(capabilityFor(artifact,manifest.dependencies)));
  }catch{return false;}
}
export function evaluate({ assignment, artifact, manifest, dependencyVersions, verification }, observedAt) {
  need(assignment.mode === 'fixture' && digest(artifact) === assignment.artifactDigest, 'runner_binding');
  need(Number(process.versions.node.split('.')[0]) === ENV.nodeMajor && process.platform === ENV.platform
    && assignment.environmentDigest === environmentDigest && digest(assignment.evaluator) === digest(evaluator), 'runner_environment');
  if(verification)need(verification.runtimePin===runtimePin && verification.policy.environmentDigest===environmentDigest
    && digest(verification.policy.requiredChecks)===digest(requiredChecks)
    && verification.policy.scope===`project:${verification.projectId}`,'runner_verification_profile');
  const start = process.hrtime.bigint(); const cpu = process.cpuUsage();
  let recipe = false;
  try { validateRecipe(artifact); recipe = matchesInstalledManifest(manifest,artifact); } catch {}
  const cases = [
    [{ range: '>=22', nodeVersion: 'v22.0.0' }, 'compatible'],
    [{ range: '>=22.5', nodeVersion: '22.4.0' }, 'incompatible'],
    [{ range: '>=22 <24', nodeVersion: '22.6.0' }, 'unknown'],
    [{ range: '>=22.5', nodeVersion: '23.not-a-version' }, 'unknown'],
    [{ range: '>=22', nodeVersion: '23.0.0-beta' }, 'unknown'],
  ];
  const probe = recipe && cases.every(([input, expected]) => invokeRecipe(artifact, input).status === expected);
  // This installed recipe has no dependency invocation mapping. A declared
  // composition cannot pass merely because all components passed individually.
  const composition = manifest.dependencies.length === 0 && dependencyVersions.length === 0;
  const passed = [recipe, probe, composition];
  const usage = process.cpuUsage(cpu);
  return { schema: 'neomorphic.foundry.verification_receipt.v1', id: `receipt:${digest(assignment).slice(7)}`,
    assignmentId: assignment.id, candidateId: assignment.candidateId, capability: assignment.capability,
    sourceRevision: assignment.sourceRevision, artifactDigest: assignment.artifactDigest,
    dependencyDigest: assignment.dependencyDigest, evaluator, environmentDigest, observedAt,
    observed: { checks: requiredChecks.map((id, i) => ({ id, status: passed[i] ? 'pass' : 'fail',
      evidence: { ref: `artifact:${hash({ artifact, target: refOf(manifest) })}`, revision: evaluator.revision } })), limitations: [] },
    usage: { cpuMs: Math.ceil((usage.user + usage.system) / 1000), wallMs: Math.ceil(Number(process.hrtime.bigint() - start) / 1e6), cost: null } };
}
