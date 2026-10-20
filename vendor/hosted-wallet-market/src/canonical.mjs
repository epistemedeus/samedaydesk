import {createHash} from 'node:crypto';

function need(ok, code) {
  if (!ok) throw Object.assign(new Error(code), {codeName: code});
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    need(Number.isFinite(value) && Number.isInteger(value), 'canonical_integer_required');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  need(value && typeof value === 'object', 'canonical_object_required');
  return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
