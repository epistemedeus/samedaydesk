// batch run against loopback fixtures speaking the backend wire shapes.
// Fixtures prove client behavior (state, caps, cancellation, EPIPE, origin
// binding, timeouts, resume); they do not prove any live service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { main } from "../src/cli.mjs";
import { EXIT } from "../src/errors.mjs";
import { BoundCredential } from "../src/auth.mjs";
import * as pinned from "./fixtures/client-io-0.1.2.mjs";
import { sink, tempDir, REPORT } from "./helpers.mjs";
import { delay, sendJson, spawnCli, startServer, waitFor } from "./server-fixture.mjs";

const HEALTH = { schema: "neomorphic.machine-gateway.health.v1", ready: true, runtime: "mounted-node", persistence: "postgres", paymentsEnabled: false, routeCount: 1 };
const DISCOVER = { schema: "neomorphic.machine-gateway.discovery.v1", version: "0.1.1", routes: [{ id: "lockfile.delta", price: { amount: 0, unit: "usd-micros" } }] };
const PROFILE = { ok: true, value: { capability: { money: "unfunded" } } };
const LISTINGS = { ok: true, value: { items: [{ id: "l1" }], nextCursor: null } };
const RECEIPT_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "t".repeat(20) + "SECRETVALUE" + "z".repeat(20);

function readRouter({ slowHost = null, slowMs = 0, hangHost = null, delayMs = 0 } = {}) {
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (delayMs) await delay(delayMs);
    if (url.pathname === "/agent-readiness") {
      const host = url.searchParams.get("host");
      if (host === "missing.example") return sendJson(res, 404, { error: { code: "not_found" } });
      if (hangHost && host.startsWith(hangHost.split(".")[0])) return; // never answers
      if (host === slowHost) await delay(slowMs);
      return sendJson(res, 200, { ...REPORT, host });
    }
    if (url.pathname === "/api/machine-gateway/healthz") return sendJson(res, 200, HEALTH);
    if (url.pathname === "/api/machine-gateway/v1/discover") return sendJson(res, 200, DISCOVER);
    if (url.pathname.startsWith("/api/machine-gateway/v1/routes/")) return sendJson(res, 200, { type: "object" });
    if (url.pathname === "/api/neomorphic-contributor-journey/v1/market/profile") return sendJson(res, 200, PROFILE);
    if (url.pathname === "/api/neomorphic-contributor-journey/v1/market/discover") return sendJson(res, 200, LISTINGS);
    return sendJson(res, 404, { error: { code: "route_not_found" } });
  };
}

async function runBatch(args, { clientIo, signal, stdinText } = {}) {
  const stdout = sink();
  const stderr = sink();
  const stdin = stdinText === undefined ? undefined : (await import("node:stream")).Readable.from([Buffer.from(stdinText)]);
  const exit = await main(["batch", "run", ...args], { stdout, stderr, stdin, clientIo, signal, sleep: async () => {} });
  return { exit, out: stdout.lines(), err: stderr.lines(), raw: stdout.chunks.join("") + stderr.chunks.join("") };
}

const jsonl = items => items.map(item => typeof item === "string" ? item : JSON.stringify(item)).join("\n") + "\n";
function inputFile(dir, items, name = "items.jsonl") { const path = join(dir, name); writeFileSync(path, jsonl(items)); return path; }
const byType = (out, type) => out.filter(record => record.type === type);

const FIVE = [
  { id: "r1", op: "readiness.check", args: { host: "example.com" } },
  { op: "gateway.health" },
  { id: "routes", op: "gateway.routes" },
  { id: "schema", op: "gateway.schema", args: { route: "lockfile.delta", kind: "output" } },
  { id: "listings", op: "market.discover", args: { limit: 5 } },
];

