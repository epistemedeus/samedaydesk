// Ordinary caller-owned readiness input.
// Uses the maintained decimal contract and supplied-row bounds.
// Does not fetch, repair, quote, or import the server.

import {
  PRICE_PATTERN,
  classifySchema,
  sameJson,
  semanticResult,
} from "./readiness-contract.mjs";
import {
  MAX_BYTES,
  WORK_LIMIT_MS,
  assertSuppliedRoute,
  inspectSupplied,
  isPlainJson,
  suppliedFail,
} from "./supplied-bounds.mjs";

export const FEATURE = "codex/task-readiness-caller-2111013";
export const CALLER_PIN = "00267aeb03c3ce01b9b318f5ee0172aee34d7e34";
export const STALE_CALLER_PIN = "259ea74da295f12d64e2aae9cb2042c4a14c6b96";
export const OWNED_POINTER = "data.quote";

const CALLER_KEYS = new Set(["method", "path", "schema", "value", "semantic", "pin", "deadline"]);
const SEMANTIC_KEYS = new Set(["pointer", "pattern"]);
const EXTRA_HOSTILE = new Set(["coldStart", "argv", "url", "fixture"]);
const COMBINATORS = Object.freeze([
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "patternProperties",
]);
const SCHEMA_IDLE = Object.freeze({ state: "not_invoked", code: null });
const SEMANTIC_IDLE = Object.freeze({
  state: "not_invoked",
  code: null,
  pointer: null,
  shape: "not_invoked",
});

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function decision(partial) {
  return {
    feature: FEATURE,
    fit: partial.fit,
    method: partial.method ?? null,
    path: partial.path ?? null,
    schema: partial.schema,
    semantic: partial.semantic,
    guarantee: partial.guarantee ?? { state: "not_invoked", code: null },
    nextAction: partial.nextAction,
    quoteGenerated: false,
    paymentSent: false,
    repairPosted: false,
    coldStartExecuted: false,
    routeFetched: false,
    completedUserTask: false,
    faithfulInvocation: false,
    outsideAcceptance: "not_observed",
    savingsClaim: false,
    directPathRetained: true,
    cost: { state: "unknown", amount: null, currency: null },
    elapsedMs: partial.elapsedMs,
  };
}

function finish(partial, started, clock) {
  const elapsedMs = roundMs(clock() - started);
  if (elapsedMs > WORK_LIMIT_MS) throw suppliedFail("work_limit", "caller work limit");
  return decision({ ...partial, elapsedMs });
}

function assertOnly(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw suppliedFail("unknown_property", "object contains an unknown property");
  }
}

function assertPin(input) {
  if (!Object.hasOwn(input, "pin")) throw suppliedFail("pin_required", "pin is required");
  const { pin } = input;
  if (typeof pin !== "string" || !/^[0-9a-f]{40}$/.test(pin)) {
    throw suppliedFail("pin_mismatch", "pin is not the supported checker pin");
  }
  if (pin === STALE_CALLER_PIN) throw suppliedFail("stale_pin", "pin is a stale checker");
  if (pin !== CALLER_PIN) throw suppliedFail("pin_mismatch", "pin is not the supported checker pin");
}

function assertDeadline(input, now) {
  if (!Object.hasOwn(input, "deadline")) throw suppliedFail("deadline_required", "deadline is required");
  const { deadline } = input;
  const match = typeof deadline === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(deadline)
    : null;
  if (!match) throw suppliedFail("deadline_invalid", "deadline is not a UTC timestamp");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "0";
  const ms = Number(fraction.padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || ms > 999) {
    throw suppliedFail("deadline_invalid", "deadline is not a UTC timestamp");
  }
  const instant = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(instant);
  const fieldsMatch = check.getUTCFullYear() === year
    && check.getUTCMonth() === month - 1
    && check.getUTCDate() === day
    && check.getUTCHours() === hour
    && check.getUTCMinutes() === minute
    && check.getUTCSeconds() === second
    && check.getUTCMilliseconds() === ms;
  if (!fieldsMatch) throw suppliedFail("deadline_invalid", "deadline is not a UTC timestamp");
  if (instant <= now) throw suppliedFail("deadline_passed", "deadline has passed");
}

