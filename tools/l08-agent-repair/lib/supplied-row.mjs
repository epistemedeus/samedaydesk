// Bounded visitor catalog row. Uses the vendored MIT checker in process.
// Does not spawn a checker, fetch a remote host, or read fixture names.
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { checkerRoot, verifyPublicChecker } from "./public-adapter.mjs";

export const SUPPLIED_SCHEMA = "samedaydesk.public-readiness.supplied-row.v1";
export const MAX_BYTES = 32_768;
export const MAX_DEPTH = 8;
export const MAX_KEYS = 32;
export const MAX_STRING = 2_048;
export const MAX_REQUIRED_PATHS = 16;
export const WORK_LIMIT_MS = 2_000;

const ROUTE_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;
const REQUIRED_PATH = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,7}$/;
const HOSTILE_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "command",
  "cmd",
  "exec",
  "shell",
  "eval",
]);
const TOP_KEYS = new Set(["catalogRow", "responseContract"]);
const ROW_KEYS = new Set(["origin", "method", "route", "requiredPaths", "schema"]);
const CONTRACT_KEYS = new Set(["schema", "example"]);

let checkerPromise = null;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function statusForSuppliedCode(code) {
  if (code === "oversized_input") return 413;
  if (code === "rate_limit" || code === "busy") return 429;
  if (code === "checker_unavailable" || code === "work_limit") return 503;
  return 400;
}

function isPlain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (isPlain(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function inspect(value, depth) {
  if (depth > MAX_DEPTH) throw fail("oversized_input", "document is too deep");
  if (typeof value === "string") {
    if (value.length > MAX_STRING) throw fail("oversized_input", "string is too long");
    if (value.includes("\u0000")) throw fail("hostile_input", "string is not accepted");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw fail("invalid_shape", "number must be finite");
    return;
  }
  if (typeof value === "boolean" || value === null) return;
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) throw fail("oversized_input", "array is too long");
    for (const item of value) inspect(item, depth + 1);
    return;
  }
  if (!isPlain(value)) throw fail("invalid_shape", "value must be plain JSON");
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) throw fail("oversized_input", "object has too many properties");
  for (const key of keys) {
    if (HOSTILE_KEYS.has(key) || key.includes("__proto__") || key.includes("\u0000")) {
      throw fail("hostile_input", "object property is not accepted");
    }
    if (key === "$ref" || key === "$dynamicRef" || key === "$id") {
      throw fail("hostile_input", "schema references and identifiers are not resolved");
    }
    inspect(value[key], depth + 1);
  }
}

function assertOnly(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      if (key === "fixture") throw fail("fixture_demonstration_is_distinct", "fixture names are not a supplied row");
      throw fail("unknown_property", "object contains an unknown property");
    }
  }
}

function assertRoute(route) {
  if (typeof route !== "string" || route.length > 200 || !ROUTE_PATTERN.test(route)) {
    throw fail("invalid_shape", "route is not an exact path");
  }
  if (route.startsWith("//") || route.includes("..") || route.includes("{") || route.includes("\\")) {
    throw fail("hostile_input", "route is not an exact path");
  }
}

function assertPaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_REQUIRED_PATHS) {
    throw fail("invalid_shape", "requiredPaths must contain 1 to 16 dotted paths");
  }
  const seen = new Set();
  for (const path of paths) {
    if (typeof path !== "string" || !REQUIRED_PATH.test(path) || seen.has(path)) {
      throw fail("invalid_shape", "requiredPaths must contain safe dotted JSON paths");
    }
    seen.add(path);
  }
}

export function validateSuppliedBody(body) {
  if (!isPlain(body)) throw fail("invalid_shape", "body must be a JSON object");
  const encoded = Buffer.byteLength(JSON.stringify(body));
  if (encoded > MAX_BYTES) throw fail("oversized_input", "body exceeds the supplied-row byte limit");
  if (Object.hasOwn(body, "fixture")) {
    throw fail("fixture_demonstration_is_distinct", "fixture names are not a supplied row");
  }
  inspect(body, 0);
  assertOnly(body, TOP_KEYS);
  if (!isPlain(body.catalogRow) || !isPlain(body.responseContract)) {
    throw fail("invalid_shape", "catalogRow and responseContract are required objects");
  }
  assertOnly(body.catalogRow, ROW_KEYS);
  assertOnly(body.responseContract, CONTRACT_KEYS);
  if (!Object.hasOwn(body.responseContract, "schema")) {
    throw fail("invalid_shape", "responseContract.schema is required");
  }
  const schema = body.responseContract.schema;
  if (!(schema === null || isPlain(schema))) throw fail("invalid_shape", "responseContract.schema must be an object or null");
  if (Object.hasOwn(body.catalogRow, "schema")) {
    const rowSchema = body.catalogRow.schema;
    if (!(rowSchema === null || isPlain(rowSchema))) throw fail("invalid_shape", "catalogRow.schema must be an object or null");
  }
  const { origin, method, route, requiredPaths } = body.catalogRow;
  if (typeof origin !== "string" || origin.length > 200) throw fail("invalid_shape", "origin is required");
  if (method !== "GET" && method !== "POST") throw fail("invalid_shape", "method must be GET or POST");
  assertRoute(route);
  assertPaths(requiredPaths);
  const exampleIgnored = Object.hasOwn(body.responseContract, "example");
  const schemaDisagreement = Object.hasOwn(body.catalogRow, "schema")
    && stable(body.catalogRow.schema) !== stable(schema);
  return {
    origin,
    method,
    route,
    requiredPaths: [...requiredPaths],
    schema,
    example: exampleIgnored ? body.responseContract.example : undefined,
    exampleIgnored,
    schemaDisagreement,
  };
}

