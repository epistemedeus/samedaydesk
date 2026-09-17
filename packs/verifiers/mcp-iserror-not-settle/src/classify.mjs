import {
  CODES,
  NAIVE_SETTLE_BASES,
  PAYMENT_RESPONSE_META_KEY,
} from "./rules.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Fail-closed truthy flags used on the wire (boolean true, "true", 1). */
export function flagTrue(value) {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === "string" && value.trim().toLowerCase() === "true") return true;
  return false;
}

function tryParseJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function contentText(result) {
  if (!isPlainObject(result) || !Array.isArray(result.content)) return "";
  return result.content
    .map((item) => (isPlainObject(item) && typeof item.text === "string" ? item.text : ""))
    .join("\n");
}

export function extractMeta(result) {
  if (!isPlainObject(result)) return {};
  return isPlainObject(result._meta) ? result._meta : {};
}

export function paymentResponseFromResult(result) {
  const meta = extractMeta(result);
  const direct = meta[PAYMENT_RESPONSE_META_KEY] ?? meta["x402/payment_response"];
  if (direct !== undefined) return direct;
  return undefined;
}

export function isPaymentRequiredShape(value) {
  if (!isPlainObject(value)) return false;
  if (Array.isArray(value.accepts)) return true;
  if (value.x402Version != null && (value.error != null || value.accepts != null)) return true;
  const err = typeof value.error === "string" ? value.error.toLowerCase() : "";
  return err.includes("payment required");
}

export function paymentRequiredFromResult(result) {
  if (!isPlainObject(result)) return null;
  if (isPaymentRequiredShape(result.structuredContent)) return result.structuredContent;
  const text = contentText(result);
  const parsed = tryParseJson(text);
  if (isPaymentRequiredShape(parsed)) return parsed;
  return null;
}

export function isErrorResult(result) {
  if (!isPlainObject(result)) return false;
  return flagTrue(result.isError);
}

function paymentResponseSuccess(payResp) {
  if (!isPlainObject(payResp)) return false;
  return flagTrue(payResp.success) || flagTrue(payResp.settled);
}

function paymentResponseFailed(payResp) {
  if (!isPlainObject(payResp)) return false;
  if (paymentResponseSuccess(payResp)) return false;
  if (payResp.success === false || payResp.settled === false) return true;
  if (typeof payResp.error === "string" && payResp.error.length > 0) return true;
  return false;
}

export function extractRpcMessages(input) {
  if (Array.isArray(input)) return input;
  if (!isPlainObject(input)) return [];
  if (Array.isArray(input.rpc)) return input.rpc;
  if (Array.isArray(input.jsonrpc)) return input.jsonrpc;
  if (Array.isArray(input.body)) return input.body;
  if (Array.isArray(input.messages)) return input.messages;
  const single = input.rpc ?? input.jsonrpc ?? input.body ?? input.message ?? input.response;
  if (Array.isArray(single)) return single;
  if (isPlainObject(single) && (single.jsonrpc != null || "result" in single || "error" in single || single.method)) {
    return [single];
  }
  if (input.jsonrpc != null || "result" in input || "error" in input) return [input];
  return [];
}

export function classifyRpcMessage(msg, { httpStatus } = {}) {
  const notes = [];
  if (httpStatus === 200 || httpStatus === 202) {
    notes.push("HTTP success on the MCP transport is not settlement");
  }

  if (!isPlainObject(msg)) {
    return {
      class: "not_settle",
      code: CODES.MALFORMED_CASE,
      settleAllowed: false,
      isError: false,
      jsonrpcError: false,
      notes,
    };
  }

  if (msg.error != null) {
    return {
      class: "not_settle",
      code: CODES.JSONRPC_ERROR_NOT_SETTLE,
      settleAllowed: false,
      isError: false,
      jsonrpcError: true,
      notes,
    };
  }

  if (!Object.hasOwn(msg, "result")) {
    return {
      class: "not_settle",
      code: CODES.NO_RESULT_NOT_SETTLE,
      settleAllowed: false,
      isError: false,
      jsonrpcError: false,
      notes,
    };
  }

  const result = msg.result;
  const resultObj = isPlainObject(result) ? result : { value: result };
  const errorFlag = isErrorResult(resultObj);
  const payResp = paymentResponseFromResult(resultObj);
  const required = paymentRequiredFromResult(resultObj);
  const text = contentText(resultObj);
  const textMentionsPayment =
    /payment is verified|payment verified|settled|settlement/i.test(text);

  if (errorFlag && paymentResponseSuccess(payResp)) {
    return {
      class: "protocol_violation",
      code: CODES.ISERROR_WITH_SUCCESSFUL_PAYMENT_RESPONSE,
      settleAllowed: false,
      isError: true,
      jsonrpcError: false,
      implicitSettleClaim: true,
      notes: [
        ...notes,
        "isError true cannot carry a successful x402/payment-response",
      ],
    };
  }

  if (errorFlag && required) {
    return {
      class: "not_settle",
      code: CODES.ISERROR_PAYMENT_REQUIRED,
      settleAllowed: false,
      isError: true,
      jsonrpcError: false,
      notes: [...notes, "PaymentRequired challenge is not settlement"],
    };
  }

  if (errorFlag && (paymentResponseFailed(payResp) || /settlement failed/i.test(text))) {
    return {
      class: "not_settle",
      code: CODES.ISERROR_SETTLEMENT_FAILED,
      settleAllowed: false,
      isError: true,
      jsonrpcError: false,
      notes: [...notes, "settlement failure is signaled with isError true"],
    };
  }

  if (errorFlag && textMentionsPayment) {
    return {
      class: "not_settle",
      code: CODES.PAYMENT_VERIFIED_TEXT_ISERROR,
      settleAllowed: false,
      isError: true,
      jsonrpcError: false,
      notes: [
        ...notes,
        "tool text that mentions payment does not override isError",
      ],
    };
  }

  if (errorFlag) {
    return {
      class: "not_settle",
      code: CODES.ISERROR_NOT_SETTLE,
      settleAllowed: false,
      isError: true,
      jsonrpcError: false,
      notes,
    };
  }

  if (paymentResponseSuccess(payResp)) {
    return {
      class: "settle_candidate",
      code: CODES.SETTLEMENT_NOT_PROVEN,
      settleAllowed: "not_proven_by_this_pack",
      isError: false,
      jsonrpcError: false,
      notes: [
        ...notes,
        "isError did not fire; this pack does not prove chain settlement",
      ],
    };
  }

  return {
    class: "not_this_invariant",
    code: CODES.INVARIANT_HOLDS,
    settleAllowed: "not_proven_by_this_pack",
    isError: false,
    jsonrpcError: false,
    notes,
  };
}

