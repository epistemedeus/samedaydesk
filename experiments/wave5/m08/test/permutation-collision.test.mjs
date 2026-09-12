import assert from "node:assert/strict";
import test from "node:test";
import { fixture, parseStdout, runConsumer, tmpOut } from "./helpers.mjs";

test("permutation of the same routes is semantic no-change; digest inequality is not forced equal", () => {
  const result = runConsumer([
    "--before",
    fixture("supported", "routes-before.json"),
    "--after",
    fixture("supported", "routes-permuted.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.analysis, "no-change");
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.counts.changed, 0);
  assert.notEqual(body.tableDigest.before, body.tableDigest.after);
  assert.equal(body.digestOrderSensitive, true);
});

test("duplicate path is a valid engine refusal, not an unsupported format", () => {
  const result = runConsumer([
    "--before",
    fixture("supported", "routes-duplicate.json"),
    "--after",
    fixture("supported", "routes-before.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.analysis, "refused");
  assert.equal(body.code, "duplicate_path");
  assert.equal(body.format.before, "routes-wrapper");
});

test("removing a route is a meaningful change", () => {
  const body = parseStdout(
    runConsumer([
      "--before",
      fixture("supported", "routes-before.json"),
      "--after",
      fixture("supported", "routes-removed.json"),
      "--out-dir",
      tmpOut(),
    ]),
  );
  assert.equal(body.ok, true);
  assert.equal(body.analysis, "change");
  assert.equal(body.counts.removed, 1);
  assert.deepEqual(body.removed, ["/for-agents/useful-jobs"]);
});

test("integer termsVersion is a valid Co12 refusal, not a hash-equality patch", () => {
  const result = runConsumer([
    "--before",
    fixture("supported", "integer-terms.json"),
    "--after",
    fixture("supported", "routes-before.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.analysis, "refused");
  assert.equal(body.code, "integer_terms_version_refused");
  assert.equal(body.format.before, "routes-wrapper");
});

test("relative canonical is a valid Co12 refusal, not an engine crash", () => {
  const result = runConsumer([
    "--before",
    fixture("supported", "relative-canonical.json"),
    "--after",
    fixture("supported", "routes-before.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.analysis, "refused");
  assert.equal(body.code, "invalid_canonical");
});
