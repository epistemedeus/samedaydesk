import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as immediate } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
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

test("a public IPv6 literal uses its admitted socket address and bracketed Host", async () => {
  let host;
  const server = await localServer((req, res) => { host = req.headers.host; res.end("ipv6 pinned"); });
  const address = "2606:4700:4700::1111";
  const wiring = wireSockets([{ address, server }]);
  try {
    const port = server.address().port;
    const got = await rawExchange(new URL(`http://[${address}]:${port}/`), { address: { address, family: 6 } });
    assert.equal(got.body, "ipv6 pinned");
    assert.equal(host, `[${address}]:${port}`);
    assert.deepEqual(wiring.attempts, [{ address, port }]);
  } finally { wiring.restore(); server.closeAllConnections(); await closeServer(server); }
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

test("an expired budget and a pre-aborted signal start no DNS or socket work", async () => {
  let lookups = 0;
  const lookup = async () => { lookups++; return publicLookup(); };
  const budget = createRequestBudget(0);
  const ctrl = new AbortController(); ctrl.abort();
  try {
    await assert.rejects(fetchPublicBounded("http://expired.example/", { lookup, budget }), { code: "budget_exhausted" });
    await assert.rejects(fetchPublicBounded("http://expired.example/", { lookup, signal: ctrl.signal }), { code: "budget_exhausted" });
    const got = await rawExchange(new URL("http://expired.example/"), { address: { address: PUBLIC_IP, family: 4 }, signal: ctrl.signal });
    assert.equal(got.error, "aborted");
    assert.equal(lookups, 0);
  } finally { budget.dispose(); }
});

async function childControl(mode, trusted = false) {
  const env = { ...process.env };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  delete env.NODE_EXTRA_CA_CERTS;
  if (trusted) env.NODE_EXTRA_CA_CERTS = fileURLToPath(new URL("./fixtures/tls/cert.pem", import.meta.url));
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/transport-child.mjs", import.meta.url)), mode], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (data) => { out += data; });
  child.stderr.on("data", (data) => { err += data; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, 0, `SIG:CHILD_DID_NOT_EXIT mode=${mode} ${err}`);
  const result = JSON.parse(out.trim());
  assert.deepEqual(result.leaked, [], `SIG:OPEN_HANDLES mode=${mode}`);
  return result;
}

test("TLS pins the socket while validating the logical hostname and certificate", async () => {
  const r = await childControl("tls", true);
  assert.equal(r.valid.body, "verified");
  assert.equal(r.mismatch.status, 0);
  assert.equal(r.mismatch.error, "connection", "SIG:TLS_IDENTITY_NOT_CHECKED");
  assert.equal(r.requests.length, 1);
  assert.equal(r.requests[0].servername, "pin.example");
  assert.equal(r.requests[0].host, `pin.example:${r.attempts[0].port}`);
  assert.equal(r.requests[0].path, "/doc?q=1");
  assert.equal(r.requests[0].headers.authorization, undefined);
  assert.equal(r.requests[0].headers.cookie, undefined);
  assert.deepEqual(r.attempts.map((x) => x.address), [PUBLIC_IP, PUBLIC_IP]);
});

test("TLS refuses an untrusted certificate and releases the failed connections", async () => {
  const r = await childControl("tls");
  assert.equal(r.valid.status, 0, "SIG:TLS_UNTRUSTED_CERT_ACCEPTED");
  assert.equal(r.requests.length, 0);
});

test("a budget cancels the actual DNS queries and leaves no query/timer handles", async () => {
  const r = await childControl("dns");
  assert.equal(r.code, "budget_exhausted");
  assert.equal(r.queries, 2, "SIG:DNS_CONTROL_DID_NOT_QUERY_BOTH_FAMILIES");
});

test("invalid input disposes the probe deadline before any connection", async () => {
  await childControl("invalid");
});

for (const mode of ["abort-body", "tls-hang", "redirect", "error"]) {
  test(`natural process exit after ${mode}: no owned sockets, agents or timers`, async () => {
    const r = await childControl(mode);
    if (mode === "abort-body") assert.equal(r.code, "budget_exhausted");
    else if (mode === "tls-hang") assert.equal(r.response.error, "timeout");
    else {
      assert.equal(r.response.body, "");
      assert.equal(r.response.disposed, true);
    }
  });
}
