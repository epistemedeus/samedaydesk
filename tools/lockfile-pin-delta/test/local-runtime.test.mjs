import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { compareLockfileTexts, parseLockfileText, ROOT, runLockfileDelta } from "../lib/index.mjs";

const sdsLock = path.resolve(ROOT, "../../package-lock.json");

test("local-runtime: SDS package-lock.json is lockfileVersion 3 with packages map", () => {
  assert.equal(fs.existsSync(sdsLock), true, "expected SDS package-lock.json at repo root");
  const text = fs.readFileSync(sdsLock, "utf8");
  const parsed = parseLockfileText(text, { label: "sds-package-lock" });
  assert.equal(parsed.lockfileVersion, 3);
  assert.equal(parsed.mapSource, "packages");
  assert.ok(parsed.pins.length > 10, `expected real pin count, got ${parsed.pins.length}`);
  const zod = parsed.pins.find((p) => p.id === "node_modules/zod");
  assert.ok(zod, "zod pin present in SDS lock");
  assert.equal(zod.version, "3.25.76");
  assert.match(zod.integrity, /^sha512-/);
  const link = parsed.pins.find((p) => p.id === "node_modules/@neomorphic/correspondence");
  assert.equal(link?.link, true, "workspace link resolution is an explicit pin boundary");
  assert.equal(link?.resolved, "vendor/neomorphic-correspondence");
  assert.equal(link?.missingIntegrity, false, "integrity is not applicable to a link stub");
});

test("local-runtime: self-compare of SDS lock omits unchanged names and stays nonsettling", () => {
  const text = fs.readFileSync(sdsLock, "utf8");
  const report = compareLockfileTexts(text, text);
  assert.equal(report.ok, true);
  assert.equal(report.counts.added, 0);
  assert.equal(report.counts.removed, 0);
  assert.equal(report.counts.changed, 0);
  assert.equal(report.purchaseAuthority, false);
  assert.equal(report.settlement, "nonsettling-prototype");
  assert.ok(report.counts.unchanged > 10);
  if (report.counts.missingIntegrity > 0) assert.equal(report.status, "partial");
});

test("local-runtime: bumping zod version+integrity lists only that pin", () => {
  const original = JSON.parse(fs.readFileSync(sdsLock, "utf8"));
  const after = structuredClone(original);
  const zod = after.packages["node_modules/zod"];
  assert.ok(zod?.integrity);
  const oldVersion = zod.version;
  const oldIntegrity = zod.integrity;
  zod.version = "3.25.77";
  zod.integrity = "sha512-local-runtime-zod-integrity-change-not-from-registryAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const report = compareLockfileTexts(JSON.stringify(original), JSON.stringify(after));
  assert.equal(report.counts.changed, 1);
  assert.equal(report.changed[0].name, "zod");
  assert.equal(report.changed[0].before.version, oldVersion);
  assert.equal(report.changed[0].after.version, "3.25.77");
  assert.equal(report.changed[0].before.integrity, oldIntegrity);
  assert.ok(report.changed[0].changeKinds.includes("integrity"));
  const blob = JSON.stringify({ added: report.added, removed: report.removed, changed: report.changed });
  assert.equal(blob.includes("express"), false);
  assert.equal(blob.includes("stripe"), false);
});

test("local HTTP: parser accepts lockfile bytes served by a loopback server (test-only)", async () => {
  const text = fs.readFileSync(sdsLock);
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(text);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/package-lock.json`);
    assert.equal(res.ok, true);
    const body = await res.text();
    const parsed = parseLockfileText(body, { label: "local-http-sds-lock" });
    assert.equal(parsed.lockfileVersion, 3);
    assert.ok(parsed.pins.some((p) => p.name === "zod"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("CLI against SDS lock vs in-memory clone writes fixture-distinct provenance local-runtime", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-pin-delta-sds-"));
  const afterPath = path.join(dir, "package-lock.after.json");
  const after = JSON.parse(fs.readFileSync(sdsLock, "utf8"));
  after.packages["node_modules/zod"].integrity =
    "sha512-cli-local-runtime-onlyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  fs.writeFileSync(afterPath, `${JSON.stringify(after)}\n`);
  const art = runLockfileDelta({
    before: sdsLock,
    after: afterPath,
    "out-dir": dir,
  });
  assert.equal(art.provenance, "local-runtime");
  assert.equal(art.changed[0].name, "zod");
  assert.deepEqual(art.changed[0].changeKinds, ["integrity"]);
});

test("CLI: SDS zod resolved-only change is detected with version and integrity unchanged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-pin-delta-sds-resolved-"));
  const afterPath = path.join(dir, "package-lock.json");
  const after = JSON.parse(fs.readFileSync(sdsLock, "utf8"));
  const zod = after.packages["node_modules/zod"];
  assert.ok(zod?.resolved);
  const oldResolved = zod.resolved;
  const oldVersion = zod.version;
  const oldIntegrity = zod.integrity;
  zod.resolved = String(oldResolved).replace("zod-3.25.76.tgz", "zod-3.25.76-rehosted.tgz");
  assert.notEqual(zod.resolved, oldResolved);
  fs.writeFileSync(afterPath, `${JSON.stringify(after)}\n`);
  const bin = path.join(ROOT, "bin/lockfile-delta.mjs");
  const r = spawnSync(process.execPath, [bin, "--before", sdsLock, "--after", afterPath, "--out-dir", dir], {
    encoding: "utf8",
    cwd: dir,
    timeout: 30_000,
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const brief = JSON.parse(r.stdout.trim());
  const art = JSON.parse(fs.readFileSync(path.join(dir, "pin-delta.json"), "utf8"));
  assert.equal(brief.ok, true);
  assert.equal(art.counts.changed, 1);
  assert.equal(art.changed[0].name, "zod");
  assert.equal(art.changed[0].before.version, oldVersion);
  assert.equal(art.changed[0].after.version, oldVersion);
  assert.equal(art.changed[0].before.integrity, oldIntegrity);
  assert.equal(art.changed[0].after.integrity, oldIntegrity);
  assert.equal(art.changed[0].before.resolved, oldResolved);
  assert.equal(art.changed[0].after.resolved, zod.resolved);
  assert.deepEqual(art.changed[0].changeKinds, ["resolved"]);
  const fileSha = createHash("sha256").update(fs.readFileSync(path.join(dir, "pin-delta.json"))).digest("hex");
  assert.equal(brief.digest, fileSha);
  const blob = JSON.stringify({ added: art.added, removed: art.removed, changed: art.changed });
  assert.equal(blob.includes("express"), false);
});

test("local HTTP: git-resolved after lock bytes compare to before file", async () => {
  const beforeText = fs.readFileSync(path.join(ROOT, "fixtures/git-resolved/before.json"), "utf8");
  const afterBytes = fs.readFileSync(path.join(ROOT, "fixtures/git-resolved/after.json"));
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(afterBytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/package-lock.json`);
    assert.equal(res.ok, true);
    const afterText = await res.text();
    const report = compareLockfileTexts(beforeText, afterText);
    assert.equal(report.counts.changed, 1);
    assert.equal(report.changed[0].name, "fixture-git");
    assert.deepEqual(report.changed[0].changeKinds, ["resolved"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
