import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { envWithoutOwner, runCli, tempDir, writeOwnerTokenFile } from "./helpers.mjs";
import { requestJson } from "../src/http.mjs";

async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function workspace(t) {
  const root = tempDir("csg-codex-boundary-");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("actual CLI: response body loss keeps the grant unknown and never reposts", async (t) => {
  const root = workspace(t);
  let posts = 0;
  const origin = await serve(t, (req, res) => {
    req.resume();
    posts += 1;
    res.writeHead(201, { "content-type": "application/json", "content-length": "1000" });
    res.flushHeaders();
    res.write('{"token":"');
    setTimeout(() => res.destroy(), 100);
  });
  const outDir = join(root, "grant");
  const ownerFile = writeOwnerTokenFile(join(root, "owner"));
  const args = ["--role", "owner", "issue", "--base-url", origin,
    "--owner-token-file", ownerFile, "--out-dir", outDir];
  const result = await runCli(args, { env: envWithoutOwner() });
  assert.equal(result.code, 1);
  assert.equal(result.json?.outcome, "unknown", result.stdout);
  assert.equal(JSON.parse(readFileSync(join(outDir, "grant-attempt.json"))).status, "unknown");
  const retry = await runCli(args, { env: envWithoutOwner() });
  assert.equal(retry.code, 1);
  const reconciled = await runCli(["--role", "owner", "reconcile", "--out-dir", outDir], { env: envWithoutOwner() });
  assert.equal(reconciled.json?.outcome, "unknown");
  assert.equal(posts, 1);
});

async function pendingClaim(t) {
  const root = workspace(t);
  const tokenFile = join(root, "contributor.token");
  writeFileSync(tokenFile, "ew_ctr_original_nonsecret_test_token\n", { mode: 0o600 });
  const stateDir = join(root, "state");
  let posts = 0;
  let drop = true;
  const origin = await serve(t, (req, res) => {
    req.resume();
    posts += 1;
    if (drop) return req.socket.destroy();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ reservation: { id: "rsv_original", status: "active" } }));
  });
  const common = ["--role", "contributor", "--base-url", origin,
    "--token-file", tokenFile, "--state-dir", stateDir];
  const args = ["claim", ...common, "--task-id", "tsk_original", "--terms-version", `sha256:${"a".repeat(64)}`,
    "--idempotency-key", "original-claim-key"];
  const first = await runCli(args, { env: envWithoutOwner() });
  assert.equal(first.json?.outcome, "unknown", first.stdout);
  return { root, tokenFile, stateDir, origin, args, common, posts: () => posts, allow: () => { drop = false; } };
}

test("actual CLI: unknown claim refuses changed origin and preserves exact replay", async (t) => {
  const pending = await pendingClaim(t);
  const path = join(pending.stateDir, "contributor-state.json");
  const before = readFileSync(path, "utf8");
  const foreignToken = join(pending.root, "foreign.token");
  writeFileSync(foreignToken, "ew_ctr_foreign_same_public_label\n", { mode: 0o600 });
  const foreignCredential = await runCli(["reconcile", ...pending.common.map((arg) => arg === pending.tokenFile ? foreignToken : arg)], { env: envWithoutOwner() });
  assert.equal(foreignCredential.code, 1);
  for (const override of [["--task-id", "tsk_other"], ["--terms-version", `sha256:${"b".repeat(64)}`], ["--idempotency-key", "other-claim-key"]]) {
    const changed = await runCli(["reconcile", ...pending.common, ...override], { env: envWithoutOwner() });
    assert.equal(changed.code, 1, changed.stdout);
  }
  assert.equal(pending.posts(), 1);
  assert.equal(readFileSync(path, "utf8"), before);
  let foreignPosts = 0;
  const foreign = await serve(t, (req, res) => {
    req.resume();
    foreignPosts += 1;
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ reservation: { id: "rsv_foreign", status: "active" } }));
  });
  const attempt = await runCli(["reconcile", "--role", "contributor", "--base-url", foreign,
    "--token-file", pending.tokenFile, "--state-dir", pending.stateDir], { env: envWithoutOwner() });
  assert.equal(attempt.code, 1, attempt.stdout);
  assert.equal(foreignPosts, 0);
  assert.equal(readFileSync(path, "utf8"), before);
  pending.allow();
  const exact = await runCli(["reconcile", ...pending.common], { env: envWithoutOwner() });
  assert.equal(exact.code, 0, exact.stdout);
  assert.equal(exact.json.reservationId, "rsv_original");
  assert.equal(pending.posts(), 2);
});

test("actual CLI: fresh claim cannot erase an unresolved attempt", async (t) => {
  const pending = await pendingClaim(t);
  const path = join(pending.stateDir, "contributor-state.json");
  const before = readFileSync(path, "utf8");
  const args = pending.args.map((arg) => arg === "original-claim-key" ? "replacement-key" : arg);
  const retry = await runCli(args, { env: envWithoutOwner() });
  assert.equal(retry.code, 1, retry.stdout);
  assert.equal(pending.posts(), 1);
  assert.equal(readFileSync(path, "utf8"), before);
});

test("actual concurrent CLI claims reserve the state file once before dispatch", async (t) => {
  const root = workspace(t);
  const tokenFile = join(root, "token");
  writeFileSync(tokenFile, "ew_ctr_concurrent_test\n", { mode: 0o600 });
  let posts = 0;
  const origin = await serve(t, (req, res) => {
    req.resume();
    posts += 1;
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ reservation: { id: "rsv_once", status: "active" } }));
  });
  const args = ["claim", "--role", "contributor", "--base-url", origin, "--token-file", tokenFile,
    "--state-dir", join(root, "state"), "--task-id", "tsk_once", "--terms-version", `sha256:${"a".repeat(64)}`];
  const results = await Promise.all(["first-key", "second-key"].map((key) => runCli([...args, "--idempotency-key", key], { env: envWithoutOwner() })));
  assert.equal(results.filter((result) => result.code === 0).length, 1);
  assert.equal(posts, 1);
});

test("unexpected success status and stalled response body remain unknown", async (t) => {
  for (const status of [200, 202]) {
    await assert.rejects(() => requestJson({ baseUrl: "http://127.0.0.1:9", method: "POST", path: "/v1/contributor-tokens", success: [201],
      fetchImpl: async () => new Response('{"token":"test-only"}', { status }) }),
    (error) => error.code === "unknown_outcome");
  }
  const origin = await serve(t, (req, res) => {
    req.resume();
    res.writeHead(201, { "content-type": "application/json" });
    res.flushHeaders();
    res.write('{"token":');
  });
  await assert.rejects(() => requestJson({ baseUrl: origin, method: "POST", path: "/v1/contributor-tokens", success: [201], timeoutMs: 50 }),
    (error) => error.code === "unknown_outcome");
});
