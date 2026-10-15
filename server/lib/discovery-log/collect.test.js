import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRecord, fileSink } from "./log.js";
import { continuity } from "./vendor/growth-619dd6ad/continuity.mjs";
import {
  JOURNEY_SECRET_PATH, MAX_FILE_BYTES, MAX_LINE, authorize, canonicalRequest, collectProof, dayFileName,
  exportDay, probePrivateDir, readAuthSecret, retainDays,
} from "./collect.js";

const SECRET = "c".repeat(32);
const JOURNEY = "j".repeat(32);
const DAY = "2026-10-15";
const TOKEN = "tok_abcdefghijklmnop";
const cli = path.join(import.meta.dirname, "collect.js");

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-collect-"));
  const parent = path.join(root, "private");
  const dir = path.join(parent, "discovery-log-v1");
  const outDir = path.join(root, "exports");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(outDir, { mode: 0o700 });
  fs.chmodSync(root, 0o700);
  fs.chmodSync(parent, 0o700);
  fs.chmodSync(dir, 0o700);
  fs.chmodSync(outDir, 0o700);
  const auth = path.join(root, "collect.auth");
  fs.writeFileSync(auth, `${SECRET}\n`, { mode: 0o600 });
  fs.chmodSync(auth, 0o600);
  return { root, parent, dir, outDir, auth, out: path.join(outDir, `discovery-${DAY}.ndjson`) };
}

function proof(action, fields) {
  return collectProof(SECRET, canonicalRequest({ action, ...fields }));
}

function record(extra = {}) {
  const { record: built } = buildRecord({
    method: "GET", path: "/llms.txt", query: { source: "https://github.com/MikeyPetrillo/Agent402/issues/1047" },
    headers: { "x-samedaydesk-journey": TOKEN, referer: "https://github.com/a/b/issues/1", "user-agent": "Claude-User/1.0" },
  }, { now: () => new Date(`${DAY}T10:00:00Z`), secret: "s".repeat(32), journeySecret: JOURNEY });
  return { ...built, ...extra };
}

function writeDaily(dir, lines, day = DAY) {
  const file = path.join(dir, `discovery-${day}.ndjson`);
  fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

test("vendored continuity.mjs is the accepted Growth blob", () => {
  const bytes = fs.readFileSync(new URL("./vendor/growth-619dd6ad/continuity.mjs", import.meta.url));
  const blob = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  assert.equal(blob, "c5db81472866409ad40a644ee1b43a8263dc5c6d");
});

test("export keeps allowlisted discovery fields and the consumer can join them", () => {
  const t = tree();
  fileSink(t.dir)(record());
  const before = fs.readdirSync(t.dir);
  const paid = path.join(t.root, "paid.ndjson");
  const digest = record().journeyDigest;
  fs.writeFileSync(paid, `${JSON.stringify({ stage: "capture", journeyDigest: digest, requesterId: "payer:eip155:8453:0x902dcf34e53695bdea2ffb354b1a2e58bd598256", quoteId: "q1", captureTx: "0xabc" })}\n`, { mode: 0o600 });
  const receipt = exportDay({
    dir: t.dir, day: DAY, out: t.out, secret: SECRET, consumePaid: paid,
    proof: proof("export", { day: DAY, dir: t.dir, out: t.out }),
  });
  assert.equal(receipt.exported, 1);
  assert.deepEqual(fs.readdirSync(t.dir), before);
  const exported = fs.readFileSync(t.out, "utf8");
  assert.equal(exported.includes(TOKEN), false);
  assert.equal(exported.includes(JOURNEY), false);
  assert.equal(exported.includes("Claude-User"), false);
  const row = JSON.parse(exported);
  assert.equal(row.schema, "samedaydesk.discovery-log.v1");
  assert.equal(row.discoveryRef, "https://github.com/MikeyPetrillo/Agent402/issues/1047");
  assert.match(row.journeyDigest, /^hmac-sha256:[0-9a-f]{64}$/);
  const joined = continuity([row], [{ stage: "capture", journeyDigest: row.journeyDigest, requesterId: "payer:eip155:8453:0x902dcf34e53695bdea2ffb354b1a2e58bd598256" }]);
  assert.equal(joined.rows[0].continuity, "joined");
  assert.equal(joined.rows[0].discoveryRef, row.discoveryRef);
  assert.equal(JSON.parse(fs.readFileSync(receipt.continuityOut, "utf8")).rows[0].continuity, "joined");
  assert.equal(fs.statSync(t.out).mode & 0o777, 0o600);
});

test("extra fields are stripped and a raw token is not exported", () => {
  const t = tree();
  writeDaily(t.dir, [{ ...record(), note: "kept-out" }]);
  exportDay({ dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: t.out }) });
  const text = fs.readFileSync(t.out, "utf8");
  assert.equal(text.includes("kept-out"), false);
  assert.equal(text.includes("rankingPosition"), false);
  const leak = path.join(t.outDir, "leak.ndjson");
  writeDaily(t.dir, [{ ...record(), smuggled: TOKEN }]);
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: leak, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: leak }),
  }), /DISCOVERY-LOG-TOKEN-LEAK/);
  assert.equal(fs.existsSync(leak), false);
  const planted = path.join(t.outDir, "planted.ndjson");
  writeDaily(t.dir, [{ ...record(), discoveryRef: TOKEN }]);
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: planted, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: planted }),
  }), /DISCOVERY-LOG-TOKEN-LEAK/);
  assert.equal(fs.existsSync(planted), false);
});

