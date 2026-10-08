import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test, { before, after } from "node:test";
import { createSdsApp } from "../app.js";
import { acceptedCallerPin, verifyCallerClosure } from "../foundry/activation/remote-private-journey.mjs";
import { clientKey, TRUSTED_PROXIES_ENV } from "../lib/agent-readiness/rate-limit.js";
import { inspectCorrespondenceEnv } from "../lib/correspondence-mount.js";
import { createApp, loadConfig, MemoryStore } from "@neomorphic/correspondence";

const root = fileURLToPath(new URL("../../", import.meta.url));
const MIN_PATCH = [2, 0, 8];
let coldDir;
let coldProxyaddr;
let coldExpress;

function acceptResolved(meta) {
  const version = String(meta?.version || "");
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`unreadable proxy-addr version ${version}`);
  }
  const vulnerable = parts[0] < MIN_PATCH[0]
    || (parts[0] === MIN_PATCH[0] && parts[1] < MIN_PATCH[1])
    || (parts[0] === MIN_PATCH[0] && parts[1] === MIN_PATCH[1] && parts[2] < MIN_PATCH[2]);
  if (vulnerable) throw new Error(`vulnerable proxy-addr ${version}`);
  const resolved = String(meta.resolved || meta._resolved || "");
  if (resolved && !resolved.includes(`proxy-addr-${version}.tgz`)) {
    throw new Error(`resolved tarball does not match proxy-addr ${version}`);
  }
  return true;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 120000);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-12000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-12000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function forwarded(addr, xff) {
  return { socket: { remoteAddress: addr }, headers: xff == null ? {} : { "x-forwarded-for": xff } };
}

function listen(app, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, host);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

function who(server, headers) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: address.address,
      port: address.port,
      family: address.family === "IPv6" ? 6 : 4,
      path: "/who",
      headers,
      agent: false,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("who timed out")));
    request.on("error", reject);
  });
}

async function withServer(app, host, fn) {
  const server = await listen(app, host);
  try { return await fn(server); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function installedCopies(dir) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (entry.name === "proxy-addr") found.push(path.join(full, "package.json"));
      else await walk(full);
    }
  }
  await walk(dir);
  return found;
}

before(async () => {
  coldDir = await mkdtemp(path.join(tmpdir(), "sds-proxy-addr-"));
  for (const relative of [
    "package.json",
    "package-lock.json",
    "vendor/agent-payment-integrity",
    "vendor/visitor-foundry-receiver/services/correspondence",
  ]) {
    await cp(path.join(root, relative), path.join(coldDir, relative), {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes("node_modules"),
    });
  }
  // Same root lock the managed layout installs with `npm ci`. This command is the
  // hosted production install: dev dependencies are omitted and scripts do not run.
  const installed = await run("npm", ["ci", "--omit=dev", "--ignore-scripts"], coldDir);
  assert.equal(installed.code, 0, installed.stderr || installed.stdout);
  const requireCold = createRequire(path.join(coldDir, "package.json"));
  coldProxyaddr = requireCold("proxy-addr");
  coldExpress = requireCold("express");
});

after(async () => {
  if (coldDir) await rm(coldDir, { recursive: true, force: true });
});

test("production dependencies retain a valid private caller control closure", () => {
  const received = verifyCallerClosure();
  assert.match(received.closureDigest, /^sha256:[a-f0-9]{64}$/);
});

test("caller closure binds original-task runtime and retains received callers", async () => {
  const pin = JSON.parse(await readFile(path.join(root, "server/foundry/activation/private-control-pin.json"), "utf8"));
  for (const name of ["cli", "client", "collect", "descriptor", "envelope", "event-guard", "operator-http"]) {
    assert.ok(pin.files[`server/lib/original-task/${name}.mjs`], name);
  }
  assert.ok(pin.files["client/public/discovery/original-task-correspondence.json"]);
  const current = verifyCallerClosure();
  assert.equal(acceptedCallerPin(current, current), true);
  for (const prior of pin.receivedCallerClosures) {
    assert.equal(acceptedCallerPin(prior, current), true);
  }
  assert.ok(pin.files["server/foundry/startup-diagnostic.js"]);
  for (const name of ["server/lib/original-task/event-guard.mjs", "server/foundry/startup-diagnostic.js"]) {
    const member = path.join(root, name);
    const original = await readFile(member);
    try {
      await writeFile(member, Buffer.concat([original, Buffer.from("\n// changed runtime member\n")]));
      assert.throws(() => verifyCallerClosure(), (error) => error.code === "caller_source_changed");
    } finally {
      await writeFile(member, original);
    }
    assert.deepEqual(verifyCallerClosure(), current);
  }
});

