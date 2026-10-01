// Offline success-contract repair for paid_get and paid_post.
// Schema checks go through client/scripts/validateJsonSchema.mjs.
// OpenAPI success-schema lookup follows the local $ref and application/json
// rules in experiments/s134-record-jobs/modules/openapi-impact/cli.mjs
// (summarizeResponses / resolveLocalRef). This module does not fetch, and it
// does not write a seller repository.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonSchema } from "../../../client/scripts/validateJsonSchema.mjs";

export const CONTRACT_REPAIR_SCHEMA = "samedaydesk.maint.contract-repair.handoff.v1";
export const CONTRACT_REPAIR_JOB = "L08-REAL-REPAIR-093097";
export const CONTRACT_REPAIR_PRIOR_HEAD = "33022efda1168a918fe4170840b46a2752e256a4";
export const CONFIRMATION = "Required fields are the intersection of the supplied success bodies. The owner confirms them before applying this patch.";
export const REUSED_COMPONENTS = [
  "client/scripts/validateJsonSchema.mjs",
  "experiments/s134-record-jobs/modules/openapi-impact/cli.mjs",
];
export const MAX_BYTES = 65536;
export const MAX_OBSERVATIONS = 8;
export const MAX_DEPTH = 8;
export const MAX_KEYS = 32;
export const MAX_STRING = 4096;

const ROUTE_METHODS = { paid_get: "GET", paid_post: "POST" };
const UNSUPPORTED = new Set([
  "oneOf", "anyOf", "allOf", "not", "if", "then", "else",
  "patternProperties", "prefixItems", "dependentSchemas", "dependentRequired",
]);
const SECRET_KEY = /^(authorization|proxy-authorization|api[-_]?key|x-api-key|token|access[-_]?token|refresh[-_]?token|secret|password|passwd|private[-_]?key|credential|cookie|set-cookie|session)$/i;
const SECRET_VALUE = [
  /bearer\s+\S+/i,
  /\bsk_(live|test)_[A-Za-z0-9]+/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /plink_/,
  /:\/\//,
];

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "../fixtures/contract-repair");

export const CONTRACT_CALLERS = [
  { callerId: "local-paid-get-object", file: "paid-get-object.json" },
  { callerId: "local-paid-post-array", file: "paid-post-array.json" },
];

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function secretString(value) {
  return SECRET_VALUE.some((pattern) => pattern.test(value));
}

function keyLeaks(key) {
  return secretString(key) || key.includes("://") || key.includes("plink_") || key.includes("@");
}

export function redactValue(value, state = { count: 0, secrets: [] }, keyName = "") {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, state));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (keyLeaks(key)) {
        state.count += 1;
        state.secrets.push(key);
        continue;
      }
      if (SECRET_KEY.test(key) && typeof child === "string") {
        state.count += 1;
        state.secrets.push(child);
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactValue(child, state, key);
    }
    return out;
  }
  if (typeof value === "string" && secretString(value)) {
    state.count += 1;
    state.secrets.push(value);
    return "[redacted]";
  }
  return value;
}

function walkLimits(value, depth = 0, maxDepth = MAX_DEPTH, maxKeys = MAX_KEYS) {
  if (depth > maxDepth) return "oversized_input";
  if (typeof value === "string" && value.length > MAX_STRING) return "oversized_input";
  if (Array.isArray(value)) {
    if (value.length > maxKeys) return "oversized_input";
    for (const item of value) {
      const problem = walkLimits(item, depth + 1, maxDepth, maxKeys);
      if (problem) return problem;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length > maxKeys) return "oversized_input";
    for (const key of keys) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") return "malformed_input";
      if (key.length > 128) return "oversized_input";
      const problem = walkLimits(value[key], depth + 1, maxDepth, maxKeys);
      if (problem) return problem;
    }
  }
  return null;
}

function pointerEscape(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointerUnescape(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function unsupportedKeyword(schema, path = "$") {
  if (!schema || typeof schema !== "object") return null;
  if (Array.isArray(schema)) return unsupportedKeyword(schema[0], path);
  for (const key of Object.keys(schema)) {
    if (UNSUPPORTED.has(key)) return { keyword: key, path };
  }
  if (Array.isArray(schema.type) && schema.type.length > 1) {
    return { keyword: "type-union", path };
  }
  if (schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      const found = unsupportedKeyword(child, `${path}.${key}`);
      if (found) return found;
    }
  }
  if (schema.items) return unsupportedKeyword(schema.items, `${path}[]`);
  return null;
}

function resolveLocalRef(doc, ref, seen = new Set()) {
  if (typeof ref !== "string") return { ok: false, reason: "ref_not_string" };
  if (!ref.startsWith("#/")) return { ok: false, reason: "remote_ref", ref };
  if (seen.has(ref)) return { ok: false, reason: "cyclic_ref", ref };
  const nextSeen = new Set(seen);
  nextSeen.add(ref);
  let cursor = doc;
  for (const part of ref.slice(2).split("/").map(pointerUnescape)) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return { ok: false, reason: "missing_local_ref", ref };
    }
    cursor = cursor[part];
  }
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor) && typeof cursor.$ref === "string" && Object.keys(cursor).length === 1) {
    return resolveLocalRef(doc, cursor.$ref, nextSeen);
  }
  return { ok: true, value: cursor };
}