const JSON_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const ANNOTATIONS = new Set([
  "title",
  "description",
  "examples",
  "example",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
]);
const OBJECT_KEYS = new Set(["type", "properties", "required", "nullable", "additionalProperties", ...ANNOTATIONS]);
const QUOTE_KEYS = new Set(["enum", "const", "pattern", "minLength", "maxLength", ...OBJECT_KEYS]);
const SHAPE_IDLE = Object.freeze({ state: "not_invoked", code: null });

function hasCombinator(node) {
  return isPlainJson(node) && COMBINATORS.some((key) => Object.prototype.hasOwnProperty.call(node, key));
}

function unsupported(code) {
  return { state: "unsupported", code };
}

function typeList(node) {
  if (!isPlainJson(node) || !Object.hasOwn(node, "type")) return [];
  return Array.isArray(node.type) ? node.type : [node.type];
}

function exactly(list, type) {
  return list.length === 1 && list[0] === type;
}

function nullableNode(node, types) {
  return node.nullable === true || types.includes("null");
}

function jsonKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value, types) {
  if (types.length === 0) return true;
  const actual = jsonKind(value);
  return types.some((type) => {
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "object") return isPlainJson(value);
    return actual === type;
  });
}

function keywordProblem(node, allowed) {
  if (!isPlainJson(node)) return unsupported("schema_malformed");
  if (hasCombinator(node)) return unsupported("schema_unsupported");
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) return unsupported(`schema_unsupported:${key}`);
  }
  if (Object.hasOwn(node, "type")) {
    const types = typeList(node);
    if (types.length === 0 || types.some((item) => typeof item !== "string" || !JSON_TYPES.has(item))) {
      return unsupported("schema_malformed");
    }
  }
  if (Object.hasOwn(node, "required") && (!Array.isArray(node.required) || node.required.some((item) => typeof item !== "string"))) {
    return unsupported("schema_malformed");
  }
  if (Object.hasOwn(node, "properties") && !isPlainJson(node.properties)) return unsupported("schema_malformed");
  if (Object.hasOwn(node, "nullable") && typeof node.nullable !== "boolean") return unsupported("schema_malformed");
  if (Object.hasOwn(node, "additionalProperties") && typeof node.additionalProperties !== "boolean") {
    return unsupported("schema_unsupported");
  }
  return null;
}

