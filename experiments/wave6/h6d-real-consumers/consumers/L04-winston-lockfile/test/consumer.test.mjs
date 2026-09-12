import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runLockfilePinDelta, JOB_ID, KIT_CLI, ensureKit } from "../adapter.mjs";
import { witness } from "../witness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BEFORE = join(ROOT, "fixtures/official/before/package-lock.json");
const AFTER = join(ROOT, "fixtures/official/after/package-lock.json");
const YARN = join(ROOT, "fixtures/negative/yarn.lock");
const HTML = join(ROOT, "fixtures/negative/not-a-lockfile.html");
const PKG = join(ROOT, "fixtures/negative/package.json");
const EXCERPT = JSON.parse(readFileSync(join(ROOT, "fixtures/excerpts/async-pin.json"), "utf8"));

const ASYNC_BEFORE = {
  version: "3.2.5",
  integrity: "sha512-baNZyqaaLhyLVKm/DlvdW051MSgO6b8eVfIezl9E5PqWxFgzLm/wQntEW4zOytVburDEr0JlALEpdOFwvErLsg==",
  resolved: "https://registry.npmjs.org/async/-/async-3.2.5.tgz",
};
const ASYNC_AFTER = {
  version: "3.2.6",
  integrity: "sha512-htCUDlxyyCLMgaM3xXg0C0LW2xqfuQ6p05pCEIsXuyQ+a1koYKTuBMzRNwmybfLgvJDMd0r1LTn4+E0Ti6C2AA==",
  resolved: "https://registry.npmjs.org/async/-/async-3.2.6.tgz",
};

