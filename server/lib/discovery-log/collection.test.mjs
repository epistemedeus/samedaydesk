import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRecord } from "./log.js";
import { prepareDiscoveryLogDir } from "./prepare-host.mjs";
import { exportDiscoveryLog } from "./export-log.mjs";
import { retainDiscoveryLogs } from "./retain.mjs";
import { assertEnrolledAuthFile, MAX_BYTES, MAX_LINE, MAX_LINES } from "./bounds.mjs";

const SECRET = "j".repeat(32);
const DATE = "2026-10-15";
const now = () => new Date("2026-10-15T12:00:00.000Z");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-log-"));
  const foundry = path.join(root, "foundry");
  const dir = path.join(foundry, "discovery-log-v1");
  fs.mkdirSync(foundry, { mode: 0o700 });
  fs.chmodSync(foundry, 0o700);
  const auth = path.join(root, "hmac.key");
  fs.writeFileSync(auth, SECRET, { mode: 0o600 });
  fs.chmodSync(auth, 0o600);
  return { root, foundry, dir, auth };
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

function recordLine(extra = {}) {
  const built = buildRecord({
    method: "GET",
    path: "/llms.txt",
    headers: { "x-samedaydesk-journey": "tok_abcdefghijklmnop", "user-agent": "Claude-User" },
    query: { source: "https://example.test/item" },
  }, { now, secret: SECRET, journeySecret: SECRET });
  return JSON.stringify({ ...built.record, ...extra });
}

test("prepare proves mode 0700, a 0600 probe, and that the directory persists", () => {
  const { dir } = workspace();
  const receipt = prepareDiscoveryLogDir(dir);
  assert.equal(receipt.probe, "written-read-removed");
  assert.equal(receipt.directoryMode, "0700");
  const stat = fs.lstatSync(dir);
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.mode & 0o777, 0o700);
  assert.equal(fs.readdirSync(dir).some(name => name.startsWith(".probe-")), false);
  assert.equal(fs.existsSync(dir), true);
});

test("prepare refuses a directory that is not mode 0700 and a discovery file that is not mode 0600", () => {
  const { foundry, dir } = workspace();
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  assert.throws(() => prepareDiscoveryLogDir(dir), /discovery_prepare_mode_refused/);
  fs.chmodSync(dir, 0o700);
  const loose = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(loose, `${recordLine()}\n`, { mode: 0o644 });
  fs.chmodSync(loose, 0o644);
  assert.throws(() => prepareDiscoveryLogDir(dir), /discovery_prepare_mode_refused/);
  assert.equal(fs.existsSync(loose), true);
  assert.equal(path.dirname(dir), foundry);
});

test("export emits journeyDigest for one allowlisted day and no raw token", () => {
  const { dir } = workspace();
  prepareDiscoveryLogDir(dir);
  const line = recordLine();
  assert.equal(line.includes("tok_abcdefghijklmnop"), false);
  assert.match(line, /hmac-sha256:[0-9a-f]{64}/);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), `${line}\n`, { mode: 0o600 });
  const page = exportDiscoveryLog({ dir, date: DATE });
  const out = page.lines.join("\n");
  assert.equal(page.complete, true);
  assert.equal(page.nextCursor, null);
  assert.match(out, /"journeyDigest":"hmac-sha256:[0-9a-f]{64}"/);
  assert.equal(out.includes("tok_abcdefghijklmnop"), false);
  assert.equal(out.includes("x-samedaydesk-journey"), false);
  assert.equal(out.includes(SECRET), false);
});

test("export refuses traversal, a missing date, an oversize line, and an empty line", () => {
  const { root, dir } = workspace();
  prepareDiscoveryLogDir(dir);
  const outside = path.join(root, "outside.ndjson");
  fs.writeFileSync(outside, `${recordLine()}\n`);
  fs.symlinkSync(outside, path.join(dir, `discovery-${DATE}.ndjson`));
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE }), /discovery_export_traversal/);
  fs.unlinkSync(path.join(dir, `discovery-${DATE}.ndjson`));
  assert.throws(() => exportDiscoveryLog({ dir, date: "../etc/passwd" }), /discovery_export_traversal/);
  assert.throws(() => exportDiscoveryLog({ dir, date: "" }), /discovery_export_unbounded/);
  assert.throws(() => exportDiscoveryLog({ dir: `${dir}/../discovery-log-v1`, date: DATE }), /discovery_export_traversal/);
  const huge = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(huge, Buffer.alloc(MAX_BYTES + 1, 0x41), { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE }), /discovery_export_unbounded/);
  fs.writeFileSync(huge, Buffer.alloc(32, 0x0a), { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE }), /discovery_export_record_refused/);
});

