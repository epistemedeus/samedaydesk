#!/usr/bin/env node
/**
 * Pin-time export of the merchant HTTP response contracts.
 * Imports schema objects only to snapshot them. Not a runtime validator path.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const owned = join(here, "..");
const merchantRoot = process.env.D17_MERCHANT_ROOT || "/tmp/x402-url-extractor-d17-run";
const merchantRequire = createRequire(join(merchantRoot, "package.json"));
const { toJsonSchemaCompat } = merchantRequire("@modelcontextprotocol/sdk/server/zod-json-schema-compat.js");

const extractUrl = pathToFileURL(join(merchantRoot, "extract.mjs")).href;
const batchUrl = pathToFileURL(join(merchantRoot, "extract-batch.mjs")).href;
const pin = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(join(owned, "PIN.json"), "utf8")));

const { extractMcpOutputSchema, readMcpOutputSchema } = await import(extractUrl);
const { extractBatchOutputSchema, extractBatchMcpOutputSchema } = await import(batchUrl);

const extractJson = toJsonSchemaCompat(extractMcpOutputSchema, { strictUnions: true, pipeStrategy: "output" });
const readJson = toJsonSchemaCompat(readMcpOutputSchema, { strictUnions: true, pipeStrategy: "output" });
const batchHttpJson = extractBatchOutputSchema();
const batchMcpJson = toJsonSchemaCompat(extractBatchMcpOutputSchema, { strictUnions: true, pipeStrategy: "output" });

const payload = {
  merchantSha: pin.merchant.sha,
  generator: "scripts/export-canonical-contracts.mjs",
  binding: {
    "/extract": {
      httpHandler: "server.js GET /extract → res.json(await extract(url))",
      producingFunction: "extract",
      schemaExport: "extractMcpOutputSchema",
      schemaKind: "zod",
      mcpTool: "extract outputSchema is the same Zod object; run calls extract(url)",
      note: "HTTP success body is the extract() object. The export is named MCP because MCP reuses it. Catch ok:false envelopes are outside this success schema.",
    },
    "/read": {
      httpHandler: "server.js GET /read → res.json(await readMarkdown(url))",
      producingFunction: "readMarkdown",
      schemaExport: "readMcpOutputSchema",
      schemaKind: "zod",
      mcpTool: "read outputSchema is the same Zod object; run calls readMarkdown(url)",
      note: "HTTP success body is the readMarkdown() object. Catch ok:false envelopes are outside this success schema.",
    },
    "/extract/batch": {
      httpHandler: "server.js POST /extract/batch OpenAPI content schema extractBatchOutputSchema()",
      producingFunction: "formatMerchantResult / executeExtractBatch",
      schemaExport: "extractBatchOutputSchema",
      schemaKind: "json-schema",
      mcpZodExport: "extractBatchMcpOutputSchema",
      note: "HTTP OpenAPI uses extractBatchOutputSchema(). MCP uses a Zod sibling. This package binds HTTP to extractBatchOutputSchema, not the MCP Zod object.",
    },
  },
  schemas: {
    extract: extractJson,
    read: readJson,
    batchHttp: batchHttpJson,
    batchMcp: batchMcpJson,
  },
};

const out = join(owned, "src/canonical-contracts.generated.json");
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(`${out}\nextract keys=${Object.keys(extractJson.properties || {}).join(",")}\n`);
