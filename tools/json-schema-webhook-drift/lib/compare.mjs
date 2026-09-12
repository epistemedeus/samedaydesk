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
  "pattern",
]);

const UNSUPPORTED_KEYWORDS = Object.freeze([
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "prefixItems",
  "unevaluatedItems",
  "unevaluatedProperties",
  "patternProperties",
  "propertyNames",
  "dependentSchemas",
  "dependentRequired",
  "contains",
  "minContains",
  "maxContains",
  "$dynamicRef",
  "$recursiveRef",
]);

const MAX_FP_DEPTH = 8;

function normalizeType(type) {
  if (typeof type === "string") return type;
  if (Array.isArray(type)) {
    const list = [...new Set(type.map(String))].sort();
    if (list.length === 1) return list[0];
    return list;
  }
  return null;
}

function typeList(type) {
  const normalized = normalizeType(type);
  if (normalized == null) return null;
  return Array.isArray(normalized) ? normalized : [normalized];
}

function typeAllows(list, jsonType) {
  if (list == null) return true;
  if (jsonType === "integer") return list.includes("integer") || list.includes("number");
  return list.includes(jsonType);
}

function typeInstanceSubset(beforeType, afterType) {
  const before = typeList(beforeType);
  const after = typeList(afterType);
  const checks = ["null", "boolean", "object", "array", "string", "number", "integer"];
  return checks.every((jsonType) => !typeAllows(before, jsonType) || typeAllows(after, jsonType));
}

function classifyTypeDirection(beforeType, afterType) {
  const before = typeList(beforeType);
  const after = typeList(afterType);
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  const beforeSubset = typeInstanceSubset(beforeType, afterType);
  const afterSubset = typeInstanceSubset(afterType, beforeType);
  if (beforeSubset && afterSubset) return null;
  if (beforeSubset && !afterSubset) return { class: "compatible", reason: "type-weakened" };
  if (!beforeSubset && afterSubset) return { class: "breaking", reason: "type-tightened" };
  return { class: "breaking", reason: "type-change" };
}

function unsupportedKeywords(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  return UNSUPPORTED_KEYWORDS.filter((key) => Object.prototype.hasOwnProperty.call(node, key));
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

function fingerprintItems(items, doc, depth) {
  if (items === undefined) return null;
  if (typeof items === "boolean") return { kind: "boolean-schema", allows: items };
  if (items && typeof items === "object" && !Array.isArray(items)) {
    return fingerprintSchemaNode(items, doc, depth + 1);
  }
  return { kind: "unknown" };
}

function fingerprintAdditionalProperties(value, doc, depth) {
  if (typeof value === "boolean") return { kind: "boolean-schema", allows: value };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return fingerprintSchemaNode(value, doc, depth + 1);
  }
  if (value === undefined) return null;
  return { kind: "unknown" };
}

function fingerprintProperties(properties, doc, depth) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  const out = {};
  for (const key of Object.keys(properties).sort()) {
    out[key] = fingerprintSchemaNode(properties[key], doc, depth + 1);
  }
  return out;
}

function schemaObjectFingerprint(node, doc, depth) {
  const unsupported = unsupportedKeywords(node);
  return {
    kind: "schema-object",
    type: normalizeType(node.type),
    format: typeof node.format === "string" ? node.format : null,
    enum: Array.isArray(node.enum) ? [...node.enum].map(stableLiteral).sort() : null,
    constJson: Object.prototype.hasOwnProperty.call(node, "const") ? stableLiteral(node.const) : null,
    required: sortedStrings(node.required),
    additionalProperties: fingerprintAdditionalProperties(node.additionalProperties, doc, depth),
    properties: fingerprintProperties(node.properties, doc, depth),
    propertiesKeys:
      node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)
        ? Object.keys(node.properties).sort()
        : null,
    items: fingerprintItems(node.items, doc, depth),
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
    pattern: typeof node.pattern === "string" ? node.pattern : null,
    nullable: node.nullable === true,
    unsupportedKeywords: unsupported.length ? unsupported : null,
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
  return schemaObjectFingerprint(rest, null, 0);
}

