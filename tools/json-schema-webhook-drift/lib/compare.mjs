import { jsonType } from "./kind.mjs";
import { remoteRefsInNode, resolveLocalRef } from "./refs.mjs";

const CONSTRAINT_SIBLING_KEYS = new Set([
  "type",
  "format",
  "enum",
  "const",
  "required",
  "additionalProperties",
  "properties",
  "items",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "nullable",
]);

function normalizeType(type) {
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return [...type].map(String).sort();
  return null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function encodeNumber(value) {
  const n = numberOrNull(value);
  if (n === null) return null;
  if (Number.isInteger(n)) return n;
  return JSON.stringify(n);
}

function boundOrNull(value) {
  if (typeof value === "boolean") return value;
  return encodeNumber(value);
}

function decodeBound(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : { incomparable: true };
  }
  if (value === null || value === undefined) return null;
  return { incomparable: true };
}

function sortedStrings(value) {
  if (!Array.isArray(value)) return null;
  return [...value].map(String).sort();
}

function stableLiteral(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function fingerprintItems(items) {
  if (items === undefined) return null;
  if (typeof items === "boolean") return { kind: "boolean-schema", allows: items };
  if (items && typeof items === "object" && !Array.isArray(items)) {
    return { kind: "schema-object", type: normalizeType(items.type) };
  }
  return { kind: "unknown" };
}

function schemaObjectFingerprint(node) {
  return {
    kind: "schema-object",
    type: normalizeType(node.type),
    format: typeof node.format === "string" ? node.format : null,
    enum: Array.isArray(node.enum) ? [...node.enum].map(stableLiteral).sort() : null,
    constJson: Object.prototype.hasOwnProperty.call(node, "const") ? stableLiteral(node.const) : null,
    required: sortedStrings(node.required),
    additionalProperties:
      typeof node.additionalProperties === "boolean"
        ? node.additionalProperties
        : node.additionalProperties === undefined
          ? null
          : "schema",
    propertiesKeys:
      node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)
        ? Object.keys(node.properties).sort()
        : null,
    items: fingerprintItems(node.items),
    itemsType:
      node.items && typeof node.items === "object" && !Array.isArray(node.items)
        ? normalizeType(node.items.type)
        : null,
    minLength: encodeNumber(node.minLength),
    maxLength: encodeNumber(node.maxLength),
    minimum: encodeNumber(node.minimum),
    maximum: encodeNumber(node.maximum),
    exclusiveMinimum: boundOrNull(node.exclusiveMinimum),
    exclusiveMaximum: boundOrNull(node.exclusiveMaximum),
    minItems: encodeNumber(node.minItems),
    maxItems: encodeNumber(node.maxItems),
    nullable: node.nullable === true,
  };
}

function emptySchemaFingerprint() {
  return schemaObjectFingerprint({});
}

function fingerprintSiblingConstraints(node) {
  const rest = {};
  let any = false;
  for (const key of Object.keys(node)) {
    if (key === "$ref") continue;
    if (CONSTRAINT_SIBLING_KEYS.has(key)) {
      rest[key] = node[key];
      any = true;
    }
  }
  if (!any) return null;
  return schemaObjectFingerprint(rest);
}

export function fingerprintSchemaNode(node, doc) {
  if (node === undefined) return { kind: "absent" };
  if (typeof node === "boolean") {
    return { kind: "boolean-schema", allows: node };
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { kind: "literal", jsonType: jsonType(node) };
  }

  const remote = remoteRefsInNode(node);
  if (remote.length) {
    return { kind: "remote-ref", refuse: true, refs: remote };
  }

  if (typeof node.$ref === "string") {
    const resolved = resolveLocalRef(doc, node.$ref);
    if (resolved.remote) {
      return { kind: "remote-ref", refuse: true, refs: [node.$ref] };
    }
    if (!resolved.ok) {
      return {
        kind: "unresolved-local-ref",
        ref: node.$ref,
        missing: Boolean(resolved.missing),
        cycle: Boolean(resolved.cycle),
        truncated: Boolean(resolved.truncated),
      };
    }
    const target = fingerprintSchemaNode(resolved.value, doc);
    const siblings = fingerprintSiblingConstraints(node);
    const out = { kind: "local-ref", ref: node.$ref, target };
    if (siblings) out.siblings = siblings;
    return out;
  }

  return schemaObjectFingerprint(node);
}

export function fingerprintExampleNode(node) {
  if (node === undefined) return { kind: "absent" };
  return {
    kind: "example-value",
    jsonType: jsonType(node),
    valueJson: stableLiteral(node),
  };
}

export function fingerprintUsedNode(node, doc, kind) {
  if (kind === "json-schema") return fingerprintSchemaNode(node, doc);
  return fingerprintExampleNode(node);
}

function fpKey(fp) {
  return JSON.stringify(fp ?? null);
}

