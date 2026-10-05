import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { listenHosted, normalizeListenPort } from "../lib/hosted-listen.js";
import { probeLoopback, snapshotAddress } from "./fixtures/loopback-probe.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-econnrefused-preload.mjs", import.meta.url));
const v4Child = fileURLToPath(new URL("./fixtures/hosted-v4-only-child.mjs", import.meta.url));
const hosts = ["127.0.0.1", "::1"];

function isolateRefusal(child, parent) {
  const detail = {};
  for (const host of hosts) {
    const left = child[host];
    const right = parent[host];
    let cause = "reachable";
    if (left?.ok && right?.ok) cause = "reachable";
    else if (Boolean(left?.ok) !== Boolean(right?.ok)) cause = "cross-process";
    else cause = "wrong-host";
    detail[host] = {
      cause,
      child: left?.ok ? left.status : left?.code || "missing",
      parent: right?.ok ? right.status : right?.code || "missing",
    };
  }
  let isolation = "reachable";
  if (hosts.some((host) => detail[host].cause === "cross-process")) isolation = "cross-process";
  else if (hosts.some((host) => detail[host].cause === "wrong-host") && hosts.some((host) => detail[host].cause === "reachable")) {
    isolation = "wrong-host";
  } else if (hosts.some((host) => detail[host].cause !== "reachable")) isolation = "bind-timing";
  return { isolation, accepted: isolation === "reachable", detail };
}

function minimalEnv(extra = {}) {
  return { PATH: process.env.PATH, NODE_ENV: "test", ...extra };
}

async function spawnIpc(t, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk).slice(-4000); });
  }
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 1000);
    try { await exited; } finally { clearTimeout(timer); }
  });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No diag receipt: " + output)), 8000);
    child.once("message", (value) => { clearTimeout(timer); resolve(value); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error("Exited before diag receipt: " + code + " " + output)); });
  });
  return { child, message, output };
}

test("address() stays null until listening and a closed port is ECONNREFUSED", async () => {
  const held = http.createServer();
  await new Promise((resolve, reject) => {
    held.once("error", reject);
    held.listen(0, "127.0.0.1", resolve);
  });
  const closedPort = held.address().port;
  await new Promise((resolve) => held.close(resolve));
  const early = await probeLoopback("127.0.0.1", closedPort, "/");
  assert.equal(early.ok, false);
  assert.equal(early.code, "ECONNREFUSED");

  const server = http.createServer((_req, res) => res.end("ok"));
  assert.equal(server.address(), null);
  let sync = "unread";
  const bound = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "::", ipv6Only: false }, () => resolve(snapshotAddress(server.address())));
    sync = snapshotAddress(server.address());
  });
  assert.equal(sync, null);
  assert.equal(bound.address, "::");
  assert.equal(bound.family, "IPv6");
  assert.ok(bound.port > 0);
  const lateV4 = await probeLoopback("127.0.0.1", bound.port, "/");
  const lateV6 = await probeLoopback("::1", bound.port, "/");
  assert.equal(lateV4.ok, true);
  assert.equal(lateV6.ok, true);
  await new Promise((resolve) => server.close(resolve));
  console.log("DIAG " + JSON.stringify({
    scenario: "bind-timing",
    beforeListen: null,
    syncAfterListenCall: sync,
    listening: bound,
    closedPort: early,
  }));
});