function quoteKeywordProblem(quote) {
  const base = keywordProblem(quote, QUOTE_KEYS);
  if (base) return base;
  if (Object.hasOwn(quote, "enum") && !Array.isArray(quote.enum)) return unsupported("schema_malformed");
  if (Object.hasOwn(quote, "pattern") && typeof quote.pattern !== "string") return unsupported("schema_malformed");
  for (const key of ["minLength", "maxLength"]) {
    if (!Object.hasOwn(quote, key)) continue;
    const value = quote[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return unsupported("schema_malformed");
  }
  if (Object.hasOwn(quote, "minLength") && Object.hasOwn(quote, "maxLength") && quote.minLength > quote.maxLength) {
    return unsupported("schema_malformed");
  }
  return null;
}

function guaranteeFor(schema) {
  if (schema == null) {
    return { state: "unproved", code: classifySchema(schema, [OWNED_POINTER]).code };
  }
  const rootProblem = keywordProblem(schema, OBJECT_KEYS);
  if (rootProblem) return rootProblem;
  const data = isPlainJson(schema.properties) ? schema.properties.data : undefined;
  if (data !== undefined && !isPlainJson(data)) return unsupported("schema_malformed");
  if (isPlainJson(data)) {
    const dataProblem = keywordProblem(data, OBJECT_KEYS);
    if (dataProblem) return dataProblem;
    const quote = isPlainJson(data.properties) ? data.properties.quote : undefined;
    if (quote !== undefined && !isPlainJson(quote)) return unsupported("schema_malformed");
    if (isPlainJson(quote)) {
      const quoteProblem = quoteKeywordProblem(quote);
      if (quoteProblem) return quoteProblem;
    }
  }
  const rootTypes = typeList(schema);
  if (!exactly(rootTypes, "object") || nullableNode(schema, rootTypes)) {
    return { state: "unproved", code: "type_not_guaranteed" };
  }
  if (!Array.isArray(schema.required) || !schema.required.includes("data")) {
    return { state: "unproved", code: "required_not_guaranteed:data" };
  }
  if (!isPlainJson(data)) return { state: "unproved", code: "quote_schema_absent:data.quote" };
  const dataTypes = typeList(data);
  if (!exactly(dataTypes, "object") || nullableNode(data, dataTypes)) {
    return { state: "unproved", code: "type_not_guaranteed:data" };
  }
  const classified = classifySchema(schema, [OWNED_POINTER]);
  if (classified.state === "fail") return { state: "unproved", code: classified.code };
  const quote = isPlainJson(data.properties) ? data.properties.quote : undefined;
  if (!isPlainJson(quote)) return { state: "unproved", code: "quote_schema_absent:data.quote" };
  const quoteTypes = typeList(quote);
  if (quoteTypes.length === 0) return { state: "unproved", code: "type_not_guaranteed:data.quote" };
  if (nullableNode(quote, quoteTypes)) return { state: "unproved", code: "type_not_guaranteed:data.quote" };
  if (quoteTypes.includes("array")) return { state: "unproved", code: "type_not_guaranteed:data.quote:array" };
  if (!exactly(quoteTypes, "string")) return { state: "unproved", code: "type_not_guaranteed:data.quote" };
  if (Array.isArray(quote.enum)) {
    const decimalEnum = quote.enum.length > 0 && quote.enum.every((item) => typeof item === "string" && PRICE_PATTERN.test(item));
    if (!decimalEnum) return { state: "unproved", code: "enum_not_guaranteed:data.quote" };
  }
  if (Object.hasOwn(quote, "const")) {
    if (typeof quote.const !== "string" || !PRICE_PATTERN.test(quote.const)) {
      return unsupported("const_not_decimal:data.quote");
    }
    if (Array.isArray(quote.enum) && !quote.enum.includes(quote.const)) return unsupported("schema_malformed");
  }
  if (Object.hasOwn(quote, "pattern") && quote.pattern !== PRICE_PATTERN.source) {
    return unsupported("pattern_unsupported:data.quote");
  }
  const restricts = (Array.isArray(quote.enum) && quote.enum.length > 0)
    || (typeof quote.const === "string" && PRICE_PATTERN.test(quote.const))
    || quote.pattern === PRICE_PATTERN.source;
  if (!restricts) return { state: "unproved", code: "guarantee_unproved:data.quote" };
  return { state: "proved", code: null };
}

function failShape(code) {
  return { state: "fail", code };
}

function shapeFor(schema, value) {
  const rootTypes = typeList(schema);
  if (rootTypes.length && !matchesType(value, rootTypes)) return failShape("type_mismatch");
  if (!isPlainJson(value)) return { state: "pass", code: null };
  if (schema.additionalProperties === false && isPlainJson(schema.properties)) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) return failShape("unexpected_property");
    }
  }
  if (Array.isArray(schema.required) && schema.required.includes("data") && !Object.hasOwn(value, "data")) {
    return failShape("required_missing:data");
  }
  const dataSchema = isPlainJson(schema.properties) ? schema.properties.data : undefined;
  if (!isPlainJson(dataSchema) || !Object.hasOwn(value, "data")) return { state: "pass", code: null };
  const dataTypes = typeList(dataSchema);
  if (dataTypes.length && !matchesType(value.data, dataTypes)) return failShape("type_mismatch:data");
  if (!isPlainJson(value.data)) return { state: "pass", code: null };
  if (dataSchema.additionalProperties === false && isPlainJson(dataSchema.properties)) {
    for (const key of Object.keys(value.data)) {
      if (!Object.hasOwn(dataSchema.properties, key)) return failShape("unexpected_property:data");
    }
  }
  if (Array.isArray(dataSchema.required) && dataSchema.required.includes("quote") && !Object.hasOwn(value.data, "quote")) {
    return failShape("required_missing:data.quote");
  }
  if (!Object.hasOwn(value.data, "quote")) return { state: "pass", code: null };
  const quoteSchema = isPlainJson(dataSchema.properties) ? dataSchema.properties.quote : undefined;
  if (!isPlainJson(quoteSchema)) return { state: "pass", code: null };
  const quote = value.data.quote;
  const quoteTypes = typeList(quoteSchema);
  if (quoteTypes.length && !matchesType(quote, quoteTypes)) return failShape("type_mismatch:data.quote");
  if (Object.hasOwn(quoteSchema, "const") && !sameJson(quote, quoteSchema.const)) {
    return failShape("const_mismatch:data.quote");
  }
  if (Array.isArray(quoteSchema.enum) && !quoteSchema.enum.some((item) => sameJson(item, quote))) {
    return failShape("enum_mismatch:data.quote");
  }
  if (typeof quote === "string") {
    if (Number.isSafeInteger(quoteSchema.minLength) && quote.length < quoteSchema.minLength) {
      return failShape("length_mismatch:data.quote");
    }
    if (Number.isSafeInteger(quoteSchema.maxLength) && quote.length > quoteSchema.maxLength) {
      return failShape("length_mismatch:data.quote");
    }
  }
  return { state: "pass", code: null };
}

