import assert from "node:assert/strict";
import test from "node:test";
import { classifyResponse } from "./lib/http.mjs";

test("apex hcdn 403 is cdn_challenge, not product 200", () => {
  const kind = classifyResponse({
    status: 403,
    headers: { server: "hcdn" },
    body: "<html><title>Attention Required</title>Checking your browser before accessing samedaydesk.com</html>",
    url: "https://samedaydesk.com/mcp",
  });
  assert.equal(kind, "cdn_challenge");
  assert.notEqual(kind, "ok");
});

test("hcdn 200 product MCP help text is not a CDN challenge", () => {
  const kind = classifyResponse({
    status: 200,
    headers: { server: "hcdn" },
    body: "samedaydesk agent tools MCP server (Streamable HTTP).",
    url: "https://samedaydesk.com/mcp",
  });
  assert.equal(kind, "ok");
});

test("unpaid extract 402 is payment_required, not a pass-through 200", () => {
  const kind = classifyResponse({
    status: 402,
    headers: { server: "railway-hikari" },
    body: '{"error":"Payment required"}',
    url: "https://agents.samedaydesk.com/extract?url=https://example.com",
  });
  assert.equal(kind, "payment_required");
});