export function claimSettled(claim) {
  if (claim === true) return true;
  if (!isPlainObject(claim)) return false;
  if (flagTrue(claim.settled)) return true;
  if (flagTrue(claim.settle)) return true;
  if (typeof claim.status === "string" && claim.status.trim().toLowerCase() === "settled") {
    return true;
  }
  return false;
}

export function claimBasis(claim) {
  if (!isPlainObject(claim)) return null;
  if (typeof claim.basis === "string") return claim.basis;
  if (typeof claim.reason === "string") return claim.reason;
  return null;
}

function settleRejectCode(classification, httpStatus, claim) {
  if (classification.code === CODES.ISERROR_WITH_SUCCESSFUL_PAYMENT_RESPONSE) {
    return CODES.ISERROR_WITH_SUCCESSFUL_PAYMENT_RESPONSE;
  }
  if (classification.code === CODES.PAYMENT_VERIFIED_TEXT_ISERROR) {
    return CODES.PAYMENT_VERIFIED_TEXT_ISERROR;
  }
  if (classification.jsonrpcError) return CODES.SETTLE_CLAIM_ON_JSONRPC_ERROR;
  const basis = claimBasis(claim);
  if (
    (httpStatus === 200 || httpStatus === 202 || NAIVE_SETTLE_BASES.includes(basis)) &&
    classification.isError
  ) {
    return CODES.HTTP_200_ISERROR_CLAIMED_SETTLE;
  }
  return CODES.SETTLE_CLAIM_ON_ISERROR;
}

/**
 * Apply an optional external settlement claim to one or more classified RPC messages.
 * The pack never proves settlement. It only forbids treating isError / JSON-RPC errors as settle.
 */
export function applyClaim(classifications, claim, { httpStatus } = {}) {
  const list = Array.isArray(classifications) ? classifications : [classifications];
  const blocking = list.find(
    (item) => item.settleAllowed === false || item.class === "protocol_violation",
  );
  const implicit = list.find((item) => item.implicitSettleClaim);
  const settled = claimSettled(claim) || Boolean(implicit);

  if (blocking && settled) {
    return {
      verdict: "reject",
      ok: false,
      code: settleRejectCode(blocking, httpStatus, claim),
      classification: blocking,
      classifications: list,
    };
  }

  if (blocking && !settled) {
    return {
      verdict: "pass",
      ok: true,
      code: blocking.code,
      classification: blocking,
      classifications: list,
    };
  }

  if (settled) {
    const candidate = list.find((item) => item.class === "settle_candidate") ?? list[0];
    return {
      verdict: "not_proven",
      ok: true,
      code: CODES.SETTLEMENT_NOT_PROVEN,
      classification: candidate,
      classifications: list,
      settlementProven: false,
    };
  }

  const primary = list[0];
  return {
    verdict: "pass",
    ok: true,
    code: primary?.code ?? CODES.INVARIANT_HOLDS,
    classification: primary,
    classifications: list,
  };
}

export function classifyCase(input) {
  if (!isPlainObject(input)) {
    return {
      verdict: "reject",
      ok: false,
      code: CODES.MALFORMED_CASE,
      error: "case must be a JSON object",
    };
  }

  const http = isPlainObject(input.http) ? input.http : {};
  const httpStatus = typeof http.status === "number" ? http.status : undefined;
  const messages = extractRpcMessages(input);
  if (messages.length === 0 && httpStatus != null && httpStatus !== 200 && httpStatus !== 202) {
    const classification = {
      class: "not_settle",
      code: CODES.HTTP_NOT_SETTLE,
      settleAllowed: false,
      isError: false,
      jsonrpcError: false,
      notes: ["non-success HTTP status is not settlement"],
    };
    return {
      ...applyClaim([classification], input.claim, { httpStatus }),
      httpStatus,
      messageCount: 0,
    };
  }

  if (messages.length === 0) {
    return {
      verdict: "reject",
      ok: false,
      code: CODES.MALFORMED_CASE,
      error: "case has no JSON-RPC message",
      httpStatus,
    };
  }

  const classifications = messages.map((msg) => classifyRpcMessage(msg, { httpStatus }));
  return {
    ...applyClaim(classifications, input.claim, { httpStatus }),
    httpStatus,
    messageCount: messages.length,
  };
}
