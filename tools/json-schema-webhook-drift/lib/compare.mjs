import { jsonType } from "./kind.mjs";
import { remoteRefsInNode, resolveLocalRefTarget } from "./refs.mjs";

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

function typeCanBe(type, jsonType) {
  const list = typeList(type);
  if (jsonType === "number") {
    return list === null || list.includes("number") || list.includes("integer");
  }
  return typeAllows(list, jsonType);
}

function typeAllowsValue(type, value) {
  const list = typeList(type);
  if (list === null) return true;
  const valueType = jsonType(value);
  if (valueType === "number" && Number.isInteger(value)) {
    return list.includes("integer") || list.includes("number");
  }
  return list.includes(valueType);
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
  const sorted = [...value].map(String).sort();
  return sorted.length ? sorted : null;
}

function stableLiteral(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function trueSchemaFingerprint() {
  return { kind: "boolean-schema", allows: true };
}

function isTrueSchemaFingerprint(value) {
  return value?.kind === "boolean-schema" && value.allows === true;
}

function fingerprintItems(items, doc, depth) {
  if (items === undefined) return null;
  if (items === true) return trueSchemaFingerprint();
  if (items === false) return { kind: "boolean-schema", allows: false };
  if (items && typeof items === "object" && !Array.isArray(items)) {
    const fp = fingerprintSchemaNode(items, doc, depth + 1);
    return isTrueSchemaFingerprint(fp) ? null : fp;
  }
  return { kind: "unknown" };
}

function fingerprintAdditionalProperties(value, doc, depth) {
  if (value === true) return trueSchemaFingerprint();
  if (value === false) return { kind: "boolean-schema", allows: false };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const fp = fingerprintSchemaNode(value, doc, depth + 1);
    return isTrueSchemaFingerprint(fp) ? null : fp;
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
  const type = normalizeType(node.type);
  const objectRelevant = typeCanBe(type, "object");
  const arrayRelevant = typeCanBe(type, "array");
  const stringRelevant = typeCanBe(type, "string");
  const numberRelevant = typeCanBe(type, "number");
  const hasConst = Object.prototype.hasOwnProperty.call(node, "const");
  if (hasConst && !typeAllowsValue(type, node.const)) {
    return { kind: "boolean-schema", allows: false };
  }
  const enumValues = Array.isArray(node.enum)
    ? node.enum.filter((value) => typeAllowsValue(type, value)).map(stableLiteral).sort()
    : null;
  if (Array.isArray(node.enum) && node.enum.length > 0 && enumValues.length === 0) {
    return { kind: "boolean-schema", allows: false };
  }

  const additionalProperties = objectRelevant
    ? fingerprintAdditionalProperties(node.additionalProperties, doc, depth)
    : null;
  let properties = objectRelevant ? fingerprintProperties(node.properties, doc, depth) : null;
  if (properties && (additionalProperties === null || isTrueSchemaFingerprint(additionalProperties))) {
    properties = Object.fromEntries(
      Object.entries(properties).filter(([, value]) => !isTrueSchemaFingerprint(value)),
    );
    if (Object.keys(properties).length === 0) properties = null;
  }

  const fp = {
    kind: "schema-object",
    type,
    format: typeof node.format === "string" ? node.format : null,
    enum: enumValues,
    constJson: hasConst ? stableLiteral(node.const) : null,
    required: objectRelevant ? sortedStrings(node.required) : null,
    additionalProperties,
    properties,
    propertiesKeys: properties ? Object.keys(properties).sort() : null,
    items: arrayRelevant ? fingerprintItems(node.items, doc, depth) : null,
    itemsType:
      arrayRelevant && node.items && typeof node.items === "object" && !Array.isArray(node.items)
        ? normalizeType(node.items.type)
        : null,
    minLength: stringRelevant && encodeNumber(node.minLength) !== 0 ? encodeNumber(node.minLength) : null,
    maxLength: stringRelevant ? encodeNumber(node.maxLength) : null,
    minimum: numberRelevant ? encodeNumber(node.minimum) : null,
    maximum: numberRelevant ? encodeNumber(node.maximum) : null,
    exclusiveMinimum: numberRelevant ? boundOrNull(node.exclusiveMinimum) : null,
    exclusiveMaximum: numberRelevant ? boundOrNull(node.exclusiveMaximum) : null,
    minItems: arrayRelevant && encodeNumber(node.minItems) !== 0 ? encodeNumber(node.minItems) : null,
    maxItems: arrayRelevant ? encodeNumber(node.maxItems) : null,
    pattern: stringRelevant && typeof node.pattern === "string" ? node.pattern : null,
    nullable: node.nullable === true,
    unsupportedKeywords: unsupported.length ? unsupported : null,
  };

  const { kind, nullable, unsupportedKeywords: unsupportedList, ...constraints } = fp;
  void kind;
  if (
    !nullable &&
    !unsupportedList &&
    Object.values(constraints).every((value) => value === null || isTrueSchemaFingerprint(value))
  ) {
    return trueSchemaFingerprint();
  }
  return fp;
}

function emptySchemaFingerprint() {
  return {
    kind: "schema-object",
    type: null,
    format: null,
    enum: null,
    constJson: null,
    required: null,
    additionalProperties: null,
    properties: null,
    propertiesKeys: null,
    items: null,
    itemsType: null,
    minLength: null,
    maxLength: null,
    minimum: null,
    maximum: null,
    exclusiveMinimum: null,
    exclusiveMaximum: null,
    minItems: null,
    maxItems: null,
    pattern: null,
    nullable: false,
    unsupportedKeywords: null,
  };
}

function fingerprintSiblingConstraints(node, doc, depth) {
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
  return schemaObjectFingerprint(rest, doc, depth);
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
    const resolved = resolveLocalRefTarget(doc, node.$ref);
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
    const siblings = fingerprintSiblingConstraints(node, doc, depth);
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
  if (unique.length && classified.class !== "remote-ref") {
    return { class: "unknown", reason: "unsupported-keyword", keywords: unique };
  }
  if (
    beforeFp?.kind === "schema-object" &&
    afterFp?.kind === "schema-object" &&
    Boolean(beforeFp.nullable) !== Boolean(afterFp.nullable)
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

function effectiveBound(fp, inclusiveKey, exclusiveKey, lower) {
  const inclusive = decodeBound(fp[inclusiveKey]);
  const exclusive = exclusiveKey ? decodeBound(fp[exclusiveKey]) : null;
  if (typeof inclusive === "boolean" || typeof exclusive === "boolean") return { incomparable: true };
  if (inclusive && typeof inclusive === "object") return { incomparable: true };
  if (exclusive && typeof exclusive === "object") return { incomparable: true };
  if (inclusive === null && exclusive === null) return null;
  if (inclusive === null) return { value: exclusive, exclusive: true };
  if (exclusive === null) return { value: inclusive, exclusive: false };
  if (inclusive === exclusive) return { value: inclusive, exclusive: true };
  const exclusiveWins = lower ? exclusive > inclusive : exclusive < inclusive;
  return exclusiveWins
    ? { value: exclusive, exclusive: true }
    : { value: inclusive, exclusive: false };
}

function compareEffectiveBound(before, after, lower) {
  if (before?.incomparable || after?.incomparable) return "incomparable";
  if (before === null && after === null) return "same";
  if (before === null) return "tighter";
  if (after === null) return "weaker";
  if (before.value === after.value) {
    if (before.exclusive === after.exclusive) return "same";
    return after.exclusive ? "tighter" : "weaker";
  }
  if (lower) return after.value > before.value ? "tighter" : "weaker";
  return after.value < before.value ? "tighter" : "weaker";
}

function intervalIsEmpty(lower, upper) {
  if (!lower || !upper || lower.incomparable || upper.incomparable) return false;
  return lower.value > upper.value ||
    (lower.value === upper.value && (lower.exclusive || upper.exclusive));
}

function boundDirections(before, after, lowerKey, upperKey, exclusiveLowerKey = null, exclusiveUpperKey = null) {
  const beforeLower = effectiveBound(before, lowerKey, exclusiveLowerKey, true);
  const afterLower = effectiveBound(after, lowerKey, exclusiveLowerKey, true);
  const beforeUpper = effectiveBound(before, upperKey, exclusiveUpperKey, false);
  const afterUpper = effectiveBound(after, upperKey, exclusiveUpperKey, false);
  if (intervalIsEmpty(beforeLower, beforeUpper) || intervalIsEmpty(afterLower, afterUpper)) {
    return ["incomparable"];
  }
  return [
    compareEffectiveBound(beforeLower, afterLower, true),
    compareEffectiveBound(beforeUpper, afterUpper, false),
  ];
}

function classifyNumeric(before, after) {
  const directions = [
    ...boundDirections(before, after, "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"),
    ...boundDirections(before, after, "minLength", "maxLength"),
    ...boundDirections(before, after, "minItems", "maxItems"),
  ];
  if (directions.includes("incomparable")) {
    return { class: "unknown", reason: "numeric-incomparable" };
  }
  const tighter = directions.includes("tighter");
  const weaker = directions.includes("weaker");
  if (tighter) return { class: "breaking", reason: "numeric-tightened" };
  if (weaker) return { class: "compatible", reason: "numeric-weakened" };
  return null;
}

function classifyAdditionalProperties(before, after) {
  const beforeAp = before.additionalProperties || trueSchemaFingerprint();
  const afterAp = after.additionalProperties || trueSchemaFingerprint();
  if (JSON.stringify(beforeAp) === JSON.stringify(afterAp)) return null;
  const row = classifyPair(beforeAp, afterAp);
  if (row.class === "breaking") return { ...row, reason: "additionalProperties-tightened" };
  if (row.class === "compatible") return { ...row, reason: "additionalProperties-weakened" };
  return row;
}

function classifyItems(before, after) {
  const beforeItems = before.items || trueSchemaFingerprint();
  const afterItems = after.items || trueSchemaFingerprint();
  if (JSON.stringify(beforeItems) === JSON.stringify(afterItems)) return null;
  return classifyPair(beforeItems, afterItems);
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

function classifyConst(before, after) {
  if (before.constJson === after.constJson) return null;
  if (before.constJson === null) return { class: "breaking", reason: "structural-change" };
  if (after.constJson === null) return { class: "compatible", reason: "const-removed" };
  return { class: "breaking", reason: "structural-change" };
}

function classifyProperties(before, after) {
  const beforeProps = before.properties || null;
  const afterProps = after.properties || null;
  if (!beforeProps && !afterProps) return null;
  if (JSON.stringify(beforeProps) === JSON.stringify(afterProps)) return null;
  const names = new Set([...Object.keys(beforeProps || {}), ...Object.keys(afterProps || {})]);
  let worst = null;
  for (const name of names) {
    const left = beforeProps?.[name] || before.additionalProperties || trueSchemaFingerprint();
    const right = afterProps?.[name] || after.additionalProperties || trueSchemaFingerprint();
    const row = classifyPair(left, right);
    if (!row || row.class === "unchanged") continue;
    worst = worst ? combineClass(worst, row) : row;
  }
  return worst;
}

function classifySchemaConstraints(before, after) {
  if (before.kind !== "schema-object" || after.kind !== "schema-object") return null;
  const deltas = [];
  const sameFiniteEnum = before.enum && after.enum && JSON.stringify(before.enum) === JSON.stringify(after.enum);
  const sameConst = before.constJson !== null && before.constJson === after.constJson;
  const typeDelta = sameFiniteEnum || sameConst ? null : classifyTypeDirection(before.type, after.type);
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
  const constant = classifyConst(before, after);
  if (constant) deltas.push(constant);
  const pattern = classifyPattern(before, after);
  if (pattern) deltas.push(pattern);
  const properties = classifyProperties(before, after);
  if (properties) deltas.push(properties);

  const finiteConstraintPresent = Boolean(
    before.enum || after.enum || before.constJson !== null || after.constJson !== null
  );
  const otherConstraintDelta = Boolean(
    typeDelta || required || numeric || additional || items || pattern || properties
  );
  if (finiteConstraintPresent && (otherConstraintDelta || (enumerated && constant))) {
    return { class: "unknown", reason: "constraint-interaction-unsupported" };
  }

  const tightening = deltas.find((delta) => delta.class === "breaking");
  const weakening = deltas.find((delta) => delta.class === "compatible");
  if (tightening && weakening) {
    return { class: "unknown", reason: "constraint-interaction-unsupported" };
  }
  if (tightening) return tightening;
  if (deltas.some((delta) => delta.class === "unknown")) {
    return deltas.find((delta) => delta.class === "unknown");
  }
  if (before.format !== after.format) return { class: "unknown", reason: "format-semantics-unsupported" };
  if (weakening) return weakening;
  const added = deltas.find((delta) => delta.class === "added" || delta.class === "deleted");
  if (added) return added;
  return { class: "unchanged", reason: "structural-equal" };
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
  if (
    (target.class === "breaking" && siblings.class === "compatible") ||
    (target.class === "compatible" && siblings.class === "breaking")
  ) {
    return { class: "unknown", reason: "constraint-interaction-unsupported" };
  }
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