test("batch: positive run, bounded concurrency, 0600 state, archived results, JSONL only on stdout", async () => {
  const server = await startServer(readRouter({ delayMs: 40 }));
  try {
    const dir = tempDir();
    const state = join(dir, "state");
    const { exit, out, err } = await runBatch(["--input-file", inputFile(dir, FIVE), "--state-dir", state, "--concurrency", "2", "--origin", server.origin, "--allow-loopback"]);
    assert.equal(exit, 0);
    assert.equal(err.length, 0);
    assert.equal(out[0].type, "start");
    assert.equal(out.at(-1).type, "summary");
    assert.ok(out.every(record => record.schema === "samedaydesk.cli.batch.v1"));
    const items = byType(out, "item");
    assert.equal(items.length, 5);
    assert.ok(items.every(item => item.status === "ok" && item.recovery === "remote_committed"));
    assert.equal(items.find(item => item.op === "gateway.health").idSource, "derived");
    assert.match(items.find(item => item.op === "gateway.health").id, /^h:[0-9a-f]{32}$/);
    assert.deepEqual(out.at(-1).counts, { total: 5, ok: 5, skippedCompleted: 0, failed: 0, refused: 0, cancelled: 0, preview: 0 });
    assert.ok(server.maxInFlight <= 2, `max in flight ${server.maxInFlight}`);
    assert.equal(statSync(state).mode & 0o777, 0o700);
    for (const sub of ["items", "results"]) for (const name of readdirSync(join(state, sub))) assert.equal(statSync(join(state, sub, name)).mode & 0o777, 0o600, name);
    assert.equal(readdirSync(join(state, "results")).length, 5);
    assert.equal(existsSync(join(state, "lock")), false, "lock released");
  } finally { await server.close(); }
});

test("batch: rerun skips completed items; changed terms for an id are refused and the archive is preserved", async () => {
  const server = await startServer(readRouter());
  try {
    const dir = tempDir();
    const state = join(dir, "state");
    const args = file => ["--input-file", file, "--state-dir", state, "--origin", server.origin, "--allow-loopback"];
    const first = await runBatch(args(inputFile(dir, FIVE)));
    assert.equal(first.exit, 0);
    const sent = server.requests.length;
    const archive = readdirSync(join(state, "results")).map(name => readFileSync(join(state, "results", name), "utf8"));
    const again = await runBatch(args(inputFile(dir, FIVE, "again.jsonl")));
    assert.equal(again.exit, 0);
    assert.equal(server.requests.length, sent, "no request for completed items");
    assert.ok(byType(again.out, "item").every(item => item.status === "skipped_completed" && item.result));
    const changed = await runBatch(args(inputFile(dir, [{ id: "r1", op: "readiness.check", args: { host: "other.example" } }, { id: "new", op: "gateway.health" }], "changed.jsonl")));
    assert.equal(changed.exit, EXIT.partial);
    const refused = byType(changed.out, "item").find(item => item.id === "r1");
    assert.equal(refused.status, "refused");
    assert.equal(refused.error.code, "item_terms_changed");
    assert.equal(refused.recovery, "not_sent");
    assert.equal(server.requests.filter(request => request.url.includes("other.example")).length, 0);
    const after = readdirSync(join(state, "results")).map(name => readFileSync(join(state, "results", name), "utf8"));
    for (const text of archive) assert.ok(after.includes(text), "archived result unchanged");
  } finally { await server.close(); }
});