export function fingerprintSchemaNode(node, doc, depth = 0) {
  if (node === undefined) return { kind: "absent" };
  if (typeof node === "boolean") {
    return { kind: "boolean-schema", allows: node };
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return { kind: "literal", jsonType: jsonType(node) };
  }
  if (depth > MAX_FP_DEPTH) {
    return { kind: "truncated-depth", unsupportedKeywords: ["depth"] };
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
    const target = fingerprintSchemaNode(resolved.value, doc, depth + 1);
    const siblings = fingerprintSiblingConstraints(node);
    const out = { kind: "local-ref", ref: node.$ref, target };
    if (siblings) out.siblings = siblings;
    const unsupported = unsupportedKeywords(node);
    if (unsupported.length) out.unsupportedKeywords = unsupported;
    return out;
  }

  return schemaObjectFingerprint(node, doc, depth);
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
  if (!fp) return JSON.stringify(null);
  const { nullable, unsupportedKeywords, ...rest } = fp;
  void nullable;
  void unsupportedKeywords;
  return JSON.stringify(rest);
}

function applyHonesty(classified, beforeFp, afterFp) {
  const keywords = [
    ...((beforeFp && beforeFp.unsupportedKeywords) || []),
    ...((afterFp && afterFp.unsupportedKeywords) || []),
  ];
  const unique = [...new Set(keywords)];
  const certainUnsafe =
    classified.class === "breaking" || classified.class === "deleted" || classified.class === "added";
  if (unique.length && !certainUnsafe && classified.class !== "remote-ref") {
    return { class: "unknown", reason: "unsupported-keyword", keywords: unique };
  }
  if (
    beforeFp?.kind === "schema-object" &&
    afterFp?.kind === "schema-object" &&
    Boolean(beforeFp.nullable) !== Boolean(afterFp.nullable) &&
    !certainUnsafe
  ) {
    return { class: "unknown", reason: "unsupported-nullable" };
  }
  return classified;
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
  if (value === false || (value?.kind === "boolean-schema" && value.allows === false)) return 0;
  if (value && typeof value === "object") return 1;
  return 2;
}

function classifyAdditionalProperties(before, after) {
  const beforeAp = before.additionalProperties;
  const afterAp = after.additionalProperties;
  if (JSON.stringify(beforeAp) === JSON.stringify(afterAp)) return null;
  if (beforeAp && afterAp && typeof beforeAp === "object" && typeof afterAp === "object") {
    if (beforeAp.kind === "boolean-schema" && afterAp.kind === "boolean-schema") {
      return classifyBooleanSchema(beforeAp, afterAp);
    }
    return classifyPair(beforeAp, afterAp);
  }
  const beforeRank = additionalPropertiesRank(beforeAp);
  const afterRank = additionalPropertiesRank(afterAp);
  if (afterRank < beforeRank) return { class: "breaking", reason: "additionalProperties-tightened" };
  if (afterRank > beforeRank) return { class: "compatible", reason: "additionalProperties-weakened" };
  return null;
}

function classifyItems(before, after) {
  const beforeItems = before.items;
  const afterItems = after.items;
  if (JSON.stringify(beforeItems) === JSON.stringify(afterItems)) return null;
  if (beforeItems && afterItems) {
    return classifyPair(beforeItems, afterItems);
  }
  return { class: "breaking", reason: "structural-change" };
}

function classifyPattern(before, after) {
  const left = before.pattern || null;
  const right = after.pattern || null;
  if (left === right) return null;
  if (!left && right) return { class: "breaking", reason: "pattern-added" };
  if (left && !right) return { class: "compatible", reason: "pattern-removed" };
  return { class: "unknown", reason: "pattern-changed" };
}

function classifyEnum(before, after) {
  if (!before.enum && !after.enum) return null;
  if (!before.enum && after.enum) return { class: "breaking", reason: "enum-added" };
  if (before.enum && !after.enum) return { class: "compatible", reason: "enum-removed" };
  const beforeSet = new Set(before.enum);
  const afterSet = new Set(after.enum);
  const lost = [...beforeSet].filter((value) => !afterSet.has(value));
  const gained = [...afterSet].filter((value) => !beforeSet.has(value));
  if (!lost.length && !gained.length) return null;
  if (lost.length) return { class: "breaking", reason: "enum-tightened" };
  return { class: "compatible", reason: "enum-weakened" };
}