function typeChanged(beforeFp, afterFp) {
  if (beforeFp.kind === "schema-object" && afterFp.kind === "schema-object") {
    return JSON.stringify(beforeFp.type) !== JSON.stringify(afterFp.type);
  }
  if (beforeFp.kind === "example-value" && afterFp.kind === "example-value") {
    return beforeFp.jsonType !== afterFp.jsonType;
  }
  if (beforeFp.kind === "literal" && afterFp.kind === "example-value") {
    return beforeFp.jsonType !== afterFp.jsonType;
  }
  return false;
}

function requiredSet(fp) {
  return new Set(fp.required || []);
}

function classifyRequired(before, after) {
  const beforeSet = requiredSet(before);
  const afterSet = requiredSet(after);
  const added = [...afterSet].filter((name) => !beforeSet.has(name));
  const removed = [...beforeSet].filter((name) => !afterSet.has(name));
  if (added.length && removed.length) return { class: "breaking", reason: "required-changed" };
  if (added.length) return { class: "breaking", reason: "required-added" };
  if (removed.length) return { class: "compatible", reason: "required-removed" };
  return null;
}

function compareLowerBound(beforeRaw, after) {
  const before = decodeBound(beforeRaw);
  const decodedAfter = decodeBound(after);
  if (before && typeof before === "object" && before.incomparable) return "incomparable";
  if (decodedAfter && typeof decodedAfter === "object" && decodedAfter.incomparable) return "incomparable";
  if (typeof before === "number" && typeof decodedAfter === "number") {
    if (decodedAfter > before) return "tighter";
    if (decodedAfter < before) return "weaker";
    return "same";
  }
  if (typeof before === "boolean" && typeof decodedAfter === "boolean") {
    if (decodedAfter === before) return "same";
    return decodedAfter ? "tighter" : "weaker";
  }
  if (before === null && decodedAfter === null) return "same";
  if (before === null && decodedAfter !== null) return "tighter";
  if (before !== null && decodedAfter === null) return "weaker";
  return "incomparable";
}

function compareUpperBound(beforeRaw, after) {
  const before = decodeBound(beforeRaw);
  const decodedAfter = decodeBound(after);
  if (before && typeof before === "object" && before.incomparable) return "incomparable";
  if (decodedAfter && typeof decodedAfter === "object" && decodedAfter.incomparable) return "incomparable";
  if (typeof before === "number" && typeof decodedAfter === "number") {
    if (decodedAfter < before) return "tighter";
    if (decodedAfter > before) return "weaker";
    return "same";
  }
  if (typeof before === "boolean" && typeof decodedAfter === "boolean") {
    if (decodedAfter === before) return "same";
    return decodedAfter ? "tighter" : "weaker";
  }
  if (before === null && decodedAfter === null) return "same";
  if (before === null && decodedAfter !== null) return "tighter";
  if (before !== null && decodedAfter === null) return "weaker";
  return "incomparable";
}

const LOWER_BOUNDS = ["minimum", "exclusiveMinimum", "minLength", "minItems"];
const UPPER_BOUNDS = ["maximum", "exclusiveMaximum", "maxLength", "maxItems"];

function classifyNumeric(before, after) {
  const directions = [];
  for (const key of LOWER_BOUNDS) {
    directions.push(compareLowerBound(before[key], after[key]));
  }
  for (const key of UPPER_BOUNDS) {
    directions.push(compareUpperBound(before[key], after[key]));
  }
  if (directions.includes("incomparable")) {
    return { class: "unknown", reason: "numeric-incomparable" };
  }
  const tighter = directions.includes("tighter");
  const weaker = directions.includes("weaker");
  if (tighter) return { class: "breaking", reason: "numeric-tightened" };
  if (weaker) return { class: "compatible", reason: "numeric-weakened" };
  return null;
}

function additionalPropertiesRank(value) {
  if (value === false) return 0;
  if (value === "schema") return 1;
  return 2;
}

function classifyAdditionalProperties(before, after) {
  const beforeRank = additionalPropertiesRank(before.additionalProperties);
  const afterRank = additionalPropertiesRank(after.additionalProperties);
  if (afterRank < beforeRank) return { class: "breaking", reason: "additionalProperties-tightened" };
  if (afterRank > beforeRank) return { class: "compatible", reason: "additionalProperties-weakened" };
  return null;
}

function classifyItems(before, after) {
  const beforeItems = before.items;
  const afterItems = after.items;
  if (JSON.stringify(beforeItems) === JSON.stringify(afterItems)) return null;
  if (beforeItems && afterItems) {
    const booleanClass = classifyBooleanSchema(beforeItems, afterItems);
    if (booleanClass && booleanClass.reason !== "structural-equal") return booleanClass;
  }
  return { class: "breaking", reason: "structural-change" };
}

const OTHER_KEYS = ["format", "enum", "constJson", "propertiesKeys", "itemsType", "nullable"];

