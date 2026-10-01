import { SCHEMAS, LIMITS, check, object, strings, iso, id, ref, refOf, versionKey, sameRef,
  validateVersion, validateObservation, validateMutation, copy, freeze, hash, stableJSON, compare } from './contracts.mjs';

const indexes = new WeakMap();
export const mutationTargetKey = m => typeof m.target === 'string' ? `observation:${m.target}` : `version:${versionKey(m.target)}`;
function dedup(records, key, validate, limit, label) {
  check(Array.isArray(records) && records.length <= limit, `${label} record limit exceeded`, 'LIMIT_EXCEEDED');
  const found = new Map();
  for (const raw of records) {
    validate(raw); const k = key(raw), prior = found.get(k);
    check(!prior || stableJSON(prior) === stableJSON(raw), `${label} identity reused with different bytes: ${k}`, 'IDENTITY_CONFLICT');
    if (!prior) found.set(k, raw);
  }
  return [...found.values()].sort((a, b) => compare(key(a), key(b)));
}
export function createSnapshot(input) {
  const data = copy(input); object(data, ['versions', 'observations', 'mutations', 'coverage'], 'snapshot input');
  const versions = dedup(data.versions, versionKey, validateVersion, LIMITS.versions, 'version');
  const observations = dedup(data.observations, x => x.id, validateObservation, LIMITS.observations, 'observation');
  const mutations = dedup(data.mutations, x => x.id, validateMutation, LIMITS.mutations, 'mutation');
  const coverage = data.coverage;
  object(coverage, ['outcomes', 'complete', 'sourceRefs', 'asOf'], 'coverage');
  strings(coverage.outcomes, 'coverage.outcomes'); strings(coverage.sourceRefs, 'coverage.sourceRefs', { nonempty: true, namespaced: true });
  check(typeof coverage.complete === 'boolean', 'coverage.complete must be boolean'); iso(coverage.asOf);
  coverage.outcomes.sort(compare); coverage.sourceRefs.sort(compare);
  const vmap = new Map(versions.map(v => [versionKey(v), v]));
  const omap = new Map(observations.map(o => [o.id, o]));
  const mmap = new Map(mutations.map(m => [m.id, m]));
  const requireTarget = target => {
    const v = vmap.get(versionKey(target)); check(v && sameRef(refOf(v), target), 'target missing or content identity changed', 'TARGET_MISMATCH'); return v;
  };
  for (const v of versions) for (const d of v.dependencies) {
    const known = vmap.get(versionKey(d));
    check(!known || known.contentId === d.contentId, 'dependency content identity mismatch', 'TARGET_MISMATCH');
  }
  for (const o of observations) {
    const v = requireTarget(o.target);
    check(v.outcomes.includes(o.scope.outcome), 'observation outcome is not declared by target');
    check(Object.keys(v.environment).every(k => Object.hasOwn(o.scope.environment, k)), 'observation must bind every required environment dimension');
  }
  const streams = new Map();
  const replacementOwners = new Map();
  for (const m of mutations) {
    if (typeof m.target === 'string') {
      check(omap.has(m.target), 'mutation observation target missing', 'TARGET_MISMATCH');
      check(Date.parse(m.at) >= Date.parse(omap.get(m.target).observedAt), 'mutation predates observation');
    } else requireTarget(m.target);
    const key = mutationTargetKey(m); if (!streams.has(key)) streams.set(key, []); streams.get(key).push(m);
    if (m.kind === 'correct-observation') {
      const replacement = omap.get(m.replacementId), target = omap.get(m.target);
      check(replacement && replacement.id !== target.id && sameRef(replacement.target, target.target)
        && stableJSON(replacement.scope) === stableJSON(target.scope), 'correction must preserve exact version and scope', 'TARGET_MISMATCH');
      check(replacement.observedAt === m.at, 'replacement observation must be recorded at correction time');
      check(!replacementOwners.has(m.replacementId), 'replacement reused by multiple corrections');
      replacementOwners.set(m.replacementId, m);
    }
  }
  for (const stream of streams.values()) {
    stream.sort((a, b) => a.revision - b.revision);
    stream.forEach((m, i) => {
      check(m.revision === i + 1 && m.previousId === (i ? stream[i - 1].id : null), 'mutation revision conflict or missing predecessor', 'REVISION_CONFLICT');
      if (i) {
        check(Date.parse(m.at) >= Date.parse(stream[i - 1].at), 'mutation time went backwards');
        check(stream[i - 1].kind !== 'revoke-version', 'revocation is terminal; publish a new version');
      }
    });
  }
  for (const o of observations) {
    const seen = new Set(); let current = o.id;
    while (replacementOwners.has(current)) {
      check(seen.size < 64, 'correction chain exceeds 64', 'LIMIT_EXCEEDED');
      check(!seen.has(current), 'correction cycle', 'CORRECTION_CYCLE'); seen.add(current);
      current = replacementOwners.get(current).target;
    }
  }
  const body = { schema: SCHEMAS['capability-snapshot'], versions, observations, mutations, coverage };
  const snapshot = freeze({ ...body, snapshotId: hash(body) });
  const reverse = new Map();
  for (const v of versions) for (const d of v.dependencies) {
    const k = versionKey(d); if (!reverse.has(k)) reverse.set(k, []); reverse.get(k).push(refOf(v));
  }
  const byVersion = new Map();
  for (const o of observations) { const key = versionKey(o.target); if (!byVersion.has(key)) byVersion.set(key, []); byVersion.get(key).push(o); }
  indexes.set(snapshot, { vmap, omap, mmap, streams, replacementOwners, reverse, byVersion });
  return snapshot;
}
export function readSnapshot(raw) {
  object(raw, ['schema', 'versions', 'observations', 'mutations', 'coverage', 'snapshotId'], 'snapshot');
  check(raw.schema === SCHEMAS['capability-snapshot'], 'wrong snapshot schema');
  const result = createSnapshot({ versions: raw.versions, observations: raw.observations, mutations: raw.mutations, coverage: raw.coverage });
  check(result.snapshotId === raw.snapshotId, 'snapshot digest mismatch', 'CONTENT_MISMATCH'); return result;
}
export function indexOf(snapshot) {
  check(indexes.has(snapshot), 'use createSnapshot/readSnapshot before querying'); return indexes.get(snapshot);
}
export function appendSnapshot(snapshot, { versions = [], observations = [], mutations = [], expectedSnapshotId } = {}) {
  indexOf(snapshot);
  check(expectedSnapshotId === snapshot.snapshotId, 'snapshot revision conflict', 'REVISION_CONFLICT');
  return createSnapshot({ versions: [...snapshot.versions, ...versions], observations: [...snapshot.observations, ...observations],
    mutations: [...snapshot.mutations, ...mutations], coverage: snapshot.coverage });
}
export function projectionAt(snapshot, now) {
  iso(now); const ms = Date.parse(now), index = indexOf(snapshot);
  const current = new Map();
  for (const [key, stream] of index.streams) {
    const effective = stream.filter(m => Date.parse(m.at) <= ms); if (effective.length) current.set(key, effective.at(-1));
  }
  const active = new Set();
  for (const o of snapshot.observations) {
    if (index.replacementOwners.has(o.id)) continue;
    let candidate = o;
    while (candidate) {
      const mutation = current.get(`observation:${candidate.id}`);
      if (!mutation) { active.add(candidate.id); break; }
      candidate = mutation.kind === 'correct-observation' ? index.omap.get(mutation.replacementId) : null;
    }
  }
  return { current, active, ms };
}
export function dependencyImpact(snapshot, target) {
  const index = indexOf(snapshot); ref(target);
  const known = index.vmap.get(versionKey(target));
  check(known && sameRef(refOf(known), target), 'impact target missing', 'TARGET_MISMATCH');
  const visited = new Set([versionKey(target)]), queue = [target], impacted = [];
  for (let i = 0; i < queue.length; i++) for (const parent of index.reverse.get(versionKey(queue[i])) || []) {
    if (visited.has(versionKey(parent))) continue;
    visited.add(versionKey(parent)); queue.push(parent); impacted.push(parent);
  }
  impacted.sort((a, b) => compare(versionKey(a), versionKey(b)));
  return freeze({ schema: SCHEMAS['capability-impact'], snapshotId: snapshot.snapshotId, target: copy(target), impacted,
    unaffectedCount: snapshot.versions.length - impacted.length - 1 });
}
export function verificationTarget(snapshot, target) {
  const index = indexOf(snapshot); ref(target);
  const v = index.vmap.get(versionKey(target));
  check(v && sameRef(refOf(v), target), 'verification target missing or drifted', 'TARGET_MISMATCH');
  return freeze({ schema: SCHEMAS['verification-target'], snapshotId: snapshot.snapshotId, target: copy(target),
    source: v.source, input: v.input, output: v.output, outcomes: v.outcomes, dependencies: v.dependencies,
    environment: v.environment, rights: v.rights, provenanceRefs: v.provenance.refs,
    admissionRequired: true, proposedTestsExecutable: false });
}
export function pageItems(items, { snapshotId, query, cursor = null, limit = 25, key = x => x.id }) {
  check(Number.isInteger(limit) && limit >= 1 && limit <= LIMITS.pageSize, `limit must be 1..${LIMITS.pageSize}`);
  const queryId = hash(query); let start = 0;
  if (cursor !== null) {
    check(typeof cursor === 'string' && cursor.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(cursor), 'malformed cursor', 'INVALID_CURSOR');
    let c; try { c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { check(false, 'malformed cursor JSON', 'INVALID_CURSOR'); }
    object(c, ['snapshotId', 'queryId', 'after'], 'cursor');
    check(c.snapshotId === snapshotId && c.queryId === queryId, 'cursor snapshot/query changed', 'STALE_CURSOR');
    const pos = items.findIndex(x => key(x) === c.after); check(pos >= 0, 'cursor anchor missing', 'INVALID_CURSOR'); start = pos + 1;
  }
  const page = items.slice(start, start + limit), more = start + page.length < items.length;
  const nextCursor = more ? Buffer.from(stableJSON({ snapshotId, queryId, after: key(page.at(-1)) })).toString('base64url') : null;
  return { items: page, nextCursor, total: items.length };
}
export function listVersions(snapshot, { outcome = null, capabilityId = null, cursor = null, limit = 25 } = {}) {
  indexOf(snapshot); if (capabilityId !== null) id(capabilityId);
  check(outcome === null || typeof outcome === 'string', 'outcome must be string or null');
  const items = snapshot.versions.filter(v => (outcome === null || v.outcomes.includes(outcome)) && (capabilityId === null || v.capabilityId === capabilityId));
  return freeze({ schema: SCHEMAS['capability-page'], snapshotId: snapshot.snapshotId,
    ...pageItems(items, { snapshotId: snapshot.snapshotId, query: { outcome, capabilityId }, cursor, limit, key: versionKey }) });
}
