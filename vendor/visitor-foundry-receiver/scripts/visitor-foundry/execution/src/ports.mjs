import { readFileSync } from 'node:fs';
import { runAcceptanceChecks } from '../../../../packs/exchange-townsquare/exchange/01/src/run-checks.mjs';
import { check, copy, freeze, hash, bytesHash, refOf, sameRef, SCHEMA, validateArtifact } from './contracts.mjs';
import { Receipt, validate } from '../../validation/src/contracts.mjs';
import { stableJSON } from '../../capabilities/src/contracts.mjs';
import { installation, invoke } from './supervisor.mjs';

const oraclePin = bytesHash(readFileSync(new URL('../../../../packs/exchange-townsquare/exchange/01/src/run-checks.mjs', import.meta.url)));
const portsPin = bytesHash(readFileSync(new URL('./ports.mjs', import.meta.url)));
export function installedPolicy({ evaluator, cases, environment }) {
  cases = copy(cases); evaluator = copy(evaluator); environment = copy(environment);
  check(cases.length > 0 && cases.length <= 16 && new Set(cases.map(c => c.id)).size === cases.length, 'test suite bounds');
  check(cases.every(c => typeof c.id === 'string' && c.id.startsWith('case:') && Object.hasOwn(c, 'input') && Object.hasOwn(c, 'expected')), 'test suite shape');
  check(evaluator.suiteDigest === hash(cases), 'installed suite digest');
  const { runtimePin } = installation();
  return freeze({ evaluator, cases, environment, runtimePin, oraclePin, portsPin,
    environmentDigest: hash({ evaluator, environment, runtimePin, oraclePin, portsPin }) });
}
const legacyRef = ref => ({id:ref.capabilityId,revision:ref.contentId});
function bindingFor(artifact, assignment, fence, policy, referenceAdapter) {
  check(assignment.artifactDigest === artifact.id && assignment.sourceRevision === hash(artifact.capability.source), 'assigned candidate mismatch');
  // Explicit VF04A/VF03 receiving projection; full VF01 coordinate is retained below.
  check(hash(assignment.capability) === hash(referenceAdapter(refOf(artifact.capability))), 'assigned capability mismatch');
  check(assignment.dependencyDigest === hash(artifact.capability.dependencies), 'assigned dependency mismatch');
  check(hash(assignment.evaluator) === hash({ id: policy.evaluator.id, revision: policy.evaluator.revision })
    && assignment.environmentDigest === policy.environmentDigest && hash(artifact.evaluation) === hash(policy.evaluator), 'assigned installation mismatch');
  return { assignmentId: assignment.id, candidateId: assignment.candidateId, fence,
    capability: refOf(artifact.capability), sourceDigest: assignment.sourceRevision, artifactId: artifact.id,
    moduleDigest: artifact.module.digest, dependencyDigest: assignment.dependencyDigest,
    evaluator: artifact.evaluation, environmentDigest: policy.environmentDigest, runtimePin: policy.runtimePin };
}
export function compareExpected(output, expected) {
  // Reuse the existing objective evaluator; expected bytes come from installed policy only.
  const brief = { objectiveChecks: [{ id: 'check:exact-output', check: { kind: 'json_path_equals', path: '$', equals: JSON.parse(stableJSON(expected)) } }] };
  return runAcceptanceChecks(brief, JSON.parse(stableJSON(output)), { clock: () => 0 }).objective.results[0].passed;

}
/** Pure projection, NOT receipt authentication. Call only with supervisor-owned results. */
export function verificationResult({ artifact, binding, samples, policy }) {
  check(samples.length === policy.cases.length, 'sample coverage');
  const checks = samples.map((s, i) => {
    const expected = policy.cases[i]; const o = s.observation;
    const complete = o?.status === 'ok' && o.termination.exited === true && o.termination.code === 0
      && o.termination.signal === null && hash(o.binding) === hash(binding)
      && o.inputDigest === bytesHash(Buffer.from(JSON.stringify(expected.input)))
      && o.runtimePin === policy.runtimePin;
    return { id: expected.id, inputDigest: hash(expected.input), executionInputDigest: o?.inputDigest ?? null,
      status: complete ? compareExpected(s.output, expected.expected) ? 'pass' : 'fail' : 'incomplete',
      observationId: o?.id ?? null };
  });
  const result = { schema: `${SCHEMA}.verification.v1`, artifactId: artifact.id, binding,
    evaluator: policy.evaluator, environment: policy.environment, oraclePin: policy.oraclePin,
    checks, observations: samples.map(s => s.observation),
    outcome: checks.every(c => c.status === 'pass') ? 'sample_checks_passed' : 'not_verified',
    applicability: { kind: 'exact-inputs-only', inputDigests: checks.map(c => c.inputDigest) },
    authority: 'receiver-admission-required', purpose: 'owner_qa', relationship: 'owner',
    limitations: ['Finite installed tests do not establish whole-domain compatibility.', 'No promotion, independent organization or useful external task is established.'] };
  return { ...result, id: hash(result) };
}
/** Opt-in private seam. Loaders MUST reread VF04A durable authority. No registry/store here. */
export function createReceivingPorts({ enabled = false, policy, loadVerification, loadInvocation, referenceAdapter=legacyRef }) {
  const installed = policy && freeze(copy(policy));
  function ready() {
    check(enabled === true, 'portable_execution_disabled');
    check(installed && installation().runtimePin === installed.runtimePin, 'installed runtime changed');
  }
  return {
    async verify({ projectId, assignmentId, fence, signal, onSpawn, onCaseStart, onObservation }) {
      ready(); check(typeof loadVerification === 'function', 'verification authority unavailable');
      const attempt = await loadVerification({ projectId, assignmentId });
      check(attempt && attempt.fence === fence && attempt.assignment.id === assignmentId, 'stale assignment fence');
      const artifact = copy(attempt.artifact), assignment = copy(attempt.assignment), moduleBytes = Buffer.from(attempt.moduleBytes);
      validateArtifact(artifact, moduleBytes);
      check(artifact.input.encoding === 'json' && artifact.output.encoding === 'json', 'installed verifier requires JSON; bytes invocation is separate');
      const binding = bindingFor(artifact, assignment, fence, installed, referenceAdapter);
      check(hash([...assignment.requiredChecks].sort()) === hash(installed.cases.map(c => c.id).sort()), 'assigned test coverage');
      const count = installed.cases.length;
      check(assignment.reservation.cpuMs >= artifact.limits.cpuSeconds*1000*count
        && assignment.reservation.memoryMb*1048576 >= artifact.limits.addressSpaceBytes
        && assignment.reservation.wallMs >= artifact.limits.wallMs*count, 'assignment resource reservation too small');
      const remaining = Date.parse(assignment.deadline)-Date.now(); check(Number.isFinite(remaining) && remaining > 0, 'assignment expired');
      const controller = new AbortController();
      const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
      const timer = setTimeout(abort, Math.min(remaining, assignment.reservation.wallMs));
      const samples = [];
      try {
        for (const c of installed.cases) {
          if (controller.signal.aborted) { samples.push({ output: null, observation: null }); continue; }
          const current = await loadVerification({ projectId, assignmentId });
          check(current?.fence === fence && hash(current.assignment) === hash(assignment) && current.artifact.id === artifact.id, 'assignment changed');
          await onCaseStart?.({caseId:c.id,fence,binding});
          const sample = await invoke({ artifact, moduleBytes, binding, input: c.input, signal: controller.signal,
            onSpawn: identity => onSpawn?.({ caseId: c.id, identity, fence, binding }) });
          await onObservation?.({caseId:c.id,fence,binding,sample});
          samples.push(sample);
          // Unknown physical outcomes forbid another child even within this assignment.
          if (sample.observation.status === 'unknown') controller.abort();
        }
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      return verificationResult({ artifact, binding, samples, policy: installed });
    },
    async invoke({ projectId, manifestId, request, signal, onSpawn }) {
      ready(); check(typeof loadInvocation === 'function', 'invocation authority unavailable');
      // Receiver rechecks grants, current source cell, evidence expiry/invalidation, exact
      // request and runtime before returning this immutable permit. It persists completion.
      request = copy(request);
      const permit = await loadInvocation({ projectId, manifestId, request });
      check(permit?.manifest.id === manifestId && permit.manifest.requestId === hash(request)
        && sameRef(permit.manifest.target, refOf(permit.artifact.capability)), 'immutable manifest mismatch');
      check(permit.binding.runtimePin === installed.runtimePin && permit.binding.environmentDigest === installed.environmentDigest, 'invocation installation mismatch');
      return invoke({ artifact: permit.artifact, moduleBytes: permit.moduleBytes, binding: permit.binding,
        input: request.input, signal, onSpawn });
    },
  };
}
/** Explicit legacy wire projection for reviewed VF04A receiving code only.
 * Admission still runs through VF03 with the actual assigned runner handle.
 * Binding/fence/observations stay in the separate immutable verification record. */
export function toVF03Receipt(result, { assignment, fence, observedAt, referenceAdapter=legacyRef }) {
  const { id: resultId, ...body } = result; check(hash(body) === resultId, 'verification digest mismatch');
  check(result.schema === `${SCHEMA}.verification.v1` && result.binding.assignmentId === assignment.id
    && result.binding.candidateId === assignment.candidateId && result.binding.fence === fence
    && result.binding.artifactId === assignment.artifactDigest && result.binding.sourceDigest === assignment.sourceRevision
    && hash(referenceAdapter(result.binding.capability)) === hash(assignment.capability)
    && result.binding.dependencyDigest === assignment.dependencyDigest && result.binding.environmentDigest === assignment.environmentDigest
    && hash({id: result.evaluator.id, revision: result.evaluator.revision}) === hash(assignment.evaluator), 'receipt binding mismatch');
  check(result.observations.every(o => o && o.status !== 'unknown' && (o.termination.exited || o.termination.noLaunch)), 'termination unknown');
  check(hash(result.checks.map(c => c.id).sort()) === hash([...assignment.requiredChecks].sort()), 'receipt coverage mismatch');
  const sum = field => result.observations.every(o => Number.isFinite(o.usage[field])) ? Math.ceil(result.observations.reduce((n,o) => n+o.usage[field],0)) : null;
  const receipt = { schema: 'neomorphic.foundry.verification_receipt.v1', id: `receipt:${result.id.slice(7)}`,
    assignmentId: assignment.id, candidateId: assignment.candidateId, capability: copy(assignment.capability),
    sourceRevision: assignment.sourceRevision, artifactDigest: assignment.artifactDigest, dependencyDigest: assignment.dependencyDigest,
    evaluator: copy(assignment.evaluator), environmentDigest: assignment.environmentDigest, observedAt,
    observed: { checks: result.checks.map(c => ({ id: c.id, status: c.status, evidence: { ref: result.id, revision: result.evaluator.revision } })),
      limitations: [...result.limitations, 'Exact-input observations only; retain the VF08 record and fence.'] },
    usage: { cpuMs: sum('cpuMs'), wallMs: sum('wallMs'), cost: null } };
  try { validate(Receipt, receipt); } catch { throw new Error('legacy_receipt_domain_unsupported: receive the full VF08 record losslessly'); }
  return receipt;
}
