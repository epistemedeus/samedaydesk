// Ordinary caller-owned readiness input.
// Uses the maintained decimal contract and supplied-row bounds.
// Does not fetch, repair, quote, or import the server.

import {
  PRICE_PATTERN,
  classifySchema,
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
  if (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(deadline)) {
    throw suppliedFail("deadline_invalid", "deadline is not a UTC timestamp");
  }
  const parsed = Date.parse(deadline);
  if (Number.isNaN(parsed)) throw suppliedFail("deadline_invalid", "deadline is not a UTC timestamp");
  if (parsed <= now) throw suppliedFail("deadline_passed", "deadline has passed");
}

function hasCombinator(node) {
  return isPlainJson(node) && COMBINATORS.some((key) => Object.prototype.hasOwnProperty.call(node, key));
}

function schemaGuarantee(schema) {
  const data = isPlainJson(schema) ? schema.properties?.data : undefined;
  const quote = isPlainJson(data) ? data.properties?.quote : undefined;
  if (hasCombinator(schema) || hasCombinator(data) || hasCombinator(quote)) {
    return { state: "fail", code: "schema_unsupported" };
  }
  if (isPlainJson(quote)) {
    const types = Array.isArray(quote.type) ? quote.type : typeof quote.type === "string" ? [quote.type] : [];
    if (quote.nullable === true || types.includes("null")) {
      return { state: "fail", code: "type_not_guaranteed:data.quote" };
    }
    if (types.includes("array")) return { state: "fail", code: "type_not_guaranteed:data.quote:array" };
    if (types.length > 0 && types.some((type) => type !== "string")) {
      return { state: "fail", code: "type_not_guaranteed:data.quote" };
    }
    if (Array.isArray(quote.enum)) {
      const guaranteed = quote.enum.length > 0 && quote.enum.every((value) => typeof value === "string" && PRICE_PATTERN.test(value));
      if (!guaranteed) return { state: "fail", code: "enum_not_guaranteed:data.quote" };
    }
  }
  return classifySchema(schema, [OWNED_POINTER]);
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
  const schema = schemaGuarantee(input.schema);
  const semantic = semanticResult(input.value);
  const nextAction = schema.state === "fail"
    ? schema.code
    : semantic.state === "pass"
      ? "decimal_match"
      : `${semantic.code}:${semantic.pointer}:${semantic.shape}`;
  return finish({
    fit: schema.code === "schema_unsupported" ? "no_fit" : "diagnosed",
    method: input.method,
    path: input.path,
    schema,
    semantic,
    nextAction,
  }, started, clock);
}
