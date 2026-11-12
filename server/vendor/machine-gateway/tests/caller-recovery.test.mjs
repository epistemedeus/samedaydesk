// Needs the package's own dependencies (npm ci --ignore-scripts in this directory).
// A committed execute response is dropped before the caller receives its
// receipt ID. A fresh caller process recovers it with the same tenant
// credential and saved idempotency key. The server's own commit count is read
// from its store, not from printed IDs.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launch, execFile } from "./process-helpers.mjs";
import { sampleInput } from "./helpers.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

// Loopback proxy in front of the real gateway. mode(req) decides per request:
// "pass", "drop-after-commit" (forward, read the full upstream answer, then
// destroy the client socket without a byte) or "hold" (never forward).
async function proxy(t, upstream, mode) {
  const log = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      const entry = { method: req.method, url: req.url, mode: mode(req, log), replayed: null, status: null };
      log.push(entry);
      if (entry.mode === "hold") return;
      const target = new URL(req.url, upstream);
      const out = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, answer => {
        const body = [];
        answer.on("data", chunk => body.push(chunk));
        answer.on("end", () => {
          entry.status = answer.statusCode; entry.replayed = answer.headers["idempotency-replayed"] ?? null;
          if (entry.mode === "drop-after-commit") return req.socket.destroy();
          res.writeHead(answer.statusCode, answer.headers); res.end(Buffer.concat(body));
        });
      });
      out.end(Buffer.concat(chunks));
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { base: `http://127.0.0.1:${server.address().port}/api/machine-gateway`, log };
}

function caller(args) {
  const child = spawn(process.execPath, [join(root, "bin/caller.mjs"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", d => { stdout += d; }); child.stderr.on("data", d => { stderr += d; });
  const done = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr })));
  return { child, done };
}

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "machine-gateway-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, "tenants.json"), tokenFile = join(dir, "tenant.credential"), stateFile = join(dir, "caller.json");
  await execFile(process.execPath, [join(root, "bin/enroll.mjs"), "--tenant", "recovery-caller", "--config", config, "--token-file", tokenFile]);
  const env = { NODE_ENV: "production", MACHINE_GATEWAY_ENABLED: "1", MACHINE_GATEWAY_TENANTS_FILE: config,
    MACHINE_GATEWAY_STATE_FILE: join(dir, "machine-gateway.sqlite"), MACHINE_GATEWAY_PAYMENTS_ENABLED: "0", PORT: "0" };
  const gateway = await launch(t, join(root, "src/server.mjs"), env);
  const inputFile = join(dir, "input.json"); await writeFile(inputFile, JSON.stringify(sampleInput));
  const commits = () => {
    const db = new DatabaseSync(env.MACHINE_GATEWAY_STATE_FILE, { readOnly: true });
    try { return { attempts: db.prepare("SELECT count(*) AS n FROM attempts").get().n, calls: db.prepare("SELECT coalesce(sum(calls),0) AS n FROM usage").get().n }; }
    finally { db.close(); }
  };
  return { dir, tokenFile, stateFile, inputFile, gateway, commits };
}

