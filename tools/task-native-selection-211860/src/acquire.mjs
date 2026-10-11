import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CATALOG_SCHEMA, COVERAGE_SCHEMA, DEFAULT_ORIGINS, FEATURE } from "./constants.mjs";
import { sha256 } from "./canonical.mjs";
import { applyX402, entriesFromOpenApi, entryFromDiscovery } from "./catalog.mjs";
import { probePublic } from "./probe.mjs";
import { OPENAPI_DOCUMENT_SCHEMA, X402_DOCUMENT_SCHEMA, validateInstance } from "./schema-support.mjs";

const SOURCES = [
  { id: "openapi", url: DEFAULT_ORIGINS.openapi, role: "machine_catalog" },
  { id: "x402", url: DEFAULT_ORIGINS.x402, role: "machine_catalog" },
  { id: "task-readiness", url: DEFAULT_ORIGINS.taskReadiness, role: "discovery_document" },
  { id: "careers-cold", url: DEFAULT_ORIGINS.careersCold, role: "declared_free_get" },
  { id: "cards", url: DEFAULT_ORIGINS.cards, role: "declared_get_schema_may_be_absent" },
];

function parseJson(buffer) {
  try {
    return { ok: true, value: JSON.parse(buffer.toString("utf8")) };
  } catch {
    return { ok: false, value: null };
  }
}

export async function acquireSources({ outDir, now, probe = probePublic }) {
  const acquiredAt = now || new Date().toISOString();
  const saved = [];
  let failed = false;
  for (const source of SOURCES) {
    const row = { id: source.id, url: source.url, role: source.role, fetchedAt: acquiredAt };
    try {
      const response = await probe(source.url);
      row.status = response.status;
      row.finalUrl = response.finalUrl;
      row.hops = response.hops;
      row.contentType = response.contentType;
      row.bytes = response.body.length;
      row.sha256 = sha256(response.body.toString("utf8"));
      row.redirects = Math.max(0, response.hops.length - 1);
      const parsed = parseJson(response.body);
      row.json = parsed.ok;
      if (response.status !== 200 || !parsed.ok) failed = true;
      saved.push({ ...row, document: parsed.ok ? parsed.value : null, raw: response.body });
    } catch (error) {
      row.status = 0;
      row.error = error.code || error.message;
      failed = true;
      saved.push({ ...row, document: null, raw: null });
    }
  }
  const openapi = saved.find((row) => row.id === "openapi");
  const x402 = saved.find((row) => row.id === "x402");
  const readiness = saved.find((row) => row.id === "task-readiness");
  const careers = saved.find((row) => row.id === "careers-cold");
  const cards = saved.find((row) => row.id === "cards");

  if (openapi?.document) {
    const checked = validateInstance(OPENAPI_DOCUMENT_SCHEMA, openapi.document);
    openapi.contract = checked.ok ? "valid" : checked.reason;
    if (!checked.ok) failed = true;
  }
  if (x402?.document) {
    const checked = validateInstance(X402_DOCUMENT_SCHEMA, x402.document);
    x402.contract = checked.ok ? "valid" : checked.reason;
    if (!checked.ok) failed = true;
  }

  const entries = openapi?.document ? entriesFromOpenApi(openapi.document, openapi.url) : [];
  if (x402?.document) applyX402(entries, x402.document, x402.url);
  const discoveryEntry = readiness?.document ? entryFromDiscovery(readiness.document, readiness.url) : null;
  if (discoveryEntry) {
    const checked = validateInstance(discoveryEntry.outputSchema, readiness.document);
    readiness.contract = checked.ok ? "valid" : checked.reason;
    if (!checked.ok) failed = true;
    entries.push(discoveryEntry);
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const careersEntry = entries.find((entry) => entry.operationId === "getCareersBoardColdRecipe");
  if (careers?.document && careersEntry?.outputSchema) {
    const checked = validateInstance(careersEntry.outputSchema, careers.document);
    careers.contract = checked.ok ? "valid" : checked.reason;
    careers.operationId = careersEntry.operationId;
    careers.priceStateUnchanged = careersEntry.price.state;
    if (!checked.ok) failed = true;
  } else if (careers) {
    careers.contract = "schema_unavailable";
    failed = true;
  }

  const cardsEntry = entries.find((entry) => entry.operationId === "listPlatformHealthCards");
  if (cards) {
    cards.operationId = cardsEntry?.operationId || null;
    cards.contract = cardsEntry?.outputSchema ? "schema_present" : "schema_absent";
    cards.priceStateUnchanged = cardsEntry?.price?.state || null;
  }

  const coverage = {
    schema: COVERAGE_SCHEMA,
    feature: FEATURE,
    acquiredAt,
    failed,
    notFetched: ["paid routes", "clawhub scan", "clawhub publish", "signup", "authenticated surfaces"],
    sources: saved.map((row) => ({
      id: row.id,
      url: row.url,
      role: row.role,
      status: row.status,
      finalUrl: row.finalUrl || null,
      redirects: row.redirects || 0,
      bytes: row.bytes || 0,
      sha256: row.sha256 || null,
      contentType: row.contentType || null,
      json: row.json === true,
      contract: row.contract || null,
      operationId: row.operationId || null,
      priceStateUnchanged: row.priceStateUnchanged || null,
      error: row.error || null,
      fetchedAt: row.fetchedAt,
    })),
    entries: entries.length,
    outputSchemas: entries.filter((entry) => entry.outputSchemaState === "present").length,
    knownPrices: entries.filter((entry) => entry.price.state === "known").length,
    knownFree: entries.filter((entry) => entry.price.state === "known_free").length,
    unknownPrices: entries.filter((entry) => entry.price.state === "unknown").length,
  };

  const catalog = {
    schema: CATALOG_SCHEMA,
    feature: FEATURE,
    acquiredAt,
    coverage,
    entries,
  };

  if (outDir) {
    await mkdir(join(outDir, "sources"), { recursive: true });
    for (const row of saved) {
      if (row.raw) await writeFile(join(outDir, "sources", `${row.id}.json`), row.raw);
    }
    await writeFile(join(outDir, "coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
    await writeFile(join(outDir, "normalized.json"), `${JSON.stringify(catalog)}\n`);
  }
  return { ok: !failed, catalog, coverage };
}
