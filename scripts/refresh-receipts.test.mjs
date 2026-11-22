import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import express from "express";
import { refreshReceipts, decodePrivateExport, gzipPrivateExport } from "./refresh-receipts.mjs";
import { mountReceiptSnapshot, writeReceiptSnapshot } from "../server/lib/receipt-snapshot.js";
import { receiptId } from "../client/src/data/receiptPages.mjs";

const policy = JSON.stringify({ invalid: 0, rows: [], privateSentinel: "private-policy-sentinel" });
const snapshot = JSON.parse(await readFile(new URL("../client/public/receipts.json", import.meta.url), "utf8"));
const next = { ...snapshot, chainReadThroughBlock: snapshot.chainReadThroughBlock + 1 };

test("plain and gzip encodings preserve exact bytes and use the observed host value limit", () => {
  const original = Buffer.from(policy + "\n");
  const plain = original.toString("base64");
  const gzip = gzipPrivateExport(original);
  assert.deepEqual(decodePrivateExport({ SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: plain }), original);
  assert.deepEqual(decodePrivateExport({ SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64: gzip.toString("base64") }), original);
  assert.deepEqual(gzipPrivateExport(original), gzip);
  assert.ok(gzip.toString("base64").length <= 8192);
  const boundary = Buffer.concat([original, Buffer.alloc(6144 - original.length, 32)]);
  assert.equal(boundary.toString("base64").length, 8192);
  assert.deepEqual(decodePrivateExport({ SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: boundary.toString("base64") }), boundary);
  const noise = Buffer.from(JSON.stringify({ invalid: 0, rows: [], padding: randomBytes(10000).toString("base64") }));
  assert.throws(() => gzipPrivateExport(noise), /private-export-value-too-large/);
});

test("missing, double, malformed, noncanonical, truncated, bomb and oversize inputs fail closed", () => {
  const plain = Buffer.from(policy).toString("base64");
  const gzip = gzipPrivateExport(Buffer.from(policy));
  const zipped = gzip.toString("base64");
  const compressed = (value) => ({ SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64: value });
  for (const env of [
    {}, { SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: plain, ...compressed(zipped) },
    { SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: "", ...compressed(zipped) },
    { SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: plain, ...compressed("") },
    compressed(""), compressed("not-base64"), compressed(zipped + "\n"),
    compressed(zipped.replace(/=+$/, "") + "!"), compressed("A".repeat(8196)),
    { SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: "A".repeat(8196) },
    compressed(Buffer.from(policy).toString("base64")),
    compressed(gzip.subarray(0, -1).toString("base64")),
    compressed(Buffer.concat([gzip.subarray(0, -1), Buffer.from([gzip.at(-1) ^ 1])]).toString("base64")),
    compressed(gzipSync(Buffer.from("not-json")).toString("base64")),
    compressed(gzipSync(Buffer.from('{"invalid":1,"rows":[]}')).toString("base64")),
    compressed(gzipSync(Buffer.alloc(2 * 1024 * 1024, 65)).toString("base64")),
    compressed(gzipSync(Buffer.from(JSON.stringify({ invalid: 0, rows: [], padding: "x".repeat(1024 * 1024) }))).toString("base64")),
  ]) assert.throws(() => decodePrivateExport(env), /invalid-private-export/);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "sds-rebuild-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, "snapshot.json");
  const original = JSON.stringify(snapshot);
  await writeFile(target, original, { mode: 0o600 });
  const env = { SDS_RECEIPTS_REBUILD_PATH: target,
    SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: Buffer.from(policy).toString("base64"),
    STRIPE_SECRET_KEY: "credential-sentinel", BASE_RPC: "https://unadmitted.invalid/secret" };
  return { root, target, original, env };
}

test("staged builder keeps old bytes until success and existing HTTP consumer receives the atomic snapshot", async (t) => {
  const h = await fixture(t);
  await writeFile(join(h.root, "unrelated-keep"), "another job");
  const result = await refreshReceipts({ env: h.env, builder: async ({ env }) => {
    assert.deepEqual(Object.keys(env).sort(), ["BASE_HASH_RPC", "BASE_RPC", "RECEIPTS_PRIVATE_EXPORT", "RECEIPTS_RPC_INTERVAL_MS", "SDS_RECEIPTS_SNAPSHOT_PATH"]);
    assert.equal(env.BASE_RPC, "https://base-rpc.publicnode.com");
    assert.equal(env.BASE_HASH_RPC, "https://mainnet.base.org");
    assert.equal(env.RECEIPTS_RPC_INTERVAL_MS, "1000");
    assert.notEqual(env.SDS_RECEIPTS_SNAPSHOT_PATH, h.target);
    assert.equal(await readFile(env.RECEIPTS_PRIVATE_EXPORT, "utf8"), policy);
    assert.equal((await lstat(env.RECEIPTS_PRIVATE_EXPORT)).mode & 0o777, 0o600);
    assert.equal((await lstat(dirname(env.RECEIPTS_PRIVATE_EXPORT))).mode & 0o777, 0o700);
    assert.equal(await readFile(h.target, "utf8"), h.original);
    await writeReceiptSnapshot(env.SDS_RECEIPTS_SNAPSHOT_PATH, JSON.stringify(next));
    assert.equal(await readFile(h.target, "utf8"), h.original);
    return { code: 0 };
  } });
  assert.equal(result.ok, true);
  assert.equal(result.cleanupComplete, true);
  assert.equal((await lstat(h.target)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(h.root)).sort(), ["snapshot.json", "unrelated-keep"]);
  assert.doesNotMatch(JSON.stringify(result), /private-policy-sentinel|credential-sentinel|https?:|\.json/);
  const app = express();
  mountReceiptSnapshot(app, resolve("client/dist"), h.target);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(origin + "/receipts.json")).text(), JSON.stringify(next));
  const row = next.entries.find((entry) => entry.kind === "settlement");
  assert.equal((await fetch(origin + "/receipts/" + receiptId(row))).status, 200);
  assert.equal((await fetch(origin + "/receipts/missing")).status, 404);
});

