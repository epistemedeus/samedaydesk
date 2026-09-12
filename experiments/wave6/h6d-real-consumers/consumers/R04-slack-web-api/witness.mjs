/**
 * Independent Slack Web API witness.
 * Method+path (+ optional operationId) set comparison.
 * Does not import useful-jobs engine compare/oracle modules.
 */
const HTTP_METHODS = Object.freeze([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function opKey(method, path) {
  return `${String(method).toUpperCase()} ${path}`;
}

function looksLikeYarn(text) {
  const trimmed = String(text ?? "").trim();
  return /^# yarn lockfile/i.test(trimmed) || /^__metadata:/m.test(trimmed);
}

function looksLikeHtml(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed.startsWith("<!DOCTYPE") || /^<html[\s>]/i.test(trimmed);
}

export function classify(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return { kind: "empty", doc: null };
    if (looksLikeYarn(trimmed)) return { kind: "yarn-lock", doc: null };
    if (looksLikeHtml(trimmed)) return { kind: "html", doc: null };
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return classify(JSON.parse(trimmed));
      } catch {
        return { kind: "unparseable", doc: null };
      }
    }
    return { kind: "text", doc: null };
  }
  if (Array.isArray(input)) {
    if (input.every((row) => isPlainObject(row) && (row.path || row.method))) {
      return { kind: "ops-list", doc: { operations: input } };
    }
    if (input.every((row) => isPlainObject(row) && row.path && row.canonical && row.title)) {
      return { kind: "sds", doc: { routes: input } };
    }
    return { kind: "unknown-array", doc: input };
  }
  if (!isPlainObject(input)) return { kind: "invalid", doc: null };
  if (Array.isArray(input.operations) && !isPlainObject(input.paths)) {
    return { kind: "ops-index", doc: input };
  }
  if (typeof input.swagger === "string" || typeof input.openapi === "string" || isPlainObject(input.paths)) {
    return { kind: "openapi", doc: input };
  }
  if (input.schema === "samedaydesk.route-table.v1" || Array.isArray(input.routes) || Array.isArray(input.catalog)) {
    return { kind: "sds", doc: input };
  }
  if (Array.isArray(input.operations)) return { kind: "ops-index", doc: input };
  return { kind: "unknown-object", doc: input };
}

export function indexOpenApi(doc) {
  const map = new Map();
  const paths = isPlainObject(doc?.paths) ? doc.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isPlainObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isPlainObject(op)) continue;
      const key = opKey(method, path);
      map.set(key, {
        key,
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === "string" ? op.operationId : null,
      });
    }
  }
  return map;
}

export function indexOpsList(doc) {
  const map = new Map();
  const rows = Array.isArray(doc?.operations) ? doc.operations : Array.isArray(doc) ? doc : [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    if (!row.method || !row.path) continue;
    const key = opKey(row.method, row.path);
    map.set(key, {
      key,
      method: String(row.method).toUpperCase(),
      path: row.path,
      operationId: typeof row.operationId === "string" ? row.operationId : null,
    });
  }
  return map;
}

export function indexSds(doc) {
  const map = new Map();
  const routes = Array.isArray(doc?.routes) ? doc.routes : Array.isArray(doc?.catalog) ? doc.catalog : [];
  for (const route of routes) {
    if (!isPlainObject(route) || typeof route.path !== "string") continue;
    map.set(route.path, {
      key: route.path,
      path: route.path,
      canonical: route.canonical ?? null,
      title: route.title ?? null,
      robots: route.robots ?? null,
    });
  }
  return map;
}

export function resolveUsedKeys(used, beforeMap, afterMap) {
  if (used == null) return { keys: null, unknown: [] };
  const unknown = [];
  const operations = Array.isArray(used)
    ? used
    : Array.isArray(used.operations)
      ? used.operations
      : null;
  if (!operations) {
    return { keys: [], unknown: [{ key: null, reason: "missing-used-list" }] };
  }
  const keys = [];
  for (const entry of operations) {
    if (!isPlainObject(entry)) {
      unknown.push({ key: null, reason: "malformed-used-entry" });
      continue;
    }
    if (entry.method && entry.path) {
      keys.push(opKey(entry.method, entry.path));
      continue;
    }
    if (entry.operationId) {
      const hit =
        [...beforeMap.values()].find((op) => op.operationId === entry.operationId) ||
        [...afterMap.values()].find((op) => op.operationId === entry.operationId);
      if (hit) keys.push(hit.key);
      else unknown.push({ key: entry.operationId, reason: "unknown-operationId" });
      continue;
    }
    unknown.push({ key: null, reason: "incomplete-used-entry" });
  }
  return { keys: [...new Set(keys)], unknown };
}

function diffMaps(beforeMap, afterMap, usedKeys) {
  const keys = usedKeys == null ? [...new Set([...beforeMap.keys(), ...afterMap.keys()])] : usedKeys;
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const unknown = [];
  for (const key of keys) {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    if (!before && !after) {
      unknown.push({ key, reason: "absent-in-both" });
      continue;
    }
    if (!before && after) {
      added.push(after);
      continue;
    }
    if (before && !after) {
      removed.push(before);
      continue;
    }
    const beforeId = before.operationId ?? null;
    const afterId = after.operationId ?? null;
    if (beforeId !== afterId) changed.push({ key, before, after, fields: ["operationId"] });
    else unchanged.push(before);
  }
  return { added, removed, changed, unchanged, unknown };
}

