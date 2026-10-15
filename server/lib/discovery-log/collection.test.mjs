import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildRecord } from "./log.js";
import { prepareDiscoveryLogDir } from "./prepare-host.mjs";
import { exportDiscoveryLog } from "./export-log.mjs";
import { retainDiscoveryLogs } from "./retain.mjs";
import { MAX_BYTES, MAX_LINES } from "./bounds.mjs";

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
  const { dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  const line = recordLine();
  assert.equal(line.includes("tok_abcdefghijklmnop"), false);
  assert.match(line, /hmac-sha256:[0-9a-f]{64}/);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), `${line}\n`, { mode: 0o600 });
  const out = exportDiscoveryLog({ dir, date: DATE, authFile: auth });
  assert.match(out, /"journeyDigest":"hmac-sha256:[0-9a-f]{64}"/);
  assert.equal(out.includes("tok_abcdefghijklmnop"), false);
  assert.equal(out.includes("x-samedaydesk-journey"), false);
  assert.equal(out.includes(SECRET), false);
});

test("export refuses traversal, a missing date, an oversize file, and an unbounded line count", () => {
  const { root, dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  const outside = path.join(root, "outside.ndjson");
  fs.writeFileSync(outside, `${recordLine()}\n`);
  fs.symlinkSync(outside, path.join(dir, `discovery-${DATE}.ndjson`));
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_traversal/);
  fs.unlinkSync(path.join(dir, `discovery-${DATE}.ndjson`));
  assert.throws(() => exportDiscoveryLog({ dir, date: "../etc/passwd", authFile: auth }), /discovery_export_traversal/);
  assert.throws(() => exportDiscoveryLog({ dir, date: "", authFile: auth }), /discovery_export_unbounded/);
  assert.throws(() => exportDiscoveryLog({ dir: `${dir}/../discovery-log-v1`, date: DATE, authFile: auth }), /discovery_export_traversal/);
  const huge = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(huge, Buffer.alloc(MAX_BYTES + 1, 10), { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_unbounded/);
  const lines = `${"{\"schema\":\"samedaydesk.discovery-log.v1\"}\n".repeat(MAX_LINES + 1)}`;
  assert.ok(Buffer.byteLength(lines) < MAX_BYTES);
  fs.writeFileSync(huge, lines, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_unbounded/);
});

test("export refuses unauthenticated access and does not print the enrolled bytes", () => {
  const { root, dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), `${recordLine()}\n`, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: path.join(root, "missing.key") }), /discovery_export_unauthenticated/);
  fs.chmodSync(auth, 0o644);
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_unauthenticated/);
  fs.chmodSync(auth, 0o600);
  fs.writeFileSync(auth, "j".repeat(31), { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_unauthenticated/);
  const link = path.join(root, "linked.key");
  fs.writeFileSync(auth, SECRET, { mode: 0o600 });
  fs.symlinkSync(auth, link);
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: link }), /discovery_export_unauthenticated/);
});

test("export refuses a raw token and does not emit it", () => {
  const { dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  const token = "tok_abcdefghijklmnop";
  const planted = JSON.parse(recordLine());
  planted["x-samedaydesk-journey"] = token;
  const file = path.join(dir, `discovery-${DATE}.ndjson`);
  fs.writeFileSync(file, `${JSON.stringify(planted)}\n`, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_token_refused/);
  planted.journeyDigest = token;
  delete planted["x-samedaydesk-journey"];
  fs.writeFileSync(file, `${JSON.stringify(planted)}\n`, { mode: 0o600 });
  assert.throws(() => exportDiscoveryLog({ dir, date: DATE, authFile: auth }), /discovery_export_token_refused/);
});

test("retain removes only daily files older than the explicit period", () => {
  const { dir, auth } = workspace();
  prepareDiscoveryLogDir(dir);
  const keep = path.join(dir, "discovery-2026-09-15.ndjson");
  const drop = path.join(dir, "discovery-2026-09-14.ndjson");
  const note = path.join(dir, "notes.txt");
  fs.writeFileSync(keep, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(drop, `${recordLine()}\n`, { mode: 0o600 });
  fs.writeFileSync(note, "leave\n", { mode: 0o600 });
  const receipt = retainDiscoveryLogs({ dir, retainDays: 30, asOf: DATE, authFile: auth });
  assert.equal(receipt.removed, 1);
  assert.equal(fs.existsSync(keep), true);
  assert.equal(fs.existsSync(drop), false);
  assert.equal(fs.existsSync(note), true);
  fs.chmodSync(auth, 0o644);
  fs.writeFileSync(path.join(dir, "discovery-2026-09-01.ndjson"), `${recordLine()}\n`, { mode: 0o600 });
  assert.throws(() => retainDiscoveryLogs({ dir, retainDays: 30, asOf: DATE, authFile: auth }), /discovery_export_unauthenticated/);
  assert.equal(fs.existsSync(path.join(dir, "discovery-2026-09-01.ndjson")), true);
});

test("the command line refuses a missing auth file and prints no record", () => {
  const { dir } = workspace();
  prepareDiscoveryLogDir(dir);
  fs.writeFileSync(path.join(dir, `discovery-${DATE}.ndjson`), `${recordLine()}\n`, { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    path.join(import.meta.dirname, "export-log.mjs"),
    "--dir", dir,
    "--date", DATE,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /discovery_export_unauthenticated/);
  assert.equal(result.stderr.includes(SECRET), false);
});
