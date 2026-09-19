# How to discover SDS MCP tools without paying

Use this when you already have the SameDayDesk apex Streamable HTTP URL
(`https://samedaydesk.com/mcp`, or a loopback extracted from this clone)
and the goal is **inventory only**: `GET`, `initialize`, `tools/list`, then
**stop**. Do not settle. Do not publish. Do not touch Neomorphic.

This is a Diátaxis how-to. It is not the unpaid for-agents first-success
tutorial, not the paid machine gateway at
`https://agents.samedaydesk.com/mcp`, and not a license-redemption guide.

Audience: an agent on a cold clone of `epistemedeus/samedaydesk`. Node
**22.x**. No `npm install`. Run every command from the repository root.

## Boundary

Apex `/mcp` is the free readiness surface in this repository. The paid
x402/MPP gateway is a different host. Listing a paid tool is catalog
metadata, not a bill.

| Surface | Unpaid discovery? | This how-to |
| --- | --- | --- |
| `GET https://samedaydesk.com/mcp` | Yes (banner) | Allowed |
| JSON-RPC `initialize` + `tools/list` on apex `/mcp` | Yes | Required |
| `tools/call` of `check_ai_readiness` / TaskMarket reads | Free, but not discovery | Out of scope here |
| `tools/call` of `generate_complete_fix_pack` | Paid Fix Pack path | Refuse before POST |
| `GET /mcp?cs=` or Stripe Payment Link | License / checkout | Refuse |
| `https://agents.samedaydesk.com/mcp` or `/extract/batch` | Paid gateway | Refuse |
| MCP Registry publish / `version=latest` write | Publish | Refuse |
| `vendor/neomorphic*` / neo-kernel-vendor | Other product | Refuse |

Speak the implemented protocol **`2024-11-05`**. Apex `initialize` is
fail-closed: it does not echo `2025-11-25`, `2026-07-28`, or a client-offered
version. Do not send `PAYMENT-SIGNATURE`, `X-PAYMENT`, `stripe-signature`,
or `Authorization`. Do not send `Mcp-Method`.

Five apex tools (order is load-bearing; pin is
`server/lib/mcp-tool-inventory.js`):

1. `check_ai_readiness` — free
2. `generate_complete_fix_pack` — **PAID** (listed, never called here)
3. `plan_taskmarket_delegation` — free plan only; does not create or fund a task
4. `browse_taskmarket_tasks` — free public read
5. `track_taskmarket_task` — free public read

The byte pin of the `TOOLS` block in `server/routes/mcp.js` is SHA-256
`068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf`
(same pin as `server/scripts/test-mcp-protocol-negotiation.js`). Drift
is a stop, not a reason to invent names.

## Cold run (offline, unpaid)

This command reads committed MCP source, serves that catalog on loopback
`node:http` (no Express, no `npm install`), POSTs `initialize` and
`tools/list`, then proves the loopback refuses `?cs=`, a payment header,
malformed JSON, and `tools/call` (HTTP 400, no handler execution). The
`rpc()` helper still refuses to send `tools/call`. It does not open Stripe
or POST to the live apex.

```bash
node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { MCP_TOOL_NAMES } from "./server/lib/mcp-tool-inventory.js";

const PAID_TOOL = "generate_complete_fix_pack";
const PROTOCOL = "2024-11-05";
const SERVER_INFO = { name: "samedaydesk-agent-tools", version: "1.2.0" };
const FROZEN_TOOLS_BLOCK_SHA256 =
  "068cbfdb8ddab4dac7eef335d51fbe347728d6ccca65bef0365a3eb831db6caf";
const FORBIDDEN_HEADERS = [
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
  "Authorization",
];
const EXPECTED_NAMES = [
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
];

const mcpSource = readFileSync("server/routes/mcp.js", "utf8");
const appSource = readFileSync("server/app.js", "utf8");

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker}`);
  return src.slice(start, end);
}

