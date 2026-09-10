import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACTS } from "./merchant-contracts.mjs";
import { requireMerchantRoot } from "./resolve-merchant-root.mjs";

let batchOutputPromise = null;

async function loadBatchOutput() {
  if (!batchOutputPromise) {
    const root = requireMerchantRoot();
    batchOutputPromise = import(
      pathToFileURL(join(root, "examples/customer-x402/src/batch-output.mjs")).href
    );
  }
  return batchOutputPromise;
}

export async function validateExtractBatchDocument(documentPath) {
  const body = JSON.parse(readFileSync(documentPath, "utf8"));
  const { assertExtractBatchSellerShape, EXTRACT_BATCH_TOP_FIELDS } = await loadBatchOutput();
  assertExtractBatchSellerShape(body);
  return {
    contract: CONTRACTS.C34.id,
    product: body.product,
    schemaVersion: body.schemaVersion,
    partial: body.partial === true,
    charged: body.charged === true,
    sourceCount: body.sources?.length ?? 0,
    requiredTopFields: [...EXTRACT_BATCH_TOP_FIELDS],
    ok: body.ok === true,
  };
}

export function mapExtractBatchToComparableRows(body, fields = ["title"]) {
  return (body.sources || []).map((row) => ({
    sourceKey: row.source,
    status: row.status,
    fields: Object.fromEntries(
      fields.map((field) => [field, row.data?.[field] ?? row.data?.headings?.[field] ?? null]),
    ),
    partial: row.status === "partial",
    error: row.error,
  }));
}