function mediaSchema(content, doc) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return { schema: null };
  const jsonKeys = Object.keys(content).filter((key) => key === "application/json" || key.startsWith("application/json;"));
  if (jsonKeys.length !== 1) return { schema: null, media: jsonKeys };
  const schema = content[jsonKeys[0]]?.schema;
  if (schema && typeof schema === "object" && !Array.isArray(schema) && typeof schema.$ref === "string" && Object.keys(schema).length === 1) {
    const resolved = resolveLocalRef(doc, schema.$ref);
    if (!resolved.ok) return { schema: null, refError: resolved };
    return { schema: resolved.value, mediaType: jsonKeys[0] };
  }
  return { schema: schema === undefined ? null : schema, mediaType: jsonKeys[0] };
}

function responseObject(response, doc) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return response;
  if (typeof response.$ref === "string" && Object.keys(response).length === 1) {
    const resolved = resolveLocalRef(doc, response.$ref);
    if (!resolved.ok) return { refError: resolved };
    return resolved.value;
  }
  return response;
}

export function extractSuccessSchema(request) {
  const contract = request.contract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { error: "malformed_input" };
  }
  if (contract.kind === "json-schema") {
    if (!Object.prototype.hasOwnProperty.call(contract, "schema") || contract.schema == null) {
      return { present: false, schema: null, pointer: "/schema", carrierKind: "json-schema" };
    }
    if (typeof contract.schema !== "object" && typeof contract.schema !== "boolean") {
      return { error: "malformed_input" };
    }
    let schema = contract.schema;
    if (schema && typeof schema === "object" && !Array.isArray(schema) && typeof schema.$ref === "string" && Object.keys(schema).length === 1) {
      const resolved = resolveLocalRef(contract, schema.$ref);
      if (!resolved.ok) return { question: refQuestion(resolved) };
      schema = resolved.value;
    }
    return { present: true, schema, pointer: "/schema", carrierKind: "json-schema" };
  }
  if (contract.kind !== "openapi") return { error: "malformed_input" };
  const doc = contract.document;
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !doc.paths || typeof doc.paths !== "object") {
    return { error: "malformed_input" };
  }
  const pathItem = doc.paths[request.path];
  const operation = pathItem?.[request.method.toLowerCase()];
  if (!operation || typeof operation !== "object") {
    return {
      question: `The supplied OpenAPI document has no ${request.method} ${request.path} operation. Which operation returns the success body?`,
    };
  }
  const responses = operation.responses;
  if (!responses || typeof responses !== "object") return { present: false, schema: null, carrierKind: "openapi" };
  const codes = Object.keys(responses).filter((code) => /^2\d\d$/.test(code)).sort();
  const found = [];
  for (const code of codes) {
    const body = responseObject(responses[code], doc);
    if (body?.refError) return { question: refQuestion(body.refError) };
    const media = mediaSchema(body?.content, doc);
    if (media.refError) return { question: refQuestion(media.refError) };
    if (media.schema != null) found.push({ code, schema: media.schema });
  }
  if (found.length === 0) return { present: false, schema: null, carrierKind: "openapi" };
  if (found.length > 1) {
    const forms = new Set(found.map((item) => stable(structuralSchema(item.schema))));
    if (forms.size > 1) {
      return {
        question: `Success statuses ${found.map((item) => item.code).join(" and ")} declare different application/json schemas. Which status is the buyer success contract?`,
      };
    }
  }
  return { present: true, schema: found[0].schema, status: found[0].code, carrierKind: "openapi" };
}

function refQuestion(error) {
  if (error.reason === "remote_ref") {
    return "The success schema uses a non-local $ref. Supply that schema inside this document. Which local schema should the patch use?";
  }
  if (error.reason === "cyclic_ref") {
    return "The success schema $ref is cyclic. Which schema should be inlined for this operation?";
  }
  return "The success schema $ref is not present in the supplied document. Which schema should the patch use?";
}