assert.deepEqual([...MCP_TOOL_NAMES], EXPECTED_NAMES);
assert.match(mcpSource, /const PROTOCOL_VERSION = "2024-11-05"/);
assert.match(mcpSource, /protocolVersion:\s*PROTOCOL_VERSION/);
assert.equal(mcpSource.includes("2025-11-25"), false);
assert.equal(mcpSource.includes("2026-07-28"), false);
assert.equal(mcpSource.includes("2999-01-01"), false);
assert.equal(mcpSource.includes("params?.protocolVersion || PROTOCOL_VERSION"), false);
assert.match(mcpSource, /name: "samedaydesk-agent-tools"/);
assert.match(mcpSource, /Unknown tool:/);
assert.match(mcpSource, /No license provided/);
assert.equal(appSource.includes("paymentMiddleware"), false);
assert.match(appSource, /app\.use\("\/mcp", mcpRouter\)/);

const toolsBlock = extractBlock(mcpSource, "const TOOLS = [", "const okMsg");
assert.equal(sha256(toolsBlock), FROZEN_TOOLS_BLOCK_SHA256);
const link = mcpSource.match(/const FIXPACK_LINK = "([^"]+)"/);
assert.ok(link, "FIXPACK_LINK missing from MCP source");
const tools = new Function(
  "FIXPACK_LINK",
  "MCP_TOOL_NAMES",
  `${toolsBlock}\nreturn TOOLS;`,
)(link[1], MCP_TOOL_NAMES);
assert.deepEqual(tools.map((tool) => tool.name), EXPECTED_NAMES);
assert.match(tools.find((tool) => tool.name === PAID_TOOL).description, /^PAID\./);

function handle(msg) {
  const { id, method } = msg || {};
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools } };
  }
  if (method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: "unpaid MCP discovery does not POST tools/call",
      },
    };
  }
  return id !== undefined
    ? { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } }
    : null;
}

const server = http.createServer(async (req, res) => {
  for (const header of FORBIDDEN_HEADERS) {
    if (req.headers[header.toLowerCase()]) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, rejected: true, code: "PAYMENT_HEADER_REFUSE", header }));
      return;
    }
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.searchParams.has("cs")) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, rejected: true, code: "STRIPE_PATH_REFUSE", path: req.url }));
    return;
  }
  if (req.method === "GET" && (url.pathname === "/mcp" || url.pathname === "/mcp/")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("samedaydesk agent tools MCP server (Streamable HTTP).\n");
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let msg;
  try {
    msg = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, rejected: true, code: "MALFORMED_JSON" }));
    return;
  }
  if (JSON.stringify(msg).includes('"tools/call"')) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, rejected: true, code: "PAID_REFUSE" }));
    return;
  }
  const out = handle(msg);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(out));
});

try {
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
assert.equal(typeof addr, "object");
assert.equal(addr.address, "127.0.0.1");
const { port } = addr;
const origin = `http://127.0.0.1:${port}/mcp`;

async function rpc(method, params, id = 1) {
  assert.notEqual(method, "tools/call", "unpaid discovery must not invoke tools/call");
  const body = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  const encoded = JSON.stringify(body);
  assert.equal(encoded.includes('"tools/call"'), false, "discovery POST must not include tools/call");
  const response = await fetch(origin, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: encoded,
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, json: await response.json() };
}

const initExact = await rpc("initialize", {
  protocolVersion: PROTOCOL,
  capabilities: {},
  clientInfo: { name: "sds-howto-unpaid-mcp", version: "0" },
});
assert.equal(initExact.status, 200);
assert.equal(initExact.json.result.protocolVersion, PROTOCOL);
assert.deepEqual(initExact.json.result.serverInfo, SERVER_INFO);

const initOfferedNewer = await rpc("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "sds-howto-unpaid-mcp", version: "0" },
}, 2);
assert.equal(initOfferedNewer.status, 200);
assert.equal(initOfferedNewer.json.result.protocolVersion, PROTOCOL);