function selectDiagnosis(guarantee, shape, semantic) {
  if (guarantee.state === "unsupported") return { fit: "no_fit", nextAction: guarantee.code };
  if (shape.state === "fail") return { fit: "diagnosed", nextAction: shape.code };
  if (guarantee.state !== "proved") return { fit: "diagnosed", nextAction: guarantee.code };
  if (semantic.state !== "pass") {
    return { fit: "diagnosed", nextAction: `${semantic.code}:${semantic.pointer}:${semantic.shape}` };
  }
  return { fit: "diagnosed", nextAction: "decimal_match" };
}

export function diagnoseCallerContract(input, options = {}) {
  const clock = options.clock ?? performance.now.bind(performance);
  const started = clock();
  const now = options.now ?? Date.now();
  if (!isPlainJson(input)) throw suppliedFail("invalid_shape", "body must be a JSON object");
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_BYTES) {
    throw suppliedFail("oversized_input", "body exceeds the supplied-row byte limit");
  }
  inspectSupplied(input, 0, EXTRA_HOSTILE);
  assertOnly(input, CALLER_KEYS);
  assertPin(input);
  assertDeadline(input, now);
  for (const key of ["method", "path", "schema", "value", "semantic"]) {
    if (!Object.hasOwn(input, key)) {
      return finish({
        fit: "missing_input",
        method: Object.hasOwn(input, "method") ? input.method : null,
        path: Object.hasOwn(input, "path") ? input.path : null,
        schema: SCHEMA_IDLE,
        semantic: SEMANTIC_IDLE,
        nextAction: `missing_input:${key}`,
      }, started, clock);
    }
  }
  assertSuppliedRoute(input.path);
  if (!isPlainJson(input.semantic)) throw suppliedFail("invalid_shape", "semantic contract must be an object");
  assertOnly(input.semantic, SEMANTIC_KEYS);
  if (!Object.hasOwn(input.semantic, "pointer")) {
    return finish({
      fit: "missing_input",
      method: input.method,
      path: input.path,
      schema: SCHEMA_IDLE,
      semantic: SEMANTIC_IDLE,
      nextAction: "missing_input:semantic.pointer",
    }, started, clock);
  }
  if (!Object.hasOwn(input.semantic, "pattern")) {
    return finish({
      fit: "missing_input",
      method: input.method,
      path: input.path,
      schema: SCHEMA_IDLE,
      semantic: { ...SEMANTIC_IDLE, pointer: typeof input.semantic.pointer === "string" ? input.semantic.pointer : null },
      nextAction: "missing_input:semantic.pattern",
    }, started, clock);
  }
  if (input.method !== "GET" && input.method !== "POST") {
    return finish({
      fit: "no_fit",
      method: input.method,
      path: input.path,
      schema: SCHEMA_IDLE,
      semantic: SEMANTIC_IDLE,
      nextAction: "no_fit:method",
    }, started, clock);
  }
  if (input.semantic.pointer !== OWNED_POINTER || input.semantic.pattern !== PRICE_PATTERN.source) {
    return finish({
      fit: "no_fit",
      method: input.method,
      path: input.path,
      schema: SCHEMA_IDLE,
      semantic: {
        state: "not_invoked",
        code: null,
        pointer: typeof input.semantic.pointer === "string" ? input.semantic.pointer : null,
        shape: "not_invoked",
      },
      nextAction: "no_fit:semantic_contract",
    }, started, clock);
  }
  if (!(input.schema === null || isPlainJson(input.schema))) {
    throw suppliedFail("invalid_shape", "schema must be an object or null");
  }
  const semantic = semanticResult(input.value);
  const guarantee = guaranteeFor(input.schema);
  const shape = input.schema == null || guarantee.state === "unsupported"
    ? SHAPE_IDLE
    : shapeFor(input.schema, input.value);
  const selected = selectDiagnosis(guarantee, shape, semantic);
  return finish({
    fit: selected.fit,
    method: input.method,
    path: input.path,
    schema: shape,
    guarantee,
    semantic,
    nextAction: selected.nextAction,
  }, started, clock);
}
