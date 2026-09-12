import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  CANONICAL_PIN,
  RESOURCES,
  SCHEMA_CONFORMANCE,
  SETTLEMENT_CLASS,
  bindOwningContracts,
  checkDeclaredContract,
  evaluateResponseBytes,
  generatedBatchMcpSchema,
  generatedHttpSchema,
  jsonSchemaSafeParse,
  resetOwningContracts,
} from "../src/index.mjs";
import {
  MERCHANT_ROOT,
  MERCHANT_SHA,
  merchantCatchEnvelope,
  readPinShaFromReadonlyClone,
  validBatchBody,
  validExtractBody,
} from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "../src");

test("runtime validator does not import merchant extract.mjs", () => {
  for (const name of [
    "contract.mjs",
    "classify.mjs",
    "store.mjs",
    "index.mjs",
    "json-schema-safe-parse.mjs",
  ]) {
    const text = readFileSync(join(srcDir, name), "utf8");
    assert.equal(text.includes("extract.mjs"), false, `${name} must not import extract.mjs`);
    assert.equal(text.includes("extract-batch.mjs"), false, `${name} must not import extract-batch.mjs`);
  }
});

test("generated pin matches the accepted merchant SHA and HTTP bindings", () => {
  assert.equal(readPinShaFromReadonlyClone(), MERCHANT_SHA);
  assert.equal(CANONICAL_PIN.merchantSha, MERCHANT_SHA);
  assert.equal(CANONICAL_PIN.binding["/extract"].schemaExport, "extractMcpOutputSchema");
  assert.equal(CANONICAL_PIN.binding["/read"].schemaExport, "readMcpOutputSchema");
  assert.equal(CANONICAL_PIN.binding["/extract/batch"].schemaExport, "extractBatchOutputSchema");
  assert.equal(CANONICAL_PIN.binding["/extract/batch"].mcpZodExport, "extractBatchMcpOutputSchema");
});

test("generated HTTP adapter agrees with live extractMcpOutputSchema.safeParse", async () => {
  const { extractMcpOutputSchema, readMcpOutputSchema } = await import(
    pathToFileURL(join(MERCHANT_ROOT, "extract.mjs")).href
  );
  const { extractBatchOutputSchema } = await import(
    pathToFileURL(join(MERCHANT_ROOT, "extract-batch.mjs")).href
  );

  const full = validExtractBody();
  const refused = validExtractBody({
    status: 403,
    sourceOk: false,
    error: { code: "http_403", message: "source refused: HTTP 403" },
  });
  const timedOut = merchantCatchEnvelope({ code: "timeout", message: "aborted" });

  assert.equal(extractMcpOutputSchema.safeParse(full).success, true);
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, full).ok, true);
  assert.equal(extractMcpOutputSchema.safeParse(refused).success, true);
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, refused).ok, true);
  assert.equal(extractMcpOutputSchema.safeParse(timedOut).success, false);
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, timedOut).ok, false);

  const quoteExtra = validBatchBody({
    quote: {
      amountAtomic: "10000",
      displayUsdc: "0.01",
      meaning: "up to five public URLs",
      extraQuoteField: "mcp-strict-quote-rejects-this",
    },
  });
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT_BATCH, quoteExtra, "POST").ok, true);
  assert.equal(jsonSchemaSafeParse(generatedHttpSchema(RESOURCES.EXTRACT_BATCH), quoteExtra).ok, true);
  assert.equal(jsonSchemaSafeParse(generatedBatchMcpSchema(), quoteExtra).ok, false);

  try {
    bindOwningContracts({
      extractSuccessParse: (value) => extractMcpOutputSchema.safeParse(value),
      readSuccessParse: (value) => readMcpOutputSchema.safeParse(value),
      batchHttpParse: (value) => extractBatchOutputSchema(),
    });
    const live = evaluateResponseBytes({
      method: "GET",
      resource: RESOURCES.EXTRACT,
      responseBytes: Buffer.from(JSON.stringify(full)),
      merchantHttpStatus: 200,
      settlementClass: SETTLEMENT_CLASS.SIMULATED,
    });
    const refusedLive = evaluateResponseBytes({
      method: "GET",
      resource: RESOURCES.EXTRACT,
      responseBytes: Buffer.from(JSON.stringify(refused)),
      merchantHttpStatus: 200,
      settlementClass: SETTLEMENT_CLASS.SIMULATED,
    });
    const timeoutLive = evaluateResponseBytes({
      method: "GET",
      resource: RESOURCES.EXTRACT,
      responseBytes: Buffer.from(JSON.stringify(timedOut)),
      merchantHttpStatus: 200,
      settlementClass: SETTLEMENT_CLASS.SIMULATED,
    });
    assert.equal(live.schemaConformance, SCHEMA_CONFORMANCE.HOLDS);
    assert.equal(refusedLive.schemaConformance, SCHEMA_CONFORMANCE.HOLDS);
    assert.equal(timeoutLive.schemaConformance, SCHEMA_CONFORMANCE.FAILS);
    assert.equal(checkDeclaredContract(RESOURCES.EXTRACT_BATCH, quoteExtra, "POST").ok, true);
  } finally {
    resetOwningContracts();
  }
});