function diffSds(beforeMap, afterMap) {
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  for (const key of keys) {
    const before = beforeMap.get(key);
    const after = afterMap.get(key);
    if (!before && after) {
      added.push(after);
      continue;
    }
    if (before && !after) {
      removed.push(before);
      continue;
    }
    const fields = [];
    if (before.canonical !== after.canonical) fields.push("canonical");
    if (before.title !== after.title) fields.push("title");
    if ((before.robots ?? null) !== (after.robots ?? null)) fields.push("robots");
    if (fields.length) changed.push({ key, fields, before, after });
    else unchanged.push(before);
  }
  return { added, removed, changed, unchanged, unknown: [] };
}

function publicOps(rows) {
  return rows.map((row) => {
    if (row && row.key && row.path) {
      return {
        key: row.key,
        method: row.method || null,
        path: row.path,
        operationId: row.operationId ?? null,
      };
    }
    if (row && row.key && row.fields) {
      return { key: row.key, fields: row.fields };
    }
    return row;
  });
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {unknown} [used]
 * @returns {{fact: string, changed: unknown[], unchanged: unknown[], added: unknown[], removed: unknown[], unknown: unknown[], equivalent?: boolean, note?: string}}
 */
export function witness(before, after, used) {
  const beforeClass = classify(before);
  const afterClass = classify(after);

  const unusable = new Set(["yarn-lock", "html", "unparseable", "empty", "text", "invalid"]);
  if (unusable.has(beforeClass.kind) || unusable.has(afterClass.kind)) {
    return {
      fact: "not-openapi",
      changed: [],
      unchanged: [],
      added: [],
      removed: [],
      unknown: [
        { key: null, reason: "unusable-input", before: beforeClass.kind, after: afterClass.kind },
      ],
      equivalent: false,
      note: "Witness refuses yarn.lock, HTML, empty, and unparseable bytes as OpenAPI/SDS inputs.",
    };
  }

  const openapiKinds = new Set(["openapi", "ops-index", "ops-list"]);
  if (openapiKinds.has(beforeClass.kind) && openapiKinds.has(afterClass.kind)) {
    const beforeMap =
      beforeClass.kind === "openapi" ? indexOpenApi(beforeClass.doc) : indexOpsList(beforeClass.doc);
    const afterMap =
      afterClass.kind === "openapi" ? indexOpenApi(afterClass.doc) : indexOpsList(afterClass.doc);
    const usedResolved = resolveUsedKeys(used, beforeMap, afterMap);
    const diff = diffMaps(beforeMap, afterMap, usedResolved.keys);
    return {
      fact: "openapi-method-path",
      changed: publicOps(diff.changed),
      unchanged: publicOps(diff.unchanged),
      added: publicOps(diff.added),
      removed: publicOps(diff.removed),
      unknown: [...usedResolved.unknown, ...diff.unknown],
      equivalent: true,
      note: "Set of HTTP method + path (+ optional operationId). Not a runtime compatibility proof.",
    };
  }

  if (beforeClass.kind === "sds" && afterClass.kind === "sds") {
    const diff = diffSds(indexSds(beforeClass.doc), indexSds(afterClass.doc));
    return {
      fact: "sds-path-projection",
      changed: diff.changed,
      unchanged: diff.unchanged,
      added: diff.added,
      removed: diff.removed,
      unknown: [],
      equivalent: false,
      note: "Non-equivalent projection: SDS {path,canonical,title,robots?} drops HTTP method and operationId.",
    };
  }

  return {
    fact: "unknown",
    changed: [],
    unchanged: [],
    added: [],
    removed: [],
    unknown: [{ key: null, reason: "kind-mismatch", before: beforeClass.kind, after: afterClass.kind }],
    equivalent: false,
    note: "Inputs are not a comparable OpenAPI or SDS pair.",
  };
}

export function projectOpenApiToSds(doc, meta = {}) {
  const host = doc?.host || "slack.com";
  const basePath = doc?.basePath || "/api";
  const scheme = Array.isArray(doc?.schemes) && doc.schemes[0] ? doc.schemes[0] : "https";
  const routes = [];
  for (const [path, item] of Object.entries(isPlainObject(doc?.paths) ? doc.paths : {})) {
    if (!isPlainObject(item)) continue;
    let method = null;
    let op = null;
    for (const candidate of HTTP_METHODS) {
      if (isPlainObject(item[candidate])) {
        method = candidate.toUpperCase();
        op = item[candidate];
        break;
      }
    }
    if (!op) continue;
    const operationId = op.operationId || path.replace(/^\//, "");
    routes.push({
      path,
      canonical: `${scheme}://${host}${basePath}${path}`,
      title: `${operationId}: Slack Web API ${path}`,
      _droppedMethod: method,
    });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema: "samedaydesk.route-table.v1",
    authority: "caller",
    publishedRouteTable: false,
    equivalentToOpenApi: false,
    migration: "openapi-to-sds-route-table",
    source: meta,
    routes: routes.map(({ path, canonical, title }) => ({ path, canonical, title })),
  };
}
