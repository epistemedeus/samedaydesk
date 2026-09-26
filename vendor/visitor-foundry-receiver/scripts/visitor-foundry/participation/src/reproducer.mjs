import { bounded, canonical, exact, field, freeze, id, mac, oneOf, record, requireValue, schema } from './safe.mjs';

/** Declarative scalar/object/array projection. Unknown input fields are never visited. */
function project(rule, input, depth = 0) {
  requireValue(depth <= 6, 'payload_too_large');
  if (rule.type === 'object') {
    exact(rule, ['type', 'fields']); requireValue(record(input) && record(rule.fields));
    const out = {};
    for (const [name, child] of Object.entries(rule.fields)) {
      requireValue(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) && !['constructor', 'prototype', 'toJSON'].includes(name));
      out[name] = project(child, field(input, name), depth + 1);
    }
    return out;
  }
  if (rule.type === 'array') {
    exact(rule, ['type', 'maxItems', 'items']);
    requireValue(Number.isInteger(rule.maxItems) && rule.maxItems >= 0 && rule.maxItems <= 32);
    requireValue(Array.isArray(input) && input.length <= rule.maxItems, 'payload_too_large');
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const d = Object.getOwnPropertyDescriptor(input, String(i));
      requireValue(d && Object.hasOwn(d, 'value'), 'unsafe_field'); out.push(project(rule.items, d.value, depth + 1));
    }
    return out;
  }
  exact(rule, ['type', 'maxLength']); oneOf(rule.type, ['string', 'integer', 'boolean']);
  requireValue(Number.isInteger(rule.maxLength) && rule.maxLength >= 1 && rule.maxLength <= 2048);
  requireValue(rule.type === 'integer' ? Number.isSafeInteger(input) : typeof input === rule.type);
  if (typeof input === 'string') requireValue(input.length <= rule.maxLength, 'payload_too_large');
  return input;
}
export function buildReproducer({ template, sharing = { scope: 'metadata' }, input }) {
  const spec = bounded(template, { maxBytes: 16384 }); exact(spec, ['id', 'fields']); id(spec.id);
  // Decide scope before inspecting input, even to compute a digest or diagnostic.
  const scope = field(sharing, 'scope'); oneOf(scope, ['metadata', 'reproducer']);
  if (scope === 'metadata') return freeze({ schema: schema('participation-reproducer'), templateId: spec.id, scope, provenance: null, authorizationRef: null, fields: null });
  const permission = bounded(sharing); exact(permission, ['scope', 'provenance', 'authorizationRef']);
  oneOf(permission.provenance, ['synthetic', 'authorized']); id(permission.authorizationRef);
  const fields = project({ type: 'object', fields: spec.fields }, input);
  return freeze(bounded({ schema: schema('participation-reproducer'), templateId: spec.id, ...permission, fields }, { maxBytes: 16384 }));
}
export function semanticIdentity({ tenantId, identityKey, proposal }) {
  // Host-owned per-tenant key: never hash private values into a public global oracle.
  id(tenantId); const safe = bounded(proposal);
  return `proposal:${mac(identityKey, 'participation-semantic-v1', [tenantId, safe])}`;
}
export const sharingBytes = reproducer => Buffer.byteLength(canonical(bounded(reproducer)));
