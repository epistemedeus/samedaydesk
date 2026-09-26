import { readFileSync } from 'node:fs';
import { createVersion, SCHEMAS } from '../../capabilities/src/contracts.mjs';
import { ABI, PROFILE, DEFAULT_LIMITS, createArtifact, bytesHash, hash, refOf } from '../src/contracts.mjs';
import { installation } from '../src/supervisor.mjs';
export const cases = JSON.parse(readFileSync(new URL('./heldouts.json', import.meta.url)));
export const evaluation = { id: 'evaluator:structured-result-owner-qa', revision: 'vf08.oracle.v1', suiteDigest: hash(cases) };
export const inputShape = { type: 'object', required: [], properties: {} };
export const outputShape = { type: 'object', required: ['outcome', 'payload'], properties: {
  payload: { type: 'object', required: [], properties: {} }, outcome: { type: 'string', enum: ['observed', 'unknown', 'error', 'unsupported'] } } };
export function packageModule(moduleBytes, { sourceRevision, limits = DEFAULT_LIMITS, input = { encoding: 'json', shape: inputShape },
  output = { encoding: 'json', shape: outputShape } } = {}) {
  const moduleDigest = bytesHash(moduleBytes);
  const capability = createVersion({ schema: SCHEMAS['capability-version'], capabilityId: 'source:correspondence-structured-result',
    version: `vf08.${moduleDigest.slice(7)}`, source: { repository: 'https://github.com/epistemedeus/neomorphic-io',
      revision: sourceRevision, path: 'scripts/visitor-foundry/execution/example/structured-result.c' },
    outcomes: ['compact-correspondence-structured-result'], input: input.shape ?? inputShape, output: output.shape ?? outputShape,
    dependencies: [], rights: { status: 'allowed', license: 'MIT', ref: 'source:vf08-owner-qa' },
    environment: { platform: ['linux'], arch: ['x64'], executionProfile: [PROFILE.id] },
    provenance: { refs: [moduleDigest, evaluation.suiteDigest], origin: 'operator:owner-qa-a', maintainer: 'operator:neomorphic',
      classification: 'demo', funding: 'voluntary', actionability: 'not-actionable', original: { purpose: 'owner_qa',
        relationship: 'owner', inputFormat: 'tools/correspondence-mcp/src/tools/write.mjs#toolText,toolError' } } });
  return createArtifact({ capability, module: { digest: moduleDigest, bytes: moduleBytes.length }, abi: ABI,
    input, output, profile: PROFILE, limits, evaluation });
}
export function bindingFor(artifact, overrides = {}) {
  const { runtimePin } = installation();
  return { assignmentId: 'assignment:owner-qa', candidateId: 'candidate:owner-qa', fence: 'fixture-fence-1',
    capability: refOf(artifact.capability), sourceDigest: hash(artifact.capability.source), artifactId: artifact.id,
    moduleDigest: artifact.module.digest, dependencyDigest: hash(artifact.capability.dependencies), evaluator: artifact.evaluation,
    environmentDigest: hash({ runtimePin, profile: PROFILE, evaluator: artifact.evaluation }), runtimePin, ...overrides };
}
