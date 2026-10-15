// Transport-level tests against REAL local sockets (no fetch stub).
// Source-identified seam: before this change the guard resolved a host, discarded the
// admitted addresses, and global fetch re-resolved at connect time. These tests pin
// the connection to the admitted set; they do not claim a demonstrated exploit.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dnsCb from "node:dns";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicBounded, createRequestBudget, setTransportForTests } from "../../lib/agent-readiness/bounded-fetch.js";
import { rawExchange } from "../../lib/agent-readiness/probe.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function localServer(handler) {
  let connections = 0;
  const srv = http.createServer(handler);
  srv.on("connection", () => { connections += 1; });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, port: srv.address().port, get connections() { return connections; }, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }) };
}

test("REBINDING: check-time public, connect-time private -> connection pinned, local server never reached", async () => {
  setTransportForTests(null); // real probe.js rawExchange
  const s = await localServer((req, res) => res.end("<title>internal</title>"));
  // Connect-time resolver: anything that re-resolves through node:dns gets 127.0.0.1.
  const origLookup = dnsCb.lookup;
  let connectTimeLookups = 0;
  dnsCb.lookup = (host, opts, cb) => { connectTimeLookups += 1; (typeof opts === "function" ? opts : cb)(null, "127.0.0.1", 4); };
  // Check-time resolver: a public, unroutable address (100::/64 discard prefix).
  let checkLookups = 0;
  const lookup = async () => { checkLookups += 1; return [{ address: "100::1", family: 6 }]; };
  const budget = createRequestBudget(1500);
  try {
    await assert.rejects(
      fetchPublicBounded(`http://rebind.example:${s.port}/`, { lookup, budget }),
      (e) => ["connection_failed", "budget_exhausted"].includes(e.code),
      "SIG:REBIND_NOT_REFUSED",
    );
    assert.equal(s.connections, 0, "SIG:REBIND_REACHED_PRIVATE_SERVER");
    assert.equal(connectTimeLookups, 0, "SIG:CONNECT_TIME_RERESOLVE");
    assert.equal(checkLookups, 1);
  } finally {
    dnsCb.lookup = origLookup; budget.dispose(); await s.close();
  }
});

test("PINNED ADDRESS GUARD: rawExchange refuses to connect to a private pinned address", async () => {
  const s = await localServer((req, res) => res.end("ok"));
  try {
    const r = await rawExchange(new URL(`http://pinned.example:${s.port}/`), { address: { address: "127.0.0.1", family: 4 }, timeoutMs: 1000 });
    assert.equal(r.status, 0, "SIG:PRIVATE_PIN_CONNECTED");
    assert.equal(s.connections, 0, "SIG:PRIVATE_PIN_REACHED_SERVER");
  } finally { await s.close(); }
});

test("BUDGET + OPEN HANDLES: hanging server, total budget ends discovery with truthful partial result and the process exits", async () => {
  const child = spawn(process.execPath, [path.join(here, "fixtures", "budget-child.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; let err = "";
  child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { err += d; });
  const started = Date.now();
  const code = await new Promise((resolve) => {
    const kill = setTimeout(() => { child.kill("SIGKILL"); resolve("HUNG"); }, 8000);
    child.on("exit", (c) => { clearTimeout(kill); resolve(c); });
  });
  assert.notEqual(code, "HUNG", "SIG:PROCESS_DID_NOT_EXIT (open handles) " + err);
  assert.equal(code, 0, "SIG:CHILD_FAILED " + err);
  const r = JSON.parse(out.trim().split("\n").pop());
  assert.ok(r.limited.includes("budget_exhausted"), "SIG:BUDGET_NOT_REPORTED");
  assert.equal(r.skipped.length + r.rejectedBudget, 3, "SIG:PARTIAL_NOT_TRUTHFUL");
  assert.equal(r.urls.length, 0);
  assert.ok(r.elapsedMs < 3000, "SIG:BUDGET_NOT_ENFORCED " + r.elapsedMs);
  assert.deepEqual(r.leaked, [], "SIG:OPEN_HANDLES " + JSON.stringify(r.leaked));
  assert.ok(Date.now() - started < 8000);
});
