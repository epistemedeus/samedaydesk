import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv";
import { root, readJson, hashFile, run, parseOptions } from "../lib/runtime.mjs";
import { manifest, pairRoot, evaluateWitnesses, verifySources, validatorFor, regressionProjection } from "../lib/witness.mjs";
import { acquireRelease, defaultArchive, verifyArchive } from "../lib/acquire.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "cw10-test-"));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const cli = (...args) => run(process.execPath, [path.join(root, "bin/check.mjs"), ...args], { timeout: 120_000 });

test("all upstream bytes, examples and adjacent source commits are pinned", () => {
  verifySources();
  assert.equal(manifest.source.files.length, 11);
  assert.equal(manifest.source.afterCommit, "e69d6eca4e5f1505afacd0677c4303877caca0d6");
  assert.equal(manifest.source.beforeCommit, "237b6924bcbfd2d0d36e7233d36c2c6bc21fa2a2");
  assert.equal(manifest.source.historicalAfterCommit, "7dd7fa56498a827a08b71919fae89428f5e8e283");
});

test("mutated transitive resource is rejected, even with untouched roots", () => {
  const base = path.join(scratch, "mutated-source"); fs.cpSync(path.join(root, "fixtures"), path.join(base, "fixtures"), { recursive: true });
  fs.appendFileSync(path.join(base, "fixtures/upstream/organization-renamed/before/common/user.schema.json"), " ");
  assert.throws(() => verifySources(base), /user.schema.json bytes/);
});

test("each Draft7 reference resource compiles offline and all used formats exist", () => {
  const before = validatorFor("before"), after = validatorFor("after");
  assert.equal(before.closure.resources.length, 5);
  assert.equal(after.closure.resources.length, 4);
  assert(before.closure.resources.includes("common/membership.schema.json"));
  assert(!after.closure.resources.includes("common/membership.schema.json"));
  assert.deepEqual(before.closure.formats, ["uri", "uri-template"]);
  assert.deepEqual(after.closure.formats, before.closure.formats);
});

test("complete independently validated request bodies isolate the two schema changes", () => {
  const { witness } = evaluateWitnesses();
  assert.deepEqual([witness["saved-membership.json"].beforeValid, witness["saved-membership.json"].afterValid], [true, false]);
  assert.deepEqual(witness["saved-membership.json"].afterErrors.map((e) => e.keyword).sort(), ["additionalProperties", "required"]);
  assert.deepEqual([witness["migrated-changes.json"].beforeValid, witness["migrated-changes.json"].afterValid], [false, true]);
});

test("neither partial migration works; invalid format/value/optional reference controls fail", () => {
  const { witness } = evaluateWitnesses();
  assert.equal(witness["add-changes-only"].afterErrors[0].params.additionalProperty, "membership");
  assert.equal(witness["remove-membership-only"].afterErrors[0].params.missingProperty, "changes");
  assert(witness["invalid-uri-control"].afterErrors.some((e) => e.keyword === "format"));
  assert(witness["invalid-changes-from-control"].afterErrors.some((e) => e.instancePath === "/changes/login/from" && e.keyword === "type"));
  assert(witness["invalid-optional-installation-control"].afterErrors.some((e) => e.instancePath.startsWith("/installation")));
});

test("small regression is derived from the real root and preserves both witness directions", () => {
  const ajv = new Ajv();
  for (const side of ["before", "after"]) {
    const expected = regressionProjection(readJson(path.join(pairRoot, side, "schema.json")));
    assert.deepEqual(readJson(path.join(root, "fixtures/regression", `${side}.json`)), expected);
    const validate = ajv.compile(expected);
    assert.equal(validate(readJson(path.join(root, "fixtures/payloads/saved-membership.json"))), side === "before");
    assert.equal(validate(readJson(path.join(root, "fixtures/payloads/migrated-changes.json"))), side === "after");
  }
});

