import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { clientKey, resetRateLimits, TRUSTED_PROXIES_ENV } from "../../lib/agent-readiness/rate-limit.js";
import { normalizeIp, isPrivateIp } from "../../lib/agent-readiness/ssrf.js";

const dir = mkdtempSync(join(tmpdir(), "sds-rate-"));
process.env.PULSE_FILE = join(dir, "pulse.json");
const { createSdsApp } = await import("../../app.js");
after(() => rmSync(dir, { recursive: true, force: true }));

const req = (peer, xff) => ({ socket: { remoteAddress: peer }, ip: "spoofed-derived-ip", headers: { "x-forwarded-for": xff } });
function policy(t, value) {
  const saved = process.env[TRUSTED_PROXIES_ENV];
  if (value === undefined) delete process.env[TRUSTED_PROXIES_ENV];
  else process.env[TRUSTED_PROXIES_ENV] = value;
  t.after(() => { if (saved === undefined) delete process.env[TRUSTED_PROXIES_ENV]; else process.env[TRUSTED_PROXIES_ENV] = saved; });
}

test("private peers and req.ip do not authorize forwarded client addresses by default", t => {
  policy(t);
  for (const peer of ["10.0.0.1", "127.0.0.1", "::ffff:127.0.0.1", "8.8.8.8", "fd00::1"]) {
    for (const xff of ["1.1.1.1", "9.9.9.9, 8.8.8.8", "not-an-ip"]) assert.equal(clientKey(req(peer, xff)), `peer:${normalizeIp(peer)}`);
  }
  assert.equal(clientKey({ ip: "8.8.8.8", headers: { "x-forwarded-for": "1.1.1.1" } }), "peer:unknown");
});

test("configured trust walks right to left and stops before spoofed prefixes", t => {
  policy(t, "10.0.0.1/32,10.1.0.0/16,fd00::1/128");
  for (const prefix of ["1.1.1.1", "9.9.9.9", "2606:4700:4700::1111"]) {
    assert.equal(clientKey(req("10.0.0.1", `${prefix}, 8.8.8.8`)), "xff:8.8.8.8");
    assert.equal(clientKey(req("10.0.0.1", `${prefix}, 8.8.8.8, 10.1.2.3`)), "xff:8.8.8.8");
    assert.equal(clientKey(req("10.0.0.1", `${prefix}, 172.16.0.8, 10.1.2.3`)), "xff:172.16.0.8", "private intermediate peers are not implicitly trusted");
  }
  assert.equal(clientKey(req("10.0.0.2", "8.8.8.8, 10.1.2.3")), "peer:10.0.0.2");
  assert.notEqual(clientKey(req("10.0.0.1", "8.8.8.8")), clientKey(req("10.0.0.1", "9.9.9.9")));
  assert.equal(clientKey(req("fd00:0:0:0:0:0:0:1", "2606:4700:4700::1111")), "xff:2606:4700:4700::1111");
});

test("malformed forwarded addresses and malformed/trust-all policies fail closed", t => {
  policy(t, "10.0.0.1");
  for (const xff of [undefined, ["8.8.8.8"], "", "1.1.1.1,,8.8.8.8", "unknown", "1.1.1.1:123", "[::1]:80", "::gg", "001.1.1.1", "8.8.8.8%bad", "8.8.8.8,invalid", "x".repeat(4097), Array(33).fill("8.8.8.8").join(",")]) assert.equal(clientKey(req("10.0.0.1", xff)), "peer:10.0.0.1");
  for (const value of ["*", "true", "1", "loopback", "0.0.0.0/0", "::/0", "10.0.0.1,broken", "10.0.0.0/33", "fd00::/129", "10.0.0.1/-1", "10.0.0.1/32/extra", ""]) {
    process.env[TRUSTED_PROXIES_ENV] = value;
    assert.equal(clientKey(req("10.0.0.1", "8.8.8.8")), "peer:10.0.0.1", value);
  }
});

test("IPv4/mapped IPv6 and equivalent IPv6 forms share rate keys and SSRF classification", t => {
  policy(t, "10.0.0.1");
  for (const address of ["8.8.8.8", "::ffff:8.8.8.8", "::ffff:0808:0808"]) assert.equal(clientKey(req("::ffff:a00:1", address)), "xff:8.8.8.8");
  for (const address of ["2606:4700:4700::1111", "2606:4700:4700:0:0:0:0:1111", "2606:4700:4700:0000:0000:0000:0000:1111"]) assert.equal(clientKey(req("10.0.0.1", address)), "xff:2606:4700:4700::1111");
  for (const address of ["127.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "[::1]"]) assert.equal(isPrivateIp(address), true);
  for (const address of ["::ffff:8.8.8.8", "::ffff:808:808"]) assert.equal(isPrivateIp(address), false);
});

test("mounted readiness cannot rotate spoofed rate keys; configured clients retain separation", async t => {
  policy(t);
  const oldLimit = process.env.AGENT_READINESS_RATE_LIMIT;
  process.env.AGENT_READINESS_RATE_LIMIT = "2";
  t.after(() => { if (oldLimit === undefined) delete process.env.AGENT_READINESS_RATE_LIMIT; else process.env.AGENT_READINESS_RATE_LIMIT = oldLimit; resetRateLimits(); });
  const server = http.createServer(createSdsApp());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const check = async xff => (await fetch(`${origin}/agent-readiness?host=127.0.0.1&format=json`, { headers: { "x-forwarded-for": xff } })).status;
  resetRateLimits();
  assert.equal(await check("1.1.1.1"), 400);
  assert.equal(await check("9.9.9.9"), 400);
  assert.equal(await check("8.8.8.8"), 429);
  process.env[TRUSTED_PROXIES_ENV] = "127.0.0.1";
  resetRateLimits();
  assert.equal(await check("1.1.1.1, 8.8.8.8"), 400);
  assert.equal(await check("9.9.9.9, 8.8.8.8"), 400);
  assert.equal(await check("1.0.0.1, 8.8.8.8"), 429);
  assert.equal(await check("9.9.9.9"), 400);
});
