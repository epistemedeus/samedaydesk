import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SPA_HISTORY_ROUTES } from "../../../server/lib/spa-fallback.js";
import { CORRESPONDENCE_PREFIX } from "../../../server/lib/correspondence-mount.js";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = here;
export const ROOT = join(here, "../../..");

const METHOD_RE = /\b(?:router|app)\.(get|post|put|patch|delete|options)\(\s*["'`]([^"'`]+)["'`]/g;
const IMPORT_RE = /import\s+(\w+)\s+from\s+"(\.\/routes\/[^"]+)"/g;
const USE_RE = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
const APP_GET_RE = /app\.get\(\s*["'`]([^"'`]+)["'`]/g;
const RETIRED_RE = /\["(\/[^"]+)"\s*,\s*"(\/[^"]+)"\]/g;
const REACT_ROUTE_RE = /<Route path="([^"]+)"/g;
const SKILLGUARD_RE = /app\.get\(\s*["'`](\/skillguard)["'`]/g;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options"]);

export function normalizePath(path) {
  if (typeof path !== "string" || path.length === 0) return "/";
  const trimmed = path.split("?")[0].split("#")[0];
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "") || "/";
}

export function joinMount(mount, routePath) {
  const prefix = normalizePath(mount);
  if (!routePath || routePath === "/") return prefix;
  const suffix = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (prefix === "/") return normalizePath(suffix);
  return normalizePath(`${prefix}${suffix}`);
}

function readRepo(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function parseRouterMethods(source) {
  const found = [];
  const re = new RegExp(METHOD_RE.source, "g");
  let match;
  while ((match = re.exec(source))) {
    const method = match[1].toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;
    found.push({ method: method.toUpperCase(), path: match[2] });
  }
  return found;
}

function parseAppMounts(appSource) {
  const imports = new Map();
  for (const match of appSource.matchAll(IMPORT_RE)) {
    imports.set(match[1], match[2].replace(/^\.\//, "server/"));
  }
  const mounts = [];
  for (const match of appSource.matchAll(USE_RE)) {
    const prefix = match[1];
    const ident = match[2];
    const file = imports.get(ident);
    if (!file) continue;
    mounts.push({ prefix, ident, file });
  }
  const appGets = [];
  for (const match of appSource.matchAll(APP_GET_RE)) {
    appGets.push({ method: "GET", path: normalizePath(match[1]), file: "server/app.js" });
  }
  const retired = [];
  for (const match of appSource.matchAll(RETIRED_RE)) {
    retired.push({
      method: "GET",
      path: normalizePath(match[1]),
      redirectTo: match[2],
      file: "server/app.js",
    });
  }
  return { mounts, appGets, retired };
}

function parseReactPaths(source) {
  const paths = [];
  for (const match of source.matchAll(REACT_ROUTE_RE)) {
    if (match[1] === "*") continue;
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

function parseSkillguard(source) {
  const paths = [];
  for (const match of source.matchAll(SKILLGUARD_RE)) {
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

export function walkSource({ root = ROOT } = {}) {
  const appSource = readFileSync(join(root, "server/app.js"), "utf8");
  const { mounts, appGets, retired } = parseAppMounts(appSource);
  const routes = [];
  const seen = new Set();

  function add(entry) {
    const method = String(entry.method || "GET").toUpperCase();
    const path = normalizePath(entry.path);
    const key = `${method} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({
      method,
      path,
      key,
      file: entry.file,
      source: entry.source,
      redirectTo: entry.redirectTo || null,
      runtimeExpected: entry.runtimeExpected !== false,
    });
  }

  for (const mount of mounts) {
    const fileRel = mount.file;
    const source = readFileSync(join(root, fileRel), "utf8");
    for (const leaf of parseRouterMethods(source)) {
      add({
        method: leaf.method,
        path: joinMount(mount.prefix, leaf.path),
        file: fileRel,
        source: "routes",
        runtimeExpected: true,
      });
    }
  }

  for (const item of appGets) {
    add({ ...item, source: "app-get", runtimeExpected: true });
  }

  for (const item of retired) {
    add({ ...item, source: "retired-301", runtimeExpected: false });
  }

  add({
    method: "GET",
    path: joinMount(CORRESPONDENCE_PREFIX, "/healthz"),
    file: "server/lib/correspondence-mount.js",
    source: "correspondence-healthz",
    runtimeExpected: false,
  });

  const spaClient = readFileSync(join(root, "server/lib/spa-client.js"), "utf8");
  for (const path of parseSkillguard(spaClient)) {
    add({
      method: "GET",
      path,
      file: "server/lib/spa-client.js",
      source: "production-client",
      runtimeExpected: false,
    });
  }

  for (const path of SPA_HISTORY_ROUTES) {
    add({
      method: "GET",
      path,
      file: "server/lib/spa-fallback.js",
      source: "spa-history",
      runtimeExpected: false,
    });
  }

  const reactPaths = parseReactPaths(readFileSync(join(root, "client/src/App.tsx"), "utf8"));
  const historySet = new Set(SPA_HISTORY_ROUTES.map(normalizePath));
  const reactSet = new Set(reactPaths);
  const spaDrift = {
    inReactNotHistory: reactPaths.filter((path) => !historySet.has(path)),
    inHistoryNotReact: SPA_HISTORY_ROUTES.map(normalizePath).filter((path) => !reactSet.has(path)),
  };

  routes.sort((a, b) => a.key.localeCompare(b.key));
  return { routes, mounts, spaDrift, spaHistory: [...SPA_HISTORY_ROUTES], reactPaths };
}

function layerLeaves(layer) {
  const leaves = [];
  if (layer?.route?.path && layer.route.methods) {
    for (const method of Object.keys(layer.route.methods)) {
      if (!layer.route.methods[method]) continue;
      leaves.push({ method: method.toUpperCase(), routePath: layer.route.path });
    }
  }
  const nested = layer?.handle?.stack;
  if (Array.isArray(nested)) {
    for (const child of nested) {
      for (const leaf of layerLeaves(child)) leaves.push(leaf);
    }
  }
  return leaves;
}

export async function walkRuntime({ root = ROOT, createApp } = {}) {
  const appModule = createApp
    ? { createSdsApp: createApp }
    : await import(pathToFileURL(join(root, "server/app.js")).href);
  const app = appModule.createSdsApp();
  const stack = app.router?.stack || [];
  const { mounts } = parseAppMounts(readFileSync(join(root, "server/app.js"), "utf8"));
  const mountQueue = [...mounts];
  const leaves = [];
  const seen = new Set();

  for (const layer of stack) {
    if (layer?.route?.path) {
      for (const leaf of layerLeaves(layer)) {
        const path = normalizePath(leaf.routePath);
        const key = `${leaf.method} ${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        leaves.push({ method: leaf.method, path, key, source: "runtime-app" });
      }
      continue;
    }
    if (layer?.name !== "router" || !layer.handle?.stack) continue;
    const mount = mountQueue.shift();
    const prefix = mount?.prefix || "";
    for (const child of layer.handle.stack) {
      for (const leaf of layerLeaves(child)) {
        const path = joinMount(prefix, leaf.routePath);
        const key = `${leaf.method} ${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        leaves.push({
          method: leaf.method,
          path,
          key,
          file: mount?.file || null,
          source: "runtime-router",
        });
      }
    }
  }

  leaves.sort((a, b) => a.key.localeCompare(b.key));
  return { leaves, routerCount: mounts.length };
}