function tmpOut(prefix = "l04-winston-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

test("kit cold extract is useful-jobs 1.4.0 lockfile-pin-delta", () => {
  const kit = ensureKit();
  assert.equal(kit.cli, KIT_CLI);
  assert.match(kit.cli, /useful-jobs-1\.4\.0\/bin\/useful-jobs\.mjs$/);
});

test("positive: winston official pair proves async name+version+integrity+resolved change", () => {
  const outDir = tmpOut();
  try {
    const seen = witness(readText(BEFORE), readText(AFTER), ["async"]);
    assert.equal(seen.unknown.length, 0);
    assert.equal(seen.fact.refused, false);
    assert.equal(seen.fact.status, "actionable");
    assert.equal(seen.added.length, 0);
    assert.equal(seen.removed.length, 0);
    assert.equal(seen.changed.length, 1);
    const row = seen.changed[0];
    assert.equal(row.id, "node_modules/async");
    assert.equal(row.name, "async");
    assert.deepEqual(row.changeKinds, ["version", "integrity", "resolved"]);
    assert.equal(row.before.version, ASYNC_BEFORE.version);
    assert.equal(row.before.integrity, ASYNC_BEFORE.integrity);
    assert.equal(row.before.resolved, ASYNC_BEFORE.resolved);
    assert.equal(row.after.version, ASYNC_AFTER.version);
    assert.equal(row.after.integrity, ASYNC_AFTER.integrity);
    assert.equal(row.after.resolved, ASYNC_AFTER.resolved);
    assert.equal(seen.fact.asyncPin.changeKinds.join(","), "version,integrity,resolved");
    assert.equal(EXCERPT.before.pin.version, ASYNC_BEFORE.version);
    assert.equal(EXCERPT.after.pin.version, ASYNC_AFTER.version);

    const run = runLockfilePinDelta({ before: BEFORE, after: AFTER, outDir });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.appId, JOB_ID);
    assert.equal(run.stdoutJson?.status, "actionable");
    assert.equal(run.stdoutJson?.purchaseAuthority, false);
    assert.equal(run.stdoutJson?.counts?.changed, 1);
    assert.equal(run.stdoutJson?.counts?.added, 0);
    assert.equal(run.stdoutJson?.counts?.removed, 0);
    assert.equal(run.stdoutJson?.counts?.unchanged, seen.unchanged);

    const report = run.outputs.report;
    assert.ok(report, "pin-delta.json missing");
    assert.equal(report.status, "actionable");
    assert.equal(report.purchaseAuthority, false);
    assert.equal(report.changed.length, 1);
    assert.equal(report.changed[0].id, row.id);
    assert.equal(report.changed[0].name, "async");
    assert.deepEqual(report.changed[0].changeKinds, ["version", "integrity", "resolved"]);
    assert.equal(report.changed[0].before.version, row.before.version);
    assert.equal(report.changed[0].before.integrity, row.before.integrity);
    assert.equal(report.changed[0].before.resolved, row.before.resolved);
    assert.equal(report.changed[0].after.version, row.after.version);
    assert.equal(report.changed[0].after.integrity, row.after.integrity);
    assert.equal(report.changed[0].after.resolved, row.after.resolved);
    assert.match(run.outputs.markdown || "", /async/);
    assert.match(run.outputs.markdown || "", /3\.2\.5 -> 3\.2\.6/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("control: identical after/after is informational with zero pin field changes", () => {
  const outDir = tmpOut();
  try {
    const seen = witness(readText(AFTER), readText(AFTER), ["async"]);
    assert.equal(seen.unknown.length, 0);
    assert.equal(seen.fact.status, "informational");
    assert.equal(seen.changed.length, 0);
    assert.equal(seen.added.length, 0);
    assert.equal(seen.removed.length, 0);
    assert.ok(seen.unchanged > 0);
    assert.equal(seen.fact.asyncPin.changeKinds.length, 0);
    assert.equal(seen.fact.asyncPin.after.version, ASYNC_AFTER.version);

    const run = runLockfilePinDelta({ before: AFTER, after: AFTER, outDir });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.status, "informational");
    assert.equal(run.stdoutJson?.counts?.changed, 0);
    assert.equal(run.stdoutJson?.counts?.added, 0);
    assert.equal(run.stdoutJson?.counts?.removed, 0);
    assert.equal(run.stdoutJson?.counts?.unchanged, seen.unchanged);
    assert.equal(run.outputs.report?.changed.length, 0);
    assert.equal(run.stdoutJson?.purchaseAuthority, false);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: yarn.lock is refused (not npm lockfileVersion 2/3)", () => {
  const outDir = tmpOut();
  try {
    const seen = witness(readText(YARN), readText(AFTER));
    assert.equal(seen.fact.refused, true);
    assert.equal(seen.fact.code, "yarn-lockfile");
    assert.ok(seen.unknown.some((u) => /yarn\.lock/.test(u)));
    assert.equal(seen.changed.length, 0);

    const run = runLockfilePinDelta({ before: YARN, after: AFTER, outDir });
    assert.notEqual(run.status, 0);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.refused, true);
    assert.equal(run.stdoutJson?.purchaseAuthority, false);
    assert.equal(run.stdoutJson?.code, "parse-error");
    assert.match(String(run.stdoutJson?.error || ""), /not JSON|# yarn loc/i);
    assert.equal(run.outputs.report, null);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("negative: HTML and package.json-only refuse", () => {
  const htmlSeen = witness(readText(HTML), readText(AFTER));
  assert.equal(htmlSeen.fact.refused, true);
  assert.equal(htmlSeen.fact.code, "html-input");

  const pkgSeen = witness(readText(PKG), readText(AFTER));
  assert.equal(pkgSeen.fact.refused, true);
  assert.equal(pkgSeen.fact.code, "package-json-only");

  const htmlOut = tmpOut("l04-html-");
  const pkgOut = tmpOut("l04-pkg-");
  try {
    const htmlRun = runLockfilePinDelta({ before: HTML, after: AFTER, outDir: htmlOut });
    assert.notEqual(htmlRun.status, 0);
    assert.equal(htmlRun.stdoutJson?.code, "html-input");

    const pkgRun = runLockfilePinDelta({ before: PKG, after: AFTER, outDir: pkgOut });
    assert.notEqual(pkgRun.status, 0);
    assert.equal(pkgRun.stdoutJson?.code, "package-json-only");
  } finally {
    rmSync(htmlOut, { recursive: true, force: true });
    rmSync(pkgOut, { recursive: true, force: true });
  }
});

test("negative: missing --after is missing-required-inputs", () => {
  const run = runLockfilePinDelta({ before: BEFORE });
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "missing-required-inputs");
});