function structuralSchema(schema) {
  if (schema === true) return { unconstrained: true };
  if (schema === false) return { type: "never" };
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { type: "never" };
  const out = {};
  if (schema.type) {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).map((type) => (type === "integer" ? "number" : type));
    out.type = types.length === 1 ? types[0] : types;
  }
  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    out.properties = {};
    for (const key of Object.keys(schema.properties).sort()) {
      out.properties[key] = structuralSchema(schema.properties[key]);
    }
    if (!out.type) out.type = "object";
  }
  if (Array.isArray(schema.required)) out.required = [...schema.required].map(String).sort();
  if (schema.items && typeof schema.items === "object") {
    out.items = structuralSchema(schema.items);
    if (!out.type) out.type = "array";
  }
  if (schema.additionalProperties === false) out.additionalProperties = false;
  for (const key of ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]) {
    if (typeof schema[key] === "number") out[key] = schema[key];
  }
  return out;
}

function validatorSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = Array.isArray(schema) ? [] : {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && value === "integer") out[key] = "number";
    else if (key === "type" && Array.isArray(value)) out[key] = value.map((item) => (item === "integer" ? "number" : item));
    else if (value && typeof value === "object") out[key] = validatorSchema(value);
    else out[key] = value;
  }
  return out;
}

function safeValidate(value, schema) {
  try {
    if (typeof schema === "boolean" || schema?.type === "never" || schema?.unconstrained === true) {
      return { ok: true, errors: [] };
    }
    return { ok: true, errors: validateJsonSchema(value, validatorSchema(schema)) };
  } catch {
    return { ok: false, errors: [] };
  }
}

function effectiveType(schema) {
  if (!schema || schema.unconstrained) return null;
  if (typeof schema.type === "string") return schema.type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return null;
}

function isUnconstrained(schema, witnesses) {
  if (schema == null || schema === true || schema.unconstrained === true) return true;
  if (schema === false || schema.type === "never") return false;
  const types = new Set(witnesses.map(jsonType));
  if (!schema.type && !schema.properties && !schema.items && !schema.enum && !Object.prototype.hasOwnProperty.call(schema, "const")) {
    return true;
  }
  if (types.has("object") && effectiveType(schema) === "object" && !schema.properties) return true;
  if (types.has("array") && effectiveType(schema) === "array" && !schema.items) return true;
  if (effectiveType(schema) === "array" && schema.items) {
    const items = witnesses.flatMap((item) => (Array.isArray(item) ? item : []));
    if (items.length > 0 && isUnconstrained(schema.items, items)) return true;
  }
  return false;
}

function coversRequired(prior, proposed) {
  if (!proposed) return true;
  const proposedType = effectiveType(proposed);
  const priorType = effectiveType(prior);
  if (proposedType && priorType !== proposedType) return false;
  if (proposedType === "object") {
    const priorRequired = new Set(prior?.required || []);
    for (const key of proposed.required || []) {
      if (!priorRequired.has(key)) return false;
      if (!coversRequired(prior?.properties?.[key], proposed.properties?.[key])) return false;
    }
  }
  if (proposedType === "array" && proposed.items) return coversRequired(prior?.items, proposed.items);
  return true;
}

function evaluatePrior(priorSchema, proposedSchema, witnesses) {
  if (priorSchema == null) return { mismatch: true, reason: "missing_schema" };
  if (priorSchema === false || priorSchema.type === "never") return { mismatch: true, reason: "validation" };
  if (isUnconstrained(priorSchema, witnesses)) return { mismatch: true, reason: "unconstrained" };
  const checked = witnesses.map((witness) => safeValidate(witness, priorSchema));
  if (checked.some((item) => !item.ok)) return { mismatch: false, reason: "checker", checker: true };
  if (checked.some((item) => item.errors.length > 0)) return { mismatch: true, reason: "validation" };
  if (!coversRequired(structuralSchema(priorSchema), proposedSchema)) return { mismatch: true, reason: "under_specified" };
  return { mismatch: false, reason: "covered" };
}

function typeWitness(value) {
  const type = jsonType(value);
  if (type === "null") return null;
  if (type === "string") return "s";
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "array") return value.map(typeWitness);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = typeWitness(value[key]);
  return out;
}

function decoyFor(schema) {
  if (schema?.type === "object") return Array.isArray(schema.required) && schema.required.length > 0 ? {} : "not-an-object";
  if (schema?.type === "array" || schema?.type === "null" || schema?.type === "boolean") return {};
  if (schema?.type === "string") return 0;
  if (schema?.type === "number") return "not-a-number";
  return "not-the-success-shape";
}

