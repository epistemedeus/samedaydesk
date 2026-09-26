import { SCHEMAS, LIMITS, check, object, strings, id, iso, validateRequest, refOf, versionKey,
  checkShape, copy, freeze, hash, stableJSON, compare } from './contracts.mjs';
import { indexOf, projectionAt, pageItems } from './graph.mjs';

export function admissionPolicy(snapshot, policy = { policyRef: 'policy:no-admitted-evidence', admittedObservationIds: [] }) {
  object(policy, ['policyRef', 'admittedObservationIds'], 'admission policy'); id(policy.policyRef);
  strings(policy.admittedObservationIds, 'admittedObservationIds', { namespaced: true, max: LIMITS.observations });
  const index = indexOf(snapshot);
  check(policy.admittedObservationIds.every(x => index.omap.has(x)), 'policy references unknown observation');
  return { policyRef: policy.policyRef, admittedObservationIds: [...policy.admittedObservationIds].sort(compare) };
}
function outputIssues(actual, wanted, path = '$') {
  if (!(actual.type === wanted.type || (actual.type === 'integer' && wanted.type === 'number'))) return [`${path}:output_type`];
  const issues = [];
  if (wanted.enum && (!actual.enum || actual.enum.some(x => !wanted.enum.some(y => stableJSON(x) === stableJSON(y))))) issues.push(`${path}:output_enum_not_guaranteed`);
  if (wanted.type === 'object') for (const k of Object.keys(wanted.properties)) {
    if (issues.length >= 128) return [...issues.slice(0, 128), 'additional_output_diagnostics_omitted'];
    if (wanted.required.includes(k) && !actual.required.includes(k)) issues.push(`${path}.${k}:output_not_guaranteed`);
    if (actual.properties[k]) issues.push(...outputIssues(actual.properties[k], wanted.properties[k], `${path}.${k}`));
    else if (!wanted.required.includes(k)) issues.push(`${path}.${k}:optional_output_unconstrained`);
  }
  if (wanted.type === 'array') {
    if (wanted.maxItems !== undefined && (actual.maxItems === undefined || actual.maxItems > wanted.maxItems)) issues.push(`${path}:output_maxItems`);
    if (wanted.items) {
      if (!actual.items) issues.push(`${path}:output_items_unknown`);
      else issues.push(...outputIssues(actual.items, wanted.items, `${path}[]`));
    }
  }
  return issues;
}
function environmentIssues(version, env) {
  const incompatible = [], unknown = [];
  for (const [key, allowed] of Object.entries(version.environment)) {
    if (!Object.hasOwn(env, key)) unknown.push(`environment_unspecified:${key}`);
    else if (!allowed.includes(env[key])) incompatible.push(`environment_unsupported:${key}`);
  }
  return { incompatible, unknown };
}
function makeHealth(snapshot, request, projection, admittedIds) {
  const index = indexOf(snapshot), memo = new Map();
  let visits = 0;
  function retain(target, issues, prefix) {
    for (const issue of issues) {
      if (target.length >= 16) {
        if (target.at(-1) !== 'additional_dependency_reasons_omitted') target.push('additional_dependency_reasons_omitted');
        break;
      }
      const text = prefix + issue;
      target.push(text.length > 1024 ? `${text.slice(0, 1000)}[diagnostic-truncated]` : text);
    }
  }
  function health(v, path = new Set()) {
    if (++visits > 50000) return { incompatible: [], unknown: ['dependency_traversal_limit'] };
    const key = versionKey(v);
    if (path.has(key)) return { incompatible: [], unknown: ['dependency_cycle'] };
    if (path.size >= LIMITS.dependencyDepth) return { incompatible: [], unknown: ['dependency_depth_limit'] };
    // Depth/cycle results depend on the traversal path and are deliberately not cached.
    const memoKey = `${key}:${path.size}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    const nextPath = new Set([...path, key]);
    const result = environmentIssues(v, request.environment);
    result.dependencyRecheckAfter = null;
    result.changeAt = null;
    // Parent receipts attest the composition, not an inferred dependency invocation.
    // New adverse/withdrawn/expired dependency evidence requires a later composition replay.
    for (const observation of index.byVersion.get(key) || []) {
      if (!admittedIds.has(observation.id) || stableJSON(observation.scope.environment) !== stableJSON(request.environment)) continue;
      const changes = [];
      if (projection.active.has(observation.id) && observation.verdict === 'incompatible') changes.push(Date.parse(observation.observedAt));
      if (projection.active.has(observation.id) && observation.expiresAt !== null) changes.push(Date.parse(observation.expiresAt));
      const change = projection.current.get(`observation:${observation.id}`);
      if (change) changes.push(Date.parse(change.at));
      for (const at of changes) if (at <= projection.ms) result.changeAt = Math.max(result.changeAt ?? -Infinity, at);
    }
    const mutation = projection.current.get(`version:${key}`);
    if (mutation) result.incompatible.push(`${mutation.kind}:${mutation.id}`);
    if (v.rights.status === 'denied') result.incompatible.push('rights_denied');
    if (v.rights.status === 'unknown') result.unknown.push('rights_unknown');
    for (const dep of v.dependencies) {
      const child = index.vmap.get(versionKey(dep));
      if (!child) { retain(result.unknown, [versionKey(dep)], 'dependency_missing:'); continue; }
      const status = health(child, nextPath);
      if (status.changeAt !== null && status.changeAt !== undefined) {
        result.dependencyRecheckAfter = Math.max(result.dependencyRecheckAfter ?? -Infinity, status.changeAt);
        result.changeAt = Math.max(result.changeAt ?? -Infinity, status.changeAt);
      }
      retain(result.incompatible, status.incompatible, `dependency:${versionKey(dep)}:`);
      retain(result.unknown, status.unknown, `dependency:${versionKey(dep)}:`);
    }
    if (!result.unknown.some(x => /dependency_cycle|dependency_depth_limit|dependency_traversal_limit/.test(x))) memo.set(memoKey, result);
    return result;
  }
  return health;
}
export function resolve(snapshot, rawRequest, { now, policy } = {}) {
  const request = validateRequest(rawRequest); iso(now, 'resolver.now');
  const admitted = admissionPolicy(snapshot, policy), admittedIds = new Set(admitted.admittedObservationIds);
  const index = indexOf(snapshot), projection = projectionAt(snapshot, now), health = makeHealth(snapshot, request, projection, admittedIds);
  const inputDigest = hash(request.input), envJSON = stableJSON(request.environment);
  const candidates = snapshot.versions.filter(v => v.outcomes.includes(request.outcome)
    && (request.capabilityId === null || v.capabilityId === request.capabilityId)).map(v => {
    const base = health(v); const incompatible = [...base.incompatible], unknown = [...base.unknown];
    incompatible.push(...checkShape(v.input, request.input).map(x => `input:${x}`));
    if (request.output !== null) incompatible.push(...outputIssues(v.output, request.output));
    const evidence = (index.byVersion.get(versionKey(v)) || []).map(o => {
      let state;
      if (!projection.active.has(o.id)) {
        const mutation = projection.current.get(`observation:${o.id}`);
        state = mutation?.kind === 'retract-observation' ? 'retracted'
          : mutation?.kind === 'correct-observation' ? 'corrected' : 'inactive-correction-branch';
      }
      else if (Date.parse(o.observedAt) > projection.ms) state = 'future';
      else if (o.expiresAt !== null && Date.parse(o.expiresAt) <= projection.ms) state = 'expired';
      else if (o.scope.outcome !== request.outcome || stableJSON(o.scope.environment) !== envJSON
        || (o.scope.inputDigest !== null && o.scope.inputDigest !== inputDigest)) state = 'out-of-scope';
      else if (!admittedIds.has(o.id)) state = 'unadmitted';
      else if (o.verdict === 'compatible' && base.dependencyRecheckAfter !== null
        && Date.parse(o.observedAt) <= base.dependencyRecheckAfter) state = 'dependency-stale';
      else state = 'active';
      return { id: o.id, state, verdict: o.verdict, observerId: o.observerId, receiptRef: o.receiptRef };
    });
    const positive = evidence.some(e => e.state === 'active' && e.verdict === 'compatible');
    const negative = evidence.some(e => e.state === 'active' && e.verdict === 'incompatible');
    if (!positive && evidence.some(e => e.state === 'dependency-stale')) unknown.push('dependency_evidence_changed_replay_composition');
    if (positive && negative) unknown.push('conflicting_evidence');
    else if (negative) incompatible.push('scoped_negative_observation');
    else if (!positive) unknown.push('no_admitted_compatible_evidence');
    const status = incompatible.length ? 'known-incompatible' : unknown.length ? 'unknown' : 'compatible';
    return { target: refOf(v), status, reasons: [...new Set([...incompatible, ...unknown])].sort(compare), evidence,
      provenance: v.provenance, rights: v.rights, dependencies: v.dependencies };
  });
  const compatible = candidates.filter(c => c.status === 'compatible');
  const unknown = candidates.some(c => c.status === 'unknown');
  const covered = snapshot.coverage.complete && snapshot.coverage.outcomes.includes(request.outcome);
  const status = compatible.length ? 'compatible' : unknown ? 'unknown' : candidates.length ? 'known-incompatible' : covered ? 'missing' : 'unknown';
  const body = { schema: SCHEMAS['capability-resolution'], snapshotId: snapshot.snapshotId, requestId: hash(request), taskId: request.taskId,
    now, policyId: hash(admitted), policyRef: admitted.policyRef, status, selected: compatible[0]?.target ?? null,
    reasons: candidates.length ? [] : [covered ? 'no_candidate_in_complete_snapshot_scope' : 'catalog_coverage_unknown'],
    coverage: snapshot.coverage, candidates,
    boundaries: { registryAcceptance: 'not-decided', promotion: 'not-decided', invocation: false, usefulOutcome: 'unknown', payment: 'not-decided' } };
  return freeze({ ...body, resolutionId: hash(body) });
}
export function resolvePage(snapshot, request, { now, policy, cursor = null, limit = 25 } = {}) {
  const result = resolve(snapshot, request, { now, policy });
  const { candidates, ...summary } = result;
  const page = pageItems(candidates, { snapshotId: snapshot.snapshotId, query: { resolutionId: result.resolutionId }, cursor, limit, key: c => versionKey(c.target) });
  return freeze({ ...summary, schema: SCHEMAS['capability-page'], resolutionSchema: result.schema,
    candidates: page.items, nextCursor: page.nextCursor, candidateCount: page.total, complete: page.nextCursor === null });
}
export function createGap(snapshot, request, options, { gapId, reproducer, funding } = {}) {
  id(gapId, 'gapId'); object(reproducer, ['ref', 'permission'], 'reproducer'); id(reproducer.ref);
  check(['synthetic', 'authorized'].includes(reproducer.permission), 'reproducer permission must be explicit');
  object(funding, ['kind', 'ref'], 'funding');
  check(['voluntary', 'unfunded-request', 'funded'].includes(funding.kind), 'invalid gap funding kind');
  if (funding.ref !== null) id(funding.ref); check(funding.kind !== 'funded' || funding.ref !== null, 'funded gap requires authoritative reference');
  const resolution = resolve(snapshot, request, options);
  check(['missing', 'known-incompatible'].includes(resolution.status), 'unknown/hit is not a genuine gap', 'NOT_A_GAP');
  check(snapshot.coverage.complete && snapshot.coverage.outcomes.includes(request.outcome), 'a genuine gap requires complete snapshot scope', 'NOT_A_GAP');
  const body = { schema: SCHEMAS.gap, id: gapId, revision: 1, taskId: request.taskId, outcome: request.outcome,
    requestId: resolution.requestId, constraintsDigest: hash({ input: request.input, environment: request.environment, output: request.output }),
    resolver: { snapshotId: snapshot.snapshotId, resolutionId: resolution.resolutionId, policyId: resolution.policyId, now: resolution.now },
    reason: resolution.status, candidateFailures: resolution.candidates.map(c => ({ target: c.target, status: c.status, reasons: c.reasons })),
    reproducer: copy(reproducer), funding: copy(funding) };
  return freeze({ ...body, contentId: hash(body) });
}