function classifySchemaConstraints(before, after) {
  if (before.kind !== "schema-object" || after.kind !== "schema-object") return null;
  if (JSON.stringify(before.type) !== JSON.stringify(after.type)) {
    return { class: "breaking", reason: "type-change" };
  }
  const deltas = [];
  const required = classifyRequired(before, after);
  if (required) deltas.push(required);
  const numeric = classifyNumeric(before, after);
  if (numeric) deltas.push(numeric);
  const additional = classifyAdditionalProperties(before, after);
  if (additional) deltas.push(additional);
  const items = classifyItems(before, after);
  if (items) deltas.push(items);

  const restChanged = OTHER_KEYS.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const tightening = deltas.find((delta) => delta.class === "breaking");
  if (tightening) return tightening;
  if (deltas.some((delta) => delta.class === "unknown")) {
    return deltas.find((delta) => delta.class === "unknown");
  }
  if (restChanged) return { class: "breaking", reason: "structural-change" };
  const weakening = deltas.find((delta) => delta.class === "compatible");
  if (weakening) return weakening;
  return null;
}

function classifyBooleanSchema(beforeFp, afterFp) {
  const beforeAllows = beforeFp.kind === "boolean-schema" ? beforeFp.allows : beforeFp.kind === "schema-object" ? "some" : null;
  const afterAllows = afterFp.kind === "boolean-schema" ? afterFp.allows : afterFp.kind === "schema-object" ? "some" : null;
  if (beforeAllows === null || afterAllows === null) return null;
  if (beforeFp.kind === "boolean-schema" && afterFp.kind === "boolean-schema") {
    if (beforeFp.allows === afterFp.allows) return { class: "unchanged", reason: "structural-equal" };
    if (beforeFp.allows === false && afterFp.allows === true) {
      return { class: "compatible", reason: "boolean-schema-weakened" };
    }
    return { class: "breaking", reason: "boolean-schema-tightened" };
  }
  if (beforeFp.kind === "boolean-schema" && afterFp.kind === "schema-object") {
    return beforeFp.allows === false
      ? { class: "compatible", reason: "boolean-schema-weakened" }
      : { class: "breaking", reason: "boolean-schema-tightened" };
  }
  if (beforeFp.kind === "schema-object" && afterFp.kind === "boolean-schema") {
    return afterFp.allows === true
      ? { class: "compatible", reason: "boolean-schema-weakened" }
      : { class: "breaking", reason: "boolean-schema-tightened" };
  }
  return null;
}

const CLASS_SEVERITY = {
  "remote-ref": 0,
  unknown: 1,
  breaking: 2,
  added: 3,
  deleted: 3,
  compatible: 4,
  informational: 5,
  unchanged: 6,
};

function combineClass(target, siblings) {
  const targetRank = CLASS_SEVERITY[target.class] ?? 5;
  const siblingRank = CLASS_SEVERITY[siblings.class] ?? 5;
  if (targetRank <= siblingRank) return target;
  return siblings;
}

function unwrapRef(fp) {
  if (fp?.kind !== "local-ref") {
    return { target: fp, siblings: emptySchemaFingerprint() };
  }
  return { target: fp.target, siblings: fp.siblings || emptySchemaFingerprint() };
}

export function classifyPair(beforeFp, afterFp) {
  if (beforeFp?.refuse || afterFp?.refuse) {
    return { class: "remote-ref", reason: "remote-ref" };
  }
  if (beforeFp?.kind === "absent" && afterFp?.kind === "absent") {
    return { class: "unknown", reason: "absent-in-both" };
  }
  if (beforeFp?.kind === "absent") {
    return { class: "added", reason: "present-after-only" };
  }
  if (afterFp?.kind === "absent") {
    return { class: "deleted", reason: "present-before-only" };
  }
  if (fpKey(beforeFp) === fpKey(afterFp)) {
    return { class: "unchanged", reason: "structural-equal" };
  }
  if (beforeFp.kind === "local-ref" || afterFp.kind === "local-ref") {
    const before = unwrapRef(beforeFp);
    const after = unwrapRef(afterFp);
    return combineClass(classifyPair(before.target, after.target), classifyPair(before.siblings, after.siblings));
  }
  const booleanClass = classifyBooleanSchema(beforeFp, afterFp);
  if (booleanClass) return booleanClass;
  if (beforeFp.kind === "schema-object" && afterFp.kind === "schema-object") {
    const directional = classifySchemaConstraints(beforeFp, afterFp);
    if (directional) return directional;
  }
  if (typeChanged(beforeFp, afterFp)) {
    return { class: "breaking", reason: "type-change" };
  }
  if (beforeFp.kind === "example-value" && afterFp.kind === "example-value") {
    return { class: "informational", reason: "value-change" };
  }
  if (beforeFp.kind === "unresolved-local-ref" || afterFp.kind === "unresolved-local-ref") {
    return { class: "unknown", reason: "unresolved-local-ref" };
  }
  return { class: "breaking", reason: "structural-change" };
}