test("the enrolled file check is a local precondition and is not export authentication", () => {
  const { root, dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), `${recordLine()}\n`, { mode: 0o600 });
  const page = exportDiscoveryLog({ dir, date: DATE });
  assert.equal(page.lines.length, 1);
  assert.equal(JSON.stringify(page).includes(SECRET), false);
  assert.throws(() => assertEnrolledAuthFile(path.join(root, "missing.key")), /discovery_export_unauthenticated/);
  fs.chmodSync(auth, 0o644);
  assert.throws(() => assertEnrolledAuthFile(auth), /discovery_export_unauthenticated/);
  fs.chmodSync(auth, 0o600);
  fs.writeFileSync(auth, "j".repeat(31), { mode: 0o600 });
  assert.throws(() => assertEnrolledAuthFile(auth), /discovery_export_unauthenticated/);
  const link = path.join(root, "linked.key");
  fs.writeFileSync(auth, SECRET, { mode: 0o600 });
  fs.symlinkSync(auth, link);
  assert.throws(() => assertEnrolledAuthFile(link), /discovery_export_unauthenticated/);
});

test("export refuses a raw token and does not emit it", () => {
  const { dir } = workspace();
  prepareDiscoveryLogDir(dir);
  const token = "tok_abcdefghijklmnop";
  const planted = JSON.parse(recordLine());
  planted["x-samedaydesk-journey"] = token;
  const file = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(file, `${JSON.stringify(planted)}\n`, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE }), /discovery_export_token_refused/);
  planted.journeyDigest = token;
  delete planted["x-samedaydesk-journey"];
  fs.writeFileSync(file, `${JSON.stringify(planted)}\n`, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE }), /discovery_export_token_refused/);
});

test("retain deletes only an old day whose completed receipt matches that file", () => {
  const { dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  const now = new Date("2026-10-15T00:00:00.000Z");
  const keep = path.join(dir, "discovery-2026-09-15.ndjson");
  const drop = path.join(dir, "discovery-2026-09-14.ndjson");
  const uncollected = path.join(dir, "discovery-2026-09-01.ndjson");
  const current = path.join(dir, `discovery-${DATE}.ndjson`);
  const note = path.join(dir, "notes.txt");
  fs.writeFileSync(keep, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(drop, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(uncollected, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(current, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(note, "leave\n", { mode: 0o600 });
  const base = { dir, retainDays: 30, asOf: DATE, authFile: auth, now };
  assert.throws(() => retainDiscoveryLogs(base), /discovery_retain_receipt_required/);
  assert.equal(fs.existsSync(drop), true);
  const forged = { ...receiptFor(drop, "2026-09-14"), watermark: "ab".repeat(32) };
  assert.equal(retainDiscoveryLogs({ ...base, receipts: [forged] }).removed, 0);
  assert.equal(fs.existsSync(drop), true);
  assert.throws(() => retainDiscoveryLogs({ ...base, receipts: [{ ...receiptFor(drop, "2026-09-14"), complete: false }] }), /discovery_retain_partial/);
  assert.equal(fs.existsSync(drop), true);
  const stale = receiptFor(drop, "2026-09-14");
  fs.appendFileSync(drop, `${recordLine()}\n`);
  assert.equal(retainDiscoveryLogs({ ...base, receipts: [stale] }).removed, 0);
  assert.equal(fs.existsSync(drop), true);
  const mismatched = { ...receiptFor(keep, "2026-09-15"), date: "2026-09-14" };
  assert.equal(retainDiscoveryLogs({ ...base, receipts: [mismatched] }).removed, 0);
  assert.equal(fs.existsSync(drop), true);
  assert.throws(() => retainDiscoveryLogs({ ...base, asOf: "2099-01-01", receipts: [receiptFor(drop, "2026-09-14")] }), /discovery_retain_asof_refused/);
  assert.equal(fs.existsSync(drop), true);
  const receipt = retainDiscoveryLogs({ ...base, receipts: [receiptFor(drop, "2026-09-14"), receiptFor(current, DATE)] });
  assert.equal(receipt.removed, 1);
  assert.equal(fs.existsSync(drop), false);
  assert.equal(fs.existsSync(keep), true);
  assert.equal(fs.existsSync(uncollected), true);
  assert.equal(fs.existsSync(current), true);
  assert.equal(fs.existsSync(note), true);
  fs.chmodSync(auth, 0o644);
  assert.throws(() => retainDiscoveryLogs({ ...base, receipts: [receiptFor(uncollected, "2026-09-01")] }), /discovery_export_unauthenticated/);
  assert.equal(fs.existsSync(uncollected), true);
});

test("a large valid day continues from a cursor and stays inside the page caps", () => {
  const { dir } = workspace();
  prepareDiscoveryLogDir(dir);
  const one = JSON.parse(recordLine());
  one.discoveryRef = "a".repeat(400);
  const line = `${JSON.stringify(one)}\n`;
  assert.ok(Buffer.byteLength(line) <= MAX_LINE);
  const count = Math.ceil((MAX_BYTES + line.length) / line.length);
  assert.ok(count < MAX_LINES);
  assert.ok(Buffer.byteLength(line) * count < MAX_BYTES * 8);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), line.repeat(count), { mode: 0o600 });
  const first = exportDiscoveryLog({ dir, date: DATE });
  assert.equal(first.complete, false);
  assert.equal(typeof first.nextCursor, "string");
  assert.ok(first.lines.length > 0);
  assert.ok(first.lines.length <= MAX_LINES);
  assert.ok(Buffer.byteLength(first.lines.join("\n")) <= MAX_BYTES);
  const second = exportDiscoveryLog({ dir, date: DATE, cursor: first.nextCursor });
  assert.equal(second.complete, true);
  assert.equal(second.nextCursor, null);
  assert.equal(first.lines.length + second.lines.length, count);
  const joined = [...first.lines, ...second.lines].join("\n");
  assert.equal(joined.includes("tok_abcdefghijklmnop"), false);
  assert.equal(joined.includes(SECRET), false);
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, cursor: "not-a-cursor" }), /discovery_export_cursor_refused/);
});

