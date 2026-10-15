// AE24 growth: redirects that leave public http(s) are refused, never followed (guardedExchange, ca826091).
import test from "node:test";
import assert from "node:assert/strict";
import { guardedExchange, MAX_REDIRECTS } from "../lib/agent-readiness/probe.js";
const lookup = async (host) => [{ address: host.endsWith(".internal") ? "10.0.0.5" : "93.184.216.34", family: 4 }];
function rig(location) {
  const hits = [];
  const rawExchange = async (url) => { hits.push(url.toString()); return hits.length === 1 ? { status: 302, headers: { location }, body: "" } : { status: 200, headers: {}, body: "followed" }; };
  return { hits, opts: { lookup, rawExchange } };
}
for (const [name, loc, re] of [
  ["private-address target", "https://evil.internal/x", /not a public address/],
  ["non-http scheme", "file:///etc/passwd", /left http\(s\)/],
  ["credentials in target", "https://user:pw@example.org/", /credentials/],
]) {
  test(`AE24 redirect refused: ${name}`, async () => {
    const { hits, opts } = rig(loc);
    await assert.rejects(guardedExchange("https://example.com/", opts), re);
    assert.equal(hits.length, 1, "the off-origin target was never fetched");
  });
}
test("AE24 redirect loop capped: stops after MAX_REDIRECTS hops and returns the 3xx unfollowed", async () => {
  let n = 0;
  const r = await guardedExchange("https://example.com/", { lookup, rawExchange: async () => ({ status: 302, headers: { location: `/r${++n}` } }) });
  assert.equal(n, MAX_REDIRECTS + 1);
  assert.equal(r.status, 302);
});
test("AE24 control: a public same-scheme redirect is followed", async () => {
  const { hits, opts } = rig("https://example.org/ok");
  assert.equal((await guardedExchange("https://example.com/", opts)).body, "followed");
  assert.equal(hits.length, 2);
});
