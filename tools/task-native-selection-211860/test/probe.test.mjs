import assert from "node:assert/strict";
import { test } from "node:test";
import { addressBlocked, hostnameBlocked, PublicHostError } from "../src/public-host.mjs";
import { probePublic } from "../src/probe.mjs";

test("ipaddr range classification blocks non-unicast targets", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "255.255.255.255", "::1", "fc00::", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(addressBlocked(ip), true, ip);
  }
  assert.equal(addressBlocked("8.8.8.8"), false);
  assert.equal(addressBlocked("2001:4860:4860::8888"), false);
  for (const host of ["localhost", "metadata.google.internal", "foo.local", "bar.internal", "2130706433", "0x7f000001", "127.0.0.1"]) {
    assert.equal(hostnameBlocked(host), true, host);
  }
  assert.equal(hostnameBlocked("agents.samedaydesk.com"), false);
});

function publicLookup() {
  return async () => [{ address: "93.184.216.34", family: 4 }];
}

test("probe refuses local, private, credential, and downgrade targets before or instead of a second hop", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("{}"), truncated: false };
  };
  await assert.rejects(() => probePublic("http://127.0.0.1/secret", { transport, lookup: publicLookup() }), (error) => error instanceof PublicHostError && error.code === "host_refused");
  await assert.rejects(() => probePublic("http://169.254.169.254/latest", { transport, lookup: publicLookup() }), (error) => error.code === "host_refused");
  await assert.rejects(() => probePublic("http://user:pass@example.com/", { transport, lookup: publicLookup() }), (error) => error.code === "credentials_refused");
  await assert.rejects(() => probePublic("file:///etc/passwd", { transport, lookup: publicLookup() }), (error) => error.code === "protocol_refused");
  assert.equal(calls, 0);

  calls = 0;
  await assert.rejects(() => probePublic("https://example.com/resource", {
    lookup: async () => [{ address: "10.0.0.8", family: 4 }],
    transport,
  }), (error) => error.code === "address_refused");
  assert.equal(calls, 0);

  calls = 0;
  await assert.rejects(() => probePublic("https://example.com/resource", {
    lookup: publicLookup(),
    transport: async () => {
      calls += 1;
      return { status: 302, headers: { location: "http://127.0.0.1/secret" }, body: Buffer.alloc(0), truncated: false };
    },
  }), (error) => error.code === "host_refused");
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(() => probePublic("https://example.com/resource", {
    lookup: publicLookup(),
    transport: async () => {
      calls += 1;
      return { status: 302, headers: { location: "http://example.com/plain" }, body: Buffer.alloc(0), truncated: false };
    },
  }), (error) => error.code === "redirect_downgrade");
  assert.equal(calls, 1);
});

test("probe returns a public body and refuses a truncated body", async () => {
  const ok = await probePublic("https://example.com/openapi.json", {
    lookup: publicLookup(),
    transport: async () => ({ status: 200, headers: { "content-type": "application/json" }, body: Buffer.from("{\"openapi\":\"3.1.0\"}"), truncated: false }),
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.hops.length, 1);
  await assert.rejects(() => probePublic("https://example.com/big", {
    lookup: publicLookup(),
    transport: async () => ({ status: 200, headers: {}, body: Buffer.alloc(0), truncated: true }),
  }), (error) => error.code === "body_truncated");
});
