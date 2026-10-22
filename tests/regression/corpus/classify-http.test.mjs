import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyResponse } from "./lib/classify-http.mjs";
import { judgeCdnFixture } from "./lib/surfaces/merchant.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("hcdn 403 fixture is cdn_challenge", () => {
  const fixture = JSON.parse(readFileSync(join(here, "fixtures/http/cdn-challenge.json"), "utf8"));
  assert.equal(classifyResponse(fixture), "cdn_challenge");
});

test("unpaid 402 fixture is payment_required", () => {
  const fixture = JSON.parse(readFileSync(join(here, "fixtures/http/x402-unpaid.json"), "utf8"));
  assert.equal(classifyResponse(fixture), "payment_required");
});

test("HTTP 301 is not product ok", () => {
  assert.equal(classifyResponse({ status: 301, headers: {}, body: "" }), "http_error");
});

test("200 hcdn challenge is cdn_challenge and is not scored as product 200", () => {
  const fixture = {
    status: 200,
    headers: { server: "hcdn", "content-type": "text/html" },
    body: "<html>Checking your browser before accessing samedaydesk.com. hcdn</html>",
  };
  assert.equal(classifyResponse(fixture), "cdn_challenge");
  const observed = judgeCdnFixture(fixture);
  assert.equal(observed.verdict, "reject");
  assert.equal(observed.code, "cdn_challenge");
});
