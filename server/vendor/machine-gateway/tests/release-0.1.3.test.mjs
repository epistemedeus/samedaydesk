// Dependency-free: node --test tests/release-0.1.3.test.mjs
// The prepared 0.1.3 client archive: exact closure against immutable 0.1.2, unchanged
// rights notices, and the repaired client receiving typed cursor, timeout and
// cancellation outcomes with server codes intact. 0.1.2 bytes stay as received.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BASE, ARCHIVE, VERSION, REPLACED, derive, readTar } from "../releases/derive-0.1.3.mjs";

const here = path => new URL(path, import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const bytesOf = name => readFileSync(here(`../releases/${name}`));
const received = JSON.parse(readFileSync(here("../deploy/RECEIVED-0.1.3.json"), "utf8"));
const received012 = JSON.parse(readFileSync(here("../deploy/RECEIVED-0.1.2.json"), "utf8"));
const members = tgz => new Map(readTar(tgz).map(entry => [entry.name.replace(/^package\//, ""), entry.data]));

test("immutable 0.1.0, 0.1.1 and 0.1.2 archives keep their received bytes", () => {
  const sums = readFileSync(here("../releases/SHA256SUMS"), "utf8").trim().split("\n");
  assert.deepEqual(sums.slice(0, 3), [
    "730a959d3d8bd7398a68015cc8f3ca1746170c0177093d5bf0d03faa75c832d3  neomorphic-machine-gateway-0.1.0.tgz",
    "ee120eaac84f58f759d5857355220685cebcc53d739cead76700720a2821b53d  neomorphic-machine-gateway-0.1.1.tgz",
    "0171af58f67ac845b720ee6d1cf7765cc1a0b4c65c5b258fc1dbd5ea99f5cfb6  neomorphic-machine-gateway-0.1.2.tgz",
  ]);
  for (const line of sums) {
    const [digest, name] = line.split("  ");
    assert.equal(sha256(bytesOf(name)), digest, name);
  }
  const base = bytesOf(BASE.archive);
  assert.equal(sha256(base), BASE.sha256);
  assert.equal(base.length, BASE.bytes);
  assert.equal(received012.archiveSha256, BASE.sha256);
  assert.equal(received.derivedFrom.archiveSha256, BASE.sha256);
});

test("0.1.3 is derived exactly from 0.1.2 and the repaired client sources", () => {
  const bytes = bytesOf(ARCHIVE);
  assert.equal(sha256(bytes), received.archiveSha256);
  assert.equal(bytes.length, received.bytes);
  assert.ok(derive().equals(bytes), "derive-0.1.3.mjs reproduces the committed archive");
  assert.match(readFileSync(here("../releases/SHA256SUMS"), "utf8"), new RegExp(`^${received.archiveSha256}  ${ARCHIVE}$`, "m"));
});

test("the 0.1.3 closure is the 0.1.2 closure with four named members changed", () => {
  const next = members(bytesOf(ARCHIVE)), prior = members(bytesOf(BASE.archive));
  assert.deepEqual([...next.keys()].sort(), Object.keys(received012.files).sort());
  assert.deepEqual([...next.keys()].sort(), Object.keys(received.files).sort());
  const changed = [];
  for (const [name, data] of next) {
    assert.equal(sha256(data), received.files[name], name);
    assert.equal(sha256(prior.get(name)), received012.files[name], name);
    if (!data.equals(prior.get(name))) changed.push(name);
  }
  assert.deepEqual(changed.sort(), ["bin/caller.mjs", "bin/client-io.mjs", "npm-shrinkwrap.json", "package.json"]);
  for (const [name, { to }] of Object.entries(REPLACED)) {
    assert.equal(sha256(next.get(name)), to, name);
    assert.equal(sha256(readFileSync(here(`../${name}`))), to, `shipped source ${name}`);
  }
  for (const name of ["package.json", "npm-shrinkwrap.json"]) {
    assert.equal(next.get(name).toString().replaceAll(`"version": "${VERSION}"`, `"version": "${BASE.version}"`), prior.get(name).toString(), name);
  }
});

test("rights notices are carried exactly and no license is invented", () => {
  const next = members(bytesOf(ARCHIVE)), prior = members(bytesOf(BASE.archive));
  const notices = [...prior.keys()].filter(name => /(^|\/)(LICENSE|NOTICE|COPYING)[^/]*$/i.test(name)).sort();
  assert.deepEqual(notices, ["vendor/extractor/LICENSE", "vendor/extractor/lockfile/LICENSE"]);
  for (const name of notices) assert.ok(next.get(name).equals(prior.get(name)), name);
  assert.deepEqual(Object.keys(received.rights.notices).sort(), notices);
  const pkg = JSON.parse(next.get("package.json"));
  assert.equal(pkg.version, VERSION);
  assert.equal(Object.hasOwn(pkg, "license"), false);
  assert.equal(Object.hasOwn(JSON.parse(prior.get("package.json")), "license"), false);
  assert.equal(received.rights.packageLicenseField, null);
});

function extractClient(t, archive) {
  const dir = mkdtempSync(join(tmpdir(), "mg-client-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, data] of members(bytesOf(archive))) {
    if (!name.startsWith("bin/") && !name.startsWith("src/")) continue;
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), data);
  }
  return import(pathToFileURL(join(dir, "bin/client-io.mjs")).href);
}

async function serve(t, handler) {
  const server = http.createServer((req, res) => { req.resume(); req.on("end", () => handler(req, res)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/api/machine-gateway`;
}
const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
const failure = promise => promise.then(() => assert.fail("expected rejection"), error => error);
const routes = (req, res) => {
  if (req.url.endsWith("/market?cursor=bad")) return json(res, 400, { ok: false, code: "cursor_malformed" });
  if (req.url.endsWith("/market?cursor=mc1.9.zz")) return json(res, 400, { error: { code: "cursor_unrecognized" } });
  if (req.url.endsWith("/cancelled")) return json(res, 499, { error: { code: "execution_aborted" } });
  if (req.url.endsWith("/slow")) return; // never answers
  return json(res, 200, { ok: true });
};

test("the 0.1.3 client receives cursor_malformed, cursor_unrecognized, request_timeout and cancellation with server codes intact", async t => {
  const client = await extractClient(t, ARCHIVE);
  const base = await serve(t, routes);
  const keep = setInterval(() => {}, 1000); t.after(() => clearInterval(keep));
  const check = async (promise, fields) => {
    const error = await failure(promise);
    assert.ok(error instanceof client.GatewayRequestError, String(error));
    for (const [key, value] of Object.entries(fields)) assert.equal(error[key], value, key);
    assert.ok(client.RECOVERY.includes(error.recovery));
    return error;
  };
  await check(client.request(base, "/market?cursor=bad"), { code: "cursor_malformed", serverCode: "cursor_malformed", status: 400, recovery: "remote_refused", message: "gateway_http_400" });
  await check(client.request(base, "/market?cursor=mc1.9.zz"), { code: "cursor_unrecognized", serverCode: "cursor_unrecognized", status: 400, recovery: "remote_refused" });
  await check(client.request(base, "/slow", { timeoutMs: 50 }), { code: "request_timeout", serverCode: null });
  const controller = new AbortController();
  const pending = client.request(base, "/slow", { body: {}, key: "release-013-key-000001", signal: controller.signal });
  setTimeout(() => controller.abort(), 30);
  await check(pending, { code: "request_aborted", recovery: "sent_unconfirmed" });
  const before = new AbortController(); before.abort();
  await check(client.request(base, "/ok", { body: {}, key: "release-013-key-000002", signal: before.signal }), { code: "request_aborted", recovery: "not_sent" });
  await check(client.request(base, "/cancelled", { body: {}, key: "release-013-key-000003" }), { code: "execution_aborted", serverCode: "execution_aborted", status: 499, recovery: "remote_cancelled" });
  assert.deepEqual(await client.request(base, "/ok"), { ok: true });
});

test("the immutable 0.1.2 client still answers with its received legacy shape", async t => {
  const client = await extractClient(t, BASE.archive);
  const base = await serve(t, routes);
  assert.equal(client.GatewayRequestError, undefined);
  for (const path of ["/market?cursor=bad", "/market?cursor=mc1.9.zz"]) {
    const error = await failure(client.request(base, path));
    assert.equal(error.message, "gateway_http_400", path);
    assert.equal(error.serverCode, undefined, path);
  }
  assert.deepEqual(await client.request(base, "/ok"), { ok: true });
});
