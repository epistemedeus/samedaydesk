export const UNKNOWN = "unknown";

export function tri(value) {
  if (value === true) return true;
  if (value === false) return false;
  return UNKNOWN;
}

export function isUnknown(value) {
  return value === UNKNOWN || value === undefined;
}

export function sourceSaysBoolean(value) {
  if (typeof value === "boolean") return value;
  return UNKNOWN;
}

export function pushUnknown(unknowns, name, cond) {
  if (cond) unknowns.push(name);
  return unknowns;
}

export function distinctUnknown(record, field) {
  return record?.unknowns?.includes(field) === true;
}
