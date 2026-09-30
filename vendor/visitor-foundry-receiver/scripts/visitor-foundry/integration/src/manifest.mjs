import { resolve, refOf, versionKey, hash, createSnapshot } from '../../capabilities/src/index.mjs';
import { requireThat as need, digest } from '../../validation/src/index.mjs';
import { environmentDigest } from './recipe.mjs';

/** Preserve exact transitive evidence rather than inferring compatible edges.
 * VF01 parent observations are composition evidence, not child sample evidence. */
export function resolutionManifest(snapshot, request, options) {
  const resolution = resolve(snapshot, request, options);
  const selected = options.target
    ? resolution.candidates.find(c => c.status === 'compatible' && digest(c.target) === digest(options.target))?.target
    : resolution.selected;
  if (!selected) return { resolution, manifest: null };
  const versions = new Map(snapshot.versions.map(v => [versionKey(v), v]));
  const visited = new Map(); const edges = [];
  const walk = (ref, depth = 0) => {
    need(depth < 64, 'dependency_depth');
    const key = versionKey(ref); if (visited.has(key)) return;
    const v = versions.get(key); need(v && v.contentId === ref.contentId, 'dependency_missing');
    visited.set(key, v);
    for (const child of v.dependencies) { edges.push({ parent: refOf(v), child }); walk(child, depth + 1); }
  };
  walk(selected);
  const observations = snapshot.observations.filter(o => visited.has(versionKey(o.target))
    && options.policy.admittedObservationIds.includes(o.id)
    && digest(o.scope.environment) === digest(request.environment)
    && (digest(o.target) !== digest(selected) || o.scope.outcome === request.outcome
      && (o.scope.inputDigest === null || o.scope.inputDigest === hash(request.input))));
  const mutations = snapshot.mutations.filter(m => typeof m.target === 'string'
    ? observations.some(o => o.id === m.target) : visited.has(versionKey(m.target)));
  const root = resolution.candidates.find(c => digest(c.target) === digest(selected));
  const active = root.evidence.filter(e => e.state === 'active' && e.verdict === 'compatible').map(e => e.id);
  const expiries = observations.filter(o => o.expiresAt && Date.parse(o.expiresAt) > Date.parse(options.now)).map(o => o.expiresAt);
  const body = { schema: 'neomorphic.foundry.resolution-manifest.v1', target: selected,
    request: { ...request, input: null }, requestId: hash(request),
    applicability: { outcome: request.outcome, environment: request.environment, inputDigest: hash(request.input) },
    evaluatorPolicy: options.policy.policyRef, snapshotId: snapshot.snapshotId, resolutionId: resolution.resolutionId,
    createdAt: options.now, validUntil: expiries.sort()[0] ?? null,
    versions: [...visited.values()], edges: edges.map(e => ({ ...e,
      compositionEvidence: observations.filter(o => digest(o.target) === digest(e.parent) && options.policy.admittedObservationIds.includes(o.id)).map(o => o.id) })),
    observations, mutations, rootEvidence: active,
    admittedObservationIds: options.policy.admittedObservationIds.filter(id => observations.some(o => o.id === id)) };
  return { resolution, manifest: { ...body, id: hash(body) } };
}
export function recheckManifest(manifest, snapshot, now, policy, request) {
  need(hash(request) === manifest.requestId, 'manifest_request_mismatch');
  need(!manifest.validUntil || Date.parse(now) < Date.parse(manifest.validUntil), 'manifest_expired');
  const latest = resolutionManifest(snapshot, request, { now, policy, target: manifest.target });
  need(latest.manifest && digest(latest.manifest.target) === digest(manifest.target), 'resolution_invalidated');
  // An unrelated graph append does not poison this branch. Changed evidence,
  // dependency pins, policy, admission, or edge mapping requires fresh resolution.
  const affected = m => ({ versions: m.versions, edges: m.edges, observations: m.observations,
    mutations: m.mutations, admittedObservationIds: m.admittedObservationIds, evaluatorPolicy: m.evaluatorPolicy });
  need(digest(affected(manifest)) === digest(affected(latest.manifest)), 'evidence_changed');
  return latest.resolution;
}
export function graphFromRows(rows, now, installed) {
  const records = kind => rows.filter(r => r.kind === kind).map(r => r.record);
  const snapshot = createSnapshot({ versions: records('version'), observations: records('observation'), mutations: records('mutation'),
    coverage: { outcomes: installed?.outcomes??['node-engine-compatibility'], complete: true,
      sourceRefs: ['source:installed-preflight-pool'], asOf: '2026-09-26T00:00:00.000Z' } });
  return { snapshot, options: { now, policy: { policyRef: installed?.policyRef??`policy:vf04-installed-preflight:${environmentDigest}`, admittedObservationIds: snapshot.observations.map(o => o.id) } } };
}
