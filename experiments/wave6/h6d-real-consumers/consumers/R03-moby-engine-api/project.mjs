/**
 * Caller-owned non-equivalent projection: Swagger 2.0 paths → SDS route-table.v1.
 * Drops HTTP methods, operationId, parameters, bodies, responses, definitions.
 * Does not import kit engines.
 */
export const SCHEMA_TABLE = "samedaydesk.route-table.v1";
export const CANONICAL_ORIGIN = "https://docs.docker.com/reference/api/engine/version/v1.56";
export const METHOD_ORDER = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

const METHOD_SET = new Set(METHOD_ORDER);

export function unquoteYamlScalar(raw) {
  const s = String(raw ?? "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Bounded Swagger 2.0 YAML walker: path keys, methods, summary/operationId only.
 * Not a general YAML parser.
 */
export function extractSwaggerPathRecords(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const records = [];
  const byPath = new Map();
  let inPaths = false;
  let currentPath = null;
  let currentMethod = null;

  const ensure = (path) => {
    let rec = byPath.get(path);
    if (!rec) {
      rec = { path, methods: [] };
      byPath.set(path, rec);
      records.push(rec);
    }
    return rec;
  };

  for (const line of lines) {
    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) inPaths = true;
      continue;
    }
    if (line.length && !line.startsWith(" ") && !line.startsWith("#") && /:\s*$/.test(line)) {
      break;
    }
    const pathMatch = line.match(/^ {2}("(\/[^"]+)"|(\/[^:]+)):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[2] || pathMatch[3];
      currentMethod = null;
      ensure(currentPath);
      continue;
    }
    const methodMatch = line.match(/^ {4}([A-Za-z]+):\s*$/);
    if (methodMatch && currentPath && METHOD_SET.has(methodMatch[1].toLowerCase())) {
      currentMethod = methodMatch[1].toLowerCase();
      const rec = ensure(currentPath);
      rec.methods.push({
        method: currentMethod.toUpperCase(),
        path: currentPath,
        operationId: null,
        summary: null,
      });
      continue;
    }
    if (!currentPath || !currentMethod) continue;
    const rec = byPath.get(currentPath);
    const op = rec?.methods[rec.methods.length - 1];
    if (!op) continue;
    const sum = line.match(/^ {6}summary:\s*(.*)$/);
    if (sum && op.summary == null) {
      op.summary = unquoteYamlScalar(sum[1]);
      continue;
    }
    const oid = line.match(/^ {6}operationId:\s*(.*)$/);
    if (oid && op.operationId == null) {
      op.operationId = unquoteYamlScalar(oid[1]);
    }
  }
  return records;
}

export function extractSwaggerPathRecordsFromObject(doc) {
  const paths = doc?.paths && typeof doc.paths === "object" && !Array.isArray(doc.paths) ? doc.paths : {};
  const records = [];
  for (const [path, item] of Object.entries(paths)) {
    const methods = [];
    if (item && typeof item === "object") {
      for (const m of METHOD_ORDER) {
        const op = item[m];
        if (op && typeof op === "object") {
          methods.push({
            method: m.toUpperCase(),
            path,
            operationId: op.operationId ?? null,
            summary: op.summary ?? null,
          });
        }
      }
    }
    records.push({ path, methods });
  }
  return records;
}

function titleFor(record) {
  const byMethod = new Map(record.methods.map((op) => [op.method.toLowerCase(), op]));
  for (const m of METHOD_ORDER) {
    const op = byMethod.get(m);
    if (op?.summary && String(op.summary).trim()) return String(op.summary).trim();
  }
  for (const m of METHOD_ORDER) {
    const op = byMethod.get(m);
    if (op?.operationId && String(op.operationId).trim()) return String(op.operationId).trim();
  }
  return record.path;
}

export function projectRecords(records, meta = {}) {
  const routes = records.map((record) => ({
    path: record.path,
    title: titleFor(record),
    canonical: `${CANONICAL_ORIGIN}${record.path}`,
  }));
  return {
    schema: SCHEMA_TABLE,
    authority: "caller",
    publishedRouteTable: false,
    equivalent: false,
    projection: "openapi-to-sds-route-table",
    note:
      "Caller-owned non-equivalent projection of moby/moby api/swagger.yaml (Swagger 2.0) into SDS route-table.v1. HTTP methods, operationId, parameters, request bodies, responses, and definitions are dropped. Not the published SDS route table. Homepage / is absent in this Engine API.",
    dropped: [
      "httpMethod",
      "operationId",
      "parameters",
      "requestBody",
      "responses",
      "definitions",
      "consumes",
      "produces",
    ],
    source: {
      repo: "moby/moby",
      path: "api/swagger.yaml",
      sha: meta.sha ?? null,
      side: meta.side ?? null,
      license: "Apache-2.0",
      swagger: "2.0",
      apiVersion: meta.apiVersion ?? "1.56",
      basePath: meta.basePath ?? "/v1.56",
    },
    routes,
  };
}

export function projectSwaggerYaml(text, meta = {}) {
  return projectRecords(extractSwaggerPathRecords(text), meta);
}

export function projectSwaggerObject(doc, meta = {}) {
  return projectRecords(extractSwaggerPathRecordsFromObject(doc), meta);
}