function shapeSignature(value) {
  const type = jsonType(value);
  if (type === "object") {
    const parts = Object.keys(value).sort().map((key) => `${key}:${shapeSignature(value[key])}`);
    return `object{${parts.join(",")}}`;
  }
  if (type === "array") {
    const items = [...new Set(value.map(shapeSignature))].sort();
    return `array[${items.join("|")}]`;
  }
  return type;
}

function mergeValues(values, path) {
  const types = [...new Set(values.map(jsonType))];
  if (types.length !== 1) {
    const list = [...types].sort().join(" vs ");
    const question = types.includes("null")
      ? `Observations disagree on the JSON type at ${path} (${list}). Is null its own success branch?`
      : `Observations disagree on the JSON type at ${path} (${list}). Which type does every successful response use?`;
    return { ok: false, question };
  }
  const type = types[0];
  if (type === "null" || type === "string" || type === "number" || type === "boolean") {
    return { ok: true, schema: { type }, requiredPaths: [], optionalPaths: [] };
  }
  if (type === "array") {
    const items = values.flatMap((value) => value);
    if (items.length === 0) {
      return {
        ok: false,
        question: `The success bodies at ${path} are arrays with no items, so an item schema would be invented. Supply a non-empty array or the item contract.`,
      };
    }
    const merged = mergeValues(items, `${path}[]`);
    if (!merged.ok) return merged;
    return {
      ok: true,
      schema: { type: "array", items: merged.schema },
      requiredPaths: merged.requiredPaths,
      optionalPaths: merged.optionalPaths,
    };
  }
  const keys = [...new Set(values.flatMap((value) => Object.keys(value)))].sort();
  if (keys.length === 0) {
    return {
      ok: false,
      question: `The success bodies at ${path} are objects with no fields, so a required field list would be invented. Which fields does every success include?`,
    };
  }
  if (keys.some(keyLeaks)) {
    return {
      ok: false,
      question: "A field name looks like a credential and cannot be copied into the patch. Rename that field before requesting a repair.",
    };
  }
  const properties = {};
  const required = [];
  const requiredPaths = [];
  const optionalPaths = [];
  for (const key of keys) {
    const present = values.filter((value) => Object.prototype.hasOwnProperty.call(value, key));
    const child = mergeValues(present.map((value) => value[key]), `${path}.${key}`);
    if (!child.ok) return child;
    properties[key] = child.schema;
    if (present.length === values.length) {
      required.push(key);
      requiredPaths.push(`${path}.${key}`, ...child.requiredPaths);
      optionalPaths.push(...child.optionalPaths);
    } else {
      optionalPaths.push(`${path}.${key}`, ...child.requiredPaths, ...child.optionalPaths);
    }
  }
  const schema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return { ok: true, schema, requiredPaths, optionalPaths };
}

function refusesWallet(request) {
  if (!request || typeof request !== "object") return false;
  if (request.secondWallet === true || request.checkout === true || request.charge === true) return true;
  if (typeof request.wallet === "string" && request.wallet.length > 0 && request.wallet !== "none") return true;
  if (typeof request.paymentLink === "string" && request.paymentLink.length > 0) return true;
  return false;
}

function requestProblem(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return "malformed_input";
  if (refusesWallet(request)) return request.checkout === true || request.charge === true || request.paymentLink ? "checkout_refused" : "second_wallet_refused";
  if (typeof request.callerId !== "string" || !/^[a-z0-9-]{3,64}$/.test(request.callerId)) return "malformed_input";
  if (request.routeClass !== "paid_get" && request.routeClass !== "paid_post") return "malformed_input";
  if (request.method !== ROUTE_METHODS[request.routeClass]) return "malformed_input";
  if (typeof request.path !== "string" || !request.path.startsWith("/") || request.path.length > 200) return "malformed_input";
  if (!Array.isArray(request.observations)) return "malformed_input";
  if (request.observations.length > MAX_OBSERVATIONS) return "oversized_input";
  const observationLimit = walkLimits(request.observations);
  if (observationLimit) return observationLimit;
  const contractLimit = walkLimits(request.contract, 0, 16, 48);
  if (contractLimit) return contractLimit;
  if (request.coverage != null) {
    if (typeof request.coverage !== "object" || Array.isArray(request.coverage)) return "malformed_input";
    if (request.coverage.declaredBranches != null && !Number.isInteger(request.coverage.declaredBranches)) return "malformed_input";
    if (request.coverage.declaredBranches != null && (request.coverage.declaredBranches < 1 || request.coverage.declaredBranches > 8)) {
      return "malformed_input";
    }
  }
  if (request.submittedRepair != null) {
    if (typeof request.submittedRepair !== "object" || Array.isArray(request.submittedRepair) || !("schema" in request.submittedRepair)) {
      return "malformed_input";
    }
    const submittedLimit = walkLimits(request.submittedRepair, 0, 16, 48);
    if (submittedLimit) return submittedLimit;
  }
  return null;
}