test("a committed execute whose response is lost is recovered in a fresh process without a second commit", { timeout: 60000 }, async t => {
  const s = await setup(t);
  let dropped = false;
  const p = await proxy(t, s.gateway.origin, req => {
    if (req.method === "POST" && req.url.endsWith("/v1/execute") && !dropped) { dropped = true; return "drop-after-commit"; }
    return "pass";
  });
  const common = ["--base-url", p.base, "--token-file", s.tokenFile, "--state-file", s.stateFile, "--allow-loopback"];

  const first = await caller([...common, "--route", "lockfile.delta", "--input-file", s.inputFile]).done;
  assert.equal(first.code, 1);
  assert.equal(first.stdout, "");
  const failure = JSON.parse(first.stderr).error;
  assert.equal(failure.recovery, "sent_unconfirmed");
  assert.equal(failure.code, "transport_failed");
  assert.deepEqual(s.commits(), { attempts: 1, calls: 1 }, "the dropped response was committed by the server");
  const saved = JSON.parse(await readFile(s.stateFile, "utf8"));
  assert.equal(saved.receipt, null, "the caller never received the server ID");
  assert.equal(saved.dispatch.recovery, "sent_unconfirmed");
  assert.equal(saved.dispatch.attempts, 1);
  assert.equal((await stat(s.stateFile)).mode & 0o077, 0);
  const text = await readFile(s.stateFile, "utf8");
  assert.equal(text.includes((await readFile(s.tokenFile, "utf8")).trim()), false, "no credential in the handback state");

  const second = await caller([...common, "--resume"]).done;
  assert.equal(second.code, 0, second.stderr);
  const receipt = JSON.parse(second.stdout);
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.output.counts.changed, 1);
  const replay = p.log.filter(e => e.method === "POST" && e.url.endsWith("/v1/execute"));
  assert.equal(replay.length, 2);
  assert.equal(replay[1].replayed, "true", "the gateway replayed the stored receipt for the same key");
  assert.deepEqual(s.commits(), { attempts: 1, calls: 1 }, "recovery added no commit");
  const after = JSON.parse(await readFile(s.stateFile, "utf8"));
  assert.equal(after.key, saved.key); assert.equal(after.receipt.id, receipt.id);
  assert.equal(after.dispatch.recovery, "remote_committed"); assert.equal(after.dispatch.attempts, 2);

  // With the server ID known, a further resume reads back and sends no POST.
  const before = p.log.length;
  const third = await caller([...common, "--resume"]).done;
  assert.equal(third.code, 0, third.stderr);
  assert.deepEqual(JSON.parse(third.stdout), receipt);
  assert.deepEqual(p.log.slice(before).map(e => e.method), ["GET", "GET"]);
  assert.deepEqual(s.commits(), { attempts: 1, calls: 1 });
});

test("SIGINT during an unanswered execute is a local abort, not a remote cancellation", { timeout: 60000 }, async t => {
  const s = await setup(t);
  let held = false;
  const p = await proxy(t, s.gateway.origin, req => {
    if (req.method === "POST" && req.url.endsWith("/v1/execute") && !held) { held = true; return "hold"; }
    return "pass";
  });
  const common = ["--base-url", p.base, "--token-file", s.tokenFile, "--state-file", s.stateFile, "--allow-loopback"];
  const run = caller([...common, "--route", "lockfile.delta", "--input-file", s.inputFile]);
  while (!held) await new Promise(resolve => setTimeout(resolve, 10));
  run.child.kill("SIGINT");
  const first = await run.done;
  assert.equal(first.code, 130);
  const failure = JSON.parse(first.stderr).error;
  assert.equal(failure.code, "request_aborted");
  assert.equal(failure.recovery, "sent_unconfirmed", "a sent request is never reported as not sent");
  assert.deepEqual(s.commits(), { attempts: 0, calls: 0 });
  const resumed = await caller([...common, "--resume"]).done;
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).status, "completed");
  assert.deepEqual(s.commits(), { attempts: 1, calls: 1 });
});

test("a server refusal keeps its code and is remote_refused", { timeout: 60000 }, async t => {
  const s = await setup(t);
  const common = ["--base-url", s.gateway.base, "--token-file", s.tokenFile, "--state-file", s.stateFile, "--allow-loopback"];
  const refused = await caller([...common, "--route", "no.such.route", "--input-file", s.inputFile]).done;
  assert.equal(refused.code, 1);
  const failure = JSON.parse(refused.stderr).error;
  assert.match(failure.code, /^gateway_http_4\d\d$/);
  assert.match(failure.serverCode, /^[a-z][a-z0-9_]+$/);
  assert.equal(failure.recovery, "remote_refused");
  assert.deepEqual(s.commits(), { attempts: 0, calls: 0 });
});
