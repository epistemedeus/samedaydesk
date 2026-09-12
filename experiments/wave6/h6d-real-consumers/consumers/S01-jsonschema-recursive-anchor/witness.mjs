/**
 * Independent used-pointer witness for JSON Schema documents.
 * Compares type, required, enum, and numeric axes only.
 * Does not import useful-jobs engines or classify breaking vs compatible.
 */

const NUMERIC_KEYS = Object.freeze([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "multipleOf",
]);

export function parseJsonPointer(pointer) {
  if (pointer === "") return { ok: true, tokens: [] };
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    return { ok: false, pointer };
  }
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  return { ok: true, tokens };
}

export function getAtPointer(doc, pointer) {
  const parsed = parseJsonPointer(pointer);
  if (!parsed.ok) return { present: false, invalid: true, pointer };
  let cur = doc;
  for (const token of parsed.tokens) {
    if (cur === null || typeof cur !== "object") {
      return { present: false, pointer };
    }
    if (!Object.prototype.hasOwnProperty.call(cur, token)) {
      return { present: false, pointer };
    }
    cur = cur[token];
  }
  return { present: true, value: cur, pointer };
}

function stable(value) {
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeAxis(node) {
  if (!isPlainObject(node) || !Object.prototype.hasOwnProperty.call(node, "type")) {
    return undefined;
  }
  const type = node.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return [...type].map(String).sort();
  return type;
}

function requiredAxis(node) {
  if (!isPlainObject(node) || !Array.isArray(node.required)) return undefined;
  return [...node.required].map(String).sort();
}

function enumAxis(node) {
  if (!isPlainObject(node) || !Array.isArray(node.enum)) return undefined;
  return [...node.enum].map(stable).sort();
}

function numericAxis(node) {
  if (!isPlainObject(node)) return undefined;
  const out = {};
  let any = false;
  for (const key of NUMERIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      out[key] = node[key];
      any = true;
    }
  }
  return any ? out : undefined;
}

function snapshot(hit) {
  if (hit.invalid) return { present: false, invalid: true };
  if (!hit.present) return { present: false };
  const value = hit.value;
  if (!isPlainObject(value)) {
    return { present: true, kind: "value", value };
  }
  return {
    present: true,
    kind: "object",
    type: typeAxis(value),
    required: requiredAxis(value),
    enum: enumAxis(value),
    numeric: numericAxis(value),
    ref: typeof value.$ref === "string" ? value.$ref : undefined,
  };
}

function axesDiffer(before, after) {
  return (
    stable(before.type) !== stable(after.type) ||
    stable(before.required) !== stable(after.required) ||
    stable(before.enum) !== stable(after.enum) ||
    stable(before.numeric) !== stable(after.numeric)
  );
}

function classifyPointer(beforeDoc, afterDoc, pointer) {
  const beforeHit = getAtPointer(beforeDoc, pointer);
  const afterHit = getAtPointer(afterDoc, pointer);
  const before = snapshot(beforeHit);
  const after = snapshot(afterHit);
  const row = { pointer, before, after };

  if (before.invalid || after.invalid) {
    return { ...row, bucket: "unknown", reason: "invalid-json-pointer" };
  }
  if (!before.present && !after.present) {
    return { ...row, bucket: "unknown", reason: "absent-in-both" };
  }
  if (!before.present && after.present) {
    return { ...row, bucket: "added", reason: "present-after-only" };
  }
  if (before.present && !after.present) {
    return { ...row, bucket: "removed", reason: "present-before-only" };
  }
  if (before.kind === "value" || after.kind === "value") {
    if (before.kind === after.kind && stable(before.value) === stable(after.value)) {
      return { ...row, bucket: "unchanged", reason: "value-equal" };
    }
    return { ...row, bucket: "changed", reason: "value-changed" };
  }
  if (axesDiffer(before, after)) {
    return { ...row, bucket: "changed", reason: "type-required-enum-numeric" };
  }
  if (before.ref !== after.ref) {
    return { ...row, bucket: "unknown", reason: "ref-only-unresolved" };
  }
  return { ...row, bucket: "unchanged", reason: "axes-equal" };
}

function usedPointers(used) {
  if (!used) return [];
  if (Array.isArray(used)) return used.filter((p) => typeof p === "string");
  if (Array.isArray(used.pointers)) return used.pointers.filter((p) => typeof p === "string");
  return [];
}

export function witness(before, after, used) {
  const pointers = usedPointers(used);
  const changed = [];
  const unchanged = [];
  const added = [];
  const removed = [];
  const unknown = [];
  const rows = [];

  for (const pointer of pointers) {
    const row = classifyPointer(before, after, pointer);
    rows.push(row);
    if (row.bucket === "changed") changed.push(pointer);
    else if (row.bucket === "unchanged") unchanged.push(pointer);
    else if (row.bucket === "added") added.push(pointer);
    else if (row.bucket === "removed") removed.push(pointer);
    else unknown.push(pointer);
  }

  let fact = "unknown";
  if (changed.length + added.length + removed.length > 0) fact = "changed";
  else if (pointers.length > 0 && unknown.length === 0) fact = "unchanged";

  return {
    fact,
    changed,
    unchanged,
    added,
    removed,
    unknown,
    rows,
  };
}