test("batch: typed partial and total failure with distinct exits", async () => {
  const server = await startServer(readRouter());
  try {
    const dir = tempDir();
    const items = [
      { id: "good", op: "readiness.check", args: { host: "example.com" } },
      { id: "gone", op: "readiness.check", args: { host: "missing.example" } },
      "not json",
      { id: "mut", op: "gateway.execute", args: {} },
      { id: "extra", op: "gateway.health", args: { nope: 1 } },
      { id: "good", op: "readiness.check", args: { host: "example.com" } },
    ];
    const partial = await runBatch(["--input-file", inputFile(dir, items), "--state-dir", join(dir, "s1"), "--origin", server.origin, "--allow-loopback", "--concurrency", "1"]);
    assert.equal(partial.exit, EXIT.partial);
    const records = byType(partial.out, "item");
    const code = id => records.find(item => item.id === id)?.error?.code;
    assert.equal(code("gone"), "not_found");
    assert.equal(records.find(item => item.id === "gone").recovery, "remote_refused");
    assert.equal(records.find(item => item.line === 3).error.code, "item_invalid");
    assert.equal(records.find(item => item.error?.code === "item_op_unsupported").status, "refused");
    assert.equal(records.find(item => item.error?.code === "item_invalid" && item.line === undefined) ?? null, null);
    assert.ok(records.some(item => item.error?.code === "item_duplicate"));
    assert.equal(server.requests.filter(request => request.url.includes("execute")).length, 0, "an unsupported mutation is never sent");
    assert.deepEqual(partial.out.at(-1).counts, { total: 6, ok: 1, skippedCompleted: 0, failed: 1, refused: 4, cancelled: 0, preview: 0 });
    assert.equal(partial.err[0].code, "batch_partial");
    const failed = await runBatch(["--input-file", inputFile(dir, [{ op: "readiness.check", args: { host: "missing.example" } }], "bad.jsonl"), "--state-dir", join(dir, "s2"), "--origin", server.origin, "--allow-loopback"]);
    assert.equal(failed.exit, EXIT.all_failed);
    assert.equal(failed.out.at(-1).error.code, "batch_all_failed");
  } finally { await server.close(); }
});

test("batch: input caps and flag caps are typed errors", async () => {
  const server = await startServer(readRouter());
  try {
    const dir = tempDir();
    const three = [1, 2, 3].map(n => ({ id: `i${n}`, op: "gateway.health" }));
    const many = await runBatch(["--input-file", inputFile(dir, three), "--state-dir", join(dir, "a"), "--max-items", "2", "--origin", server.origin, "--allow-loopback"]);
    assert.equal(many.exit, EXIT.input);
    assert.equal(many.out.at(-1).error.code, "batch_too_many_items");
    assert.equal(byType(many.out, "item").length, 2);
    assert.equal(server.requests.length, 2, "nothing past the cap is sent");
    const long = await runBatch(["--input-file", inputFile(dir, [{ id: "x".repeat(10), op: "gateway.health", args: {} }, JSON.stringify({ op: "readiness.check", args: { host: `${"a".repeat(400)}.com` } })], "long.jsonl"), "--state-dir", join(dir, "b"), "--max-line-bytes", "256", "--origin", server.origin, "--allow-loopback"]);
    assert.equal(long.exit, EXIT.input);
    assert.equal(long.out.at(-1).error.code, "batch_line_too_long");
    for (const [flag, value] of [["--concurrency", "9"], ["--max-items", "10001"], ["--max-line-bytes", "65537"], ["--timeout-ms", "99"]]) {
      const refused = await runBatch(["--input-file", "-", "--state-dir", join(dir, "c"), flag, value], { stdinText: "" });
      assert.equal(refused.exit, EXIT.input, flag);
      assert.equal(refused.out[0].error.code, "invalid_input", flag);
    }
    const noState = await runBatch(["--input-file", "-"], { stdinText: "" });
    assert.equal(noState.out[0].error.code, "input_required");
  } finally { await server.close(); }
});

test("batch: --dry-run previews requests and sends nothing", async () => {
  const dir = tempDir();
  const { exit, out } = await runBatch(["--input-file", inputFile(dir, FIVE), "--dry-run"]);
  assert.equal(exit, 0);
  const items = byType(out, "item");
  assert.ok(items.every(item => item.status === "preview" && item.sent === false && item.kind === "local_preview"));
  assert.equal(items[0].request.url, "https://samedaydesk.com/agent-readiness?host=example.com&format=json");
});