test("traversal is refused for day, symlink file, symlink directory, and in-directory output", () => {
  const t = tree();
  writeDaily(t.dir, [record()]);
  assert.throws(() => dayFileName("../etc/passwd"), /DISCOVERY-LOG-TRAVERSAL/);
  assert.throws(() => exportDay({
    dir: t.dir, day: "../etc/passwd", out: t.out, secret: SECRET, proof: proof("export", { day: "../etc/passwd", dir: t.dir, out: t.out }),
  }), /DISCOVERY-LOG-TRAVERSAL/);
  const linked = path.join(t.parent, "linked-log");
  fs.symlinkSync(t.dir, linked);
  assert.throws(() => exportDay({
    dir: linked, day: DAY, out: t.out, secret: SECRET, proof: proof("export", { day: DAY, dir: linked, out: t.out }),
  }), /DISCOVERY-LOG-TRAVERSAL/);
  fs.rmSync(path.join(t.dir, `discovery-${DAY}.ndjson`));
  fs.symlinkSync("/etc/passwd", path.join(t.dir, `discovery-${DAY}.ndjson`));
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: t.out }),
  }), /DISCOVERY-LOG-TRAVERSAL/);
  assert.equal(fs.existsSync(t.out), false);
  const inside = path.join(t.dir, "export.ndjson");
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: inside, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: inside }),
  }), /DISCOVERY-LOG-TRAVERSAL/);
});

test("oversize daily file is refused before its bytes are exported", () => {
  const t = tree();
  const file = path.join(t.dir, `discovery-${DAY}.ndjson`);
  fs.writeFileSync(file, Buffer.alloc(MAX_FILE_BYTES + 1, 0x61), { mode: 0o600 });
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: t.out }),
  }), /DISCOVERY-LOG-OVERSIZE/);
  assert.equal(fs.existsSync(t.out), false);
  fs.rmSync(file);
  writeDaily(t.dir, [record({ discoveryRef: "x".repeat(MAX_LINE) })]);
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: proof("export", { day: DAY, dir: t.dir, out: t.out }),
  }), /DISCOVERY-LOG-OVERSIZE/);
});