test("removed required membership alone weakens; forbidding its property causes rejection", () => {
  const before = regressionProjection(readJson(path.join(pairRoot, "before/schema.json")));
  const saved = readJson(path.join(root, "fixtures/payloads/saved-membership.json"));
  const relaxed = structuredClone(before); relaxed.required = relaxed.required.filter((key) => key !== "membership");
  const ajv = new Ajv();
  assert.equal(ajv.compile(relaxed)(saved), true);
  const removed = structuredClone(relaxed); delete removed.properties.membership;
  const closed = ajv.compile(removed);
  assert.equal(closed(saved), false);
  assert.equal(closed.errors[0].keyword, "additionalProperties");
});

test("archive acquisition rejects altered bytes before extraction", async () => {
  const archive = process.env.USEFUL_JOBS_ARCHIVE || defaultArchive;
  const bytes = fs.readFileSync(archive); verifyArchive(bytes);
  const corrupt = Buffer.from(bytes); corrupt[50] ^= 1;
  assert.throws(() => verifyArchive(corrupt), /SHA-256/);
  const file = path.join(scratch, "corrupt.tar.gz"); fs.writeFileSync(file, corrupt);
  const out = path.join(scratch, "must-not-extract");
  await assert.rejects(acquireRelease(out, file), /SHA-256/);
  assert.equal(fs.existsSync(out), false);
});

test("CLI handles equals and separated options, rejects ambiguity and missing values", () => {
  assert.deepEqual(parseOptions(["--mode=audit", "--out-dir", "/tmp/out"], ["mode", "out-dir"]), { mode: "audit", "out-dir": "/tmp/out" });
  for (const args of [["--mode"], ["--mode="], ["--mode", "--out-dir=x"], ["--mode=audit", "--mode=gate"], ["--archive-root=/unverified"]]) {
    assert.equal(cli(...args).status, 2, args.join(" "));
  }
});

test("offline audit proves released CLI receives schemas and reproduces the false negative", () => {
  const out = path.join(scratch, "audit");
  const result = cli("--mode", "audit", `--out-dir=${out}`);
  assert.equal(result.status, 0, result.stderr);
  const report = readJson(path.join(out, "report.json"));
  assert.equal(report.release.keywordPointers.kind, "json-schema");
  assert.equal(report.release.keywordPointers.inputs.before, `sha256:${hashFile(path.join(pairRoot, "before/schema.json"))}`);
  assert.equal(report.release.keywordPointers.inputs.after, `sha256:${hashFile(path.join(pairRoot, "after/schema.json"))}`);
  assert.equal(report.release.keywordPointers.status, "informational");
  assert.equal(report.release.keywordPointers.impact.unchangedCount, 2);
  assert.equal(report.release.rawRoot.refusal.code, "remote-ref-refused");
  assert.equal(report.release.rootProjection.impact.breaking.length, 1);
  assert.equal(report.release.projectionKeywordPointers.impact.unchangedCount, 2);
  assert.equal(report.acceptance.compatible, false);
  assert.match(report.acceptance.evidenceClass, /not independent production/);
});

test("default compatibility gate exits 1 for a valid-before rejected-after body", () => {
  const out = path.join(scratch, "gate"); const result = cli(`--out-dir=${out}`);
  assert.equal(result.status, 1, result.stderr);
  const report = readJson(path.join(out, "report.json"));
  assert.equal(report.acceptance.auditPassed, true);
  assert.equal(report.acceptance.gateExit, 1);
});

test("existing output and an unpinned candidate are refused without changing inputs", () => {
  const out = path.join(scratch, "occupied"); fs.mkdirSync(out); fs.writeFileSync(path.join(out, "keep"), "other writer");
  assert.equal(cli("--out-dir", out).status, 2);
  assert.equal(fs.readFileSync(path.join(out, "keep"), "utf8"), "other writer");
  assert.equal(cli("--candidate-repo", scratch).status, 2);
  assert.equal(cli("--candidate-head", "main", "--out-dir", path.join(scratch, "bad-head")).status, 2);
});
