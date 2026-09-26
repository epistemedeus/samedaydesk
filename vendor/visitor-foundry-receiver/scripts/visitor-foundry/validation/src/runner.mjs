import { performance } from 'node:perf_hooks';
import { runAcceptanceChecks } from '../../../../packs/exchange-townsquare/exchange/01/src/run-checks.mjs';
import { clone, digest, jsonBounded, requireThat as need, sameRef, schemaId } from './contracts.mjs';

const allowed = new Set(['json_path_exists', 'json_path_equals', 'json_path_type', 'string_max_length', 'array_min_length', 'enum_in', 'https_url_shape', 'sha256_hex']);
/** Installed recipe, not a sandbox. Host owns brief; contribution test proposals are never read here. */
export function createFixtureJsonRunner({ evaluator, environmentDigest, brief }) {
  const installed = jsonBounded(brief, 16384);
  need(Array.isArray(installed.objectiveChecks) && installed.objectiveChecks.length > 0 && installed.objectiveChecks.length <= 32, 'invalid_installed_recipe');
  need(installed.objectiveChecks.every(c => allowed.has(c.check?.kind)), 'unbounded_check_refused');
  return ({ assignment, artifact, receiptId, observedAt }) => {
    need(assignment.mode === 'fixture', 'fixture_runner_only');
    need(sameRef(evaluator, assignment.evaluator) && environmentDigest === assignment.environmentDigest, 'runner_installation_mismatch');
    const bounded = jsonBounded(artifact, 16384);
    need(digest(bounded) === assignment.artifactDigest, 'artifact_digest_mismatch');
    need(digest(installed.objectiveChecks.map(c => c.id).sort()) === digest([...assignment.requiredChecks].sort()), 'installed_check_coverage');
    const start = performance.now();
    const result = runAcceptanceChecks(installed, bounded, { clock: () => Date.parse(observedAt) });
    return {
      schema: schemaId('verification_receipt'), id: receiptId, assignmentId: assignment.id, candidateId: assignment.candidateId,
      capability: clone(assignment.capability), sourceRevision: assignment.sourceRevision, artifactDigest: assignment.artifactDigest,
      dependencyDigest: assignment.dependencyDigest, evaluator: clone(evaluator), environmentDigest, observedAt,
      observed: { checks: result.objective.results.map(r => ({ id: r.id, status: r.passed ? 'pass' : 'fail', evidence: { ref: `artifact:${assignment.artifactDigest}`, revision: evaluator.revision } })), limitations: result.subjective.results.map(r => r.detail) },
      usage: { cpuMs: null, wallMs: Math.ceil(performance.now() - start), cost: null },
    };
  };
}
/** Bounded, installed interpreter for the demo's JSON capability. Never eval/import submitted code. */
export function checkCard(rule, rawCard) {
  const card = jsonBounded(rawCard, 16384); const issues = [];
  need(rule.kind === 'capability-card-check' && Array.isArray(rule.requiredFields) && rule.requiredFields.length <= 16 && Number.isSafeInteger(rule.maxDescriptionLength) && rule.maxDescriptionLength > 0 && rule.maxDescriptionLength <= 4096, 'unsupported_card_rule');
  for (const field of rule.requiredFields) if (!Object.hasOwn(card, field)) issues.push(`missing:${field}`);
  if (typeof card.description === 'string' && card.description.length > rule.maxDescriptionLength) issues.push('description_too_long');
  return { issues, useful: issues.length === 0 };
}