test("unauthenticated access writes nothing", () => {
  const t = tree();
  writeDaily(t.dir, [record()]);
  assert.throws(() => readAuthSecret(path.join(t.root, "missing.auth")), /DISCOVERY-LOG-UNAUTHENTICATED/);
  assert.throws(() => readAuthSecret(JOURNEY_SECRET_PATH), /DISCOVERY-LOG-AUTH-REFUSED/);
  fs.chmodSync(t.auth, 0o644);
  assert.throws(() => readAuthSecret(t.auth), /DISCOVERY-LOG-UNAUTHENTICATED/);
  fs.chmodSync(t.auth, 0o600);
  assert.throws(() => exportDay({
    dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: "0".repeat(64),
  }), /DISCOVERY-LOG-UNAUTHENTICATED/);
  assert.equal(fs.existsSync(t.out), false);
  const wrong = proof("export", { day: DAY, dir: t.dir, out: path.join(t.outDir, "other.ndjson") });
  assert.throws(() => exportDay({ dir: t.dir, day: DAY, out: t.out, secret: SECRET, proof: wrong }), /DISCOVERY-LOG-UNAUTHENTICATED/);
  const run = spawnSync(process.execPath, [cli, "export", "--dir", t.dir, "--day", DAY, "--out", t.out], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /DISCOVERY-LOG-UNAUTHENTICATED/);
  assert.equal(run.stdout.includes(SECRET), false);
  assert.equal(fs.existsSync(t.out), false);
});

test("retention deletes only daily files older than 30 days and does not rewrite the rest", () => {
  const t = tree();
  const kept = record();
  writeDaily(t.dir, [kept], "2026-09-15");
  writeDaily(t.dir, [record()], "2026-09-14");
  writeDaily(t.dir, [kept], DAY);
  fs.writeFileSync(path.join(t.dir, "notes.txt"), "leave-me", { mode: 0o600 });
  const before = fs.readFileSync(path.join(t.dir, "discovery-2026-09-15.ndjson"));
  const receipt = retainDays({
    dir: t.dir, today: DAY, secret: SECRET, proof: proof("retain", { day: DAY, dir: t.dir }),
  });
  assert.deepEqual(receipt.removed, ["2026-09-14"]);
  assert.equal(fs.existsSync(path.join(t.dir, "discovery-2026-09-14.ndjson")), false);
  assert.deepEqual(fs.readFileSync(path.join(t.dir, "discovery-2026-09-15.ndjson")), before);
  assert.equal(fs.readFileSync(path.join(t.dir, "notes.txt"), "utf8"), "leave-me");
  fs.symlinkSync("/etc/passwd", path.join(t.dir, "discovery-2000-01-01.ndjson"));
  assert.throws(() => retainDays({
    dir: t.dir, today: DAY, secret: SECRET, proof: proof("retain", { day: DAY, dir: t.dir }),
  }), /DISCOVERY-LOG-TRAVERSAL/);
  assert.equal(fs.existsSync(path.join(t.dir, "discovery-2026-09-15.ndjson")), true);
  assert.equal(fs.readFileSync(path.join(t.dir, "notes.txt"), "utf8"), "leave-me");
});

test("probe requires auth and proves a mode 0700 directory is writable", () => {
  const t = tree();
  assert.throws(() => probePrivateDir({
    parent: t.parent, dir: t.dir, secret: SECRET, proof: "00",
  }), /DISCOVERY-LOG-UNAUTHENTICATED/);
  const receipt = probePrivateDir({
    parent: t.parent, dir: t.dir, secret: SECRET, proof: proof("probe", { dir: t.dir, parent: t.parent }),
  });
  assert.equal(receipt.writable, true);
  assert.equal(receipt.persistent, true);
  assert.equal(fs.existsSync(path.join(t.parent, ".collection-writer-probe")), false);
  fs.chmodSync(t.dir, 0o755);
  assert.throws(() => probePrivateDir({
    parent: t.parent, dir: t.dir, secret: SECRET, proof: proof("probe", { dir: t.dir, parent: t.parent }),
  }), /DISCOVERY-LOG-DIR-MODE/);
});

test("proof command prints the hex proof and not the fake secret", () => {
  const t = tree();
  const run = spawnSync(process.execPath, [
    cli, "proof", "--auth-file", t.auth, "--action", "export", "--day", DAY, "--dir", t.dir, "--out", t.out,
  ], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.equal(run.stdout.trim(), proof("export", { day: DAY, dir: t.dir, out: t.out }));
  assert.equal(run.stdout.includes(SECRET), false);
  authorize(SECRET, run.stdout.trim(), canonicalRequest({ action: "export", day: DAY, dir: t.dir, out: t.out }));
});