test("seeded proxy-addr 2.0.7 resolution is refused", () => {
  assert.throws(
    () => acceptResolved({
      version: "2.0.7",
      resolved: "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.7.tgz",
    }),
    /vulnerable proxy-addr 2\.0\.7/,
  );
  assert.throws(() => acceptResolved({ version: "1.1.0" }), /vulnerable proxy-addr 1\.1\.0/);
  assert.equal(acceptResolved({ version: "2.0.8", resolved: "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz" }), true);
});

test("cold production install resolves patched proxy-addr from the managed-layout lock", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(coldDir, "package-lock.json"), "utf8"));
  const locked = lock.packages["node_modules/proxy-addr"];
  assert.notEqual(manifest.dependencies["proxy-addr"], "2.0.7");
  assert.equal(acceptResolved({ version: manifest.dependencies["proxy-addr"] }), true);
  assert.equal(acceptResolved(locked), true);
  assert.equal(lock.packages[""].dependencies["proxy-addr"], manifest.dependencies["proxy-addr"]);

  const copies = [];
  for (const file of await installedCopies(path.join(coldDir, "node_modules"))) {
    copies.push(JSON.parse(await readFile(file, "utf8")));
  }
  assert.ok(copies.length >= 1);
  for (const copy of copies) {
    assert.equal(acceptResolved(copy), true);
    assert.equal(copy.version, "2.0.8");
  }
  const repoCopy = JSON.parse(await readFile(path.join(root, "node_modules/proxy-addr/package.json"), "utf8"));
  assert.equal(repoCopy.version, copies[0].version);

  // The hosted layout uses the root lock; no nested correspondence install may
  // supply its runtime. Do not preserve an obsolete vendored version as a requirement.
  const nestedInstalled = (await installedCopies(path.join(
    coldDir,
    "vendor/visitor-foundry-receiver/services/correspondence",
  ))).length;
  assert.equal(nestedInstalled, 0);

  const listed = await run("npm", ["ls", "proxy-addr", "--all", "--json"], coldDir);
  assert.equal(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /"version": "2\.0\.8"/);
  assert.doesNotMatch(listed.stdout, /2\.0\.7/);
});

