import test from "node:test";
import assert from "node:assert/strict";
import { createReceiptRpc } from "./receipt-rpc.mjs";

test("provider refusal produces one attempt and never changes endpoints", async () => {
  const calls = [];
  const rpc = createReceiptRpc({ intervalMs: 0, fetchImpl: async (url, options) => {
    calls.push({ origin: url.origin, body: JSON.parse(options.body) });
    return { ok: false, status: 429 };
  } });
  await assert.rejects(rpc("https://rpc.example.test/private-token", "eth_getTransactionReceipt", ["0x01"]), /HTTP 429/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, "https://rpc.example.test");
  assert.equal(calls[0].body.method, "eth_getTransactionReceipt");
});

test("receipt reads retain exact results and reject absent or error results", async () => {
  const read = result => createReceiptRpc({ intervalMs: 0, fetchImpl: async () => ({ ok: true, json: async () => result }) });
  assert.deepEqual(await read({ result: [] })("https://rpc.example.test", "eth_getLogs", []), []);
  await assert.rejects(read({ result: null })("https://rpc.example.test", "eth_getTransactionReceipt", []), /no record/);
  await assert.rejects(read({ error: { code: -32602 } })("https://rpc.example.test", "eth_getLogs", []), /code -32602/);
});

test("write methods and unsafe configuration stop before any provider call", async () => {
  const rpc = createReceiptRpc({ intervalMs: 0, fetchImpl: () => { throw new Error("provider must stay untouched"); } });
  await assert.rejects(rpc("https://rpc.example.test", "eth_sendRawTransaction", []), /read methods/);
  await assert.rejects(rpc("http://rpc.example.test", "eth_chainId", []), /HTTPS/);
  assert.throws(() => createReceiptRpc({ intervalMs: -1 }), /interval/);
});