test("a valid day over 8 MiB is paged, and a changed or shrunk file is refused", () => {
  const { dir } = workspace();
  prepareDiscoveryLogDir(dir);
  const one = JSON.parse(recordLine());
  one.discoveryRef = "c".repeat(400);
  const line = `${JSON.stringify(one)}\n`;
  assert.ok(Buffer.byteLength(line) <= MAX_LINE);
  const count = Math.floor((MAX_BYTES * 8) / Buffer.byteLength(line)) + 2;
  const file = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(file, line.repeat(count), { mode: 0o600 });
  assert.ok(fs.statSync(file).size > MAX_BYTES * 8);
  const seen = [];
  let cursor = null;
  let pages = 0;
  for (;;) {
    const page = exportDiscoveryLog({ dir, date: DATE, cursor });
    pages += 1;
    assert.ok(page.lines.length <= MAX_LINES);
    assert.ok(Buffer.byteLength(page.lines.join("\n")) <= MAX_BYTES);
    seen.push(...page.lines);
    if (page.complete) {
      assert.equal(page.nextCursor, null);
      assert.equal(page.bytes, fs.statSync(file).size);
      assert.equal(page.watermark, receiptFor(file, DATE).watermark);
      break;
    }
    assert.equal(typeof page.nextCursor, "string");
    assert.ok(page.offset > 0);
    cursor = page.nextCursor;
    assert.ok(pages < 32);
  }
  assert.ok(pages > 8);
  assert.equal(seen.length, count);
  const expected = line.slice(0, -1);
  assert.equal(seen.every(row => row === expected), true);

  const resumed = exportDiscoveryLog({ dir, date: DATE });
  const shifted = Buffer.from(line.repeat(count));
  shifted[resumed.offset - 8] ^= 0x01;
  fs.writeFileSync(file, shifted, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, cursor: resumed.nextCursor }), /discovery_export_cursor_refused/);
  fs.truncateSync(file, Math.max(0, resumed.offset - 1));
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, cursor: resumed.nextCursor }), /discovery_export_cursor_refused/);
  assert.equal(fs.existsSync(file), true);
});
