import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { witness } from "../witness.mjs";
import {
  KIT_SHA256,
  OFFICIAL_AFTER,
  OFFICIAL_BEFORE,
  runLockfilePinDelta,
  runMissingInputs,
  verifyPublishedArchive,
} from "../adapter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function withOutDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "l03-glob-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function pinByName(list, name) {
  return (list || []).find((p) => p.name === name || p.id === `node_modules/${name}`);
}

const acquisition = readJson("acquisition.json");
const changedTable = readJson("fixtures/excerpt/changed-pins.json");

test("published kit bytes match useful-jobs 1.4.0 pin", () => {
  const v = verifyPublishedArchive();
  assert.equal(v.digest, KIT_SHA256);
  assert.equal(v.bytes, 2575215);
});

test("acquisition pins full SHAs, BlueOak license, and stored full-blob sha256", () => {
  assert.equal(acquisition.repo, "isaacs/node-glob");
  assert.equal(acquisition.path, "package-lock.json");
  assert.equal(acquisition.beforeSha, "aee5a632c5c29d82dd5be14b0344ad52209bcaba");
  assert.equal(acquisition.afterSha, "7df583d631ff191e2f71a62b383926c0bd83ccda");
  assert.equal(acquisition.license, "BlueOak-1.0.0");
  assert.notEqual(acquisition.license, "ISC");
  assert.match(read("fixtures/license/LICENSE.md"), /Blue Oak Model License/);
  assert.equal(readJson("fixtures/license/package.json").license, "BlueOak-1.0.0");
  assert.equal(sha256File(join(root, "fixtures/official/package-lock.before.json")), acquisition.sha256.before);
  assert.equal(sha256File(join(root, "fixtures/official/package-lock.after.json")), acquisition.sha256.after);
  assert.equal(sha256File(join(root, "fixtures/license/LICENSE.md")), acquisition.sha256.licenseMd);
  assert.equal(readFileSync(join(root, "fixtures/official/package-lock.before.json")).length, 204135);
  assert.equal(readFileSync(join(root, "fixtures/official/package-lock.after.json")).length, 204058);
});

test("positive: independent witness proves tap and uuid pin movement from lockfile bytes", () => {
  const before = read("fixtures/official/package-lock.before.json");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(before, after);
  assert.equal(w.fact.refused, false);
  assert.equal(w.fact.status, "actionable");
  assert.equal(w.fact.lockfileVersion.before, 3);
  assert.equal(w.fact.lockfileVersion.after, 3);
  assert.equal(w.fact.counts.added, 0);
  assert.equal(w.fact.counts.removed, 0);
  assert.equal(w.fact.counts.changed, 29);
  assert.equal(w.fact.counts.unchanged, 374);
  assert.equal(w.changed.length, 29);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.unchanged.length, 374);

  const uuid = pinByName(w.changed, "uuid");
  assert.ok(uuid, "uuid must appear in changed");
  assert.equal(uuid.before.version, "8.3.2");
  assert.equal(uuid.after.version, "14.0.0");
  assert.equal(
    uuid.before.integrity,
    "sha512-+NYs2QeMWy+GWFOEm9xnn6HCDp0l7QBD7ml8zLUmJ+93Q5NF0NocErnwkTkXVFNiX3/fpC6afS8Dhb/gz7R7eg==",
  );
  assert.equal(
    uuid.after.integrity,
    "sha512-Qo+uWgilfSmAhXCMav1uYFynlQO7fMFiMVZsQqZRMIXp0O7rR7qjkj+cPvBHLgBqi960QCoo/PH2/6ZtVqKvrg==",
  );
  assert.equal(uuid.before.resolved, "https://registry.npmjs.org/uuid/-/uuid-8.3.2.tgz");
  assert.equal(uuid.after.resolved, "https://registry.npmjs.org/uuid/-/uuid-14.0.0.tgz");
  assert.ok(uuid.changeKinds.includes("version"));
  assert.ok(uuid.changeKinds.includes("integrity"));
  assert.ok(uuid.changeKinds.includes("resolved"));

  const tap = pinByName(w.changed, "tap");
  assert.ok(tap, "tap must appear in changed");
  assert.equal(tap.before.version, "21.7.1");
  assert.equal(tap.after.version, "21.7.2");
  assert.equal(
    tap.before.integrity,
    "sha512-LvH6mQTJvSgGivaPh5lkxkj66FOYy26ofY3HAFjBLVJbBLSHnjFmamqgdwSd57bgZzSaZ/pGn9U7xS7fyS8FPw==",
  );
  assert.equal(
    tap.after.integrity,
    "sha512-i5dPkJcojXqrbo+liVpRGvhxN0/h+oweqxHmoztIJ5+E2//11mVUL6D0dU2ugriFUNdjdI7G9GR7nW6koEeYlA==",
  );

  const minimatch = w.unchanged.find((p) => p.name === "minimatch" || p.id === "node_modules/minimatch");
  assert.ok(minimatch, "minimatch is an unchanged control pin");
  assert.equal(minimatch.version, "10.2.5");
  assert.equal(changedTable.counts.changed, 29);
  assert.equal(changedTable.highlights.uuid.after.version, "14.0.0");
});