for (const [name, clientIo] of [["repaired", undefined], ["pinned", pinned]]) {
  test(`batch (${name} client-io): per-item timeout is request_timeout with sent_unconfirmed, never success`, async () => {
    const server = await startServer(readRouter({ hangHost: "slow.example" }));
    try {
      const dir = tempDir();
      const state = join(dir, "s");
      const { exit, out } = await runBatch(["--input-file", inputFile(dir, [{ id: "slow", op: "readiness.check", args: { host: "slow.example" } }, { id: "ok", op: "gateway.health" }]), "--state-dir", state, "--timeout-ms", "200", "--origin", server.origin, "--allow-loopback"], { clientIo });
      assert.equal(exit, EXIT.partial);
      const slow = byType(out, "item").find(item => item.id === "slow");
      assert.equal(slow.status, "failed");
      assert.equal(slow.error.code, "request_timeout");
      assert.equal(slow.recovery, "sent_unconfirmed");
      assert.equal(slow.attempts, 1);
      const persisted = readdirSync(join(state, "items")).map(file => JSON.parse(readFileSync(join(state, "items", file), "utf8"))).find(record => record.id === "slow");
      assert.equal(persisted.status, "failed");
      assert.equal(persisted.recovery, "sent_unconfirmed");
      assert.equal(persisted.resultFile, null);
    } finally { await server.close(); }
  });
}

test("batch: credential is origin- and scope-bound; a cross-origin redirect never carries it", async () => {
  const other = await startServer(async (req, res) => sendJson(res, 200, { id: RECEIPT_ID, status: "completed" }));
  const server = await startServer(async (req, res) => {
    if (req.url.startsWith("/api/machine-gateway/v1/receipts/")) { res.writeHead(302, { location: `${other.origin}${req.url}` }); return res.end(); }
    return readRouter()(req, res);
  });
  try {
    const dir = tempDir();
    const credential = join(dir, "tenant.credential");
    writeFileSync(credential, `${TOKEN}\n`); chmodSync(credential, 0o600);
    const state = join(dir, "s");
    const { exit, out, raw } = await runBatch(["--input-file", inputFile(dir, [{ id: "receipt", op: "gateway.receipt", args: { id: RECEIPT_ID } }, { id: "profile", op: "market.profile" }]), "--state-dir", state, "--credential-file", credential, "--origin", server.origin, "--allow-loopback", "--concurrency", "1"]);
    assert.equal(exit, EXIT.partial);
    const receipt = byType(out, "item").find(item => item.id === "receipt");
    assert.equal(receipt.error.code, "origin_refused");
    assert.equal(other.requests.length, 0, "the redirect target never received a request");
    const toGateway = server.requests.find(request => request.url.startsWith("/api/machine-gateway/v1/receipts/"));
    assert.equal(toGateway.headers.authorization, `Bearer ${TOKEN}`);
    const toMarket = server.requests.find(request => request.url.includes("market/profile"));
    assert.equal(toMarket.headers.authorization, undefined, "outside the gateway scope no credential is sent");
    assert.ok(!raw.includes("SECRETVALUE"), "credential not in stdout or stderr");
    for (const sub of ["items", "results"]) for (const name of readdirSync(join(state, sub))) assert.ok(!readFileSync(join(state, sub, name), "utf8").includes("SECRETVALUE"), name);
    const loose = join(dir, "loose.credential");
    writeFileSync(loose, `${TOKEN}\n`); chmodSync(loose, 0o644);
    const refused = await runBatch(["--input-file", "-", "--state-dir", join(dir, "s2"), "--credential-file", loose], { stdinText: "" });
    assert.equal(refused.out[0].error.code, "credential_unavailable");
    assert.ok(!JSON.stringify(refused.out).includes("SECRETVALUE"));
    const missing = await runBatch(["--input-file", inputFile(dir, [{ op: "gateway.receipt", args: { id: RECEIPT_ID } }], "m.jsonl"), "--state-dir", join(dir, "s3"), "--origin", server.origin, "--allow-loopback"]);
    assert.equal(byType(missing.out, "item")[0].error.code, "credential_required");
  } finally { await server.close(); await other.close(); }
});

test("BoundCredential: token only for its exact origin and gateway path; redacted in JSON", () => {
  const credential = new BoundCredential(TOKEN, { origin: "https://samedaydesk.com", scopePath: "/api/machine-gateway", source: "file" });
  assert.equal(credential.tokenFor("https://samedaydesk.com/api/machine-gateway/v1/execute"), TOKEN);
  assert.equal(credential.tokenFor("https://samedaydesk.com/api/machine-gatewayx/v1"), null);
  assert.equal(credential.tokenFor("https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile"), null);
  assert.equal(credential.tokenFor("https://evil.example/api/machine-gateway/v1/execute"), null);
  assert.equal(credential.tokenFor("http://samedaydesk.com/api/machine-gateway/v1/execute"), null);
  assert.equal(credential.tokenFor("https://agents.samedaydesk.com/api/machine-gateway/v1/execute"), null);
  assert.ok(!JSON.stringify(credential).includes("SECRETVALUE"));
  assert.ok(!JSON.stringify({ credential }).includes(TOKEN));
});

