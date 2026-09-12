import {
  RESOURCES,
  boundCounter,
  checkDeclaredContract,
  contractNameForResource,
  parseJsonBytes,
} from "./contract.mjs";

export const SCHEMA = "samedaydesk.wave5.d17.http-response-validation.v1";

export const DELIVERY = Object.freeze({
  FULL_BOUNDED_CAPTURE: "full_bounded_capture",
  SOURCE_REFUSAL: "source_refusal",
  TRUNCATED_PARTIAL: "truncated_partial",
  UNSUPPORTED_CONTENT: "unsupported_content",
  TRANSPORT_FAILURE: "transport_failure",
  ENGINE_FAILURE: "engine_failure",
  MALFORMED_BODY: "malformed_body",
  MISSING_BODY: "missing_body",
});

export const VERDICT = Object.freeze({
  PASS: "pass",
  INVALID: "invalid",
  UNKNOWN: "unknown",
});

export const SETTLEMENT_CLASS = Object.freeze({
  SIMULATED: "simulated",
  UNPAID: "unpaid",
  REAL_UNVERIFIED: "real_unverified",
});

export const VALIDATOR_AUTHORITY = "merchant_declared_schema";
export const VALIDATOR_SOURCE = "caller_observed_http_bytes";
export const USEFULNESS_UNKNOWN = "unknown";

export const PROHIBITED_INFERENCES = Object.freeze([
  "http_200_is_useful_delivery",
  "nonempty_text_is_useful_delivery",
  "schema_pass_is_buyer_attested",
  "simulated_settlement_is_revenue",
  "not_checked_is_validated",
  "mcp_tool_is_http_buyer",
]);

const ENGINE_CODES = new Set([
  "fetch_error",
  "redirect_error",
  "invalid_response",
  "ssrf_blocked",
]);

export function classifyParsedBody({ resource, parsed, contract }) {
  if (!parsed.ok && parsed.reason === "missing_body") {
    return wrap(VERDICT.UNKNOWN, DELIVERY.MISSING_BODY, contract);
  }
  if (!parsed.ok) {
    return wrap(VERDICT.INVALID, DELIVERY.MALFORMED_BODY, contract);
  }

  const body = parsed.value;
  const failureCode = failureCodeOf(body);
  if (body && body.ok === false) {
    if (failureCode === "unsupported_encoding") {
      return wrap(VERDICT.INVALID, DELIVERY.UNSUPPORTED_CONTENT, contract);
    }
    if (failureCode === "timeout") {
      return wrap(VERDICT.INVALID, DELIVERY.TRANSPORT_FAILURE, contract);
    }
    if (ENGINE_CODES.has(failureCode)) {
      return wrap(VERDICT.INVALID, DELIVERY.ENGINE_FAILURE, contract);
    }
    if (!contract.ok) {
      return wrap(VERDICT.INVALID, DELIVERY.MALFORMED_BODY, contract);
    }
    return wrap(VERDICT.INVALID, DELIVERY.ENGINE_FAILURE, contract);
  }

  if (!contract.ok) {
    return wrap(VERDICT.INVALID, DELIVERY.MALFORMED_BODY, contract);
  }

  const truncateMarks = truncateMarksOf(body, resource);
  if (truncateMarks > 0) {
    return wrap(VERDICT.PASS, DELIVERY.TRUNCATED_PARTIAL, contract, truncateMarks);
  }
  if (body.sourceOk === false) {
    return wrap(VERDICT.PASS, DELIVERY.SOURCE_REFUSAL, contract, truncateMarks);
  }
  if (resource === RESOURCES.EXTRACT_BATCH) {
    if (body.ok === true && body.partial === false) {
      return wrap(VERDICT.PASS, DELIVERY.FULL_BOUNDED_CAPTURE, contract, truncateMarks);
    }
    return wrap(VERDICT.PASS, DELIVERY.TRUNCATED_PARTIAL, contract, truncateMarks);
  }
  if (body.sourceOk === true) {
    return wrap(VERDICT.PASS, DELIVERY.FULL_BOUNDED_CAPTURE, contract, truncateMarks);
  }
  return wrap(VERDICT.UNKNOWN, DELIVERY.MALFORMED_BODY, contract, truncateMarks);
}

export function evaluateResponseBytes({
  method,
  resource,
  responseBytes,
  merchantHttpStatus,
  settlementClass,
  settlementReference = null,
  payerClass = "unclassified",
  capturedAt = new Date().toISOString(),
  recordId,
} = {}) {
  const bytes = Buffer.isBuffer(responseBytes) || responseBytes instanceof Uint8Array
    ? Buffer.from(responseBytes)
    : Buffer.alloc(0);
  const parsed = parseJsonBytes(bytes);
  const contract = parsed.ok
    ? checkDeclaredContract(resource, parsed.value)
    : { ok: false, schemaErrors: 1, requiredPresent: 0, codes: [parsed.reason || "missing_body"] };
  const classified = classifyParsedBody({ resource, parsed, contract });
  return {
    schemaVersion: SCHEMA,
    contractName: contractNameForResource(resource),
    method,
    resource,
    merchantHttpStatus: Number.isInteger(merchantHttpStatus) ? merchantHttpStatus : null,
    settlementClass,
    settlementReference,
    payerClass,
    capturedAt,
    recordId,
    bytesLength: bytes.length,
    parsed,
    contract,
    ...classified,
  };
}

function failureCodeOf(body) {
  if (!body || typeof body !== "object") return null;
  if (body.error && typeof body.error === "object" && typeof body.error.code === "string") {
    return body.error.code;
  }
  if (typeof body.error === "string") return body.error;
  return null;
}

function truncateMarksOf(body, resource) {
  let marks = 0;
  const capture = body?.capture;
  if (capture?.bodyTruncated === true) marks += 1;
  if (capture?.textTruncated === true) marks += 1;
  if (body?.truncated === true) marks += 1;
  if (resource === RESOURCES.EXTRACT_BATCH && body?.partial === true) marks += 1;
  return boundCounter(marks);
}

function wrap(verdict, deliveryClass, contract, truncateMarks = 0) {
  return {
    validatorVerdict: verdict,
    validatorAuthority: VALIDATOR_AUTHORITY,
    validatorSource: VALIDATOR_SOURCE,
    deliveryClass,
    usefulness: USEFULNESS_UNKNOWN,
    counters: {
      schemaErrors: boundCounter(contract.schemaErrors),
      requiredPresent: boundCounter(contract.requiredPresent),
      truncateMarks: boundCounter(truncateMarks),
    },
  };
}
