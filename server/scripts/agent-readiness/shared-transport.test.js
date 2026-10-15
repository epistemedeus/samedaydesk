import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as immediate } from "node:timers/promises";
import { rawExchange, guardedExchange } from "../../lib/agent-readiness/probe.js";
import { createRequestBudget, fetchPublicBounded } from "../../lib/agent-readiness/bounded-fetch.js";
import { isPrivateIp } from "../../lib/agent-readiness/ssrf.js";
import { PUBLIC_IP, OTHER_PUBLIC_IP, publicLookup, localServer, closeServer, wireSockets } from "./fixtures/socket-controls.mjs";

test("literal URLs cannot bypass pinned-address admission", async () => {
  let hits = 0;
  const server = await localServer((_req, res) => { hits++; res.end("private"); });
  try {
    const port = server.address().port;
    for (const address of ["127.0.0.1", PUBLIC_IP, undefined]) {
      const got = await rawExchange(new URL(`http://127.0.0.1:${port}/`), {
        ...(address ? { address: { address, family: 4 } } : {}), timeoutMs: 200,
      });
      assert.equal(got.status, 0, "SIG:LITERAL_BYPASSED_ADMISSION");
    }
    assert.equal(hits, 0);
  } finally { server.closeAllConnections(); await closeServer(server); }
});

test("a second admission cannot reuse a socket to the previous address", async () => {
  const first = await localServer((_req, res) => res.end("first"));
  const second = await localServer((_req, res) => res.end("second"));
  const wiring = wireSockets([{ address: PUBLIC_IP, server: first }, { address: OTHER_PUBLIC_IP, server: second }]);
  try {
    const url = new URL(`http://pool.example:${first.address().port}/`);
    assert.equal((await rawExchange(url, { address: { address: PUBLIC_IP, family: 4 } })).body, "first");
    await immediate(); // also exercise a fully idle pooled socket on the old source
    assert.equal((await rawExchange(url, { address: { address: OTHER_PUBLIC_IP, family: 4 } })).body, "second", "SIG:ADMITTED_ADDRESS_IGNORED_BY_POOL");
    assert.deepEqual(wiring.attempts.map((x) => x.address), [PUBLIC_IP, OTHER_PUBLIC_IP]);
  } finally {
    wiring.restore(); first.closeAllConnections(); second.closeAllConnections();
    await Promise.all([closeServer(first), closeServer(second)]);
  }
});

test("budget abort after response headers is a failure, never a successful prefix", async () => {
  const server = await localServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.write("<title>incomplete</title>");
  });
  const wiring = wireSockets([{ address: PUBLIC_IP, server }]);
  const budget = createRequestBudget(100);
  try {
    await assert.rejects(fetchPublicBounded(`http://body.example:${server.address().port}/`, { lookup: publicLookup, budget }),
      { code: "budget_exhausted" }, "SIG:ABORTED_BODY_ACCEPTED");
  } finally { budget.dispose(); wiring.restore(); server.closeAllConnections(); await closeServer(server); }
});

test("an incomplete HTTP body is rejected even when its prefix is valid", async () => {
  const server = await localServer((_req, res) => {
    res.writeHead(200, { "content-length": 100 }); res.write("{}");
    const timer = setTimeout(() => res.destroy(), 20);
    res.once("close", () => clearTimeout(timer));
  });
  const wiring = wireSockets([{ address: PUBLIC_IP, server }]);
  try {
    await assert.rejects(fetchPublicBounded(`http://partial.example:${server.address().port}/`, { lookup: publicLookup }),
      { code: "connection_failed" }, "SIG:INCOMPLETE_BODY_ACCEPTED");
  } finally { wiring.restore(); server.closeAllConnections(); await closeServer(server); }
});

test("the raw deadline bounds a continuously active body", async () => {
  const server = await localServer((_req, res) => {
    res.writeHead(200); res.write("x");
    const timer = setInterval(() => res.write("x"), 15);
    res.once("close", () => clearInterval(timer));
  });
  const wiring = wireSockets([{ address: PUBLIC_IP, server }]);
  const ctrl = new AbortController();
  const fallback = setTimeout(() => ctrl.abort(), 800);
  try {
    const start = Date.now();
    const got = await rawExchange(new URL(`http://drip.example:${server.address().port}/`), {
      address: { address: PUBLIC_IP, family: 4 }, timeoutMs: 80, signal: ctrl.signal,
    });
    assert.equal(got.error, "timeout", "SIG:ACTIVITY_EXTENDED_DEADLINE");
    assert.ok(Date.now() - start < 500);
  } finally { clearTimeout(fallback); wiring.restore(); server.closeAllConnections(); await closeServer(server); }
});

test("both consumers re-admit a redirect before making another socket", async () => {
  let hits = 0;
  const server = await localServer((_req, res) => { hits++; res.writeHead(302, { location: "/next" }); res.write("never-ending redirect body"); });
  const wiring = wireSockets([{ address: PUBLIC_IP, server }]);
  try {
    for (const exchange of [guardedExchange, fetchPublicBounded]) {
      let lookups = 0;
      await assert.rejects(exchange(`http://redirect.example:${server.address().port}/`, {
        lookup: async () => [{ address: ++lookups === 1 ? PUBLIC_IP : "127.0.0.1", family: 4 }],
      }), { code: "ssrf" });
      assert.equal(lookups, 2);
    }
    assert.equal(hits, 2, "SIG:REDIRECT_REBIND_REACHED_SERVER");
    assert.equal(wiring.attempts.length, 2);
  } finally { wiring.restore(); server.closeAllConnections(); await closeServer(server); }
});

test("special-purpose IPv6 addresses are not public socket targets", () => {
  for (const address of ["100::1", "100:0:0:1::1", "64:ff9b:1::7f00:1", "2001:2::1", "2001:db8::1", "2002:7f00:1::", "3fff::1", "5f00::1", "::127.0.0.1"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ["2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPrivateIp(address), false, address);
});
