import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { capture, capturePreflight } from "../src/providers.mjs";
import { publicFetch } from "../vendor/extractor/public-fetch.mjs";
import { sha256 } from "../src/util.mjs";
import { fixture, delay } from "./helpers.mjs";

test("SSRF blocks normalized numeric, private, metadata, IPv6, userinfo, protocol and port escapes before quote", async t => {
  const f = await fixture(t);
  const urls = ["http://localhost/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/",
    "http://10.1.2.3/", "http://169.254.169.254/", "http://172.16.0.1/", "http://192.168.0.1/", "http://100.64.0.1/",
    "http://192.0.0.1/", "http://198.18.0.1/", "http://198.51.100.1/", "http://203.0.113.1/", "http://224.0.0.1/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[2606:4700:4700::1111]/", "http://internal.local/",
    "file:///etc/passwd", "gopher://example.com/", "https://user:secret@example.com/", "https://example.com:22/", "https://example.com/#fragment"];
  for (const url of urls) {
    const result = await f.request("/v1/quote", { body: { routeId: "http.capture", input: { url } } });
    assert.equal(result.status, 400, url); assert.equal(result.body.error.code, "ssrf_blocked", url);
  }
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM quotes").get().n, 0);
});

test("all DNS answers must be public IPv4; mixed answers and rebinding to private cannot open a socket", async () => {
  let requests = 0;
  for (const answers of [[], [{ address: "127.0.0.1", family: 4 }], [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }], [{ address: "::1", family: 6 }]]) {
    await assert.rejects(publicFetch("https://public.example/", { signal: AbortSignal.timeout(1000) }, {
      lookup: async () => answers, request: () => { requests++; throw new Error("socket must not open"); },
    }), /blocked/);
  }
  assert.equal(requests, 0);
});

async function upstream(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  let resolverCalls = 0, requests = 0;
  const dependencies = {
    lookup: async () => { resolverCalls++; return [{ address: resolverCalls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }]; },
    request: (url, options, callback) => {
      requests++;
      assert.equal(url.hostname, "public.example");
      assert.equal(options.agent, false);
      options.lookup(url.hostname, {}, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, "93.184.216.34"); assert.equal(family, 4);
      });
      options.lookup(url.hostname, { all: true }, (error, addresses) => {
        assert.equal(error, null); assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
      });
      // Local unsigned transport fixture only. The production function receives
      // no injectable transport from an HTTP caller and uses native DNS pinning.
      return http.request(`http://127.0.0.1:${server.address().port}${url.pathname}`, {
        method: options.method, headers: options.headers, signal: options.signal, agent: false,
      }, callback);
    },
  };
  return { dependencies, counts: () => ({ resolverCalls, requests }) };
}

test("production public-fetch pins its validated answer into connection lookup and forwards no credentials", async t => {
  let received;
  const fixture = await upstream(t, (req, res) => { received = req.headers; res.writeHead(200, { "content-type": "text/plain" }); res.end("real local socket bytes"); });
  const output = await capture({ url: "http://public.example/result" }, { signal: AbortSignal.timeout(1000) }, fixture.dependencies);
  assert.equal(output.bytes, 23); assert.equal(output.sha256, sha256("real local socket bytes"));
  assert.equal(Buffer.from(output.bodyBase64, "base64").toString(), "real local socket bytes");
  assert.deepEqual(fixture.counts(), { resolverCalls: 1, requests: 1 });
  for (const name of ["authorization", "cookie", "payment-signature", "x-payment", "x-samedaydesk-internal"]) assert.equal(received[name], undefined);
});

test("redirects to metadata/private hosts are never followed", async t => {
  const fixture = await upstream(t, (_req, res) => { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }); res.end("redirect"); });
  await assert.rejects(capture({ url: "http://public.example/redirect" }, { signal: AbortSignal.timeout(1000) }, fixture.dependencies), e => e.code === "redirect_blocked");
  assert.equal(fixture.counts().requests, 1);
});

test("provider response limit stops streaming and no partial output is returned", async t => {
  const fixture = await upstream(t, (_req, res) => { res.writeHead(200); res.end(Buffer.alloc(65537)); });
  await assert.rejects(capture({ url: "http://public.example/huge" }, { signal: AbortSignal.timeout(1000) }, fixture.dependencies), e => e.code === "response_too_large");
});

test("DNS timeout/abort prevents a delayed resolution from later opening a socket", async () => {
  let requests = 0;
  await assert.rejects(capture({ url: "https://public.example/" }, { signal: AbortSignal.timeout(10) }, {
    lookup: async () => { await delay(50); return [{ address: "93.184.216.34", family: 4 }]; },
    request: () => { requests++; throw new Error("no late socket"); },
  }));
  await delay(70); assert.equal(requests, 0);
});

test("stream timeout closes the actual upstream connection", async t => {
  let closed = false;
  const fixture = await upstream(t, (req, res) => {
    res.on("close", () => { closed = true; }); res.writeHead(200); res.write("partial");
  });
  await assert.rejects(capture({ url: "http://public.example/hang" }, { signal: AbortSignal.timeout(40) }, fixture.dependencies));
  await delay(50); assert.equal(closed, true);
});