function carrierFor(request, priorSchema) {
  if (request.contract.kind === "json-schema") {
    const carrier = { kind: "json-schema" };
    if (priorSchema != null) carrier.schema = priorSchema;
    return carrier;
  }
  const response = { description: "success" };
  if (priorSchema != null) response.content = { "application/json": { schema: priorSchema } };
  return {
    openapi: "3.0.3",
    paths: {
      [request.path]: {
        [request.method.toLowerCase()]: { responses: { "200": response } },
      },
    },
  };
}

function patchFor(request, priorPresent) {
  if (request.contract.kind === "json-schema") {
    return { op: priorPresent ? "replace" : "add", pointer: "/schema" };
  }
  const base = `/paths/${pointerEscape(request.path)}/${request.method.toLowerCase()}/responses/200`;
  if (!priorPresent) return { op: "add", pointer: `${base}/content` };
  return { op: "replace", pointer: `${base}/content/application~1json/schema` };
}

function patchValue(proposed, priorPresent, kind) {
  if (!priorPresent && kind === "openapi") return { "application/json": { schema: proposed } };
  return proposed;
}

export function applyPointer(document, pointer, value, op) {
  const clone = structuredClone(document);
  const parts = pointer.split("/").slice(1).map(pointerUnescape);
  let cursor = clone;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, key) || cursor[key] == null) {
      return { ok: false, document: clone };
    }
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  if (!cursor || typeof cursor !== "object") return { ok: false, document: clone };
  const exists = Object.prototype.hasOwnProperty.call(cursor, last);
  if (op === "add" && exists) return { ok: false, document: clone };
  if (op === "replace" && !exists) return { ok: false, document: clone };
  cursor[last] = value;
  return { ok: true, document: clone };
}

function sourceIdOf(request, observations) {
  const canonical = {
    callerId: request.callerId,
    routeClass: request.routeClass,
    method: request.method,
    path: request.path,
    contract: request.contract,
    shapes: observations.map(shapeSignature),
  };
  return sha256(stable(canonical));
}

function rootTypes(observations) {
  return new Set(observations.map(jsonType)).size;
}

function submittedFixes(schema, proposed, witnesses) {
  if (schema == null || schema === false || schema === true) return false;
  const evaluation = evaluatePrior(schema, proposed, witnesses);
  if (evaluation.checker || evaluation.mismatch) return false;
  if (isUnconstrained(schema, witnesses)) return false;
  const checked = witnesses.map((witness) => safeValidate(witness, schema));
  return checked.every((item) => item.ok && item.errors.length === 0);
}

function sameSchema(left, right) {
  if (left == null && right == null) return true;
  return stable(structuralSchema(left)) === stable(structuralSchema(right));
}

function questionResult(request, question, redactions) {
  return {
    exit: 0,
    kind: "unresolved",
    question,
    summary: null,
    artifacts: {
      "diagnosis.json": {
        schema: "samedaydesk.maint.contract-repair.diagnosis.v1",
        callerId: request?.callerId ?? null,
        routeClass: request?.routeClass ?? null,
        findingClass: null,
        disposition: "unresolved",
        ownerApplied: false,
        verifiedRepair: false,
        question,
        redactions,
      },
    },
  };
}

function rejectionResult(request, error, redactions = 0) {
  return {
    exit: 1,
    kind: "rejected",
    error,
    question: null,
    summary: null,
    artifacts: {
      "diagnosis.json": {
        schema: "samedaydesk.maint.contract-repair.diagnosis.v1",
        callerId: request?.callerId ?? null,
        routeClass: request?.routeClass ?? null,
        findingClass: null,
        disposition: "rejected",
        ownerApplied: false,
        verifiedRepair: false,
        error,
        redactions,
      },
    },
  };
}

