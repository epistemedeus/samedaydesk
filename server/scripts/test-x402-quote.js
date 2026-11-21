// The /x402 quote route: it makes exactly one fixed unpaid request, returns the challenge as
// received (status, headers, the decoded PAYMENT-REQUIRED header, the body), reuses a result for
// 30 seconds and says plainly when the gateway cannot be reached.
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { QUOTE_URL, createX402QuoteRouter } from "../routes/x402-quote.js";

const challenge = { x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000" }] };
const encoded = Buffer.from(JSON.stringify(challenge)).toString("base64");

async function serve(router) {
  const app = express();
  app.use("/api/x402-quote", router);
  const server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  return { url: `http://127.0.0.1:${server.address().port}/api/x402-quote`, close: () => server.close() };
}

test("returns the gateway's unpaid challenge for the one fixed request", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(challenge), { status: 402, headers: { "content-type": "application/json", "payment-required": encoded } });
  };
  let t = 1_000_000;
  const { url, close } = await serve(createX402QuoteRouter({ fetchImpl, now: () => t }));
  try {
    const res = await fetch(`${url}?url=https://evil.example`, { headers: { cookie: "a=b", authorization: "Bearer x" } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 402);
    assert.equal(body.request.url, QUOTE_URL);
    assert.equal(body.headers["payment-required"], encoded);
    assert.deepEqual(body.paymentRequired, challenge);
    assert.deepEqual(body.body, challenge);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, QUOTE_URL, "the caller's query is never used");
    assert.deepEqual(Object.keys(calls[0].init.headers), ["accept"], "no caller header is forwarded");
    await fetch(url);
    assert.equal(calls.length, 1, "reused within 30 seconds");
    t += 31_000;
    await fetch(url);
    assert.equal(calls.length, 2, "asked again after 30 seconds");
  } finally { close(); }
});

test("says so when the gateway cannot be reached", async () => {
  const { url, close } = await serve(createX402QuoteRouter({ fetchImpl: async () => { throw Object.assign(new Error("down"), { name: "TimeoutError" }); } }));
  try {
    const res = await fetch(url);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "gateway_unreachable", detail: "TimeoutError", url: QUOTE_URL });
  } finally { close(); }
});