test("ordinary trusted IPv4 and IPv6 hops resolve on the cold-installed module", async () => {
  assert.equal(coldProxyaddr(forwarded("10.1.2.3", "203.0.113.10"), "10.0.0.0/8"), "203.0.113.10");
  assert.equal(
    coldProxyaddr(forwarded("10.0.0.1", "9.9.9.9, 203.0.113.10, 10.1.2.3"), ["10.0.0.0/8"]),
    "203.0.113.10",
  );
  assert.equal(coldProxyaddr(forwarded("fd00::1", "2001:db8::5"), "fd00::/8"), "2001:db8::5");
  assert.equal(coldProxyaddr.compile(["::ffff:10.0.0.0/104"])("10.0.0.1"), true);
  assert.equal(coldProxyaddr.compile(["::ffff:10.0.0.0/104"])("::ffff:10.0.0.1"), true);
  assert.equal(coldProxyaddr.compile(["::ffff:10.0.0.0/104"])("8.8.8.8"), false);
  assert.equal(coldProxyaddr(forwarded("10.0.0.1", "203.0.113.10"), ["::ffff:10.0.0.0/104"]), "203.0.113.10");

  const app = coldExpress();
  app.set("trust proxy", "loopback");
  app.get("/who", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  await withServer(app, "127.0.0.1", async (server) => {
    const ipv4 = await who(server, { "x-forwarded-for": "203.0.113.10" });
    assert.equal(ipv4.ip, "203.0.113.10");
    const stopped = await who(server, { "x-forwarded-for": "9.9.9.9, 203.0.113.10" });
    assert.equal(stopped.ip, "203.0.113.10");
  });
  const v6 = coldExpress();
  v6.set("trust proxy", "loopback");
  v6.get("/who", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  await withServer(v6, "::1", async (server) => {
    const ipv6 = await who(server, { "x-forwarded-for": "2001:db8::5" });
    assert.equal(ipv6.ip, "2001:db8::5");
  });
});

test("spoofed IPv4-mapped prefixes are refused by the cold-installed module", async () => {
  const short = coldProxyaddr.compile(["::ffff:10.0.0.0/8"]);
  assert.equal(short("8.8.8.8"), false);
  assert.equal(short("10.0.0.1"), false);
  assert.equal(short("::ffff:8.8.8.8"), false);
  assert.equal(short("127.0.0.1"), false);
  const zero = coldProxyaddr.compile(["::/1"]);
  assert.equal(zero("8.8.8.8"), false);
  assert.equal(zero("::ffff:8.8.8.8"), false);
  assert.equal(coldProxyaddr(forwarded("8.8.8.8", "9.9.9.9"), ["::ffff:10.0.0.0/8"]), "8.8.8.8");
  assert.equal(coldProxyaddr(forwarded("::ffff:8.8.8.8", "9.9.9.9"), ["::ffff:10.0.0.0/8"]), "::ffff:8.8.8.8");
  assert.equal(coldProxyaddr(forwarded("8.8.8.8", "9.9.9.9"), ["::/1"]), "8.8.8.8");

  const app = coldExpress();
  app.set("trust proxy", "::ffff:10.0.0.0/8");
  app.get("/who", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  await withServer(app, "127.0.0.1", async (server) => {
    const spoofed = await who(server, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(spoofed.ip, "127.0.0.1");
    assert.deepEqual(spoofed.ips, []);
  });
});

test("host trust proxy stays closed and request identity keeps ordinary hops", async (t) => {
  const saved = process.env[TRUSTED_PROXIES_ENV];
  t.after(() => {
    if (saved === undefined) delete process.env[TRUSTED_PROXIES_ENV];
    else process.env[TRUSTED_PROXIES_ENV] = saved;
  });

  const host = createSdsApp({ correspondence: { env: { NODE_ENV: "test" } } });
  assert.equal(host.get("trust proxy"), false);
  const closed = coldExpress();
  closed.get("/who", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  assert.equal(closed.get("trust proxy"), false);
  await withServer(closed, "127.0.0.1", async (server) => {
    const direct = await who(server, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(direct.ip, "127.0.0.1");
    assert.deepEqual(direct.ips, []);
  });

  const token = "fixture-admin-token-not-a-secret-24";
  const memory = loadConfig({
    NODE_ENV: "test",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: token,
  });
  assert.equal(memory.trustProxyHops, 0);
  const correspondence = createApp(new MemoryStore(), memory);
  assert.equal(correspondence.get("trust proxy"), 0);
  correspondence.get("/who", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  await withServer(correspondence, "127.0.0.1", async (server) => {
    const direct = await who(server, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(direct.ip, "127.0.0.1");
  });
  assert.throws(() => loadConfig({
    NODE_ENV: "test",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: token,
    CORRESPONDENCE_TRUST_PROXY: "true",
  }), /not boolean true/);
  const inspected = inspectCorrespondenceEnv({
    NODE_ENV: "test",
    CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:1/fixture",
    CORRESPONDENCE_ADMIN_TOKEN: token,
    CORRESPONDENCE_TRUST_PROXY: "true",
  });
  assert.equal(inspected.kind, "invalid_config");
  assert.equal(inspected.detail, "invalid trust proxy");

  const req = (peer, xff) => ({ socket: { remoteAddress: peer }, headers: { "x-forwarded-for": xff } });
  process.env[TRUSTED_PROXIES_ENV] = "10.0.0.0/8";
  assert.equal(clientKey(req("10.0.0.1", "9.9.9.9, 203.0.113.10, 10.1.2.3")), "xff:203.0.113.10");
  process.env[TRUSTED_PROXIES_ENV] = "fd00::/8";
  assert.equal(clientKey(req("fd00::1", "2001:db8::5")), "xff:2001:db8::5");
  process.env[TRUSTED_PROXIES_ENV] = "::ffff:10.0.0.0/104";
  assert.equal(clientKey(req("10.0.0.1", "203.0.113.10")), "xff:203.0.113.10");
  assert.equal(clientKey(req("8.8.8.8", "9.9.9.9")), "peer:8.8.8.8");
  for (const policy of ["::ffff:10.0.0.0/8", "::/1"]) {
    process.env[TRUSTED_PROXIES_ENV] = policy;
    assert.equal(clientKey(req("8.8.8.8", "9.9.9.9")), "peer:8.8.8.8", policy);
    assert.equal(clientKey(req("::ffff:8.8.8.8", "9.9.9.9")), "peer:8.8.8.8", policy);
  }
});
