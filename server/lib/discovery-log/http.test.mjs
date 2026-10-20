import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createSdsApp } from "../../app.js";
import { buildRecord } from "./log.js";
import { prepareDiscoveryLogDir } from "./prepare-host.mjs";
import { MAX_BYTES, MAX_LINE, MAX_LINES } from "./bounds.mjs";
import { exportHostedLog, formatExportResult, MAX_PAGES, readBounded } from "../../../tools/discovery-log-export/cli.mjs";

const ADMIN = "A".repeat(40);
const JOURNEY = "J".repeat(40);
const QA = "Q".repeat(40);
const DATE = "2026-10-15";
const now = () => new Date("2026-10-15T12:00:00.000Z");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-http-"));
  const dir = path.join(root, "foundry", "discovery-log-v1");
  fs.mkdirSync(path.dirname(dir), { mode: 0o700 });
  const auth = path.join(root, "CORRESPONDENCE_ADMIN_TOKEN");
  fs.writeFileSync(auth, `${ADMIN}\n`, { mode: 0o600 });
  fs.chmodSync(auth, 0o600);
  const other = path.join(root, "other-log");
  fs.mkdirSync(other, { mode: 0o700 });
  return { root, dir, auth, other };
}

function receiptFor(file, date) {
  const bytes = fs.readFileSync(file);
  return {
    schema: "samedaydesk.discovery-log.export-receipt.v1",
    date,
    complete: true,
    watermark: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function line(extra = {}) {
  const built = buildRecord({
    method: "GET",
    path: "/llms.txt",
    headers: { "x-samedaydesk-journey": "tok_abcdefghijklmnop", "user-agent": "Claude-User" },
    query: { source: "https://example.test/item" },
  }, { now, secret: QA, journeySecret: JOURNEY });
  return `${JSON.stringify({ ...built.record, ...extra })}\n`;
}

async function listen(dir) {
  const app = createSdsApp({
    discoveryLog: {
      env: {
        DISCOVERY_LOG_DIR: dir,
        CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
        DISCOVERY_LOG_JOURNEY_SECRET: JOURNEY,
        DISCOVERY_LOG_QA_SECRET: QA,
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({
      status,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

async function call(base, { token, date = DATE, cursor, dir, method = "GET", body } = {}) {
  const query = new URLSearchParams();
  if (date !== undefined) query.set("date", date);
  if (cursor) query.set("cursor", cursor);
  if (dir) query.set("dir", dir);
  const headers = { accept: "application/json" };
  if (token !== undefined) headers.authorization = token;
  const response = await fetch(`${base}/api/discovery-log/v1/export?${query}`, { method, headers, redirect: "error" });
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

test("missing, wrong, and unrelated credentials fail; the admin token succeeds", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  fs.writeFileSync(path.join(place.dir, `discovery-${DATE}.ndjson`), line(), { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const missing = await call(server.base, {});
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error, "discovery_export_unauthenticated");
    assert.equal(missing.text.includes(ADMIN), false);

    const wrong = await call(server.base, { token: `Bearer ${`${ADMIN.slice(0, -1)}x`}` });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.error, "discovery_export_unauthenticated");
    assert.equal(wrong.text.includes(ADMIN), false);

    const journey = await call(server.base, { token: `Bearer ${JOURNEY}` });
    assert.equal(journey.status, 401);
    assert.equal(journey.json.error, "discovery_export_unauthenticated");
    assert.equal(journey.text.includes(JOURNEY), false);

    const qa = await call(server.base, { token: `Bearer ${QA}` });
    assert.equal(qa.status, 401);
    const basic = await call(server.base, { token: `Basic ${ADMIN}` });
    assert.equal(basic.status, 401);

    const ok = await call(server.base, { token: `Bearer ${ADMIN}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.schema, "samedaydesk.discovery-log.export.v1");
    assert.equal(ok.json.complete, true);
    assert.match(ok.json.lines[0], /"journeyDigest":"hmac-sha256:[0-9a-f]{64}"/);
    assert.equal(ok.text.includes("tok_abcdefghijklmnop"), false);
    assert.equal(ok.text.includes("x-samedaydesk-journey"), false);
    assert.equal(ok.text.includes(ADMIN), false);
    assert.equal(ok.text.includes(JOURNEY), false);
    assert.equal(ok.text.includes(place.dir), false);
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

function doneDir(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("bounds refuse a caller directory, a bad date, and an oversize line", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  fs.writeFileSync(path.join(place.dir, `discovery-${DATE}.ndjson`), line(), { mode: 0o600 });
  fs.writeFileSync(path.join(place.other, `discovery-${DATE}.ndjson`), `${JSON.stringify({ marker: "other-directory-secret" })}\n`, { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const supplied = await call(server.base, { token: `Bearer ${ADMIN}`, dir: place.other });
    assert.equal(supplied.status, 400);
    assert.equal(supplied.json.error, "discovery_export_dir_refused");
    assert.equal(supplied.text.includes("other-directory-secret"), false);
    assert.equal(supplied.text.includes(place.other), false);

    const traversal = await call(server.base, { token: `Bearer ${ADMIN}`, date: "../etc/passwd" });
    assert.equal(traversal.status, 400);
    assert.equal(traversal.json.error, "discovery_export_traversal");

    const huge = path.join(place.dir, "discovery-2026-10-16.ndjson");
    fs.writeFileSync(huge, Buffer.alloc(MAX_LINE + 8, 0x41), { mode: 0o600 });
    const unbounded = await call(server.base, { token: `Bearer ${ADMIN}`, date: "2026-10-16" });
    assert.equal(unbounded.status, 413);
    assert.equal(unbounded.json.error, "discovery_export_unbounded");
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

test("continuation returns the rest of a large valid day and redacts a raw token", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  const record = JSON.parse(line());
  record.discoveryRef = "b".repeat(400);
  const row = `${JSON.stringify(record)}\n`;
  assert.ok(Buffer.byteLength(row) <= MAX_LINE);
  const count = Math.ceil((MAX_BYTES + Buffer.byteLength(row)) / Buffer.byteLength(row));
  fs.writeFileSync(path.join(place.dir, `discovery-${DATE}.ndjson`), row.repeat(count), { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const first = await call(server.base, { token: `Bearer ${ADMIN}` });
    assert.equal(first.status, 200);
    assert.equal(first.json.complete, false);
    assert.ok(first.json.lines.length < count);
    assert.ok(Buffer.byteLength(first.json.lines.join("\n")) <= MAX_BYTES);
    const second = await call(server.base, { token: `Bearer ${ADMIN}`, cursor: first.json.nextCursor });
    assert.equal(second.status, 200);
    assert.equal(second.json.complete, true);
    assert.equal(first.json.lines.length + second.json.lines.length, count);
    assert.equal(`${first.text}${second.text}`.includes("tok_abcdefghijklmnop"), false);

    const planted = JSON.parse(line());
    planted["x-samedaydesk-journey"] = "tok_abcdefghijklmnop";
    fs.writeFileSync(path.join(place.dir, "discovery-2026-10-14.ndjson"), `${JSON.stringify(planted)}\n`, { mode: 0o600 });
    const leaked = await call(server.base, { token: `Bearer ${ADMIN}`, date: "2026-10-14" });
    assert.equal(leaked.status, 422);
    assert.equal(leaked.json.error, "discovery_export_token_refused");
    assert.equal(leaked.text.includes("tok_abcdefghijklmnop"), false);
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

async function retain(base, body, token = `Bearer ${ADMIN}`) {
  const response = await fetch(`${base}/api/discovery-log/v1/retain`, {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null, text };
}

test("retain deletes only a receipt-matched old day and leaves the read available", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  const keep = path.join(place.dir, "discovery-2026-09-15.ndjson");
  const drop = path.join(place.dir, "discovery-2026-09-14.ndjson");
  const uncollected = path.join(place.dir, "discovery-2026-09-01.ndjson");
  const current = path.join(place.dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(keep, line(), { mode: 0o600 });
  fs.writeFileSync(drop, line(), { mode: 0o600 });
  fs.writeFileSync(uncollected, line(), { mode: 0o600 });
  fs.writeFileSync(current, line(), { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const early = await retain(server.base, { retainDays: 30, asOf: DATE });
    assert.equal(early.status, 400);
    assert.equal(early.json.error, "discovery_retain_not_received");
    assert.equal(fs.existsSync(drop), true);

    const globalDelete = await retain(server.base, { retainDays: 30, received: true, asOf: DATE });
    assert.equal(globalDelete.status, 400);
    assert.equal(globalDelete.json.error, "discovery_retain_receipt_required");
    assert.equal(fs.existsSync(drop), true);

    const wrongWindow = await retain(server.base, { retainDays: 1, received: true, asOf: DATE, receipts: [receiptFor(drop, "2026-09-14")] });
    assert.equal(wrongWindow.status, 400);
    assert.equal(fs.existsSync(drop), true);

    const forged = await retain(server.base, { retainDays: 30, received: true, asOf: DATE, receipts: [{ ...receiptFor(drop, "2026-09-14"), watermark: "ab".repeat(32) }] });
    assert.equal(forged.status, 200);
    assert.equal(forged.json.removed, 0);
    assert.equal(fs.existsSync(drop), true);

    const partial = await retain(server.base, { retainDays: 30, received: true, asOf: DATE, receipts: [{ ...receiptFor(drop, "2026-09-14"), complete: false }] });
    assert.equal(partial.status, 400);
    assert.equal(partial.json.error, "discovery_retain_partial");
    assert.equal(fs.existsSync(drop), true);

    const staleReceipt = receiptFor(drop, "2026-09-14");
    fs.appendFileSync(drop, line());
    const stale = await retain(server.base, { retainDays: 30, received: true, asOf: DATE, receipts: [staleReceipt] });
    assert.equal(stale.status, 200);
    assert.equal(stale.json.removed, 0);
    assert.equal(fs.existsSync(drop), true);

    const mismatched = await retain(server.base, { retainDays: 30, received: true, asOf: DATE, receipts: [{ ...receiptFor(keep, "2026-09-15"), date: "2026-09-14" }] });
    assert.equal(mismatched.status, 200);
    assert.equal(mismatched.json.removed, 0);
    assert.equal(fs.existsSync(drop), true);

    const future = await retain(server.base, { retainDays: 30, received: true, asOf: "2099-01-01", receipts: [receiptFor(drop, "2026-09-14")] });
    assert.equal(future.status, 400);
    assert.equal(future.json.error, "discovery_retain_asof_refused");
    assert.equal(fs.existsSync(drop), true);

    const read = await call(server.base, { token: `Bearer ${ADMIN}`, date: DATE });
    assert.equal(read.status, 200);
    assert.equal(read.json.complete, true);
    assert.equal(read.json.lines.length, 1);
    assert.equal(read.text.includes(place.dir), false);

    const done = await retain(server.base, {
      retainDays: 30, received: true, asOf: DATE,
      receipts: [receiptFor(drop, "2026-09-14"), receiptFor(current, DATE)],
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.removed, 1);
    assert.equal(done.json.retainDays, 30);
    assert.equal(fs.existsSync(keep), true);
    assert.equal(fs.existsSync(drop), false);
    assert.equal(fs.existsSync(uncollected), true);
    assert.equal(fs.existsSync(current), true);
    assert.equal(done.text.includes(place.dir), false);
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

test("the controller reaches the local server and refuses a missing auth file", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  fs.writeFileSync(path.join(place.dir, `discovery-${DATE}.ndjson`), line(), { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const cli = path.join(import.meta.dirname, "../../../tools/discovery-log-export/cli.mjs");
    const missing = await runCli([
      cli, "export", "--origin", server.base, "--date", DATE, "--auth-file", path.join(place.root, "missing"),
    ]);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /discovery_export_unauthenticated/);
    assert.equal(missing.stderr.includes(ADMIN), false);

    const ok = await runCli([
      cli, "export", "--origin", server.base, "--date", DATE, "--auth-file", place.auth,
    ]);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /"journeyDigest":"hmac-sha256:[0-9a-f]{64}"/);
    assert.equal(ok.stdout.includes("tok_abcdefghijklmnop"), false);
    assert.equal(ok.stdout.includes(ADMIN), false);
    assert.equal(ok.stderr.includes(ADMIN), false);
    assert.match(ok.stderr, /receipt /);
    const receipt = JSON.parse(ok.stderr.slice(ok.stderr.indexOf("receipt ") + "receipt ".length));
    assert.deepEqual(receipt, receiptFor(path.join(place.dir, `discovery-${DATE}.ndjson`), DATE));
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

test("HTTP export pages a valid day over 8 MiB and a cold continuation does not repeat or drop lines", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  const record = JSON.parse(line());
  record.discoveryRef = "d".repeat(400);
  const row = `${JSON.stringify(record)}\n`;
  assert.ok(Buffer.byteLength(row) <= MAX_LINE);
  const count = Math.floor((MAX_BYTES * 8) / Buffer.byteLength(row)) + 2;
  const file = path.join(place.dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(file, row.repeat(count), { mode: 0o600 });
  assert.ok(fs.statSync(file).size > MAX_BYTES * 8);
  const server = await listen(place.dir);
  try {
    const first = await call(server.base, { token: `Bearer ${ADMIN}` });
    assert.equal(first.status, 200);
    assert.equal(first.json.complete, false);
    assert.equal(first.json.watermark, undefined);
    assert.ok(first.json.lines.length > 0);
    assert.ok(first.json.lines.length <= MAX_LINES);
    assert.ok(first.json.lines.every(item => Buffer.byteLength(item) <= MAX_LINE));
    const stopped = await exportHostedLog({
      origin: server.base, date: DATE, authFile: place.auth, maxPages: 1,
    });
    assert.equal(stopped.complete, false);
    assert.equal(stopped.lines.length, first.json.lines.length);
    const formatted = formatExportResult(stopped);
    assert.equal(formatted.status, 0);
    assert.match(formatted.stderr, /^discovery_export_continuation /);
    assert.equal(formatted.stdout.includes(stopped.lines[0]), true);
    const continued = await exportHostedLog({
      origin: server.base, date: DATE, authFile: place.auth, cursor: stopped.continuation,
    });
    assert.equal(continued.complete, true);
    assert.equal(continued.receipt.watermark, receiptFor(file, DATE).watermark);
    const combined = [...stopped.lines, ...continued.lines];
    assert.equal(combined.length, count);
    assert.equal(combined[0], stopped.lines[0]);
    assert.equal(combined[stopped.lines.length], continued.lines[0]);
    assert.equal(combined.filter(item => item === stopped.lines[0]).length, count);

    const shifted = Buffer.from(row.repeat(count));
    shifted[first.json.offset - 8] ^= 0x01;
    fs.writeFileSync(file, shifted);
    const changed = await call(server.base, { token: `Bearer ${ADMIN}`, cursor: first.json.nextCursor });
    assert.equal(changed.status, 400);
    assert.equal(changed.json.error, "discovery_export_cursor_refused");
    fs.truncateSync(file, Math.max(0, first.json.offset - 1));
    const shrunk = await call(server.base, { token: `Bearer ${ADMIN}`, cursor: first.json.nextCursor });
    assert.equal(shrunk.status, 400);
    assert.equal(shrunk.json.error, "discovery_export_cursor_refused");
  } finally {
    await server.close();
    doneDir(place.root);
  }
});

test("the controller stops at 64 pages with a partial and continues cold without duplicates", async () => {
  const place = workspace();
  const seen = [];
  const fetchImpl = async (url) => {
    const cursor = new URL(url).searchParams.get("cursor");
    const index = cursor ? Number(cursor.slice(1)) : 0;
    seen.push(index);
    const last = index === MAX_PAGES;
    const body = {
      schema: "samedaydesk.discovery-log.export.v1",
      date: DATE,
      lines: [`{"n":${index}}`],
      nextCursor: last ? null : `c${index + 1}`,
      complete: last,
      ...(last ? { watermark: "ab".repeat(32), bytes: index + 1 } : {}),
    };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const sentinel = globalThis.fetch;
  const first = await exportHostedLog({ origin: "http://127.0.0.1:9", date: DATE, authFile: place.auth, fetch: fetchImpl });
  assert.equal(globalThis.fetch, sentinel);
  assert.equal(first.complete, false);
  assert.equal(first.lines.length, MAX_PAGES);
  assert.equal(first.continuation, `c${MAX_PAGES}`);
  assert.equal(seen.length, MAX_PAGES);
  const presented = formatExportResult(first);
  assert.equal(presented.status, 0);
  assert.match(presented.stderr, new RegExp(`^discovery_export_continuation c${MAX_PAGES}\\n$`));
  assert.equal(presented.stdout.split("\n").filter(Boolean).length, MAX_PAGES);
  const second = await exportHostedLog({
    origin: "http://127.0.0.1:9", date: DATE, authFile: place.auth, fetch: fetchImpl, cursor: first.continuation,
  });
  assert.equal(second.complete, true);
  assert.deepEqual(second.lines, [`{"n":${MAX_PAGES}}`]);
  assert.equal(seen.at(-1), MAX_PAGES);
  assert.equal(globalThis.fetch, sentinel);
  doneDir(place.root);
});

test("readBounded cancels and releases on a limit, and a timeout keeps earlier progress", async () => {
  const limited = {
    cancelled: false,
    released: false,
    reads: 0,
    async read() {
      this.reads += 1;
      return { done: false, value: Buffer.alloc(80) };
    },
    async cancel() { this.cancelled = true; },
    releaseLock() { this.released = true; },
  };
  await assert.rejects(
    () => readBounded({ body: { getReader: () => limited } }, { limit: 100 }),
    /discovery_export_unbounded/,
  );
  assert.equal(limited.cancelled, true);
  assert.equal(limited.released, true);

  let releaseHang;
  const hung = new Promise((resolve) => { releaseHang = resolve; });
  const controller = new AbortController();
  const slow = {
    cancelled: false,
    released: false,
    reads: 0,
    async read() {
      this.reads += 1;
      if (this.reads === 1) return { done: false, value: Buffer.from("kept-progress") };
      controller.abort();
      await hung;
      return { done: true, value: undefined };
    },
    async cancel() { this.cancelled = true; releaseHang(); },
    releaseLock() { this.released = true; },
  };
  const error = await readBounded({ body: { getReader: () => slow } }, { signal: controller.signal }).then(() => null, (value) => value);
  assert.equal(error.message, "discovery_export_deadline");
  assert.equal(error.progress, "kept-progress");
  assert.equal(slow.cancelled, true);
  assert.equal(slow.released, true);

  const place = workspace();
  let page = 0;
  let releaseSecond;
  const secondHang = new Promise((resolve) => { releaseSecond = resolve; });
  const reader = {
    cancelled: false,
    released: false,
    reads: 0,
    async read() {
      this.reads += 1;
      if (this.reads === 1) return { done: false, value: Buffer.from("page-two-partial") };
      await secondHang;
      return { done: true, value: undefined };
    },
    async cancel() { this.cancelled = true; releaseSecond(); },
    releaseLock() { this.released = true; },
  };
  const fetchImpl = async () => {
    page += 1;
    if (page === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          schema: "samedaydesk.discovery-log.export.v1",
          date: DATE,
          lines: ['{"n":1}'],
          nextCursor: "c1",
          complete: false,
        }),
      };
    }
    return { ok: true, status: 200, body: { getReader: () => reader } };
  };
  const saved = globalThis.fetch;
  const result = await exportHostedLog({
    origin: "http://127.0.0.1:9",
    date: DATE,
    authFile: place.auth,
    fetch: fetchImpl,
    deadlines: { requestMs: 2000, bodyMs: 30, overallMs: 2000 },
  });
  assert.equal(globalThis.fetch, saved);
  assert.equal(result.timedOut, true);
  assert.deepEqual(result.lines, ['{"n":1}']);
  assert.equal(result.continuation, "c1");
  assert.equal(result.progress, "page-two-partial");
  assert.equal(reader.cancelled, true);
  assert.equal(reader.released, true);
  doneDir(place.root);
});
