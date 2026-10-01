import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { UNKNOWN_TOOL_NAME, guardedExchange, mcpRpcBody, probeHost, rawExchange } from "../../lib/agent-readiness/probe.js";
import { PublicHostError, isPrivateIp } from "../../lib/agent-readiness/ssrf.js";
import { resetRateLimits } from "../../lib/agent-readiness/rate-limit.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("private, loopback, and link-local addresses are refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.20", "172.16.0.4", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp("1.1.1.1"), false);
  assert.equal(isPrivateIp("8.8.8.8"), false);
  assert.equal(isPrivateIp("172.32.0.1"), false);
});

test("seeded loopback server is never contacted", async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits += 1;
    res.end(`secret ${req.url}`);
  });
  const port = await listen(server);
  try {
    await assert.rejects(() => probeHost(`http://127.0.0.1:${port}/`), PublicHostError);
    await assert.rejects(() => probeHost("localhost"), PublicHostError);
    await assert.rejects(() => probeHost("http://169.254.169.254/latest/meta-data"), PublicHostError);
    await assert.rejects(() => probeHost("http://[::1]/"), PublicHostError);
    assert.equal(hits, 0);
  } finally {
    await close(server);
  }
});

test("DNS that resolves to a private address is refused before connect", async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.end("nope");
  });
  const port = await listen(server);
  try {
    await assert.rejects(
      () => probeHost("evil.example", {
        lookup: async () => [{ address: "10.0.0.8", family: 4 }],
        rawExchange(_url) {
          hits += 1;
          return { status: 200, headers: {}, body: "should not run" };
        },
      }),
      /not a public address/,
    );
    assert.equal(hits, 0);
    assert.equal(port > 0, true);
  } finally {
    await close(server);
  }
});

test("a redirect to a loopback address is refused and not fetched", async () => {
  const calls = [];
  await assert.rejects(
    () => guardedExchange("https://ok.example/llms.txt", {
      lookup: async (hostname) => {
        if (hostname === "ok.example") return [{ address: "1.1.1.1", family: 4 }];
        return [{ address: "127.0.0.1", family: 4 }];
      },
      rawExchange(url) {
        calls.push(String(url));
        return {
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
          body: "",
        };
      },
    }),
    /Redirect target is not a public address/,
  );
  assert.deepEqual(calls, ["https://ok.example/llms.txt"]);
});

test("the probe calls only initialize, tools/list, and the unknown tool", async () => {
  const calls = [];
  const publicLookup = async () => [{ address: "1.1.1.1", family: 4 }];
  const bundle = await probeHost("linked.example", {
    lookup: publicLookup,
    exchange: async (url, options = {}) => {
      const target = String(url);
      calls.push({ url: target, method: options.method, body: options.body || "" });
      if (options.method === "POST") {
        const message = JSON.parse(options.body);
        if (message.method === "tools/call" && message.params.name !== UNKNOWN_TOOL_NAME) {
          throw new Error(`real tool executed: ${message.params.name}`);
        }
        if (message.method === "initialize") {
          return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25", serverInfo: { name: "fixture", version: "1" } } }), finalUrl: target };
        }
        if (message.method === "tools/list") {
          return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "real_tool", description: "do not call", inputSchema: { type: "object" } }] } }), finalUrl: target };
        }
        return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, error: { code: -32602, message: "Unknown tool" } }), finalUrl: target };
      }
      if (target.endsWith("/llms.txt")) {
        return { status: 200, headers: { "content-type": "text/plain" }, body: "mcp-endpoint: https://mcp.partner.example/mcp\n", finalUrl: target };
      }
      if (target === "https://linked.example/" ) {
        return { status: 200, headers: { "content-type": "text/html" }, body: "<html>ok</html>", finalUrl: target };
      }
      return { status: 404, headers: {}, body: "", finalUrl: target };
    },
  });
  const toolCalls = calls.filter((call) => call.method === "POST").map((call) => JSON.parse(call.body));
  assert.deepEqual([...new Set(toolCalls.filter((call) => call.method === "tools/call").map((call) => call.params.name))], [UNKNOWN_TOOL_NAME]);
  assert.equal(toolCalls.some((call) => call.method === "tools/call" && call.params.name === "real_tool"), false);
  assert.equal(bundle.linkedMcp?.[0]?.url, "https://mcp.partner.example/mcp");
  assert.equal(mcpRpcBody("unknown").params.name, UNKNOWN_TOOL_NAME);
  assert.throws(() => mcpRpcBody("tools/call"));
});

test("response bodies are capped", async () => {
  const server = http.createServer((_req, res) => {
    res.end("x".repeat(250_000));
  });
  const port = await listen(server);
  try {
    const got = await rawExchange(new URL(`http://127.0.0.1:${port}/big`), {
      address: { address: "127.0.0.1", family: 4 },
      maxBytes: 1000,
      timeoutMs: 2000,
    });
    assert.equal(got.status, 200);
    assert.ok(got.body.length <= 1000, String(got.body.length));
  } finally {
    await close(server);
  }
});

test("pinned lookup connects to the resolved address, not a second name", async () => {
  let hostHeader = "";
  const server = http.createServer((req, res) => {
    hostHeader = req.headers.host || "";
    res.end("pinned");
  });
  const port = await listen(server);
  try {
    const got = await rawExchange(new URL(`http://example.com:${port}/pinned`), {
      address: { address: "127.0.0.1", family: 4 },
      timeoutMs: 2000,
    });
    assert.equal(got.body, "pinned");
    assert.match(hostHeader, /example\.com/);
  } finally {
    await close(server);
  }
});

test.after(() => {
  resetRateLimits();
});