function classifyProperties(before, after) {
  const beforeProps = before.properties || null;
  const afterProps = after.properties || null;
  if (!beforeProps && !afterProps) return null;
  if (JSON.stringify(beforeProps) === JSON.stringify(afterProps)) return null;
  const names = new Set([...Object.keys(beforeProps || {}), ...Object.keys(afterProps || {})]);
  let worst = null;
  for (const name of names) {
    const left = beforeProps?.[name] || { kind: "absent" };
    const right = afterProps?.[name] || { kind: "absent" };
    const row = classifyPair(left, right);
    if (!row || row.class === "unchanged") continue;
    worst = worst ? combineClass(worst, row) : row;
  }
  return worst;
}

const OTHER_KEYS = ["format", "constJson", "itemsType"];

function classifySchemaConstraints(before, after) {
  if (before.kind !== "schema-object" || after.kind !== "schema-object") return null;
  const deltas = [];
  const typeDelta = classifyTypeDirection(before.type, after.type);
  if (typeDelta) deltas.push(typeDelta);
  const required = classifyRequired(before, after);
  if (required) deltas.push(required);
  const numeric = classifyNumeric(before, after);
  if (numeric) deltas.push(numeric);
  const additional = classifyAdditionalProperties(before, after);
  if (additional) deltas.push(additional);
  const items = classifyItems(before, after);
  if (items) deltas.push(items);
  const enumerated = classifyEnum(before, after);
  if (enumerated) deltas.push(enumerated);
  const pattern = classifyPattern(before, after);
  if (pattern) deltas.push(pattern);
  const properties = classifyProperties(before, after);
  if (properties) deltas.push(properties);

  const restChanged = OTHER_KEYS.some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const tightening = deltas.find((delta) => delta.class === "breaking");
  if (tightening) return tightening;
  if (deltas.some((delta) => delta.class === "unknown")) {
    return deltas.find((delta) => delta.class === "unknown");
  }
  if (restChanged) return { class: "breaking", reason: "structural-change" };
  const weakening = deltas.find((delta) => delta.class === "compatible");
  if (weakening) return weakening;
  const added = deltas.find((delta) => delta.class === "added" || delta.class === "deleted");
  if (added) return added;
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
    return applyHonesty({ class: "unchanged", reason: "structural-equal" }, beforeFp, afterFp);
  }
  if (beforeFp.kind === "local-ref" || afterFp.kind === "local-ref") {
    const before = unwrapRef(beforeFp);
    const after = unwrapRef(afterFp);
    return applyHonesty(
      combineClass(classifyPair(before.target, after.target), classifyPair(before.siblings, after.siblings)),
      beforeFp,
      afterFp,
    );
  }
  const booleanClass = classifyBooleanSchema(beforeFp, afterFp);
  if (booleanClass) return applyHonesty(booleanClass, beforeFp, afterFp);
  if (beforeFp.kind === "schema-object" && afterFp.kind === "schema-object") {
    const directional = classifySchemaConstraints(beforeFp, afterFp);
    if (directional) return applyHonesty(directional, beforeFp, afterFp);
  }
  if (typeChanged(beforeFp, afterFp)) {
    const directed = classifyTypeDirection(beforeFp.type, afterFp.type);
    return applyHonesty(directed || { class: "breaking", reason: "type-change" }, beforeFp, afterFp);
  }
  if (beforeFp.kind === "example-value" && afterFp.kind === "example-value") {
    return { class: "informational", reason: "value-change" };
  }
  if (beforeFp.kind === "unresolved-local-ref" || afterFp.kind === "unresolved-local-ref") {
    return { class: "unknown", reason: "unresolved-local-ref" };
  }
  if (beforeFp.kind === "truncated-depth" || afterFp.kind === "truncated-depth") {
    return { class: "unknown", reason: "unsupported-keyword", keywords: ["depth"] };
  }
  return applyHonesty({ class: "breaking", reason: "structural-change" }, beforeFp, afterFp);
}