function schemaNode(schema, parentPath) {
  if (parentPath === "$") return schema;
  if (typeof parentPath !== "string" || parentPath.length === 0 || !isPlain(schema)) return null;
  let current = schema;
  for (const segment of parentPath.split(".")) {
    if (!isPlain(current?.properties) || !isPlain(current.properties[segment])) return null;
    current = current.properties[segment];
  }
  return current;
}

export function minimalRepair(schema, actions) {
  const applied = [];
  const withheld = [];
  if (!isPlain(schema) || !Array.isArray(actions)) {
    return { schema: null, applied, withheld: Array.isArray(actions) ? actions.map((action) => ({ ...action, reason: "schema_absent" })) : [] };
  }
  const clone = structuredClone(schema);
  for (const action of actions) {
    if (!isPlain(action) || action.action !== "add_property_to_required") {
      withheld.push({ ...action, reason: "type_not_confirmed" });
      continue;
    }
    if (action.propertyDeclared !== true || typeof action.propertyType !== "string" || action.propertyType.length === 0) {
      withheld.push({ ...action, reason: "type_not_confirmed" });
      continue;
    }
    const parent = schemaNode(clone, action.parentPath);
    const declared = parent?.properties?.[action.property];
    if (!isPlain(declared) || declared.type !== action.propertyType) {
      withheld.push({ ...action, reason: "declared_type_unavailable" });
      continue;
    }
    if (parent.required === undefined) parent.required = [];
    if (!Array.isArray(parent.required)) {
      withheld.push({ ...action, reason: "required_array_unavailable" });
      continue;
    }
    if (!parent.required.includes(action.property)) parent.required.push(action.property);
    applied.push({
      requiredPath: action.requiredPath,
      action: action.action,
      parentPath: action.parentPath,
      property: action.property,
      propertyType: action.propertyType,
    });
  }
  return { schema: applied.length ? clone : null, applied, withheld };
}

function documentFor(prepared) {
  const media = { schema: prepared.schema };
  if (prepared.exampleIgnored) media.example = prepared.example;
  return {
    openapi: "3.1.0",
    info: { title: "supplied-catalog-row", version: "supplied" },
    paths: {
      [prepared.route]: {
        [prepared.method.toLowerCase()]: {
          responses: { 200: { content: { "application/json": media } } },
          "x-payment-info": { protocols: [{ x402: { scheme: "exact" } }] },
        },
      },
    },
  };
}

async function loadChecker() {
  if (!checkerPromise) {
    checkerPromise = (async () => {
      const provenance = verifyPublicChecker();
      const href = pathToFileURL(join(checkerRoot, "integrity.mjs")).href;
      const loaded = await import(href);
      if (typeof loaded.auditIntegrity !== "function" || typeof loaded.normalizeOrigin !== "function") {
        throw fail("checker_unavailable", "public checker exports are incomplete");
      }
      if (loaded.TOOL_VERSION !== provenance.checker.version) {
        throw fail("checker_unavailable", "public checker version does not match provenance");
      }
      return { provenance, auditIntegrity: loaded.auditIntegrity, normalizeOrigin: loaded.normalizeOrigin };
    })().catch((error) => {
      checkerPromise = null;
      throw error;
    });
  }
  return checkerPromise;
}

function recheckBody(prepared, schema) {
  return {
    catalogRow: {
      origin: prepared.origin,
      method: prepared.method,
      route: prepared.route,
      requiredPaths: prepared.requiredPaths,
      schema,
    },
    responseContract: { schema },
  };
}

