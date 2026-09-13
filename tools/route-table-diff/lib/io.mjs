import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { RouteDiffError, refused } from "./errors.mjs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function isHttpLocator(locator) {
  return typeof locator === "string" && /^https?:\/\//i.test(locator);
}

export function assertLoopbackHttp(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    refused("invalid_locator", `Not a URL: ${url}`);
  }
  if (parsed.protocol !== "http:") {
    refused("external_catalog_refused", "Only loopback http:// catalogs are accepted. HTTPS and public hosts are external, not local-runtime.", {
      url,
    });
  }
  if (!LOOPBACK.has(parsed.hostname)) {
    refused("external_catalog_refused", "Non-loopback catalog URLs are external. This job does not fetch production sites.", {
      host: parsed.hostname,
    });
  }
  return parsed;
}

export async function defaultFetchJson(url) {
  const parsed = assertLoopbackHttp(url);
  let res;
  try {
    res = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(5000) });
  } catch (err) {
    if (err instanceof RouteDiffError) throw err;
    refused("http_catalog_failed", `Loopback catalog fetch failed: ${err instanceof Error ? err.message : String(err)}`, {
      url,
    });
  }
  if (!res.ok) {
    refused("http_catalog_failed", `Loopback catalog HTTP ${res.status}`, { url, status: res.status });
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    refused("invalid_catalog", "Loopback catalog is not JSON", { url });
  }
}

export function defaultReadFileJson(path) {
  const resolved = isAbsolute(path) ? path : resolve(process.cwd(), path);
  let text;
  try {
    text = readFileSync(resolved, "utf8");
  } catch (err) {
    refused("catalog_unreadable", `Cannot read catalog file ${resolved}`, { path: resolved, error: err.message });
  }
  try {
    return JSON.parse(text);
  } catch {
    refused("invalid_catalog", `Catalog file is not JSON: ${resolved}`, { path: resolved });
  }
}

export function writeDiffOutputs(outDir, jsonDoc, markdown) {
  if (!outDir || typeof outDir !== "string") refused("missing_out_dir", "--out-dir is required");
  const dir = isAbsolute(outDir) ? outDir : resolve(process.cwd(), outDir);
  mkdirSync(dir, { recursive: true });
  const jsonPath = resolve(dir, "route-diff.json");
  const mdPath = resolve(dir, "route-diff.md");
  writeFileSync(jsonPath, `${JSON.stringify(jsonDoc, null, 2)}\n`);
  writeFileSync(mdPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  return { dir, jsonPath, mdPath };
}

export function createDefaultAdapters(overrides = {}) {
  return {
    readFileJson: overrides.readFileJson || defaultReadFileJson,
    fetchJson: overrides.fetchJson || defaultFetchJson,
    writeOutputs: overrides.writeOutputs || writeDiffOutputs,
  };
}

export async function loadRawCatalog(locator, adapters) {
  if (isHttpLocator(locator)) return adapters.fetchJson(locator);
  return adapters.readFileJson(locator);
}