const listed = await rpc("tools/list", {}, 7);
assert.equal(listed.status, 200);
assert.deepEqual(listed.json.result.tools.map((tool) => tool.name), EXPECTED_NAMES);
assert.match(listed.json.result.tools.find((tool) => tool.name === PAID_TOOL).description, /^PAID\./);
assert.equal(JSON.stringify(listed.json).includes("tools/call"), false);

const banner = await fetch(origin, { signal: AbortSignal.timeout(5000) });
assert.equal(banner.status, 200);
assert.match(await banner.text(), /samedaydesk agent tools MCP server/);

const csRefuse = await fetch(`${origin}?cs=cs_test_seeded`, { signal: AbortSignal.timeout(5000) });
assert.equal(csRefuse.status, 400);
const csJson = await csRefuse.json();
assert.equal(csJson.code, "STRIPE_PATH_REFUSE");
const stripePathRefused = csJson.rejected === true;

const payRefuse = await fetch(origin, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json",
    "PAYMENT-SIGNATURE": "e30=",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "sds-howto-unpaid-mcp", version: "0" },
    },
  }),
  signal: AbortSignal.timeout(5000),
});
assert.equal(payRefuse.status, 400);
const payJson = await payRefuse.json();
assert.equal(payJson.code, "PAYMENT_HEADER_REFUSE");
const paymentHeaderRefused = payJson.rejected === true;

const malformed = await fetch(origin, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: "{not-json",
  signal: AbortSignal.timeout(5000),
});
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).code, "MALFORMED_JSON");

const callRefuse = await fetch(origin, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: PAID_TOOL, arguments: { url: "https://example.com", license: "cs_test_seeded" } },
  }),
  signal: AbortSignal.timeout(5000),
});
assert.equal(callRefuse.status, 400);
const callJson = await callRefuse.json();
assert.equal(callJson.code, "PAID_REFUSE");
const loopbackCallRefused = callJson.rejected === true;
assert.equal(stripePathRefused, true);
assert.equal(paymentHeaderRefused, true);
assert.equal(loopbackCallRefused, true);

