import assert from "node:assert/strict";
import test from "node:test";
import { classifyCase, classifyRpcMessage, flagTrue, isErrorResult } from "../src/classify.mjs";
import { CODES } from "../src/rules.mjs";

test("flagTrue fail-closes on boolean, string, and 1", () => {
  assert.equal(flagTrue(true), true);
  assert.equal(flagTrue("true"), true);
  assert.equal(flagTrue("TRUE"), true);
  assert.equal(flagTrue(1), true);
  assert.equal(flagTrue(false), false);
  assert.equal(flagTrue("false"), false);
  assert.equal(flagTrue(0), false);
  assert.equal(flagTrue(undefined), false);
});

test("isErrorResult reads CallToolResult.isError", () => {
  assert.equal(isErrorResult({ isError: true }), true);
  assert.equal(isErrorResult({ isError: "true" }), true);
  assert.equal(isErrorResult({ content: [] }), false);
  assert.equal(isErrorResult({ isError: false }), false);
});

test("HTTP 200 unpaid Fix Pack without a settle claim passes as not settle", () => {
  const report = classifyCase({
    http: { status: 200 },
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "No license provided." }],
        isError: true,
      },
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, "pass");
  assert.equal(report.classification.isError, true);
  assert.equal(report.classification.settleAllowed, false);
  assert.equal(report.code, CODES.ISERROR_NOT_SETTLE);
});

test("seeded failure: HTTP 200 + isError claimed settled is rejected", () => {
  const report = classifyCase({
    http: { status: 200 },
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "No license provided." }],
        isError: true,
      },
    },
    claim: { settled: true, basis: "http_200" },
  });
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.code, CODES.HTTP_200_ISERROR_CLAIMED_SETTLE);
});

test("payment-verified tool text does not override isError", () => {
  const report = classifyCase({
    http: { status: 200 },
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: "Your payment is verified, but auto-generation hit an error (boom).",
          },
        ],
        isError: true,
      },
    },
    claim: { settled: true, basis: "payment_verified_text" },
  });
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.code, CODES.PAYMENT_VERIFIED_TEXT_ISERROR);
});

test("x402 PaymentRequired isError is a challenge, not settle", () => {
  const report = classifyCase({
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        structuredContent: {
          x402Version: 2,
          error: "Payment required to access this resource",
          accepts: [{ scheme: "exact" }],
        },
        content: [{ type: "text", text: "{\"x402Version\":2,\"accepts\":[]}" }],
      },
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.code, CODES.ISERROR_PAYMENT_REQUIRED);
});

test("settlement failure with isError is not settle", () => {
  const msg = classifyRpcMessage({
    jsonrpc: "2.0",
    id: 1,
    result: {
      isError: true,
      content: [{ type: "text", text: "Settlement failed" }],
      _meta: { "x402/payment-response": { success: false, error: "settle_failed" } },
    },
  });
  assert.equal(msg.settleAllowed, false);
  assert.equal(msg.code, CODES.ISERROR_SETTLEMENT_FAILED);
});

test("isError plus successful payment-response is a protocol violation", () => {
  const report = classifyCase({
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: true,
        content: [{ type: "text", text: "failed" }],
        _meta: { "x402/payment-response": { success: true, transaction: "0x1" } },
      },
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.code, CODES.ISERROR_WITH_SUCCESSFUL_PAYMENT_RESPONSE);
});

test("JSON-RPC error is not settle even on HTTP 200", () => {
  const report = classifyCase({
    http: { status: 200 },
    rpc: { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } },
    claim: { settled: true, basis: "http_ok" },
  });
  assert.equal(report.ok, false);
  assert.equal(report.code, CODES.SETTLE_CLAIM_ON_JSONRPC_ERROR);
});

test("success without isError is not proven settlement", () => {
  const report = classifyCase({
    http: { status: 200 },
    rpc: {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [{ type: "text", text: "ok" }],
        _meta: { "x402/payment-response": { success: true } },
      },
    },
    claim: { settled: true },
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, "not_proven");
  assert.equal(report.settlementProven, false);
  assert.equal(report.code, CODES.SETTLEMENT_NOT_PROVEN);
});

test("HTTP 402 without a body is not settle", () => {
  const report = classifyCase({ http: { status: 402 } });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, "pass");
  assert.equal(report.code, CODES.HTTP_NOT_SETTLE);
});

test("malformed input is rejected", () => {
  const report = classifyCase(null);
  assert.equal(report.ok, false);
  assert.equal(report.code, CODES.MALFORMED_CASE);
});

test("batch: one isError message blocks a batch settle claim", () => {
  const report = classifyCase({
    rpc: [
      { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } },
      {
        jsonrpc: "2.0",
        id: 2,
        result: { content: [{ type: "text", text: "fail" }], isError: true },
      },
    ],
    claim: { settled: true, basis: "jsonrpc_result" },
  });
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.equal(report.messageCount, 2);
});
