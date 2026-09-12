import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runLockfilePinDelta } from "../adapter.mjs";
import { witness } from "../witness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const beforeLock = join(root, "fixtures/official/before.package-lock.json");
const afterLock = join(root, "fixtures/official/after.package-lock.json");
const yarnLock = join(root, "fixtures/negative/yarn.lock");
const packageJsonOnly = join(root, "fixtures/negative/package.json");
const expected = JSON.parse(readFileSync(join(root, "fixtures/excerpt/expected-delta.json"), "utf8"));

function tmpOut(name) {
  mkdirSync(join(root, "tmp"), { recursive: true });
  return mkdtempSync(join(root, "tmp", `${name}-`));
}

function idsOf(rows) {
  return rows.map((row) => row.id).sort();
}

function engineDelta(run) {
  const report = run.report || {};
  return {
    added: idsOf(report.added || []),
    removed: idsOf(report.removed || []),
    changed: idsOf(report.changed || []),
    counts: report.counts || run.stdoutJson?.counts || {},
    status: report.status || run.stdoutJson?.status,
  };
}

test("witness source does not import kit engines", () => {
  const src = readFileSync(join(root, "witness.mjs"), "utf8");
  assert.equal(/engines\/lockfile-pin-delta/.test(src), false);
  assert.equal(/from ["'].*compare\.mjs/.test(src), false);
  assert.equal(/hash-terms\.mjs/.test(src), false);
  assert.equal(/parse-lockfile\.mjs/.test(src), false);
});

test("positive: commander #2506 → #2518 pin delta is actionable", () => {
  const w = witness(beforeLock, afterLock);
  assert.equal(w.fact, "actionable");
  assert.equal(w.purchaseAuthority, false);
  assert.equal(w.counts.added, expected.counts.added);
  assert.equal(w.counts.removed, expected.counts.removed);
  assert.equal(w.counts.changed, expected.counts.changed);
  assert.equal(w.counts.unchanged, expected.counts.unchanged);
  assert.equal(w.counts.beforePins, 203);
  assert.equal(w.counts.afterPins, 204);
  assert.deepEqual(
    w.added.map((p) => `${p.name}@${p.version}`),
    ["@humanfs/types@0.15.0"],
  );
  const ts = w.changed.find((c) => c.id === "node_modules/typescript");
  assert.ok(ts, "typescript pin changed");
  assert.equal(ts.before.version, "6.0.2");
  assert.equal(ts.after.version, "6.0.3");
  assert.ok(ts.changeKinds.includes("version"));
  assert.ok(ts.changeKinds.includes("integrity"));
  assert.ok(ts.changeKinds.includes("resolved"));
  const eslint = w.changed.find((c) => c.id === "node_modules/eslint");
  assert.equal(eslint.before.version, "10.2.0");
  assert.equal(eslint.after.version, "10.4.0");
  const prettier = w.changed.find((c) => c.id === "node_modules/prettier");
  assert.equal(prettier.before.version, "3.8.2");
  assert.equal(prettier.after.version, "3.8.3");
  const helpers = w.changed.find((c) => c.id === "node_modules/@eslint/config-helpers");
  assert.equal(helpers.before.version, "0.5.5");
  assert.equal(helpers.after.version, "0.6.0");

  const outDir = tmpOut("positive");
  const run = runLockfilePinDelta({ before: beforeLock, after: afterLock, outDir });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.ok, true);
  assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
  assert.equal(run.stdoutJson?.status, "actionable");
  assert.ok(run.outputs.json);
  assert.ok(run.outputs.md);
  const eng = engineDelta(run);
  assert.equal(eng.status, "actionable");
  assert.equal(eng.counts.added, w.counts.added);
  assert.equal(eng.counts.removed, w.counts.removed);
  assert.equal(eng.counts.changed, w.counts.changed);
  assert.equal(eng.counts.unchanged, w.counts.unchanged);
  assert.deepEqual(eng.added, idsOf(w.added));
  assert.deepEqual(eng.removed, idsOf(w.removed));
  assert.deepEqual(eng.changed, idsOf(w.changed));
  const engTs = (run.report.changed || []).find((c) => c.id === "node_modules/typescript");
  assert.equal(engTs.after.version, "6.0.3");
  assert.match(run.markdown || "", /typescript/);
});

test("identical-control: after=before yields empty pin delta", () => {
  const w = witness(beforeLock, beforeLock);
  assert.equal(w.fact, "identical");
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.changed.length, 0);
  assert.equal(w.counts.unchanged, 203);
  assert.equal(w.counts.beforePins, w.counts.afterPins);

  const outDir = tmpOut("control");
  const run = runLockfilePinDelta({ before: beforeLock, after: beforeLock, outDir });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.ok, true);
  assert.equal(run.stdoutJson?.status, "informational");
  assert.equal(run.report?.counts?.added, 0);
  assert.equal(run.report?.counts?.removed, 0);
  assert.equal(run.report?.counts?.changed, 0);
  assert.equal(run.report?.counts?.unchanged, 203);
  assert.deepEqual(run.report?.added || [], []);
  assert.deepEqual(run.report?.changed || [], []);
});

test("negative: yarn.lock is refused", () => {
  const w = witness(yarnLock, afterLock);
  assert.equal(w.fact, "refused");
  assert.equal(w.refused, true);
  assert.equal(w.code, "yarn-lock");
  assert.equal(w.changed.length, 0);

  const outDir = tmpOut("yarn");
  const run = runLockfilePinDelta({ before: yarnLock, after: afterLock, outDir });
  assert.notEqual(run.status, 0);
  assert.equal(run.ok, false);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
  const blob = `${run.stdoutJson?.code || ""} ${run.stdoutJson?.error || ""} ${run.stdout} ${run.stderr}`;
  assert.match(blob, /parse-error|yarn|not JSON/i);
});

test("negative: package.json-only is refused", () => {
  const w = witness(beforeLock, packageJsonOnly);
  assert.equal(w.fact, "refused");
  assert.equal(w.code, "package-json-only");

  const outDir = tmpOut("pkgjson");
  const run = runLockfilePinDelta({ before: beforeLock, after: packageJsonOnly, outDir });
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  assert.equal(run.stdoutJson?.code, "package-json-only");
});

test("adapter does not claim purchase authority", () => {
  const outDir = tmpOut("auth");
  const run = runLockfilePinDelta({ before: beforeLock, after: afterLock, outDir });
  assert.equal(run.purchaseAuthority, false);
  assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
  assert.notEqual(run.report?.purchaseAuthority, true);
  assert.notEqual(run.report?.paidValueClaim, true);
});

test.after(() => {
  try {
    rmSync(join(root, "tmp"), { recursive: true, force: true });
  } catch {
    // leave tmp if busy
  }
});