test("malformed base64 and incomplete policy are refused without invoking the builder", async (t) => {
  const h = await fixture(t);
  for (const encoded of [undefined, "not-base64", Buffer.from("not-json").toString("base64"),
    Buffer.from('{"invalid":1,"rows":[]}').toString("base64")]) {
    const result = await refreshReceipts({ env: { ...h.env, SDS_RECEIPTS_PRIVATE_EXPORT_BASE64: encoded },
      builder: () => assert.fail("builder must not run") });
    assert.equal(result.reason, "invalid-private-export");
    assert.equal(result.published, false);
    assert.equal(await readFile(h.target, "utf8"), h.original);
  }
});

test("first enrollment creates a private destination without switching the app snapshot setting", async (t) => {
  const h = await fixture(t);
  const target = join(h.root, "new-private", "snapshot.json");
  assert.equal(h.env.SDS_RECEIPTS_SNAPSHOT_PATH, undefined);
  const result = await refreshReceipts({ env: { ...h.env, SDS_RECEIPTS_REBUILD_PATH: target },
    builder: async ({ env }) => {
      assert.notEqual(env.SDS_RECEIPTS_SNAPSHOT_PATH, target);
      await writeReceiptSnapshot(env.SDS_RECEIPTS_SNAPSHOT_PATH, JSON.stringify(next));
      return { code: 0 };
    } });
  assert.equal(result.ok, true);
  assert.equal((await lstat(dirname(target))).mode & 0o777, 0o700);
  assert.equal((await lstat(target)).mode & 0o777, 0o600);
  assert.equal(await readFile(h.target, "utf8"), h.original);
});

test("gzip reaches the unchanged builder as exact protected bytes and malformed gzip retains last-good", async (t) => {
  const h = await fixture(t);
  const env = { ...h.env, SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64: gzipPrivateExport(Buffer.from(policy)).toString("base64") };
  delete env.SDS_RECEIPTS_PRIVATE_EXPORT_BASE64;
  const result = await refreshReceipts({ env, builder: async ({ env: child }) => {
    assert.equal(child.SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64, undefined);
    assert.equal(child.SDS_RECEIPTS_PRIVATE_EXPORT_BASE64, undefined);
    assert.equal(await readFile(child.RECEIPTS_PRIVATE_EXPORT, "utf8"), policy);
    assert.equal((await lstat(child.RECEIPTS_PRIVATE_EXPORT)).mode & 0o777, 0o600);
    await writeReceiptSnapshot(child.SDS_RECEIPTS_SNAPSHOT_PATH, JSON.stringify(next));
    return { code: 0 };
  } });
  assert.equal(result.ok, true);
  const retained = await readFile(h.target, "utf8");
  const failed = await refreshReceipts({ env: { ...env, SDS_RECEIPTS_PRIVATE_EXPORT_GZIP_BASE64: "invalid" },
    builder: () => assert.fail("invalid gzip must not invoke builder") });
  assert.equal(failed.published, false);
  assert.equal(failed.cleanupComplete, true);
  assert.equal(await readFile(h.target, "utf8"), retained);
  assert.deepEqual(await readdir(h.root), ["snapshot.json"]);
});

