import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DELIVERY,
  RESOURCES,
  SETTLEMENT_CLASS,
  digestResponseBytes,
  isHistoricalV1PaidSuccess,
  openStore,
  recordFromObservedResponse,
} from "../src/index.mjs";
import {
  FAKE_SETTLE_TX,
  MERCHANT_SHA,
  PRICE_ATOMIC,
  PAY_TO,
  historicalV1Row,
  paidGet,
  readPinShaFromReadonlyClone,
  startFakeFacilitator,
  startMerchant,
  stopChild,
  waitForPaidEvidence,
} from "./helpers.mjs";

test("pinned merchant SHA is the accepted production head", () => {
  assert.equal(readPinShaFromReadonlyClone(), MERCHANT_SHA);
});

test("disposable merchant: request, caller digest, capture, restart, and negative classes", {
  timeout: 120_000,
}, async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "d17-http-merchant-"));
  const facilitator = await startFakeFacilitator();
  let merchant;
  t.after(async () => {
    await stopChild(merchant?.child);
    await facilitator.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const prior = historicalV1Row({
    id: "22222222-2222-4222-8222-222222222222",
    responseDigest: "f".repeat(64),
    settlementReference: `0x${"a".repeat(64)}`,
  });
  await writeFile(
    path.join(dataDir, "commerce-paid-success-evidence.ndjson"),
    `${JSON.stringify(prior)}\n`,
    "utf8",
  );

  merchant = await startMerchant({ dataDir, facilitatorUrl: facilitator.url });

  const ok = await paidGet(merchant.base, "/extract", "https://ok.example/");
  assert.equal(ok.paid.status, 200, ok.bytes.toString("utf8").slice(0, 500));
  assert.equal(ok.accepted.amount, PRICE_ATOMIC);
  assert.equal(ok.accepted.payTo, PAY_TO);
  const callerDigest = digestResponseBytes(ok.bytes);
  const okRecord = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: ok.bytes,
    merchantHttpStatus: ok.paid.status,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: FAKE_SETTLE_TX,
  });
  assert.equal(okRecord.responseDigest, callerDigest);
  assert.equal(okRecord.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(okRecord.usefulness, "unknown");
  assert.equal(okRecord.settlementClass, SETTLEMENT_CLASS.SIMULATED);
  assert.notEqual(okRecord.settlementClass, SETTLEMENT_CLASS.REAL_UNVERIFIED);

  const blocked = await paidGet(merchant.base, "/extract", "https://403.example/");
  const blockedRecord = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: blocked.bytes,
    merchantHttpStatus: blocked.paid.status,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: FAKE_SETTLE_TX,
  });
  assert.equal(blocked.paid.status, 200);
  assert.equal(blocked.body.status, 403);
  assert.equal(blocked.body.sourceOk, false);
  assert.equal(blockedRecord.deliveryClass, DELIVERY.SOURCE_REFUSAL);
  assert.notEqual(blockedRecord.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(blockedRecord.usefulness, "unknown");

  const truncated = await paidGet(merchant.base, "/extract", "https://long.example/");
  const truncatedRecord = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: truncated.bytes,
    merchantHttpStatus: truncated.paid.status,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: FAKE_SETTLE_TX,
  });
  assert.equal(truncated.body.capture.textTruncated, true);
  assert.equal(truncatedRecord.deliveryClass, DELIVERY.TRUNCATED_PARTIAL);

  const gzip = await paidGet(merchant.base, "/extract", "https://gzip.example/");
  const gzipRecord = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: gzip.bytes,
    merchantHttpStatus: gzip.paid.status,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: FAKE_SETTLE_TX,
  });
  assert.equal(gzip.body.ok, false);
  assert.equal(gzipRecord.deliveryClass, DELIVERY.UNSUPPORTED_CONTENT);

  const timedOut = await paidGet(merchant.base, "/extract", "https://slow.example/");
  const timeoutRecord = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: timedOut.bytes,
    merchantHttpStatus: timedOut.paid.status,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: FAKE_SETTLE_TX,
  });
  assert.equal(timedOut.body.error.code, "timeout");
  assert.equal(timeoutRecord.deliveryClass, DELIVERY.TRANSPORT_FAILURE);

  const rows = await waitForPaidEvidence(dataDir, 6);
  const live = rows.filter((row) => row.id !== prior.id);
  assert.equal(live.length >= 5, true, `expected live paid-success rows, got ${live.length}`);
  for (const row of live) {
    assert.equal(isHistoricalV1PaidSuccess(row, { currentValidatorVerdict: "validated" }), true);
    assert.equal(row.validatorVerdict, "not_checked");
    assert.equal(row.validatorAuthority, "none");
    assert.equal(row.validatorSource, "http_runtime_not_checked");
    assert.equal(row.payerClass, "unclassified");
    assert.equal(row.runtimeAttribution, "http");
  }
  const okRow = live.find((row) => row.responseDigest === callerDigest);
  assert.ok(okRow, "merchant retained digest must equal the caller-observed digest");
  assert.equal(okRow.method, "GET");
  assert.equal(okRow.route, "/extract");
  assert.equal(okRow.settlementReference, FAKE_SETTLE_TX);

  const store = openStore(dataDir);
  await store.appendValidation(okRecord);
  await store.appendValidation(blockedRecord);
  await store.appendValidation(truncatedRecord);
  await store.appendValidation(gzipRecord);
  await store.appendValidation(timeoutRecord);

  await stopChild(merchant.child);
  merchant = null;

  const afterStop = openStore(dataDir);
  const joined = await afterStop.join({ currentValidatorVerdict: "validated" });
  const priorJoin = joined.find((item) => item.historical?.id === prior.id);
  assert.ok(priorJoin, "unchanged old v1 evidence still joins after restart");
  assert.equal(priorJoin.historical.validatorVerdict, "not_checked");
  assert.equal(priorJoin.validations.length, 0);

  const okJoin = joined.find((item) => item.historical?.responseDigest === callerDigest);
  assert.ok(okJoin);
  assert.equal(okJoin.validations[0].responseDigest, callerDigest);
  assert.equal(okJoin.validations[0].deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(okJoin.validations[0].usefulness, "unknown");

  const blockedJoin = joined.find((item) => item.validations[0]?.deliveryClass === DELIVERY.SOURCE_REFUSAL);
  assert.ok(blockedJoin);
  assert.equal(blockedJoin.validations[0].merchantHttpStatus, 200);

  merchant = await startMerchant({ dataDir, facilitatorUrl: facilitator.url });
  const stillThere = await waitForPaidEvidence(dataDir, 6);
  assert.equal(stillThere.some((row) => row.id === prior.id), true);
  assert.equal(stillThere.some((row) => row.responseDigest === callerDigest), true);
  assert.equal(facilitator.calls.settle >= 5, true);
  assert.equal(facilitator.calls.verify, facilitator.calls.settle);
});
