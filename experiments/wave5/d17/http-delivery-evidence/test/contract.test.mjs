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
  SCHEMA_CONFORMANCE,
  SETTLEMENT_CLASS,
  MAX_RESPONSE_BYTES,
  evaluateResponseBytes,
  recordFromObservedResponse,
  canonicalizeValidationRecord,
  isHistoricalV1PaidSuccess,
  HISTORICAL_VALIDATOR_VERDICT,
} from "../src/index.mjs";
import {
  extractCapture,
  historicalV1Row,
  merchantCatchEnvelope,
  validBatchBody,
  validExtractBody,
  validReadBody,
} from "./helpers.mjs";

function evaluateExtract(body, extra = {}) {
  return evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(body)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
    ...extra,
  });
}

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
  assert.equal(result.schemaConformance, SCHEMA_CONFORMANCE.FAILS);
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
  assert.equal(missing.schemaConformance, SCHEMA_CONFORMANCE.NOT_APPLICABLE);

  const blank = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from("   \n"),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(blank.deliveryClass, DELIVERY.MISSING_BODY);
  assert.notEqual(missing.validatorVerdict, VERDICT.PASS);

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
  const fullEval = evaluateExtract(full);
  assert.equal(fullEval.validatorVerdict, VERDICT.PASS);
  assert.equal(fullEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(fullEval.schemaConformance, SCHEMA_CONFORMANCE.HOLDS);
  assert.equal(fullEval.usefulness, "unknown");

  const refused = validExtractBody({
    status: 403,
    sourceOk: false,
    error: { code: "http_403", message: "source refused: HTTP 403" },
    text: "Access Denied block copy",
  });
  const refusedEval = evaluateExtract(refused);
  assert.equal(refusedEval.validatorVerdict, VERDICT.PASS);
  assert.equal(refusedEval.deliveryClass, DELIVERY.SOURCE_REFUSAL);
  assert.equal(refusedEval.schemaConformance, SCHEMA_CONFORMANCE.HOLDS);
  assert.equal(refusedEval.counters.sourceRefusalMarks, 1);
  assert.notEqual(refusedEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);

  const truncated = validExtractBody({
    text: "x".repeat(1200),
    capture: extractCapture({ textTruncated: true }),
  });
  const truncatedEval = evaluateExtract(truncated);
  assert.equal(truncatedEval.deliveryClass, DELIVERY.TRUNCATED_PARTIAL);
  assert.equal(truncatedEval.counters.truncateMarks >= 1, true);
  assert.equal(truncatedEval.counters.sourceRefusalMarks, 0);
});

test("source refusal is principal when truncation is also present", () => {
  const both = validExtractBody({
    status: 403,
    sourceOk: false,
    error: { code: "http_403", message: "source refused: HTTP 403" },
    capture: extractCapture({ textTruncated: true, bodyTruncated: true }),
  });
  const result = evaluateExtract(both);
  assert.equal(result.deliveryClass, DELIVERY.SOURCE_REFUSAL);
  assert.notEqual(result.deliveryClass, DELIVERY.TRUNCATED_PARTIAL);
  assert.notEqual(result.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(result.validatorVerdict, VERDICT.PASS);
  assert.equal(result.counters.sourceRefusalMarks, 1);
  assert.equal(result.counters.truncateMarks >= 2, true);
});

test("schema-shaped HTTP 500 is not completed delivery", () => {
  const result = evaluateExtract(validExtractBody(), { merchantHttpStatus: 500 });
  assert.equal(result.schemaConformance, SCHEMA_CONFORMANCE.HOLDS);
  assert.equal(result.merchantHttpStatus, 500);
  assert.equal(result.validatorVerdict, VERDICT.INVALID);
  assert.equal(result.deliveryClass, DELIVERY.MERCHANT_HTTP_FAILURE);
  assert.notEqual(result.validatorVerdict, VERDICT.PASS);
  assert.notEqual(result.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);

  const record = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(validExtractBody())),
    merchantHttpStatus: 500,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(record.deliveryClass, DELIVERY.MERCHANT_HTTP_FAILURE);
  assert.equal(record.merchantHttpStatus, 500);
  assert.equal(record.usefulness, "unknown");
});