export function repairContract(request) {
  const problem = requestProblem(request);
  if (problem === "second_wallet_refused" || problem === "checkout_refused") return rejectionResult(request, problem);
  if (problem) return { exit: 2, kind: "invalid", error: problem, question: null, summary: null, artifacts: {} };

  const redaction = { count: 0, secrets: [] };
  const observations = request.observations.map((item) => redactValue(item, redaction));
  const contract = redactValue(request.contract, redaction);
  const redactedRequest = { ...request, contract, observations };

  if (observations.length === 0) {
    return questionResult(redactedRequest, "No success body was supplied. Which JSON value does a successful response return?", redaction.count);
  }
  if (observations.length < 2) {
    return questionResult(
      redactedRequest,
      "Only one success body was supplied, so requiring its fields would invent a guarantee. Which fields are present on every success?",
      redaction.count,
    );
  }
  const declared = request.coverage?.declaredBranches;
  if (Number.isInteger(declared) && declared !== rootTypes(observations)) {
    return questionResult(
      redactedRequest,
      `The request declares ${declared} success branches and the bodies show ${rootTypes(observations)} JSON type${rootTypes(observations) === 1 ? "" : "s"}. Which branch was not supplied?`,
      redaction.count,
    );
  }

  const extracted = extractSuccessSchema(redactedRequest);
  if (extracted.error) return { exit: 2, kind: "invalid", error: extracted.error, question: null, summary: null, artifacts: {} };
  if (extracted.question) return questionResult(redactedRequest, extracted.question, redaction.count);
  if (extracted.present) {
    const combinator = unsupportedKeyword(extracted.schema);
    if (combinator) {
      const question = combinator.keyword === "type-union"
        ? `The success schema allows more than one JSON type at ${combinator.path}. This repair does not collapse that union into one shape. Which type is the success contract?`
        : `The success schema uses ${combinator.keyword} at ${combinator.path}. This repair does not collapse that combinator into one response shape. Which branch should the patch describe?`;
      return questionResult(redactedRequest, question, redaction.count);
    }
  }

  const merged = mergeValues(observations, "$");
  if (!merged.ok) {
    if (request.submittedRepair) return rejectionResult(redactedRequest, "repair_incorrect", redaction.count);
    return questionResult(redactedRequest, merged.question, redaction.count);
  }

  const witnesses = observations.map(typeWitness);
  const priorSchema = extracted.present ? extracted.schema : null;
  const priorStructural = priorSchema == null ? null : structuralSchema(priorSchema);
  const publicPrior = priorSchema == null ? null : (priorStructural?.unconstrained ? true : priorStructural);
  const internal = evaluatePrior(priorSchema, merged.schema, observations);
  if (internal.checker) {
    return questionResult(
      redactedRequest,
      "The success schema could not be checked with the repo JSON Schema checker. Which constraint should be rewritten as type, properties, required, or items?",
      redaction.count,
    );
  }
  const publicEval = evaluatePrior(publicPrior, merged.schema, witnesses);
  if (!internal.mismatch) return rejectionResult(redactedRequest, "repair_unchanged", redaction.count);
  if (!publicEval.mismatch) {
    return questionResult(
      redactedRequest,
      "The mismatch is not shown by types, required fields, and items alone. Which constraint should the owner change?",
      redaction.count,
    );
  }

  if (request.submittedRepair) {
    const submitted = request.submittedRepair.schema;
    if (sameSchema(submitted, priorSchema)) return rejectionResult(redactedRequest, "repair_unchanged", redaction.count);
    if (!submittedFixes(submitted, merged.schema, observations)) return rejectionResult(redactedRequest, "repair_incorrect", redaction.count);
  }

  const proposedCheck = witnesses.map((witness) => safeValidate(witness, merged.schema));
  if (proposedCheck.some((item) => !item.ok || item.errors.length > 0)) {
    return { exit: 2, kind: "invalid", error: "repair_failed", question: null, summary: null, artifacts: {} };
  }
  const decoy = decoyFor(merged.schema);
  const decoyCheck = safeValidate(decoy, merged.schema);
  if (!decoyCheck.ok || decoyCheck.errors.length === 0) {
    return { exit: 2, kind: "invalid", error: "repair_failed", question: null, summary: null, artifacts: {} };
  }

  const spec = patchFor(redactedRequest, extracted.present);
  const value = patchValue(merged.schema, extracted.present, redactedRequest.contract.kind);
  const carrier = carrierFor(redactedRequest, publicPrior);
  const regression = {
    schema: "samedaydesk.maint.contract-repair.regression.v1",
    disposition: "suggestion",
    ownerApplied: false,
    verifiedRepair: false,
    carrier,
    requestEcho: {
      method: redactedRequest.method,
      path: redactedRequest.path,
      contract: { kind: redactedRequest.contract.kind },
    },
    priorSchema: publicPrior,
    proposedSchema: merged.schema,
    witnesses,
    decoy,
    patch: { op: spec.op, pointer: spec.pointer, value },
    expect: {
      priorMismatch: true,
      reason: publicEval.reason,
      proposedAcceptsAll: true,
      proposedRejectsDecoy: true,
    },
  };
  const executed = executeRegressionDocument(regression);
  if (!executed.ok) return { exit: 2, kind: "invalid", error: "repair_failed", question: null, summary: null, artifacts: {} };

  const summary = {
    callerId: redactedRequest.callerId,
    routeClass: redactedRequest.routeClass,
    method: redactedRequest.method,
    path: redactedRequest.path,
    findingClass: priorSchema == null ? "missing_response_schema" : "incorrect_response_schema",
    shape: jsonType(observations[0]),
    sourceId: sourceIdOf(redactedRequest, observations),
    disposition: "suggestion",
    ownerApplied: false,
    verifiedRepair: false,
    confirmation: CONFIRMATION,
    requiredPaths: merged.requiredPaths,
    optionalPaths: [...new Set(merged.optionalPaths)],
    patch: { op: spec.op, pointer: spec.pointer, schema: merged.schema },
    regression: {
      priorMismatch: true,
      reason: publicEval.reason,
      proposedAcceptsAll: true,
      proposedRejectsDecoy: true,
      exit: 0,
    },
  };
  return {
    exit: 0,
    kind: "suggestion",
    error: null,
    question: null,
    summary,
    secrets: redaction.secrets,
    artifacts: {
      "diagnosis.json": {
        schema: "samedaydesk.maint.contract-repair.diagnosis.v1",
        callerId: summary.callerId,
        routeClass: summary.routeClass,
        findingClass: summary.findingClass,
        shape: summary.shape,
        disposition: "suggestion",
        ownerApplied: false,
        verifiedRepair: false,
        confirmation: CONFIRMATION,
        requiredPaths: summary.requiredPaths,
        optionalPaths: summary.optionalPaths,
        redactions: redaction.count,
        question: null,
      },
      "patch.json": {
        schema: "samedaydesk.maint.contract-repair.patch.v1",
        disposition: "suggestion",
        ownerApplied: false,
        verifiedRepair: false,
        label: "This is a proposed patch. It is not an owner-applied verified repair.",
        findingClass: summary.findingClass,
        routeClass: summary.routeClass,
        op: spec.op,
        pointer: spec.pointer,
        value,
        schema: merged.schema,
        confirmation: CONFIRMATION,
      },
      "regression.json": regression,
      "summary.json": summary,
    },
  };
}