test("batch: credential from stdin works and conflicts with --input-file -", async () => {
  const dir = tempDir();
  const conflict = await runBatch(["--input-file", "-", "--state-dir", join(dir, "s"), "--credential-stdin"], { stdinText: `${TOKEN}\n` });
  assert.equal(conflict.out[0].error.code, "invalid_arguments");
  const bad = await runBatch(["--input-file", inputFile(dir, FIVE), "--dry-run", "--credential-stdin"], { stdinText: "short\n" });
  assert.equal(bad.out[0].error.code, "credential_invalid");
  assert.ok(!bad.raw.includes("short"));
});

test("batch child: EPIPE (stdout closed early) stops dispatch, persists state, exits 14 without a stack trace", async () => {
  const server = await startServer(readRouter({ delayMs: 30 }));
  try {
    const dir = tempDir();
    const state = join(dir, "s");
    const items = Array.from({ length: 60 }, (_, n) => ({ id: `h${n}`, op: "readiness.check", args: { host: `h${n}.example` } }));
    const cli = spawnCli(["batch", "run", "--input-file", inputFile(dir, items), "--state-dir", state, "--concurrency", "2", "--origin", server.origin, "--allow-loopback"]);
    await waitFor(() => cli.stdout().split("\n").filter(Boolean).length >= 2);
    cli.child.stdout.destroy();
    const { code } = await cli.exited;
    assert.equal(code, EXIT.output_closed);
    const err = cli.stderr();
    assert.doesNotMatch(err, /\n\s+at |Error:|EPIPE/);
    const diagnostic = JSON.parse(err.trim().split("\n").at(-1));
    assert.equal(diagnostic.code, "output_closed");
    assert.ok(server.requests.length < 60, `dispatch stopped (${server.requests.length} sent)`);
    const records = readdirSync(join(state, "items")).map(file => JSON.parse(readFileSync(join(state, "items", file), "utf8")));
    assert.ok(records.length < 60);
    assert.ok(records.every(record => ["completed", "cancelled", "failed"].includes(record.status)), JSON.stringify(records.map(r => r.status)));
    assert.equal(existsSync(join(state, "lock")), false);
  } finally { await server.close(); }
});

test("batch child: SIGINT marks in-flight items sent_unconfirmed and unsent items not_sent, exit 130", async () => {
  const server = await startServer(readRouter({ hangHost: "hang.example" }));
  try {
    const dir = tempDir();
    const state = join(dir, "s");
    const items = [{ id: "done", op: "gateway.health" }, { id: "inflight", op: "readiness.check", args: { host: "hang.example" } }, { id: "inflight2", op: "readiness.check", args: { host: "hang2.example" } }, { id: "next", op: "gateway.routes" }, { id: "later", op: "gateway.routes" }];
    const cli = spawnCli(["batch", "run", "--input-file", inputFile(dir, items), "--state-dir", state, "--concurrency", "2", "--origin", server.origin, "--allow-loopback"]);
    await waitFor(() => server.requests.some(request => request.url.includes("hang2.example")) && cli.stdout().includes('"id":"done"'));
    cli.child.kill("SIGINT");
    const { code } = await cli.exited;
    assert.equal(code, 130);
    const out = cli.lines();
    const item = id => out.find(record => record.type === "item" && record.id === id);
    assert.equal(item("done").status, "ok");
    assert.equal(item("inflight").status, "cancelled");
    assert.equal(item("inflight").recovery, "sent_unconfirmed");
    assert.equal(item("inflight2").recovery, "sent_unconfirmed");
    assert.equal(item("next").status, "cancelled");
    assert.equal(item("next").recovery, "not_sent");
    assert.equal(item("later"), undefined, "unread input is not consumed");
    assert.equal(out.at(-1).type, "summary");
    assert.equal(out.at(-1).cancelled, true);
    assert.equal(out.at(-1).error.code, "cancelled");
    assert.equal(server.requests.filter(request => request.url.endsWith("/v1/discover")).length, 0);
    const persisted = readdirSync(join(state, "items")).map(file => JSON.parse(readFileSync(join(state, "items", file), "utf8")));
    assert.equal(persisted.find(record => record.id === "inflight").recovery, "sent_unconfirmed");
    assert.doesNotMatch(cli.stderr(), /\n\s+at /);
  } finally { await server.close(); }
});

