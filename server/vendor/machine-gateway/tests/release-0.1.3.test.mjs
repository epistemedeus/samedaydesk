// Dependency-free: node --test tests/release-0.1.3.test.mjs
// The selected 0.1.3 archive as built by the producer (neomorphic-io PR #479):
// exact received closure, unchanged rights notices, the shipped client equal to
// its member, the new client's typed cursor/timeout/cancel outcomes against the
// repaired market cursor producer, and the immutable 0.1.2 client still paging
// that repaired server with its legacy error shape.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { createMarketCursor } from "../../../../vendor/hosted-wallet-market/src/market-cursor.mjs";

const here = path => new URL(path, import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = version => readFileSync(here(`../releases/neomorphic-machine-gateway-${version}.tgz`));
const received = version => JSON.parse(readFileSync(here(`../deploy/RECEIVED-${version}.json`), "utf8"));

function members(tgz) {
  const tar = gunzipSync(tgz), out = new Map();
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString("latin1").replace(/\0.*$/s, "");
    const size = parseInt(header.subarray(124, 136).toString("latin1").replace(/[\0 ]+$/, ""), 8);
    out.set(name.replace(/^package\//, ""), Buffer.from(tar.subarray(at + 512, at + 512 + size)));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

test("0.1.0 to 0.1.2 keep their received bytes and 0.1.3 is the selected producer build", () => {
  const sums = readFileSync(here("../releases/SHA256SUMS"), "utf8").trim().split("\n");
  assert.deepEqual(sums, [
    "730a959d3d8bd7398a68015cc8f3ca1746170c0177093d5bf0d03faa75c832d3  neomorphic-machine-gateway-0.1.0.tgz",
    "ee120eaac84f58f759d5857355220685cebcc53d739cead76700720a2821b53d  neomorphic-machine-gateway-0.1.1.tgz",
    "0171af58f67ac845b720ee6d1cf7765cc1a0b4c65c5b258fc1dbd5ea99f5cfb6  neomorphic-machine-gateway-0.1.2.tgz",
    "2ae4cf46486c06166eda3a1817493f38e23e789cda490eec548da748692dca52  neomorphic-machine-gateway-0.1.3.tgz",
  ]);
  for (const line of sums) { const [digest, name] = line.split("  "); assert.equal(sha256(readFileSync(here(`../releases/${name}`))), digest, name); }
  const manifest = JSON.parse(readFileSync(here("../deploy/upstream-machine-manifest.json"), "utf8"));
  const next = received("0.1.3");
  assert.equal(manifest.version, "0.1.3");
  assert.equal(manifest.state, "prepared-not-deployed");
  assert.equal(manifest.sourceArchive.sha256, next.archiveSha256);
  assert.equal(next.repository, "epistemedeus/neomorphic-io");
  assert.equal(next.supersededDiagnostic.sha256 === next.archiveSha256, false, "the derived diagnostic is not the selected bytes");
  assert.equal(JSON.parse(readFileSync(here("../package.json"), "utf8")).version, "0.1.3");
});

test("the 0.1.3 closure matches RECEIVED, keeps the 0.1.2 member set and changes six named members", () => {
  const next = members(archive("0.1.3")), prior = members(archive("0.1.2"));
  assert.deepEqual([...next.keys()].sort(), [...prior.keys()].sort());
  assert.deepEqual([...next.keys()].sort(), Object.keys(received("0.1.3").files).sort());
  const changed = [];
  for (const [name, data] of next) {
    assert.equal(sha256(data), received("0.1.3").files[name], name);
    if (!data.equals(prior.get(name))) changed.push(name);
  }
  assert.deepEqual(changed.sort(), ["README.md", "bin/caller.mjs", "bin/client-io.mjs", "deploy/RUNBOOK.md", "npm-shrinkwrap.json", "package.json"]);
  for (const name of ["bin/client-io.mjs", "bin/caller.mjs"]) assert.ok(next.get(name).equals(readFileSync(here(`../${name}`))), `shipped ${name} equals the selected member`);
});

test("rights notices are carried exactly and no license is invented", () => {
  const next = members(archive("0.1.3")), prior = members(archive("0.1.2"));
  const notices = [...prior.keys()].filter(name => /(^|\/)(LICENSE|NOTICE|COPYING)[^/]*$/i.test(name)).sort();
  assert.deepEqual(notices, ["vendor/extractor/LICENSE", "vendor/extractor/lockfile/LICENSE"]);
  for (const name of notices) assert.ok(next.get(name).equals(prior.get(name)), name);
  assert.equal(Object.hasOwn(JSON.parse(next.get("package.json")), "license"), false);
  assert.equal(received("0.1.3").rights.packageLicenseField, null);
});

function client(t, version) {
  const dir = mkdtempSync(join(tmpdir(), `mg-${version}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, data] of members(archive(version))) {
    if (!name.startsWith("bin/") && !name.startsWith("src/")) continue;
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), data);
  }
  return import(pathToFileURL(join(dir, "bin/client-io.mjs")).href);
}

// The repaired market read: pages issued and read back with the market cursor producer.
async function market(t) {
  const cursors = createMarketCursor(randomBytes(32).toString("hex"));
  const rows = ["market-a", "market-b", "market-c"];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.endsWith("/slow")) return;
    if (url.pathname.endsWith("/cancelled")) return json(499, { error: { code: "execution_aborted" } });
    let after;
    try { after = cursors.read("market.discover", url.searchParams.get("cursor")); }
    catch (error) { return json(400, { ok: false, code: error.code }); }
    const start = after ? rows.indexOf(after) + 1 : 0, items = rows.slice(start, start + 1);
    const last = start + 1 >= rows.length;
    return json(200, { ok: true, value: { items, nextCursor: last ? null : cursors.emit("market.discover", items[0]) } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/neomorphic-contributor-journey`;
  const walk = async io => {
    const seen = []; let cursor = "";
    do {
      const page = await io.request(base, `/v1/market/discover?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.value.items); cursor = page.value.nextCursor;
    } while (cursor);
    return seen;
  };
  return { base, walk, tampered: cursors.emit("market.discover", "market-a").replace(/.$/, c => (c === "A" ? "B" : "A")) };
}
const failure = promise => promise.then(() => assert.fail("expected rejection"), error => error);

test("new 0.1.3 client: pages the repaired market and keeps cursor, timeout and cancellation codes", async t => {
  const io = await client(t, "0.1.3"), { base, walk, tampered } = await market(t);
  const keep = setInterval(() => {}, 1000); t.after(() => clearInterval(keep));
  assert.deepEqual(await walk(io), ["market-a", "market-b", "market-c"]);
  const typed = async (promise, fields) => {
    const error = await failure(promise);
    assert.ok(error instanceof io.GatewayRequestError, String(error));
    for (const [key, value] of Object.entries(fields)) assert.equal(error[key], value, key);
  };
  await typed(io.request(base, "/v1/market/discover?cursor=bad"), { code: "cursor_malformed", serverCode: "cursor_malformed", status: 400, recovery: "remote_refused" });
  await typed(io.request(base, `/v1/market/discover?cursor=${tampered}`), { code: "cursor_unrecognized", serverCode: "cursor_unrecognized", status: 400, recovery: "remote_refused" });
  await typed(io.request(base, "/slow", { timeoutMs: 50 }), { code: "request_timeout", serverCode: null });
  const controller = new AbortController();
  const pending = io.request(base, "/slow", { body: {}, key: "release-013-key-000001", signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await typed(pending, { code: "request_aborted", recovery: "sent_unconfirmed" });
  await typed(io.request(base, "/cancelled", { body: {}, key: "release-013-key-000002" }), { code: "execution_aborted", recovery: "remote_cancelled" });
});

test("old 0.1.2 client against the repaired market: pages complete, refusals keep the legacy shape", async t => {
  const io = await client(t, "0.1.2"), { base, walk, tampered } = await market(t);
  assert.equal(io.GatewayRequestError, undefined);
  assert.deepEqual(await walk(io), ["market-a", "market-b", "market-c"]);
  for (const cursor of ["bad", tampered]) {
    const error = await failure(io.request(base, `/v1/market/discover?cursor=${cursor}`));
    assert.equal(error.message, "gateway_http_400", cursor);
  }
});