console.log(JSON.stringify({
  ok: true,
  surface: "sds-mcp-unpaid-discovery",
  quadrant: "howto",
  paid: false,
  liveMerchantPay: false,
  checkout: false,
  publish: false,
  neoKernelVendor: false,
  toolsCalled: false,
  paymentAttempted: false,
  protocolVersion: PROTOCOL,
  serverInfo: SERVER_INFO,
  toolNames: EXPECTED_NAMES,
  paidToolListed: PAID_TOOL,
  paidToolCalled: false,
  toolsBlockSha256: FROZEN_TOOLS_BLOCK_SHA256,
  origin,
  loopbackBind: addr.address,
  stripePathRefused,
  paymentHeaderRefused,
  loopbackCallRefused,
}, null, 2));
} finally {
await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
JS
```

Expected: exit **0** and JSON with `"ok": true`, `"paid": false`,
`"toolsCalled": false`, `"protocolVersion": "2024-11-05"`,
`"paidToolListed": "generate_complete_fix_pack"`, `"paidToolCalled": false`,
`"stripePathRefused": true`, `"paymentHeaderRefused": true`,
`"loopbackCallRefused": true`, `"loopbackBind": "127.0.0.1"`.

The loopback catalog is extracted from `server/routes/mcp.js`. It is not a
second product and it does not execute tool handlers.

## Seeded failure (required refusal)

The seed below is intentional. It asks this how-to to `tools/call`
`generate_complete_fix_pack`. Do not "fix" it by posting the call, attaching
a `cs_` license, or opening Stripe. Discovery refuses **before** POST.

```bash
(
  set +e
  SDS_HOWTO_SEED="${SDS_HOWTO_SEED:-paid-tool-call}" node --input-type=module <<'JS'
const PAID_TOOL = "generate_complete_fix_pack";
const FORBIDDEN_HEADERS = [
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
  "Authorization",
];
const PAYMENT_STOP_PATHS = ["/api/checkout", "/api/stripe/webhook", "/checkout", "/mcp?cs="];
const NEO_STOP = [
  "vendor/neomorphic-correspondence",
  "neo-kernel-vendor",
  "neomorphic.io",
  "npm run correspondence:migrate",
];
const KNOWN = [
  "paid-tool-call",
  "payment-signature",
  "stripe-path",
  "registry-publish",
  "neo-kernel-vendor",
];

let networkCalls = 0;
const fetchImpl = globalThis.fetch;
globalThis.fetch = async (...args) => {
  networkCalls += 1;
  return fetchImpl(...args);
};

function fail(code, message, extra = {}) {
  const body = {
    ok: false,
    rejected: true,
    code,
    message,
    paid: false,
    paymentAttempted: false,
    toolsCalled: false,
    publishAttempted: false,
    neoKernelVendor: false,
    ...extra,
    neverPostedCall: networkCalls === 0,
    networkCalls,
  };
  console.log(JSON.stringify(body, null, 2));
  console.error(message);
  process.exit(1);
}

const seed = process.env.SDS_HOWTO_SEED || "paid-tool-call";
if (seed === "paid-tool-call") {
  const forbiddenMethod = "tools/call";
  fail(
    "PAID_REFUSE",
    "tools/call of generate_complete_fix_pack is paid; unpaid MCP discovery does not settle",
    { seed, tool: PAID_TOOL, forbiddenMethod },
  );
}
if (seed === "payment-signature") {
  fail(
    "PAYMENT_HEADER_REFUSE",
    "payment headers are forbidden on unpaid MCP discovery",
    { seed, forbidden: FORBIDDEN_HEADERS, headerNeverSent: true },
  );
}
if (seed === "stripe-path") {
  fail(
    "STRIPE_PATH_REFUSE",
    "refusing Stripe/checkout path in unpaid MCP discovery: /api/checkout",
    { seed, path: "/api/checkout", stops: PAYMENT_STOP_PATHS, neverOpenedCheckout: true },
  );
}
if (seed === "registry-publish") {
  fail(
    "REGISTRY_PUBLISH_REFUSE",
    "MCP Registry publish is a kill condition for unpaid discovery",
    { seed, publishAttempted: false },
  );
}
if (seed === "neo-kernel-vendor") {
  fail(
    "NEO_VENDOR_REFUSE",
    "neomorphic/neo-kernel-vendor is out of scope for SDS unpaid MCP discovery",
    { seed, stops: NEO_STOP },
  );
}
fail("UNKNOWN_SEED", `unknown seeded failure: ${seed}`, { seed, known: KNOWN });
JS
  echo "seeded_exit:$?"
)
```

Expected: the Node process exits **1**. Stdout is JSON with
`"ok": false`, `"rejected": true`, `"code": "PAID_REFUSE"`,
`"neverPostedCall": true`, `"networkCalls": 0`, `"paymentAttempted": false`.
Stderr matches
`tools/call of generate_complete_fix_pack is paid; unpaid MCP discovery does not settle`.
`seeded_exit:1`.

Replay other named refusals with the same fence by setting `SDS_HOWTO_SEED`
(the fence defaults to `paid-tool-call` and does not hardcode that value over
a caller-supplied seed). Under `set -e`, the subshell still prints
`seeded_exit:1`.

| `SDS_HOWTO_SEED` | Exit | `code` |
| --- | --- | --- |
| `paid-tool-call` (default) | 1 | `PAID_REFUSE` |
| `payment-signature` | 1 | `PAYMENT_HEADER_REFUSE` |
| `stripe-path` | 1 | `STRIPE_PATH_REFUSE` |
| `registry-publish` | 1 | `REGISTRY_PUBLISH_REFUSE` |
| `neo-kernel-vendor` | 1 | `NEO_VENDOR_REFUSE` |
| `not-a-real-id` | 1 | `UNKNOWN_SEED` |

Apex source already maps an unknown `tools/call` name to JSON-RPC `-32602`
`Unknown tool: …` after the three TaskMarket names. That is a protocol
rejection. This how-to still must not POST `tools/call` to observe it.

## Optional live unpaid probe (still no pay)

Network is not required. If you already have it, the same three methods
against the deployed apex must match the cold catalog. Do not follow with
`tools/call`. The commands below are a `text` fence, not `bash`, so a
follow-the-doc extractor must not auto-run them.

```text
curl -sS https://samedaydesk.com/mcp
curl -sS -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"sds-howto-unpaid-mcp","version":"0"}}}' \
  https://samedaydesk.com/mcp
