/**
 * Independent swagger path-set witness.
 * Does not import useful-jobs engine compare/oracle modules.
 */
import { extractSwaggerPathRecords, extractSwaggerPathRecordsFromObject } from "./project.mjs";

function asText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.text === "string") return value.text;
  return null;
}

function countYamlKey(text, key) {
  const re = new RegExp(`^\\s+${key}:\\s*$`, "gm");
  return (String(text).match(re) || []).length;
}

function scanDefinitionProperty(text) {
  return {
    HealthCheck: countYamlKey(text, "HealthCheck"),
    Healthcheck: countYamlKey(text, "Healthcheck"),
    Umask: countYamlKey(text, "Umask"),
  };
}

function usedPathSet(used) {
  if (used == null) return null;
  const paths = new Set();
  if (typeof used === "string") {
    try {
      return usedPathSet(JSON.parse(used));
    } catch {
      paths.add(used);
      return paths;
    }
  }
  if (Array.isArray(used)) {
    for (const item of used) {
      if (typeof item === "string") paths.add(item);
      else if (item && typeof item === "object" && typeof item.path === "string") paths.add(item.path);
    }
    return paths;
  }
  if (used && typeof used === "object") {
    if (Array.isArray(used.paths)) return usedPathSet(used.paths);
    if (Array.isArray(used.operations)) return usedPathSet(used.operations);
    if (typeof used.path === "string") paths.add(used.path);
  }
  return paths.size ? paths : null;
}

function fromRecords(records, extra = {}) {
  const operations = [];
  for (const rec of records) {
    for (const op of rec.methods || []) operations.push({ method: op.method, path: rec.path });
  }
  return {
    kind: extra.kind || "swagger-paths",
    paths: records.map((r) => r.path),
    operations,
    properties: extra.properties || null,
    swagger: extra.swagger || null,
  };
}

export function analyze(input) {
  if (input == null) return { kind: "empty", paths: [], operations: [], properties: null, swagger: null };
  const text = asText(input);
  if (typeof text === "string") {
    const trimmed = text.trim();
    if (!trimmed) return { kind: "empty", paths: [], operations: [], properties: null, swagger: null };
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return analyze(JSON.parse(trimmed));
    }
    const swagger = /^\s*swagger:\s*"?2(\.0)?"?/m.test(trimmed)
      ? "2.0"
      : /^\s*openapi:\s*/m.test(trimmed)
        ? "openapi"
        : null;
    return fromRecords(extractSwaggerPathRecords(trimmed), {
      kind: "swagger-yaml",
      swagger,
      properties: scanDefinitionProperty(trimmed),
    });
  }
  if (typeof input !== "object") {
    return { kind: "unknown", paths: [], operations: [], properties: null, swagger: null };
  }
  if (Array.isArray(input.routes) || Array.isArray(input.catalog)) {
    const routes = input.routes || input.catalog;
    return {
      kind: "sds-route-table",
      paths: routes.map((r) => r?.path).filter((p) => typeof p === "string"),
      operations: [],
      properties: null,
      swagger: null,
    };
  }
  if (Array.isArray(input.paths)) {
    return { kind: "path-list", paths: input.paths.filter((p) => typeof p === "string"), operations: [], properties: null, swagger: null };
  }
  if (input.paths && typeof input.paths === "object") {
    const records = extractSwaggerPathRecordsFromObject(input);
    return fromRecords(records, {
      kind: "swagger-object",
      swagger: input.swagger || input.openapi || null,
    });
  }
  if (Array.isArray(input.operations)) {
    const paths = [...new Set(input.operations.map((op) => op.path).filter(Boolean))];
    return { kind: "operation-list", paths, operations: input.operations, properties: null, swagger: null };
  }
  return { kind: "unknown", paths: [], operations: [], properties: null, swagger: null };
}