test("positive: cold CLI engine agrees with witness on official pair", () => {
  const before = read("fixtures/official/package-lock.before.json");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(before, after);
  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: OFFICIAL_BEFORE,
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.stdoutJson?.ok, true);
  assert.notEqual(run.stdoutJson?.purchaseAuthority, true);
  assert.equal(run.stdoutJson?.status, "actionable");
  assert.ok(run.report, "pin-delta.json must be published");
  assert.ok(run.outputs.md?.text, "pin-delta.md must be published");
  assert.match(run.outputs.md.text, /uuid/);
  assert.match(run.outputs.md.text, /8\.3\.2/);
  assert.match(run.outputs.md.text, /14\.0\.0/);

  const counts = run.report.counts;
  assert.equal(counts.added, w.fact.counts.added);
  assert.equal(counts.removed, w.fact.counts.removed);
  assert.equal(counts.changed, w.fact.counts.changed);
  assert.equal(counts.unchanged, w.fact.counts.unchanged);
  assert.equal(counts.changed, 29);

  const engineUuid = pinByName(run.report.changed, "uuid");
  const witnessUuid = pinByName(w.changed, "uuid");
  assert.equal(engineUuid.before.version, witnessUuid.before.version);
  assert.equal(engineUuid.after.version, witnessUuid.after.version);
  assert.equal(engineUuid.before.integrity, witnessUuid.before.integrity);
  assert.equal(engineUuid.after.integrity, witnessUuid.after.integrity);
  assert.equal(engineUuid.before.resolved, witnessUuid.before.resolved);
  assert.equal(engineUuid.after.resolved, witnessUuid.after.resolved);

  const engineTap = pinByName(run.report.changed, "tap");
  const witnessTap = pinByName(w.changed, "tap");
  assert.equal(engineTap.before.version, witnessTap.before.version);
  assert.equal(engineTap.after.version, witnessTap.after.version);
  assert.equal(engineTap.before.integrity, witnessTap.before.integrity);
  assert.equal(engineTap.after.integrity, witnessTap.after.integrity);
});

test("control: identical before/after is informational with zero pin movement", () => {
  const before = read("fixtures/official/package-lock.before.json");
  const w = witness(before, before);
  assert.equal(w.fact.status, "informational");
  assert.equal(w.changed.length, 0);
  assert.equal(w.added.length, 0);
  assert.equal(w.removed.length, 0);
  assert.equal(w.unchanged.length, 403);
  assert.equal(w.fact.uuid.before.version, w.fact.uuid.after.version);
  assert.equal(w.fact.tap.before.version, w.fact.tap.after.version);

  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: OFFICIAL_BEFORE,
      after: OFFICIAL_BEFORE,
      outDir,
    }),
  );
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(run.stdoutJson?.status, "informational");
  assert.equal(run.report.counts.changed, 0);
  assert.equal(run.report.counts.added, 0);
  assert.equal(run.report.counts.removed, 0);
  assert.equal(run.report.counts.unchanged, 403);
});

test("negative: yarn.lock refuses (not npm package-lock)", () => {
  const yarn = read("fixtures/negative/yarn.lock");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(yarn, after);
  assert.equal(w.fact.status, "refused");
  assert.equal(w.fact.code, "yarn-lockfile");
  assert.equal(w.changed.length, 0);

  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: join(root, "fixtures/negative/yarn.lock"),
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.refused, true);
  const blob = `${run.stdoutJson?.code || ""} ${run.stdoutJson?.error || ""} ${run.stdout} ${run.stderr}`;
  assert.match(blob, /parse-error|not JSON|html-input|yarn/i);
});

test("negative: HTML input refuses", () => {
  const html = read("fixtures/negative/not-a-lock.html");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(html, after);
  assert.equal(w.fact.status, "refused");
  assert.equal(w.fact.code, "html-input");

  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: join(root, "fixtures/negative/not-a-lock.html"),
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.code, "html-input");
});

test("negative: package.json-only refuses", () => {
  const pkg = read("fixtures/negative/package-json-only.json");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(pkg, after);
  assert.equal(w.fact.status, "refused");
  assert.equal(w.fact.code, "package-json-only");

  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: join(root, "fixtures/negative/package-json-only.json"),
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.code, "package-json-only");
});

test("negative: lockfileVersion 1 refuses", () => {
  const v1 = read("fixtures/negative/lockfileVersion-1.json");
  const after = read("fixtures/official/package-lock.after.json");
  const w = witness(v1, after);
  assert.equal(w.fact.status, "refused");
  assert.equal(w.fact.code, "unsupported-lockfile-version");

  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: join(root, "fixtures/negative/lockfileVersion-1.json"),
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.code, "unsupported-lockfile-version");
});

test("negative: missing required inputs refuse closed", () => {
  const run = runMissingInputs();
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.code, "missing-required-inputs");
});

test("negative: live URL is a local miss, never a fetch", () => {
  const run = withOutDir((outDir) =>
    runLockfilePinDelta({
      before: "https://example.test/held-lock.json",
      after: OFFICIAL_AFTER,
      outDir,
    }),
  );
  assert.notEqual(run.status, 0);
  assert.equal(run.stdoutJson?.ok, false);
  assert.equal(run.stdoutJson?.code, "missing-input-file");
  assert.notEqual(run.stdoutJson?.code, "ENOTFOUND");
});

test("independent witness does not import kit engine compare/oracle", () => {
  const src = read("witness.mjs");
  assert.equal(/useful-jobs-1\.4\.0\/engines\//.test(src), false);
  assert.equal(/engines\/lockfile-pin-delta\/lib\/compare/.test(src), false);
  assert.equal(/from ["'].*vendor\/useful-jobs/.test(src), false);
});

test("owned path and receiving owner are H6D-parent", () => {
  const owned = readJson("owned-paths.json");
  assert.equal(owned.ownedPath, "experiments/wave6/h6d-real-consumers/consumers/L03-glob-lockfile/");
  assert.equal(owned.receivingIntegrationOwner, "H6D-parent");
  assert.equal(owned.jobId, "lockfile-pin-delta");
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.migration.equivalent, false);
  assert.equal(owned.migration.applied, false);
});