test("partial, invalid and older candidates retain last-good bytes and clean only the owned job", async (t) => {
  const h = await fixture(t);
  for (const kind of ["failed", "invalid", "older"]) {
    const result = await refreshReceipts({ env: h.env, builder: async ({ env }) => {
      const body = kind === "older" ? JSON.stringify({ ...snapshot, chainReadThroughBlock: snapshot.chainReadThroughBlock - 1 }) : "partial candidate";
      await writeFile(env.SDS_RECEIPTS_SNAPSHOT_PATH, body);
      return { code: kind === "failed" ? 1 : 0, stderr: "private-policy-sentinel https://secret.invalid credential-sentinel RPC eth_getLogs: HTTP 429" };
    } });
    assert.equal(result.ok, false);
    assert.equal(result.published, false);
    assert.equal(result.cleanupComplete, true);
    assert.equal(await readFile(h.target, "utf8"), h.original);
    assert.deepEqual(await readdir(h.root), ["snapshot.json"]);
    assert.doesNotMatch(JSON.stringify(result), /private-policy-sentinel|credential-sentinel|https?:/);
    if (kind === "failed") assert.equal(result.httpStatus, 429);
  }
});

test("deadline and parent interruption retain the snapshot and release owned temporary files", async (t) => {
  const h = await fixture(t);
  const timeout = await refreshReceipts({ env: h.env, timeoutMs: 10,
    builder: ({ signal }) => new Promise((done) => signal.addEventListener("abort", () => done({ code: null }), { once: true })) });
  assert.equal(timeout.reason, "deadline-exceeded");
  const parent = new AbortController();
  const interrupted = await refreshReceipts({ env: h.env, signal: parent.signal,
    builder: async () => { parent.abort(); return { code: 0 }; } });
  assert.equal(interrupted.reason, "interrupted");
  assert.equal(await readFile(h.target, "utf8"), h.original);
  assert.deepEqual(await readdir(h.root), ["snapshot.json"]);
});

test("an existing job lock is reported and never removed", async (t) => {
  const h = await fixture(t);
  const lock = join(h.root, ".rebuild.lock");
  await mkdir(lock, { mode: 0o700 });
  await writeFile(join(lock, "owner"), "existing job");
  const result = await refreshReceipts({ env: h.env, builder: () => assert.fail("busy") });
  assert.equal(result.reason, "rebuild-already-running");
  assert.equal(await readFile(join(lock, "owner"), "utf8"), "existing job");
  assert.equal(await readFile(h.target, "utf8"), h.original);
});

test("private directory and file permissions are required without changing existing permissions", async (t) => {
  const h = await fixture(t);
  await chmod(h.root, 0o755);
  const directory = await refreshReceipts({ env: h.env, builder: () => assert.fail("public directory") });
  assert.equal(directory.reason, "private-directory-required");
  assert.equal((await lstat(h.root)).mode & 0o777, 0o755);
  await chmod(h.root, 0o700);
  await chmod(h.target, 0o644);
  const file = await refreshReceipts({ env: h.env, builder: () => assert.fail("public file") });
  assert.equal(file.reason, "private-snapshot-required");
  assert.equal((await lstat(h.target)).mode & 0o777, 0o644);
});

test("host CLI rejects missing configuration with one safe receipt and no stack", () => {
  const child = spawnSync(process.execPath, [new URL("./refresh-receipts.mjs", import.meta.url).pathname], { env: {}, encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.equal(JSON.parse(child.stdout).reason, "invalid-rebuild-configuration");
  assert.equal(child.stderr, "");
});

test("host current directory symlink executes the CLI instead of silently exiting", async (t) => {
  const h = await fixture(t);
  await symlink(resolve("."), join(h.root, "current"), "dir");
  const child = spawnSync(process.execPath, [join(h.root, "current/scripts/refresh-receipts.mjs")], { env: {}, encoding: "utf8" });
  assert.equal(child.status, 1);
  assert.equal(JSON.parse(child.stdout).reason, "invalid-rebuild-configuration");
  assert.equal(child.stderr, "");
});