export function executeRegressionDocument(doc) {
  if (!doc || doc.ownerApplied !== false || doc.verifiedRepair !== false || doc.disposition !== "suggestion") {
    return { ok: false, exit: 1, reason: "not_a_suggestion" };
  }
  const prior = evaluatePrior(doc.priorSchema, doc.proposedSchema, doc.witnesses);
  if (!prior.mismatch || prior.reason !== doc.expect?.reason) return { ok: false, exit: 1, reason: "prior_not_reproduced" };
  const applied = applyPointer(doc.carrier, doc.patch.pointer, doc.patch.value, doc.patch.op);
  if (!applied.ok) return { ok: false, exit: 1, reason: "patch_rejected" };
  const echo = {
    method: doc.requestEcho.method,
    path: doc.requestEcho.path,
    contract: doc.requestEcho.contract.kind === "json-schema"
      ? { kind: "json-schema", schema: applied.document.schema }
      : { kind: "openapi", document: applied.document },
  };
  const extracted = extractSuccessSchema(echo);
  if (!extracted.present) return { ok: false, exit: 1, reason: "patched_schema_missing" };
  if (stable(structuralSchema(extracted.schema)) !== stable(doc.proposedSchema)) {
    return { ok: false, exit: 1, reason: "patched_schema_mismatch" };
  }
  const accepted = doc.witnesses.every((witness) => {
    const result = safeValidate(witness, extracted.schema);
    return result.ok && result.errors.length === 0;
  });
  const decoy = safeValidate(doc.decoy, extracted.schema);
  if (!accepted || !decoy.ok || decoy.errors.length === 0) return { ok: false, exit: 1, reason: "new_behavior_failed" };
  if (JSON.stringify(doc.proposedSchema).includes("\"example\"") || JSON.stringify(doc.proposedSchema).includes("\"const\"")) {
    return { ok: false, exit: 1, reason: "value_constraint" };
  }
  return { ok: true, exit: 0, reason: prior.reason };
}

