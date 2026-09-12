import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runLockfilePinDelta } from "../adapter.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const officialBefore = join(root, "fixtures/official/package-lock.before.json");
const officialAfter = join(root, "fixtures/official/package-lock.after.json");
const yarnLock = join(root, "fixtures/negative/yarn.lock");
const packageJsonOnly = join(root, "fixtures/negative/package.json");
const htmlNeg = join(root, "fixtures/negative/not-a-lock.html");

function read(path) {
  return readFileSync(path, "utf8");
}

function tmpOut(label) {
  return mkdtempSync(join(root, `tmp-${label}-`));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test("positive: official yargs lockfiles — registry pins unchanged across 18.0.0→18.1.0", () => {
  const beforeText = read(officialBefore);
  const afterText = read(officialAfter);
  assert.notEqual(beforeText, afterText, "official blobs must differ");
  const w = witness(beforeText, afterText);
  assert.equal(w.ok, true);
  assert.equal(w.refused, false);
  assert.equal(w.status, "informational");
  assert.equal(w.root.before.version, "18.0.0");
  assert.equal(w.root.after.version, "18.1.0");
  assert.equal(w.root.treatedAsRegistryPin, false);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.changed.length, 0);
  assert.equal(w.unchanged.length, 562);
  assert.equal(w.unknown.length, 0);
  assert.ok(w.unchanged.includes("node_modules/cliui"));
  assert.ok(w.unchanged.includes("node_modules/yargs-parser"));
  assert.match(w.fact, /18\.0\.0 → yargs@18\.1\.0/);

  const outDir = tmpOut("pos");
  try {
    const run = runLockfilePinDelta({
      before: officialBefore,
      after: officialAfter,
      outDir,
    });
    assert.equal(run.timedOut, false, run.error || run.stderr);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.appId, "lockfile-pin-delta");
    assert.equal(run.stdoutJson?.status, "informational");
    assert.equal(run.stdoutJson?.purchaseAuthority, false);
    assert.equal(run.stdoutJson?.counts?.added, 0);
    assert.equal(run.stdoutJson?.counts?.removed, 0);
    assert.equal(run.stdoutJson?.counts?.changed, 0);
    assert.equal(run.stdoutJson?.counts?.unchanged, 562);
    const report = run.files["pin-delta.json"];
    assert.equal(report?.schema, "samedaydesk.lockfile-pin-delta.v1");
    assert.equal(report.counts.added, w.added.length);
    assert.equal(report.counts.removed, w.removed.length);
    assert.equal(report.counts.changed, w.changed.length);
    assert.equal(report.counts.unchanged, w.unchanged.length);
    assert.equal(report.lockfileVersion.before, 3);
    assert.equal(report.lockfileVersion.after, 3);
    assert.match(String(run.files["pin-delta.md"] || ""), /Status: \*\*informational\*\*/);
    assert.equal(run.stdoutJson.counts.unchanged, w.counts.unchanged);
  } finally {
    cleanup(outDir);
  }
});

test("identical-control: before === after yields zero pin delta", () => {
  const beforeText = read(officialBefore);
  const w = witness(beforeText, beforeText);
  assert.equal(w.ok, true);
  assert.equal(w.status, "informational");
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.changed.length, 0);
  assert.equal(w.unchanged.length, 562);
  assert.equal(w.root.changed, false);
  assert.equal(w.root.before.version, "18.0.0");
  assert.equal(w.root.after.version, "18.0.0");

  const outDir = tmpOut("ctl");
  try {
    const run = runLockfilePinDelta({
      before: officialBefore,
      after: officialBefore,
      outDir,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdoutJson?.ok, true);
    assert.equal(run.stdoutJson?.status, "informational");
    assert.equal(run.stdoutJson?.counts?.added, 0);
    assert.equal(run.stdoutJson?.counts?.removed, 0);
    assert.equal(run.stdoutJson?.counts?.changed, 0);
    assert.equal(run.stdoutJson?.counts?.unchanged, w.unchanged.length);
  } finally {
    cleanup(outDir);
  }
});

test("negative: yarn.lock wrong format refuses", () => {
  const w = witness(read(yarnLock), read(officialAfter));
  assert.equal(w.ok, false);
  assert.equal(w.refused, true);
  assert.equal(w.code, "yarn-lockfile");
  assert.equal(w.changed.length, 0);

  const outDir = tmpOut("neg-yarn");
  try {
    const run = runLockfilePinDelta({
      before: yarnLock,
      after: officialAfter,
      outDir,
    });
    assert.equal(run.status, 2, run.stdout || run.stderr);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.refused, true);
    assert.ok(run.stdoutJson?.code, "expected refuse code");
    assert.notEqual(run.stdoutJson?.code, undefined);
    assert.equal(run.files["pin-delta.json"], null);
  } finally {
    cleanup(outDir);
  }
});

test("negative: package.json-only refuses", () => {
  const w = witness(read(packageJsonOnly), read(officialAfter));
  assert.equal(w.ok, false);
  assert.equal(w.code, "package-json-only");

  const outDir = tmpOut("neg-pkg");
  try {
    const run = runLockfilePinDelta({
      before: packageJsonOnly,
      after: officialAfter,
      outDir,
    });
    assert.equal(run.status, 2, run.stdout || run.stderr);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.refused, true);
    assert.equal(run.stdoutJson?.code, "package-json-only");
  } finally {
    cleanup(outDir);
  }
});

test("negative: HTML is not a lockfile", () => {
  const w = witness(read(htmlNeg), read(officialAfter));
  assert.equal(w.ok, false);
  assert.equal(w.code, "html-input");

  const outDir = tmpOut("neg-html");
  try {
    const run = runLockfilePinDelta({
      before: htmlNeg,
      after: officialAfter,
      outDir,
    });
    assert.equal(run.status, 2, run.stdout || run.stderr);
    assert.equal(run.stdoutJson?.ok, false);
    assert.equal(run.stdoutJson?.code, "html-input");
  } finally {
    cleanup(outDir);
  }
});

test("witness does not import kit compare engines", () => {
  const src = read(join(root, "witness.mjs"));
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/lockfile-pin-delta\/lib\/compare/.test(src), false);
  assert.equal(/from ["'].*engines\//.test(src), false);
});
