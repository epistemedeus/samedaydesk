export class ServiceError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function requireThat(condition, code, status = 400) {
  if (!condition) throw new ServiceError(code, status);
}
export function object(value, keys) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'object_required');
  requireThat(Object.keys(value).every(key => keys.includes(key)), 'unsupported_field');
}
export function integer(value, min, max, code = 'invalid_integer') {
  requireThat(Number.isSafeInteger(value) && value >= min && value <= max, code);
  return value;
}
