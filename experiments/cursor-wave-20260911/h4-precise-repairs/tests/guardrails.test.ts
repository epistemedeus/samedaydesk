import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertLivePricesUnchanged,
  scanPackSourceForPaymentReassignment,
} from "../src/guardrails.ts";
import { MERCHANT_PIN, SDS_START_HEAD } from "../src/constants.ts";
import { MERCHANT_FIXTURE } from "../src/paths.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("SDS live prices remain extract $0.005 and seller-integrity-audit $0.01", () => {
  const pins = assertLivePricesUnchanged();
  assert.deepEqual(pins, {
    ok: true,
    extract: "$0.005",
    sellerIntegrityAudit: "$0.01",
  });
});

test("pack source does not reassign verifyPayment or settlePayment", () => {
  const scan = scanPackSourceForPaymentReassignment();
  assert.equal(scan.verifyPaymentReassigned, false);
  assert.equal(scan.settlePaymentReassigned, false);
});

test("merchant PR54 fixture is hook-based continuity, not a second signer", () => {
  const text = readFileSync(MERCHANT_FIXTURE, "utf8");
  assert.match(text, /onBeforeVerify/);
  assert.match(text, /onBeforeSettle/);
  assert.match(text, /Does not reassign `verifyPayment` or `settlePayment`/);
  assert.match(text, /signs only `payload`/);
  assert.match(text, /paymentPayload\.resource/);
  assert.match(text, /extensions\.bazaar/);
  assert.match(text, /Never abort verify\/settle/);
  assert.equal(MERCHANT_PIN, "a143898dd1ec35c097ca7eb0b472f30dad1ee319");
  assert.equal(SDS_START_HEAD, "5b97d1b02e786acd1895cfa1508087ae3f7a1545");
});

test("this pack does not wrap the six jobs as paid catalog offers", () => {
  const catalog = JSON.parse(
    readFileSync(
      join(packRoot, "../../../client/public/for-agents/useful-jobs/catalog.json"),
      "utf8",
    ),
  );
  assert.equal(catalog.runtime.purchaseAuthority, false);
  for (const job of catalog.jobs) {
    assert.equal(job.freeSample, true);
    assert.equal(job.exampleFlag, "--example");
  }
});
