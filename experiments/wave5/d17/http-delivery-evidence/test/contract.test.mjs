import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  RESPONSE_DIGEST_DOMAIN,
  digestResponseBytes,
  checkDeclaredContract,
  parseJsonBytes,
  RESOURCES,
  DELIVERY,
  VERDICT,
  SETTLEMENT_CLASS,
  evaluateResponseBytes,
  recordFromObservedResponse,
  isHistoricalV1PaidSuccess,
  HISTORICAL_VALIDATOR_VERDICT,
} from "../src/index.mjs";
import { validExtractBody, historicalV1Row } from "./helpers.mjs";

test("HTTP 200 plus nonempty text is not a pass without the declared contract", () => {
  const bytes = Buffer.from(JSON.stringify({ ok: true, status: 200, text: "hello from a page" }));
  const result = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: bytes,
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(result.validatorVerdict, VERDICT.INVALID);
  assert.equal(result.deliveryClass, DELIVERY.MALFORMED_BODY);
  assert.equal(result.usefulness, "unknown");
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, JSON.parse(bytes.toString())).ok, false);
});

test("missing and malformed bodies stay unknown or invalid, never pass", () => {
  const missing = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.alloc(0),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(missing.validatorVerdict, VERDICT.UNKNOWN);
  assert.equal(missing.deliveryClass, DELIVERY.MISSING_BODY);

  const malformed = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from("<html>not json"),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(malformed.validatorVerdict, VERDICT.INVALID);
  assert.equal(malformed.deliveryClass, DELIVERY.MALFORMED_BODY);
  assert.equal(parseJsonBytes(Buffer.from("{")).ok, false);
});

test("declared extract contract distinguishes refusal, truncation, and full capture", () => {
  const full = validExtractBody();
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, full).ok, true);
  const fullEval = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(full)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(fullEval.validatorVerdict, VERDICT.PASS);
  assert.equal(fullEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(fullEval.usefulness, "unknown");

  const refused = validExtractBody({
    status: 403,
    sourceOk: false,
    error: { code: "http_403", message: "source refused: HTTP 403" },
    text: "Access Denied block copy",
  });
  const refusedEval = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(refused)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(refusedEval.validatorVerdict, VERDICT.PASS);
  assert.equal(refusedEval.deliveryClass, DELIVERY.SOURCE_REFUSAL);
  assert.notEqual(refusedEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);

  const truncated = validExtractBody({
    text: "x".repeat(1200),
    capture: {
      ...full.capture,
      textTruncated: true,
    },
  });
  const truncatedEval = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(truncated)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(truncatedEval.deliveryClass, DELIVERY.TRUNCATED_PARTIAL);
  assert.equal(truncatedEval.counters.truncateMarks >= 1, true);
});

test("timeout and unsupported encoding stay distinct from source refusal", () => {
  const timeout = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify({
      ok: false,
      url: "https://slow.example/",
      requestedUrl: "https://slow.example/",
      finalUrl: null,
      status: null,
      sourceOk: false,
      error: { code: "timeout", message: "aborted" },
      capture: validExtractBody().capture,
    })),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(timeout.deliveryClass, DELIVERY.TRANSPORT_FAILURE);
  assert.equal(timeout.validatorVerdict, VERDICT.INVALID);

  const gzip = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify({
      ok: false,
      url: "https://gzip.example/",
      requestedUrl: "https://gzip.example/",
      finalUrl: null,
      status: null,
      sourceOk: false,
      error: { code: "unsupported_encoding", message: "compressed body unsupported" },
      capture: validExtractBody().capture,
    })),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(gzip.deliveryClass, DELIVERY.UNSUPPORTED_CONTENT);
});

test("response digest is domain-prefixed SHA-256 of the exact caller bytes", () => {
  const bytes = Buffer.from("response-value-alpha");
  const expected = createHash("sha256")
    .update(RESPONSE_DIGEST_DOMAIN, "utf8")
    .update(bytes)
    .digest("hex");
  assert.equal(digestResponseBytes(bytes), expected);
  assert.notEqual(digestResponseBytes(Buffer.from("response-value-beta")), expected);
  const hashedWithoutDomain = createHash("sha256").update(bytes).digest("hex");
  assert.notEqual(digestResponseBytes(bytes), hashedWithoutDomain);
});

test("historical v1 not_checked rows survive a later validated constant", () => {
  const row = historicalV1Row();
  assert.equal(isHistoricalV1PaidSuccess(row), true);
  assert.equal(isHistoricalV1PaidSuccess(row, { currentValidatorVerdict: "validated" }), true);
  const extra = historicalV1Row({ responseValidation: { schema: "future" } });
  assert.equal(isHistoricalV1PaidSuccess(extra, { currentValidatorVerdict: "validated" }), true);
  assert.equal(isHistoricalV1PaidSuccess(historicalV1Row({ validatorVerdict: "validated" })), false);
});

test("new validation records do not retain query, body text, or credentials", () => {
  const body = validExtractBody();
  const record = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(body)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    settlementReference: `0x${"3".repeat(64)}`,
  });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(body.text), false);
  assert.equal(serialized.includes("ok.example"), false);
  assert.equal(serialized.includes("payment-signature"), false);
  assert.equal(record.usefulness, "unknown");
  assert.equal(record.settlementClass, SETTLEMENT_CLASS.SIMULATED);
  assert.notEqual(record.settlementClass, SETTLEMENT_CLASS.REAL_UNVERIFIED);
});
