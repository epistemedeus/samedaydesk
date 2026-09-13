export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function presentValue(holder, key) {
  if (!isPlainObject(holder) || !Object.prototype.hasOwnProperty.call(holder, key)) {
    return false;
  }
  const value = holder[key];
  return value !== undefined && value !== null;
}

export function cloneJson(value) {
  return structuredClone(value);
}

export function stableJson(value) {
  return JSON.stringify(value);
}
