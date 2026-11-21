import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fixture, TOKEN_A } from "./helpers.mjs";

function raw(f, { body = "{}", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${f.origin}${f.gateway.prefix}/v1/quote`, { method: "POST", headers: {
      authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json", ...headers,
    } }, res => {
      const chunks = []; res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on("error", reject); req.end(body);
  });
}

test("malformed, deep, unsafe-key, oversized and non-JSON bodies fail before any quote or attempt", async t => {
  const f = await fixture(t);
  assert.equal((await raw(f, { body: "{bad" })).status, 400);
  assert.equal((await raw(f, { body: '{"__proto__":{"tenant":"other"}}' })).status, 400);
  assert.equal((await raw(f, { body: `${'['.repeat(20)}0${']'.repeat(20)}` })).status, 400);
  assert.equal((await raw(f, { body: JSON.stringify({ huge: "x".repeat(132000) }) })).status, 413);
  assert.equal((await raw(f, { body: "{}", headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await raw(f, { body: "{}", headers: { "content-encoding": "gzip" } })).status, 415);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM quotes").get().n, 0);
});

test("public rate limiter ignores forged forwarded IPs and keeps health/discovery bounded", async t => {
  const f = await fixture(t, { httpOptions: { rateLimit: { perMinute: 2 } } });
  assert.equal((await f.request("/healthz")).status, 200);
  assert.equal((await f.request("/v1/discover", { headers: { "x-forwarded-for": "1.1.1.1" } })).status, 200);
  assert.equal((await f.request("/v1/discover", { headers: { "x-forwarded-for": "8.8.8.8" } })).status, 429);
});
