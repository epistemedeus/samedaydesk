import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createSdsApp } from "../../app.js";
import { buildRecord } from "./log.js";
import { prepareDiscoveryLogDir } from "./prepare-host.mjs";
import { MAX_BYTES, MAX_LINE } from "./bounds.mjs";

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

test("retain deletes aged daily files only after records are received", async () => {
  const place = workspace();
  prepareDiscoveryLogDir(place.dir);
  const keep = path.join(place.dir, "discovery-2026-09-15.ndjson");
  const drop = path.join(place.dir, "discovery-2026-09-14.ndjson");
  fs.writeFileSync(keep, line(), { mode: 0o600 });
  fs.writeFileSync(drop, line(), { mode: 0o600 });
  const server = await listen(place.dir);
  try {
    const early = await fetch(`${server.base}/api/discovery-log/v1/retain`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ retainDays: 30, asOf: DATE }),
    });
    assert.equal(early.status, 400);
    assert.equal((await early.json()).error, "discovery_retain_not_received");
    assert.equal(fs.existsSync(drop), true);

    const wrongWindow = await fetch(`${server.base}/api/discovery-log/v1/retain`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ retainDays: 1, received: true, asOf: DATE }),
    });
    assert.equal(wrongWindow.status, 400);
    assert.equal(fs.existsSync(drop), true);

    const done = await fetch(`${server.base}/api/discovery-log/v1/retain`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" },
      body: JSON.stringify({ retainDays: 30, received: true, asOf: DATE }),
    });
    const body = await done.json();
    assert.equal(done.status, 200);
    assert.equal(body.removed, 1);
    assert.equal(body.retainDays, 30);
    assert.equal(fs.existsSync(keep), true);
    assert.equal(fs.existsSync(drop), false);
    assert.equal(JSON.stringify(body).includes(place.dir), false);
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
  } finally {
    await server.close();
    doneDir(place.root);
  }
});