function regressionScript(libPath) {
  return [
    "import { readFileSync } from 'node:fs';",
    `import { executeRegressionDocument } from ${JSON.stringify(libPath)};`,
    "const doc = JSON.parse(readFileSync(new URL('./regression.json', import.meta.url), 'utf8'));",
    "const result = executeRegressionDocument(doc);",
    "process.stdout.write(`regression prior-mismatch ${result.reason} proposed-accept decoy-reject exit ${result.exit}\\n`);",
    "process.exit(result.exit);",
    "",
  ].join("\n");
}

function containsSecret(text, secrets) {
  return secrets.some((secret) => typeof secret === "string" && secret.length > 0 && text.includes(secret));
}

export function runRequestFile(inPath, outPath) {
  const bytes = statSync(inPath).size;
  if (bytes > MAX_BYTES) return { exit: 2, error: "oversized_input", secrets: [] };
  let request;
  try {
    request = JSON.parse(readFileSync(inPath, "utf8"));
  } catch {
    return { exit: 2, error: "malformed_input", secrets: [] };
  }
  const result = repairContract(request);
  mkdirSync(outPath, { recursive: true });
  for (const name of readdirSync(outPath)) rmSync(join(outPath, name), { recursive: true, force: true });
  for (const [name, body] of Object.entries(result.artifacts)) {
    writeFileSync(join(outPath, name), `${JSON.stringify(body, null, 2)}\n`);
  }
  if (result.kind === "suggestion") {
    const libPath = fileURLToPath(new URL("./contract-repair.mjs", import.meta.url));
    writeFileSync(join(outPath, "regression.mjs"), regressionScript(libPath));
    const ran = spawnSync(process.execPath, [join(outPath, "regression.mjs")], { encoding: "utf8" });
    writeFileSync(join(outPath, "regression-result.json"), `${JSON.stringify({
      exit: ran.status,
      reason: (ran.stdout || "").trim(),
      ownerApplied: false,
      verifiedRepair: false,
    }, null, 2)}\n`);
    if (ran.status !== 0) return { exit: 1, error: "regression_failed", result, secrets: result.secrets ?? [] };
  }
  const texts = readdirSync(outPath).map((name) => readFileSync(join(outPath, name), "utf8")).join("\n");
  if (containsSecret(texts, result.secrets ?? [])) return { exit: 2, error: "secret_leak", secrets: [] };
  return { exit: result.exit, error: result.error ?? null, question: result.question ?? null, result, secrets: [] };
}

export function prepareOutDir(parent) {
  return mkdtempSync(join(parent ?? tmpdir(), "l08-contract-"));
}

export function buildContractRepairHandoff() {
  const callers = CONTRACT_CALLERS.map((caller) => {
    const request = JSON.parse(readFileSync(join(fixtureDir, caller.file), "utf8"));
    const result = repairContract(request);
    if (result.exit !== 0 || result.summary?.callerId !== caller.callerId) {
      throw new Error(`contract repair fixture ${caller.file} did not produce a suggestion`);
    }
    return result.summary;
  });
  return {
    schema: CONTRACT_REPAIR_SCHEMA,
    job: CONTRACT_REPAIR_JOB,
    priorHead: CONTRACT_REPAIR_PRIOR_HEAD,
    offline: true,
    checkoutRequired: false,
    charge: false,
    ownerApplied: false,
    verifiedRepair: false,
    coldClientWritesHandoff: true,
    listenerWritesHandoff: false,
    secondWallet: false,
    externalSellerMutated: false,
    catalogExamplesAreInputsOnly: true,
    reused: REUSED_COMPONENTS,
    callers,
  };
}

export function validateContractRepairSection(section) {
  let expected;
  try {
    expected = buildContractRepairHandoff();
  } catch {
    return "contract_repair_fixture";
  }
  if (!section || typeof section !== "object" || Array.isArray(section)) return "contract_repair";
  for (const key of [
    "schema", "job", "priorHead", "offline", "checkoutRequired", "charge", "ownerApplied",
    "verifiedRepair", "coldClientWritesHandoff", "listenerWritesHandoff", "secondWallet",
    "externalSellerMutated", "catalogExamplesAreInputsOnly", "reused", "callers",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(section, key)) return "contract_repair";
  }
  if (stable(section) !== stable(expected)) return "contract_repair";
  if (JSON.stringify(section).includes("https://") || JSON.stringify(section).includes("plink_")) return "contract_repair_leak";
  if (section.callers.some((caller) => caller.ownerApplied !== false || caller.verifiedRepair !== false)) return "contract_repair_verified";
  return null;
}

export function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

export const FIXTURE_DIR = fixtureDir;
