import { createHash } from 'node:crypto';

export const SCHEMAS = Object.freeze(Object.fromEntries([
  'capability-version', 'compatibility-observation', 'capability-mutation',
  'capability-snapshot', 'capability-request', 'capability-resolution',
  'capability-page', 'gap', 'reuse-observation', 'capability-impact', 'verification-target',
].map(name => [name, `neomorphic.foundry.${name}.v1`])));
export const LIMITS = Object.freeze({ versions: 5000, observations: 20000, mutations: 20000,
  pageSize: 100, bytes: 16 * 1024 * 1024, depth: 32, nodes: 500000, dependencyDepth: 64 });
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function fail(code, message) { throw Object.assign(new Error(message), { code }); }
export function check(ok, message, code = 'INVALID_INPUT') { if (!ok) fail(code, message); }
export const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export function object(v, keys, label) {
  check(plain(v), `${label} must be a plain object`);
  check(Object.keys(v).every(k => keys.includes(k)), `${label} has unknown fields`);
  check(keys.every(k => Object.hasOwn(v, k)), `${label} has missing fields`);
}
export function str(v, label, max = 2048) {
  check(typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim()
    && !/[\u0000-\u001f\u007f]/.test(v), `${label} must be a bounded nonempty string`);
}
export function id(v, label = 'id') {
  str(v, label, 512); check(/^[a-zA-Z][a-zA-Z0-9._-]*:[^\s]+$/.test(v), `${label} must be namespaced`);
}
export function iso(v, label = 'timestamp') {
  check(typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)
    && Number.isFinite(Date.parse(v)), `${label} must be UTC RFC3339`);
  check(new Date(v).toISOString() === v.replace(/Z$/, v.includes('.') ? 'Z' : '.000Z'), `${label} is not a real UTC date`);
}
export function array(v, label, max = 1000) { check(Array.isArray(v) && v.length <= max, `${label} must be a bounded array`); }
export function strings(v, label, { nonempty = false, namespaced = false, max = 1000 } = {}) {
  array(v, label, max); check(!nonempty || v.length > 0, `${label} cannot be empty`);
  v.forEach(x => namespaced ? id(x, label) : str(x, label));
  check(new Set(v).size === v.length, `${label} contains duplicates`);
}
export function digest(v, label = 'digest') { check(/^sha256:[a-f0-9]{64}$/.test(v), `${label} must be sha256`); }
export function choice(v, options, label) { check(options.includes(v), `${label} must be ${options.join('|')}`); }
export function safeData(value) {
  let nodes = 0;
  const seen = new Set();
  function visit(v, depth) {
    check(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'JSON complexity limit exceeded', 'LIMIT_EXCEEDED');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'string') { check(v.length <= 200000, 'JSON string too long', 'LIMIT_EXCEEDED'); return; }
    if (typeof v === 'number') { check(Number.isFinite(v), 'JSON number must be finite'); return; }
    check(plain(v) || Array.isArray(v), 'only JSON data is accepted');
    check(!seen.has(v), 'cyclic JSON data'); seen.add(v);
    check(Object.getOwnPropertySymbols(v).length === 0, 'symbol keys are not JSON');
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && k === 'length') continue;
      check(!['__proto__', 'prototype', 'constructor'].includes(k), 'unsafe JSON key');
      check(Object.hasOwn(d, 'value') && d.enumerable, 'accessors and hidden fields are not JSON');
      visit(d.value, depth + 1);
    }
    if (Array.isArray(v)) check(Object.keys(v).length === v.length
      && Object.keys(v).every((k, i) => k === String(i)), 'sparse or decorated array');
    seen.delete(v);
  }
  visit(value, 0);
  check(Buffer.byteLength(JSON.stringify(value)) <= LIMITS.bytes, 'JSON byte limit exceeded', 'LIMIT_EXCEEDED');
  return value;
}
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (plain(v)) return `{${Object.keys(v).sort(compare).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export function stableJSON(v) { safeData(v); return canonical(v); }
export function hash(v) { return `sha256:${createHash('sha256').update(stableJSON(v)).digest('hex')}`; }
export function freeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
export function copy(v) { safeData(v); return structuredClone(v); }
export function ref(v, label = 'versionRef') {
  object(v, ['capabilityId', 'version', 'contentId'], label);
  id(v.capabilityId, `${label}.capabilityId`); str(v.version, `${label}.version`, 512); digest(v.contentId);
}
export const versionKey = v => stableJSON([v.capabilityId, v.version]);
export const refOf = v => ({ capabilityId: v.capabilityId, version: v.version, contentId: v.contentId });
export const sameRef = (a, b) => stableJSON(a) === stableJSON(b);
export function environment(v, label = 'environment') {
  check(plain(v) && Object.keys(v).length <= 32, `${label} must be a bounded object`);
  for (const [k, val] of Object.entries(v)) {
    str(k, `${label} key`, 100);
    check(typeof val === 'boolean' || typeof val === 'string' || (typeof val === 'number' && Number.isFinite(val)), `${label}.${k} must be scalar`);
    if (typeof val === 'string') str(val, `${label}.${k}`, 200);
  }
}
const TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
export function validateShape(v, label = 'shape', depth = 0) {
  check(depth <= 8, 'type nesting exceeds 8');
  check(plain(v), `${label} must be an object`);
  check(Object.keys(v).every(k => ['type', 'required', 'properties', 'enum', 'items', 'maxItems'].includes(k)), `${label} has unsupported type constraints`);
  choice(v.type, TYPES, `${label}.type`);
  if (v.enum !== undefined) { array(v.enum, `${label}.enum`, 100); check(v.enum.length > 0, 'enum empty');
    for (const x of v.enum) check(typeMatches(x, v.type), 'enum value has wrong type'); }
  if (v.type === 'object') {
    strings(v.required, `${label}.required`); check(plain(v.properties), `${label}.properties required`);
    check(Object.keys(v.properties).length <= 100, 'too many properties');
    check(v.required.every(k => Object.hasOwn(v.properties, k)), 'required property must declare a type');
    for (const [k, shape] of Object.entries(v.properties)) { str(k, 'property name', 100); validateShape(shape, `${label}.${k}`, depth + 1); }
  } else check(v.required === undefined && v.properties === undefined, 'properties/required require object');
  if (v.type === 'array') {
    if (v.items !== undefined) validateShape(v.items, `${label}.items`, depth + 1);
    if (v.maxItems !== undefined) check(Number.isSafeInteger(v.maxItems) && v.maxItems >= 0, 'maxItems must be a nonnegative integer');
  } else check(v.items === undefined && v.maxItems === undefined, 'items/maxItems require array');
}
function typeMatches(v, type) {
  if (type === 'null') return v === null;
  if (type === 'array') return Array.isArray(v);
  if (type === 'object') return plain(v);
  if (type === 'integer') return Number.isSafeInteger(v);
  return typeof v === type && (type !== 'number' || Number.isFinite(v));
}
export function checkShape(shape, value, path = '$') {
  const issues = [];
  function visit(spec, item, location) {
    if (issues.length >= 128) return;
    if (!typeMatches(item, spec.type)) { issues.push(`${location}:expected_${spec.type}`); return; }
    if (spec.enum && !spec.enum.some(x => stableJSON(x) === stableJSON(item))) issues.push(`${location}:enum`);
    if (spec.type === 'object') {
      for (const k of spec.required) {
        if (issues.length >= 128) return;
        if (!Object.hasOwn(item, k)) issues.push(`${location}.${k}:required`);
      }
      for (const [k, child] of Object.entries(spec.properties)) if (Object.hasOwn(item, k)) visit(child, item[k], `${location}.${k}`);
    }
    if (spec.type === 'array') {
      if (spec.maxItems !== undefined && item.length > spec.maxItems) issues.push(`${location}:maxItems`);
      if (spec.items) for (let i = 0; i < item.length && issues.length < 128; i++) visit(spec.items, item[i], `${location}[${i}]`);
    }
  }
  visit(shape, value, path);
  if (issues.length >= 128) issues.push('additional_type_diagnostics_omitted');
  return issues;
}
export function validateVersion(v) {
  safeData(v);
  object(v, ['schema', 'capabilityId', 'version', 'contentId', 'source', 'outcomes', 'input', 'output', 'dependencies', 'rights', 'environment', 'provenance'], 'version');
  check(v.schema === SCHEMAS['capability-version'], 'wrong version schema');
  ref(refOf(v));
  object(v.source, ['repository', 'revision', 'path'], 'source');
  str(v.source.repository, 'source.repository'); str(v.source.path, 'source.path');
  check(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(v.source.revision), 'source.revision must be a full commit/digest');
  check(!v.source.path.startsWith('/') && !v.source.path.split('/').includes('..'), 'source.path must be relative');
  strings(v.outcomes, 'outcomes', { nonempty: true }); validateShape(v.input, 'input'); validateShape(v.output, 'output');
  array(v.dependencies, 'dependencies', 100); v.dependencies.forEach(d => ref(d, 'dependency'));
  check(new Set(v.dependencies.map(versionKey)).size === v.dependencies.length, 'duplicate dependencies');
  object(v.rights, ['status', 'license', 'ref'], 'rights'); choice(v.rights.status, ['allowed', 'denied', 'unknown'], 'rights.status');
  if (v.rights.license !== null) str(v.rights.license, 'license'); id(v.rights.ref, 'rights.ref');
  check(plain(v.environment) && Object.keys(v.environment).length <= 32, 'environment requirements must be a bounded object');
  for (const [k, vals] of Object.entries(v.environment)) {
    array(vals, `environment.${k}`, 32); check(vals.length > 0, 'environment values cannot be empty');
    vals.forEach(val => environment({ [k]: val })); check(new Set(vals.map(stableJSON)).size === vals.length, 'duplicate environment values');
  }
  object(v.provenance, ['refs', 'origin', 'maintainer', 'classification', 'funding', 'actionability', 'original'], 'provenance');
  strings(v.provenance.refs, 'provenance.refs', { nonempty: true, namespaced: true });
  id(v.provenance.origin, 'origin'); id(v.provenance.maintainer, 'maintainer');
  choice(v.provenance.classification, ['maintained', 'historical', 'demo'], 'classification');
  choice(v.provenance.funding, ['voluntary', 'unfunded-request', 'funded', 'unknown'], 'funding');
  choice(v.provenance.actionability, ['actionable', 'not-actionable', 'unknown'], 'actionability');
  const { contentId, ...body } = v; check(hash(body) === contentId, 'immutable version content digest mismatch', 'CONTENT_MISMATCH');
  return v;
}
export function createVersion(body) {
  const data = copy(body); check(!Object.hasOwn(data, 'contentId'), 'contentId is computed');
  const v = { ...data, contentId: hash(data) }; validateVersion(v); return freeze(v);
}
export function validateObservation(o) {
  safeData(o); object(o, ['schema', 'id', 'target', 'scope', 'verdict', 'observedAt', 'expiresAt', 'observerId', 'receiptRef'], 'observation');
  check(o.schema === SCHEMAS['compatibility-observation'], 'wrong observation schema'); id(o.id); ref(o.target);
  object(o.scope, ['outcome', 'environment', 'inputDigest'], 'scope'); str(o.scope.outcome, 'scope.outcome'); environment(o.scope.environment);
  if (o.scope.inputDigest !== null) digest(o.scope.inputDigest, 'scope.inputDigest');
  choice(o.verdict, ['compatible', 'incompatible'], 'verdict'); iso(o.observedAt);
  if (o.expiresAt !== null) { iso(o.expiresAt); check(Date.parse(o.expiresAt) > Date.parse(o.observedAt), 'expiry must follow observation'); }
  id(o.observerId); id(o.receiptRef); return o;
}
export function validateMutation(m) {
  safeData(m); object(m, ['schema', 'id', 'kind', 'target', 'replacementId', 'revision', 'previousId', 'at', 'reason', 'provenanceRef'], 'mutation');
  check(m.schema === SCHEMAS['capability-mutation'], 'wrong mutation schema'); id(m.id);
  choice(m.kind, ['retract-observation', 'correct-observation', 'revoke-version', 'deprecate-version'], 'mutation.kind');
  if (m.kind.endsWith('observation')) id(m.target, 'mutation.target'); else ref(m.target);
  if (m.kind === 'correct-observation') id(m.replacementId); else check(m.replacementId === null, 'only correction takes replacementId');
  check(Number.isSafeInteger(m.revision) && m.revision >= 1, 'revision must be positive integer');
  if (m.previousId !== null) id(m.previousId);
  iso(m.at); str(m.reason, 'reason'); id(m.provenanceRef); return m;
}
export function validateRequest(r) {
  safeData(r); object(r, ['schema', 'taskId', 'outcome', 'input', 'environment', 'output', 'capabilityId'], 'request');
  check(r.schema === SCHEMAS['capability-request'], 'wrong request schema'); id(r.taskId); str(r.outcome, 'outcome');
  environment(r.environment); if (r.output !== null) validateShape(r.output, 'request.output');
  if (r.capabilityId !== null) id(r.capabilityId); return r;
}

/** Canonical immutable gap, distinct from a work-cell's small reference record.
 * revision is the immutable envelope format revision, never workflow CAS. */
export function validateGap(g) {
  safeData(g);
  object(g, ['schema','id','revision','taskId','outcome','requestId','constraintsDigest','resolver','reason','candidateFailures','reproducer','funding','contentId'], 'gap');
  check(g.schema === SCHEMAS.gap && g.revision === 1, 'wrong immutable gap schema/revision');
  id(g.id); id(g.taskId); str(g.outcome,'gap.outcome'); digest(g.requestId); digest(g.constraintsDigest);
  object(g.resolver,['snapshotId','resolutionId','policyId','now'],'gap.resolver');
  for (const k of ['snapshotId','resolutionId','policyId']) digest(g.resolver[k]); iso(g.resolver.now);
  choice(g.reason,['missing','known-incompatible'],'gap.reason');
  array(g.candidateFailures,'gap.candidateFailures',LIMITS.versions);
  for (const f of g.candidateFailures) {
    object(f,['target','status','reasons'],'gap.candidateFailure'); ref(f.target);
    choice(f.status,['known-incompatible'],'gap.candidateFailure.status'); strings(f.reasons,'gap.candidateFailure.reasons');
  }
  object(g.reproducer,['ref','permission'],'gap.reproducer'); id(g.reproducer.ref);
  choice(g.reproducer.permission,['synthetic','authorized'],'gap.reproducer.permission');
  object(g.funding,['kind','ref'],'gap.funding'); choice(g.funding.kind,['voluntary','unfunded-request','funded'],'gap.funding.kind');
  if(g.funding.ref!==null)id(g.funding.ref); check(g.funding.kind!=='funded'||g.funding.ref!==null,'funded gap requires a reference');
  const {contentId,...body}=g; digest(contentId); check(hash(body)===contentId,'immutable gap content digest mismatch','CONTENT_MISMATCH');
  return g;
}
