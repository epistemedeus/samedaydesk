import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { M01_SCHEMA, D26_SCHEMA } from "./schema.mjs";
import {
  BUYER_CATALOG_PATH,
  CATALOG_PATH,
  D26_DEFAULT,
  DISCOVERY_PATH,
  M01_DEFAULT,
  MCP_PATH,
  OPENAPI_PATH,
  OUTCOMES_PATH,
  REPO_ROOT,
  WRAPPER_INDEX,
} from "./paths.mjs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function mcpToolPrice(src, name) {
  const re = new RegExp(`name: "${name}",\\s*price: "\\$([^"]+)"`);
  const m = src.match(re);
  return m ? m[1] : null;
}

function loadOptionalJson(path, expectedSchema) {
  if (!existsSync(path)) {
    return { status: "unbound", path, schema: expectedSchema, doc: null };
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { status: "incompatible", path, schema: expectedSchema, error: err.message, doc: null };
  }
  if (doc?.schema !== expectedSchema) {
    return {
      status: "incompatible",
      path,
      schema: expectedSchema,
      error: `expected ${expectedSchema}, got ${doc?.schema || "missing"}`,
      doc,
    };
  }
  return { status: "bound", path, schema: expectedSchema, doc };
}

export async function loadWrapperModule(repoRoot = REPO_ROOT) {
  const url = pathToFileURL(WRAPPER_INDEX).href;
  const mod = await import(url);
  const runPaidOffer =
    typeof mod.createExecutor === "function" ? mod.createExecutor() : mod.runPaidOffer;
  return {
    mod,
    runPaidOffer,
    hasCreateExecutor: typeof mod.createExecutor === "function",
    hasHttp: typeof mod.listenExecutionServer === "function",
    contract: mod.EXECUTION_CONTRACT_VERSION || "sds52-runPaidOffer",
    classifyTransport: typeof mod.classifyTransport === "function" ? mod.classifyTransport : null,
    classifyAnalysis: typeof mod.classifyAnalysis === "function" ? mod.classifyAnalysis : null,
    JOBS: mod.JOBS,
    JOB_IDS: mod.JOB_IDS,
    getJob: mod.getJob,
    LIVE_EXTRACT_PRICE_USDC: mod.LIVE_EXTRACT_PRICE_USDC,
    LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC: mod.LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
    LIVE_PAY_TO: mod.LIVE_PAY_TO,
    FIXTURE_PRICE_USDC: mod.FIXTURE_PRICE_USDC,
    USEFUL_JOBS_ARCHIVE_SHA256: mod.USEFUL_JOBS_ARCHIVE_SHA256,
    USEFUL_JOBS_ARCHIVE_BYTES: mod.USEFUL_JOBS_ARCHIVE_BYTES,
  };
}

export async function loadSources({
  repoRoot = REPO_ROOT,
  m01Path = process.env.W5_M01_SELECTED || M01_DEFAULT,
  d26Path = process.env.W5_D26_COST || D26_DEFAULT,
} = {}) {
  const catalogText = readFileSync(CATALOG_PATH);
  const outcomesText = readFileSync(OUTCOMES_PATH);
  const discovery = JSON.parse(readFileSync(DISCOVERY_PATH, "utf8"));
  const catalog = JSON.parse(catalogText.toString("utf8"));
  const outcomes = JSON.parse(outcomesText.toString("utf8"));
  const buyer = JSON.parse(readFileSync(BUYER_CATALOG_PATH, "utf8"));
  const mcp = readFileSync(MCP_PATH, "utf8");
  const openapi = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  const wrapper = await loadWrapperModule(repoRoot);
  const siaPath = openapi.paths["/commerce/seller-integrity-audit"];
  const siaAmount = siaPath?.get?.["x-payment-info"]?.price?.amount || null;

  return {
    repoRoot,
    catalog,
    catalogSha256: sha256Bytes(catalogText),
    outcomes,
    outcomesSha256: sha256Bytes(outcomesText),
    discovery,
    buyer,
    mcpExtractPrice: mcpToolPrice(mcp, "extract"),
    mcpSiaPrice: mcpToolPrice(mcp, "seller_integrity_audit"),
    siaAmount,
    wrapper,
    m01: loadOptionalJson(m01Path, M01_SCHEMA),
    d26: loadOptionalJson(d26Path, D26_SCHEMA),
  };
}