test("unsupported method or resource stays unknown, not invalid success", () => {
  const put = evaluateResponseBytes({
    method: "PUT",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(validExtractBody())),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(put.validatorVerdict, VERDICT.UNKNOWN);
  assert.equal(put.deliveryClass, DELIVERY.UNSUPPORTED_TARGET);
  assert.equal(put.schemaConformance, SCHEMA_CONFORMANCE.NOT_APPLICABLE);
  assert.notEqual(put.validatorVerdict, VERDICT.PASS);

  const scan = evaluateResponseBytes({
    method: "GET",
    resource: "/scan",
    responseBytes: Buffer.from(JSON.stringify({ ok: true, repo: "owner/name" })),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(scan.validatorVerdict, VERDICT.UNKNOWN);
  assert.equal(scan.deliveryClass, DELIVERY.UNSUPPORTED_TARGET);
  assert.equal(checkDeclaredContract("/scan", { ok: true }).unsupported, true);
});

test("timeout and unsupported encoding stay distinct from source refusal", () => {
  const timeout = evaluateExtract(merchantCatchEnvelope({
    url: "https://slow.example/",
    code: "timeout",
    message: "aborted",
  }));
  assert.equal(timeout.deliveryClass, DELIVERY.TRANSPORT_FAILURE);
  assert.equal(timeout.validatorVerdict, VERDICT.INVALID);
  assert.equal(timeout.schemaConformance, SCHEMA_CONFORMANCE.FAILS);
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT, merchantCatchEnvelope()).ok, false);

  const gzip = evaluateExtract(merchantCatchEnvelope({
    url: "https://gzip.example/",
    code: "unsupported_encoding",
    message: "compressed body unsupported",
  }));
  assert.equal(gzip.deliveryClass, DELIVERY.UNSUPPORTED_CONTENT);

  const fetchErr = evaluateExtract(merchantCatchEnvelope({
    url: "https://down.example/",
    code: "fetch_error",
    message: "unmapped extract fixture",
  }));
  assert.equal(fetchErr.deliveryClass, DELIVERY.ENGINE_FAILURE);
});

test("declared read and HTTP batch contracts hold for canonical success bodies", () => {
  const read = validReadBody();
  assert.equal(checkDeclaredContract(RESOURCES.READ, read).ok, true);
  const readEval = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.READ,
    responseBytes: Buffer.from(JSON.stringify(read)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(readEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);

  const batch = validBatchBody();
  assert.equal(checkDeclaredContract(RESOURCES.EXTRACT_BATCH, batch, "POST").ok, true);
  const batchEval = evaluateResponseBytes({
    method: "POST",
    resource: RESOURCES.EXTRACT_BATCH,
    responseBytes: Buffer.from(JSON.stringify(batch)),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(batchEval.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
});

test("bounded oversized capture is never full_bounded_capture", () => {
  const body = validExtractBody({ text: "x".repeat(MAX_RESPONSE_BYTES) });
  const bytes = Buffer.from(JSON.stringify(body));
  assert.equal(bytes.length > MAX_RESPONSE_BYTES, true);
  const result = evaluateResponseBytes({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: bytes,
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(result.bytesLength, bytes.length);
  assert.equal(result.storedByteLength, MAX_RESPONSE_BYTES);
  assert.notEqual(result.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
  assert.equal(result.counters.truncateMarks >= 1, true);

  const record = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: bytes,
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  assert.equal(record.responseByteLength, MAX_RESPONSE_BYTES);
  assert.equal(record.responseDigest, digestResponseBytes(bytes));
  assert.notEqual(record.deliveryClass, DELIVERY.FULL_BOUNDED_CAPTURE);
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
  assert.equal(record.counters.sourceRefusalMarks, 0);
});

test("canonicalize rejects non-finite event fields and drops private bytes", () => {
  const record = recordFromObservedResponse({
    method: "GET",
    resource: RESOURCES.EXTRACT,
    responseBytes: Buffer.from(JSON.stringify(validExtractBody())),
    merchantHttpStatus: 200,
    settlementClass: SETTLEMENT_CLASS.SIMULATED,
  });
  const stuffed = {
    ...record,
    parsed: { ok: true, value: validExtractBody() },
    text: validExtractBody().text,
    responseBytes: Buffer.from("secret"),
    codes: ["https://ok.example/?url=leak"],
    error: "fetch failed for https://ok.example/",
  };
  const canonical = canonicalizeValidationRecord(stuffed);
  const serialized = JSON.stringify(canonical);
  assert.equal(Object.hasOwn(canonical, "parsed"), false);
  assert.equal(Object.hasOwn(canonical, "text"), false);
  assert.equal(Object.hasOwn(canonical, "responseBytes"), false);
  assert.equal(Object.hasOwn(canonical, "codes"), false);
  assert.equal(Object.hasOwn(canonical, "error"), false);
  assert.equal(serialized.includes("ok.example"), false);
  assert.equal(serialized.includes(validExtractBody().text), false);

  assert.throws(() => canonicalizeValidationRecord({ ...record, merchantHttpStatus: Number.POSITIVE_INFINITY }));
  assert.throws(() => canonicalizeValidationRecord({ ...record, merchantHttpStatus: Number.NaN }));
  assert.throws(() => canonicalizeValidationRecord({ ...record, responseByteLength: Number.NaN }));
  assert.throws(() => canonicalizeValidationRecord({ ...record, responseByteLength: 1.5 }));
  assert.throws(() => canonicalizeValidationRecord({
    ...record,
    counters: { ...record.counters, truncateMarks: Number.POSITIVE_INFINITY },
  }));
});