curl -sS -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}' \
  https://samedaydesk.com/mcp
```

Expect HTTP 200, protocol `2024-11-05`, server `samedaydesk-agent-tools`
`1.2.0`, and the same five tool names. `generate_complete_fix_pack`
description starts with `PAID.`. Then stop.

If dependencies are already installed, the in-repo gate is the same list-only
contract (it asserts the request must not include `tools/call`):

```text
node --test server/scripts/test-mcp-protocol-negotiation.js
```

That file imports Express. Skip it on a clone without `node_modules`.

## Do not run (wrong path for this how-to)

These are named so they can be refused. Do not execute them from this doc.

```text
curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"generate_complete_fix_pack","arguments":{"url":"https://example.com","license":"cs_test_seeded"}}}' \
  https://samedaydesk.com/mcp
curl -sS -H 'PAYMENT-SIGNATURE: e30=' https://samedaydesk.com/mcp
curl -sS 'https://samedaydesk.com/mcp?cs=cs_test_seeded'
curl -sS -H 'PAYMENT-SIGNATURE: e30=' \
  'https://agents.samedaydesk.com/extract?url=https://example.com'
node vendor/neomorphic-correspondence/dist/migrate.js
npm run correspondence:migrate
```

Reasons:

| Path fragment | Reason |
| --- | --- |
| `tools/call` + `generate_complete_fix_pack` | Paid Fix Pack; may fetch the target URL even without a valid license |
| `license` / `cs_` / `/mcp?cs=` | Stripe checkout-session redemption |
| `PAYMENT-SIGNATURE` / `X-PAYMENT` | Settlement credential |
| `agents.samedaydesk.com` `/extract` | Paid gateway, not apex discovery |
| `vendor/neomorphic*` / `correspondence:migrate` | Neomorphic / neo-kernel-vendor out of scope |
| MCP Registry POST / new version | Publish |

`tools/list` is not demand. A Fix Pack buy URL in the paid tool description
is not permission to open it.

## Related in-repo artifacts

- `server/routes/mcp.js` (apex Streamable HTTP MCP)
- `server/lib/mcp-tool-inventory.js` (five names)
- `server/scripts/test-mcp-protocol-negotiation.js` (list-only protocol gate)
- `server/lib/fixpack-license.js` (why `cs_` is a paid license, not used here)
- `TASKMARKET-INTEGRATION.md` (free plan/browse/track; creation stays on TaskMarket)
- `tools/presence/REGISTRY-CONSUMER.md` (read-only registry pitfall; no publish)
- `client/public/llms.txt` (apex MCP vs paid gateway)

## Bounds

In scope: offline source pin, loopback `initialize` + `tools/list`, named
refusals, optional live unpaid GET/initialize/list against apex `/mcp`.

Out of scope: `tools/call` (free or paid), wallets, payment headers,
facilitator settle, Stripe checkout, price or SKU edits, MCP Registry
writes, `vendor/neomorphic*`, `neomorphic.io`, neo-kernel-vendor,
`--live` paid gateway probes.
