import { createHmac, timingSafeEqual } from 'node:crypto';
export const schema = name => `neomorphic.foundry.${name}.v1`;
export class ParticipationError extends Error {
  constructor(code) { super(code); this.name = 'ParticipationError'; this.code = code; }
}
export function requireValue(ok, code = 'invalid_input') { if (!ok) throw new ParticipationError(code); }
export function record(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x)); }
export function field(x, key) {
  requireValue(record(x));
  const d = Object.getOwnPropertyDescriptor(x, key);
  requireValue(!d || Object.hasOwn(d, 'value'), 'unsafe_field');
  return d?.value;
}
// Never stringify untrusted objects (toJSON/getters/errors can copy private context).
export function bounded(value, { maxBytes = 24576, maxDepth = 10, maxNodes = 2048 } = {}) {
  let nodes = 0, bytes = 0;
  const seen = new Set();
  function walk(x, depth) {
    requireValue(++nodes <= maxNodes && depth <= maxDepth, 'payload_too_large');
    if (x === null || typeof x === 'boolean') { bytes += 5; return x; }
    if (typeof x === 'string') { bytes += Buffer.byteLength(x) * 6 + 2; requireValue(bytes <= maxBytes, 'payload_too_large'); return x; }
    if (typeof x === 'number') { requireValue(Number.isFinite(x)); bytes += 24; return x; }
    requireValue(typeof x === 'object' && !seen.has(x), 'unsafe_field');
    seen.add(x);
    let out;
    if (Array.isArray(x)) {
      requireValue(Object.getPrototypeOf(x) === Array.prototype && x.length <= maxNodes, 'payload_too_large');
      requireValue(Reflect.ownKeys(x).length === x.length + 1, 'unsafe_field');
      out = [];
      for (let i = 0; i < x.length; i++) {
        const d = Object.getOwnPropertyDescriptor(x, String(i));
        requireValue(d && Object.hasOwn(d, 'value'), 'unsafe_field'); out.push(walk(d.value, depth + 1));
      }
    } else {
      requireValue(record(x), 'unsafe_field'); out = {};
      const keys = Reflect.ownKeys(x);
      requireValue(keys.length <= 128, 'payload_too_large');
      for (const key of keys) {
        requireValue(typeof key === 'string' && !['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key), 'unsafe_field');
        bytes += Buffer.byteLength(key) * 6 + 4;
        requireValue(bytes <= maxBytes, 'payload_too_large');
        out[key] = walk(field(x, key), depth + 1);
      }
    }
    seen.delete(x); requireValue(bytes <= maxBytes, 'payload_too_large'); return out;
  }
  return walk(value, 0);
}
export function exact(x, keys) { requireValue(record(x) && Object.keys(x).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(x, k))); return x; }
export function oneOf(x, values) { requireValue(values.includes(x)); return x; }
export function id(x) { requireValue(typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/.test(x)); return x; }
export function digest(x) { requireValue(typeof x === 'string' && /^sha256:[0-9a-f]{64}$/.test(x)); return x; }
export function textValue(x, max = 2000) { requireValue(typeof x === 'string' && x.length > 0 && x.length <= max); return x; }
export function canonical(x) { return x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? `[${x.map(canonical).join(',')}]` : `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`; }
export function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
export function secretKey(key) { requireValue((typeof key === 'string' || Buffer.isBuffer(key)) && Buffer.byteLength(key) >= 32, 'identity_key_required'); return key; }
export function mac(key, purpose, value) { return createHmac('sha256', secretKey(key)).update(canonical([purpose, value])).digest('hex'); }
export function equalMac(a, b) { return typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function artifact(x) {
  exact(x, ['uri', 'digest']); digest(x.digest); textValue(x.uri, 2048);
  let u; try { u = new URL(x.uri); } catch { throw new ParticipationError('invalid_reference'); }
  requireValue(u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash, 'invalid_reference');
  return x; // Reference only. No fetch, redirect, shell, or test execution.
}