function sorted(set) {
  return [...set].sort();
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {unknown} [used]
 * @returns {{ fact: string, changed: string[], unchanged: string[], added: string[], removed: string[], unknown: object[] }}
 */
export function witness(before, after, used) {
  const b = analyze(before);
  const a = analyze(after);
  const usedPaths = usedPathSet(used);

  const beforeSet = new Set(usedPaths ? b.paths.filter((p) => usedPaths.has(p)) : b.paths);
  const afterSet = new Set(usedPaths ? a.paths.filter((p) => usedPaths.has(p)) : a.paths);

  const added = sorted(afterSet).filter((p) => !beforeSet.has(p));
  const removed = sorted(beforeSet).filter((p) => !afterSet.has(p));
  const unchanged = sorted(beforeSet).filter((p) => afterSet.has(p));

  const unknown = [
    {
      kind: "non-equivalent-projection",
      note: "Swagger 2.0 path+method is not SDS {path,canonical,title,robots?}. Methods and parameters are dropped.",
      dropped: ["httpMethod", "operationId", "parameters", "requestBody", "responses", "definitions"],
    },
  ];

  const bProps = b.properties;
  const aProps = a.properties;
  if (bProps && aProps) {
    if (bProps.HealthCheck !== aProps.HealthCheck || bProps.Healthcheck !== aProps.Healthcheck) {
      unknown.push({
        kind: "definition-property-rename",
        pointer: "definitions.TaskSpec.properties.ContainerSpec.properties.HealthCheck",
        before: "HealthCheck",
        after: "Healthcheck",
        counts: { before: bProps, after: aProps },
        note: "Definition/property rename is outside the SDS path-set and outside route-table-diff.",
      });
    }
    if (bProps.Umask === aProps.Umask && bProps.Umask > 0) {
      unknown.push({
        kind: "definition-field-present-both",
        pointer: "definitions.HostConfig.properties.Umask",
        note: "HostConfig.Umask exists in both revisions; not a path add/remove.",
      });
    }
  } else {
    unknown.push({
      kind: "definition-delta-not-observed",
      note: "Witness did not see YAML definition keys on this input shape; path-set only.",
    });
  }

  const bOps = new Set((b.operations || []).map((op) => `${op.method} ${op.path}`));
  const aOps = new Set((a.operations || []).map((op) => `${op.method} ${op.path}`));
  const methodDropped = b.operations?.length || a.operations?.length;
  if (methodDropped) {
    const opAdded = [...aOps].filter((k) => !bOps.has(k)).sort();
    const opRemoved = [...bOps].filter((k) => !aOps.has(k)).sort();
    if (opAdded.length || opRemoved.length) {
      unknown.push({
        kind: "method-path-ops-not-projected",
        added: opAdded,
        removed: opRemoved,
        note: "Operation method+path deltas are not SDS route-table facts.",
      });
    }
  }

  const changed = [];
  if (usedPaths) {
    for (const p of usedPaths) {
      if (!b.paths.includes(p) && !a.paths.includes(p)) {
        unknown.push({ kind: "used-path-absent-both", path: p });
      }
    }
  }

  const dialect = b.swagger || a.swagger;
  return {
    fact: "swagger-path-set",
    dialect: dialect || null,
    changed,
    unchanged,
    added,
    removed,
    unknown,
    counts: {
      beforePaths: b.paths.length,
      afterPaths: a.paths.length,
      beforeOps: (b.operations || []).length,
      afterOps: (a.operations || []).length,
      added: added.length,
      removed: removed.length,
      unchanged: unchanged.length,
    },
  };
}

export function looksLikeOpenApiOrSwagger(input) {
  if (input && typeof input === "object") {
    if (typeof input.openapi === "string" || typeof input.swagger === "string") return true;
    if (input.paths && typeof input.paths === "object" && !Array.isArray(input.paths) && !Array.isArray(input.routes)) {
      return true;
    }
  }
  const text = asText(input);
  if (typeof text === "string") {
    return /^\s*(swagger|openapi)\s*:/m.test(text) || /"swagger"\s*:|"openapi"\s*:/.test(text);
  }
  return false;
}
