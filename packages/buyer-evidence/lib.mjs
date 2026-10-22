import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Directory of packed catalog + per-runtime replay fixtures. */
export const FIXTURE_ROOT = join(here, "fixtures");

export const STATES = Object.freeze([
  "discover",
  "construct",
  "contract",
  "authorize-ready",
  "stop",
]);

export const RUNTIMES = Object.freeze(["agent402", "coinbase-x402"]);

export const CIRCLE_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_NETWORK_LABELS = new Set(["eip155:8453", "base", "base-mainnet"]);

/**
 * @param {string} path
 * @returns {unknown}
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Load the shared SameDayDesk extract catalog pin.
 * @returns {object}
 */
export function loadCatalog() {
  return readJson(join(FIXTURE_ROOT, "catalog.json"));
}

/**
 * Load one runtime's sources.json and five state fixtures.
 * @param {string} name
 * @returns {{name: string, dir: string, sources: object, states: Record<string, object>}}
 */
export function loadRuntime(name) {
  const dir = join(FIXTURE_ROOT, name);
  const states = {};
  for (const state of STATES) {
    states[state] = readJson(join(dir, "states", `${state}.json`));
  }
  return {
    name,
    dir,
    sources: readJson(join(dir, "sources.json")),
    states,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function evmAddr(value) {
  return String(value || "").toLowerCase();
}

/**
 * Agent402 client/index.js parse402Usd (lines 557-570).
 * @param {{accepts?: object[]}} body
 * @returns {number | null}
 */
export function parse402Usd(body) {
  const accepts = body && body.accepts;
  if (!Array.isArray(accepts) || !accepts.length) return null;
  let maxUsd = 0;
  for (const a of accepts) {
    const atomic = Number(a && a.maxAmountRequired);
    if (!Number.isFinite(atomic) || atomic < 0) return null;
    const decimals = Number((a && a.extra && a.extra.decimals) ?? (a && a.decimals) ?? 6);
    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 30) return null;
    const usd = atomic / 10 ** decimals;
    if (usd > maxUsd) maxUsd = usd;
  }
  return maxUsd;
}

/**
 * Agent402 src/x402-buyer.js pickPayableAccept for chain "base" (lines 54-65).
 * @param {object[] | undefined} accepts
 * @param {string} [chain]
 * @returns {object | null}
 */
export function pickPayableAccept(accepts, chain = "base") {
  if (chain !== "base") return null;
  const asset = CIRCLE_USDC_BASE.toLowerCase();
  return (
    (accepts || []).find(
      (a) =>
        BASE_NETWORK_LABELS.has(String(a.network || "").toLowerCase()) &&
        String(a.scheme || "exact") === "exact" &&
        String(a.asset || "").toLowerCase() === asset,
    ) || null
  );
}

/**
 * @param {{method?: string, url?: string, headers?: Record<string, string>}} request
 * @param {{equal: Function, match: Function, doesNotMatch: Function}} assert
 */
export function assertUnpaidRequest(request, assert) {
  assert.equal(request.method, "GET");
  assert.match(request.url, /^https:\/\/agents\.samedaydesk\.com\/extract\?url=/);
  const headers = request.headers || {};
  for (const name of Object.keys(headers)) {
    assert.doesNotMatch(name, /^(PAYMENT-SIGNATURE|X-PAYMENT)$/i, name);
  }
  const blob = JSON.stringify(request);
  assert.doesNotMatch(blob, /PAYMENT-SIGNATURE|X-PAYMENT:/);
}

/**
 * @param {unknown} value
 * @param {string[]} [into]
 * @returns {string[]}
 */
export function collectStrings(value, into = []) {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, into);
  }
  return into;
}

/**
 * @param {{accepts?: object[], extensions?: object, resource?: object, x402Version?: number}} body
 * @returns {object}
 */
export function contractFrom402(body) {
  const accept = pickPayableAccept(body.accepts);
  const bazaar = body.extensions?.bazaar;
  const example = bazaar?.info?.output?.example || accept?.outputSchema?.output?.example || {};
  const schemaRequired =
    bazaar?.schema?.properties?.output?.properties?.example?.required ||
    ["ok", "title", "url"];
  return {
    x402Version: body.x402Version,
    scheme: accept?.scheme,
    network: accept?.network,
    payTo: accept?.payTo,
    asset: accept?.asset,
    amount: accept?.amount,
    maxAmountRequired: accept?.maxAmountRequired,
    extraName: accept?.extra?.name,
    extraVersion: accept?.extra?.version,
    resourceUrl: body.resource?.url,
    mimeType: body.resource?.mimeType,
    serviceName: body.resource?.serviceName,
    exampleKeys: Object.keys(example),
    guaranteedPaths: schemaRequired,
  };
}

/**
 * @returns {string[]}
 */
export function listRuntimeDirs() {
  return readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