test("real entry: same-child and parent both reach each loopback after address() is an object", async (t) => {
  const { message, output } = await spawnIpc(t, ["--import", preload, "server/index.js"], minimalEnv({ PORT: "0" }));
  const listening = message.timeline.find((row) => row.phase === "listening");
  const sync = message.timeline.find((row) => row.phase === "sync-after-listen-call");
  const before = message.timeline.find((row) => row.phase === "before-listen");
  assert.deepEqual(message.timeline.map((row) => row.phase), ["before-listen", "sync-after-listen-call", "listening"]);
  assert.equal(before.address, null);
  assert.equal(sync.address, null);
  assert.equal(listening.address?.address, "::");
  assert.equal(listening.address.family, "IPv6");
  assert.equal(listening.address.port, message.port);
  assert.match(output, /\[samedaydesk\] listening on :0 /);
  const parent = {};
  for (const host of hosts) parent[host] = await probeLoopback(host, message.port, message.path, { expectService: "samedaydesk" });
  const report = isolateRefusal(message.probes, parent);
  console.log("DIAG " + JSON.stringify({ scenario: "entry", timeline: message.timeline, child: message.probes, parent, report }));
  assert.equal(report.isolation, "reachable");
  assert.equal(report.accepted, true);
  for (const host of hosts) {
    assert.equal(message.probes[host].ok, true);
    assert.equal(parent[host].ok, true);
  }
});

test("seeded IPv4-only listen is ECONNREFUSED on ::1 for the child and the parent", async (t) => {
  const { message } = await spawnIpc(t, [v4Child], minimalEnv());
  assert.deepEqual(message.timeline.map((row) => row.phase), ["before-listen", "sync-after-listen-call", "listening"]);
  const listening = message.timeline.find((row) => row.phase === "listening");
  const sync = message.timeline.find((row) => row.phase === "sync-after-listen-call");
  assert.equal(sync.address, null);
  assert.equal(listening.address.address, "0.0.0.0");
  assert.equal(listening.address.family, "IPv4");
  const parent = {};
  for (const host of hosts) parent[host] = await probeLoopback(host, message.port, message.path);
  const report = isolateRefusal(message.probes, parent);
  console.log("DIAG " + JSON.stringify({ scenario: "v4-seed", timeline: message.timeline, child: message.probes, parent, report }));
  assert.equal(message.probes["127.0.0.1"].ok, true);
  assert.equal(message.probes["::1"].code, "ECONNREFUSED");
  assert.equal(parent["::1"].code, "ECONNREFUSED");
  assert.equal(report.isolation, "wrong-host");
  assert.equal(report.accepted, false);
});

test("seeded cross-process split is rejected", () => {
  const report = isolateRefusal(
    { "127.0.0.1": { ok: true, status: 200, code: null }, "::1": { ok: true, status: 200, code: null } },
    { "127.0.0.1": { ok: false, status: null, code: "ECONNREFUSED" }, "::1": { ok: true, status: 200, code: null } },
  );
  console.log("DIAG " + JSON.stringify({ scenario: "cross-process-seed", report }));
  assert.equal(report.isolation, "cross-process");
  assert.equal(report.accepted, false);
});

test("invalid PORT is rejected before listen", () => {
  assert.throws(() => normalizeListenPort("nope"), (error) => error.code === "ERR_INVALID_PORT");
  assert.equal(normalizeListenPort("0"), 0);
  assert.equal(normalizeListenPort(3000), 3000);
});

test("unreachable IPv6 primary falls back to 0.0.0.0 and keeps 127.0.0.1", async (t) => {
  const { server, address } = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fallback bind timed out")), 3000);
    const listening = listenHosted((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    }, 0, (bound) => {
      clearTimeout(timer);
      resolve({ server: listening, address: snapshotAddress(bound) });
    }, { primaryHost: "2001:db8::1" });
    t.after(() => new Promise((resolveClose) => listening.close(resolveClose)));
  });
  assert.equal(address.address, "0.0.0.0");
  assert.equal(address.family, "IPv4");
  const v4 = await probeLoopback("127.0.0.1", address.port, "/");
  const v6 = await probeLoopback("::1", address.port, "/");
  console.log("DIAG " + JSON.stringify({ scenario: "fallback", address, v4, v6 }));
  assert.equal(v4.ok, true);
  assert.equal(v6.code, "ECONNREFUSED");
  assert.equal(server.listening, true);
});