export async function auditSuppliedRow(body) {
  const prepared = validateSuppliedBody(body);
  let checker;
  try {
    checker = await loadChecker();
  } catch (error) {
    if (error.code === "checker_unavailable" || error.code === "provenance_mismatch") throw fail("checker_unavailable", "public checker is unavailable");
    throw error;
  }
  try {
    checker.normalizeOrigin(prepared.origin);
  } catch {
    throw fail("origin_refused", "origin is not a credential-free public HTTPS origin");
  }

  let requestImplCalls = 0;
  const requestImpl = async () => {
    requestImplCalls += 1;
    throw fail("remote_fetch_refused", "supplied-input endpoint does not fetch");
  };
  let timer;
  let report;
  const pending = checker.auditIntegrity({
    origin: prepared.origin,
    x402Document: documentFor(prepared),
    method: prepared.method,
    route: prepared.route,
    requiredPaths: prepared.requiredPaths,
    requireBazaar: false,
    requirePurchaseEvidence: false,
    maxRoutes: 1,
    requestImpl,
  });
  pending.catch(() => {});
  try {
    report = await Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(fail("work_limit", "supplied-row work limit")), WORK_LIMIT_MS);
      }),
    ]);
  } catch (error) {
    if (error.code === "work_limit" || error.code === "origin_refused") throw error;
    const message = String(error?.message || "");
    if (/origin/i.test(message)) throw fail("origin_refused", "origin is not a credential-free public HTTPS origin");
    if (/route|requiredPaths|method|OpenAPI|paid/i.test(message)) throw fail("invalid_shape", "checker rejected the supplied row");
    throw fail("checker_unavailable", "public checker did not return a decision");
  } finally {
    clearTimeout(timer);
  }

  const route = report?.routes?.[0];
  if (!route?.responseContract || !route.repairPlan) {
    throw fail("checker_unavailable", "public checker did not return a decision");
  }
  const findings = Array.isArray(route.findings) ? [...route.findings] : [];
  const repair = prepared.schemaDisagreement
    ? { schema: null, applied: [], withheld: (route.repairPlan.actions || []).map((action) => ({ ...action, reason: "schema_disagreement" })) }
    : minimalRepair(prepared.schema, route.repairPlan.actions || []);
  const uncertainty = [];
  if (prepared.method === "GET" || route.probe?.attempted !== true || route.probe?.reason) uncertainty.push("runtime_not_observed");
  if (requestImplCalls > 0) uncertainty.push("supplied_input_does_not_fetch");
  if (prepared.schemaDisagreement) uncertainty.push("catalog_row_schema_differs_from_response_contract");
  if (route.responseContract.decision === "absent") uncertainty.push("response_schema_absent");
  const output = repair.schema ? recheckBody(prepared, repair.schema) : null;
  return {
    schema: SUPPLIED_SCHEMA,
    mode: "supplied-input",
    visitorSupplied: true,
    fixtureDemonstration: false,
    versions: {
      source: "vendor/agent-payment-integrity",
      checker: checker.provenance.checker.version,
      commit: checker.provenance.checker.commit,
      license: checker.provenance.checker.license,
      auditSchema: report.schemaVersion,
      responseContractSchema: route.responseContract.schemaVersion ?? null,
    },
    checked: {
      origin: prepared.origin,
      method: prepared.method,
      route: route.route,
      requiredPaths: prepared.requiredPaths,
    },
    observation: {
      decision: route.responseContract.decision ?? null,
      nextAction: route.responseContract.nextAction ?? null,
      schemaDigest: route.responseContract.schemaDigest ?? null,
      mismatch: findings.length ? findings : null,
      uncertainty: uncertainty.length ? uncertainty : null,
      findings,
      checkerOk: report.ok === true,
      machineBuyable: report.machineBuyable === true,
      readinessClaimed: false,
      exampleIgnored: prepared.exampleIgnored,
      schemaDisagreement: prepared.schemaDisagreement,
    },
    repair: {
      input: {
        origin: prepared.origin,
        method: prepared.method,
        route: prepared.route,
        requiredPaths: prepared.requiredPaths,
        schema: prepared.schema,
      },
      output,
      actions: route.repairPlan.actions || [],
      applied: repair.applied,
      withheld: repair.withheld,
      complete: route.repairPlan.complete === true,
      boundary: route.repairPlan.boundary ?? null,
    },
    nextAction: {
      checker: route.responseContract.nextAction ?? null,
      executable: output ? {
        method: "POST",
        path: "/api/public-readiness/supplied-row",
        body: output,
        note: "A second process must POST this body, with its own target if the route changes. This response did not re-check it.",
      } : null,
    },
    network: {
      fetched: false,
      requestImplCalls,
      remoteFetch: "refused",
    },
    checkerSafety: report.safety ?? null,
    compiledRepair: {
      scope: "this-process",
      source: "vendor/agent-payment-integrity/integrity.mjs",
    },
    publicDeployment: {
      activated: false,
      readback: null,
    },
  };
}
