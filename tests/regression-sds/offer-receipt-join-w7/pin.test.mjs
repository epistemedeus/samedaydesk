import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ASSET,
  EXTRACT_AMOUNT,
  EXTRACT_DIGEST,
  NETWORK,
  PAY_TO,
  READ_AMOUNT,
  SCAN_AMOUNT,
  SCHEME,
} from "./lib/pin.mjs";
import {
  findCatalogItem,
  loadBuyerCatalog,
  loadCommittedX402,
  loadExtractDigest,
  offerFromCatalogItem,
} from "./lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("committed x402 catalog still pins extract/read/scan amounts", () => {
  const doc = loadCommittedX402();
  assert.equal(doc.x402Version, 2);
  assert.ok(Array.isArray(doc.items) && doc.items.length >= 3);

  const extract = offerFromCatalogItem(findCatalogItem(doc, "/extract"));
  const read = offerFromCatalogItem(findCatalogItem(doc, "/read"));
  const scan = offerFromCatalogItem(findCatalogItem(doc, "/scan"));

  assert.equal(extract.amount, EXTRACT_AMOUNT);
  assert.equal(read.amount, READ_AMOUNT);
  assert.equal(scan.amount, SCAN_AMOUNT);
  for (const offer of [extract, read, scan]) {
    assert.equal(offer.scheme, SCHEME);
    assert.equal(offer.network, NETWORK);
    assert.equal(offer.asset, ASSET);
    assert.equal(offer.payTo, PAY_TO);
  }
});

test("buyer-runtime catalog still lists offer-receipt as a volatile extension", () => {
  const catalog = loadBuyerCatalog();
  assert.ok(catalog.contract.extensionKeys.includes("offer-receipt"));
  assert.ok(
    catalog.volatileOmitted.some((item) => String(item).includes("extensions.offer-receipt")),
  );
  assert.equal(catalog.contract.amount, EXTRACT_AMOUNT);
  assert.equal(catalog.contract.payTo, PAY_TO);
});

test("frozen pack pin matches committed extract accept", () => {
  const frozen = JSON.parse(readFileSync(join(here, "fixtures/pin/extract-offer.json"), "utf8"));
  const extract = offerFromCatalogItem(findCatalogItem(loadCommittedX402(), "/extract"));
  assert.equal(frozen.amount, extract.amount);
  assert.equal(frozen.payTo, extract.payTo);
  assert.equal(frozen.asset, extract.asset);
  assert.equal(frozen.network, extract.network);
  assert.equal(frozen.bazaarExtractDigest, EXTRACT_DIGEST);
  assert.equal(loadExtractDigest(), EXTRACT_DIGEST);
});