test("batch child: crash (SIGKILL) then resume in a fresh process skips completed items and reruns the unconfirmed read", async () => {
  let hang = true;
  const server = await startServer(async (req, res) => {
    if (req.url.includes("hang.example") && hang) return;
    return readRouter()(req, res);
  });
  try {
    const dir = tempDir();
    const state = join(dir, "s");
    const items = [{ id: "a", op: "gateway.health" }, { id: "b", op: "gateway.routes" }, { id: "c", op: "readiness.check", args: { host: "hang.example" } }];
    const file = inputFile(dir, items);
    const crashed = spawnCli(["batch", "run", "--input-file", file, "--state-dir", state, "--concurrency", "1", "--origin", server.origin, "--allow-loopback"]);
    await waitFor(() => server.requests.some(request => request.url.includes("hang.example")));
    crashed.child.kill("SIGKILL");
    await crashed.exited;
    assert.ok(existsSync(join(state, "lock")), "the crashed run left its lock");
    const before = readdirSync(join(state, "items")).map(name => JSON.parse(readFileSync(join(state, "items", name), "utf8")));
    assert.equal(before.find(record => record.id === "c").status, "dispatching");
    assert.equal(before.find(record => record.id === "c").recovery, "sent_unconfirmed", "persisted before dispatch");
    hang = false;
    const counts = { a: server.requests.filter(r => r.url.endsWith("/healthz")).length, b: server.requests.filter(r => r.url.endsWith("/v1/discover")).length };
    const resumed = spawnCli(["batch", "run", "--input-file", file, "--state-dir", state, "--origin", server.origin, "--allow-loopback"]);
    const { code } = await resumed.exited;
    assert.equal(code, 0, resumed.stderr());
    const out = resumed.lines();
    assert.ok(out[0].tookOverStaleLock);
    const item = id => out.find(record => record.type === "item" && record.id === id);
    assert.equal(item("a").status, "skipped_completed");
    assert.equal(item("b").status, "skipped_completed");
    assert.equal(item("c").status, "ok");
    assert.equal(server.requests.filter(r => r.url.endsWith("/healthz")).length, counts.a);
    assert.equal(server.requests.filter(r => r.url.endsWith("/v1/discover")).length, counts.b);
  } finally { await server.close(); }
});

test("batch: a second live run on the same state dir is refused; a different origin is refused", async () => {
  const server = await startServer(readRouter({ hangHost: "hang.example" }));
  try {
    const dir = tempDir();
    const state = join(dir, "s");
    const first = await runBatch(["--input-file", inputFile(dir, [{ op: "gateway.health" }]), "--state-dir", state, "--origin", server.origin, "--allow-loopback"]);
    assert.equal(first.exit, 0);
    const otherOrigin = await runBatch(["--input-file", inputFile(dir, [{ op: "gateway.health" }], "b.jsonl"), "--state-dir", state]);
    assert.equal(otherOrigin.out[0].error.code, "batch_state_origin_mismatch");
    writeFileSync(join(state, "lock"), JSON.stringify({ pid: process.pid, runId: "live" }), { mode: 0o600 });
    const locked = await runBatch(["--input-file", inputFile(dir, [{ op: "gateway.health" }], "c.jsonl"), "--state-dir", state, "--origin", server.origin, "--allow-loopback"]);
    assert.equal(locked.out[0].error.code, "batch_state_locked");
  } finally { await server.close(); }
});
