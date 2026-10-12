// Decimal and schema checks for task readiness. No server, network, or package imports.
// task-readiness.mjs re-exports these functions. Their results stay the same.

export const PRICE_PATTERN = /^\d+(\.\d+)?$/;

export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function quoteValue(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return undefined;
  return body.data.quote;
}

export function semanticResult(body) {
  const value = quoteValue(body);
  const ok = typeof value === "string" && PRICE_PATTERN.test(value);
  return {
    state: ok ? "pass" : "fail",
    code: ok ? null : "value_mismatch",
    pointer: "data.quote",
    shape: typeof value === "string" ? "string" : value === undefined ? "absent" : typeof value,
  };
}

export function authorizePacket(observation, fixture) {
  if (observation.semantic?.state !== "pass") {
    return { authorized: false, reason: "semantic_mismatch" };
  }
  if (observation.method !== fixture.row.method || observation.route !== fixture.row.route) {
    return { authorized: false, reason: "route_mismatch" };
  }
  if (!sameJson(observation.requiredPaths, fixture.row.requiredPaths)) {
    return { authorized: false, reason: "paths_mismatch" };
  }
  if (!sameJson(observation.schema, fixture.row.schema)) {
    return { authorized: false, reason: "schema_mismatch" };
  }
  return { authorized: true, reason: null, sha256: fixture.sha256, source: observation.source };
}

export function classifySchema(schema, requiredPaths) {
  if (schema == null) {
    return { state: "fail", code: "seller_response_contract_absent" };
  }
  const required = schema?.properties?.data?.required;
  const missing = requiredPaths.filter((path) => path === "data.quote" && !(Array.isArray(required) && required.includes("quote")));
  if (missing.length) return { state: "fail", code: "seller_response_required_path_missing:data.quote" };
  return { state: "pass", code: null };
}
