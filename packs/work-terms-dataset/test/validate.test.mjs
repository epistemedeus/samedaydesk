import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DATA_ROOT, PACK_ROOT } from "../lib/paths.mjs";
import { loadStore, validateStore, versionsIndex } from "../lib/store.mjs";
import { validateRecord } from "../lib/validate.mjs";

test("committed store validates", () => {
  const store = loadStore(DATA_ROOT);
  const result = validateStore(store);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(store.records.length, 8);
});

test("every record has explicit version, republication rights, and attribution", () => {
  const store = loadStore(DATA_ROOT);
  for (const item of store.records) {
    const record = item.record;
    const result = validateRecord(record);
    assert.equal(result.ok, true, `${item.file}: ${JSON.stringify(result.errors)}`);
    assert.equal(typeof record.version.id, "string");
    assert.equal(typeof record.version.label, "string");
    assert.match(record.version.observedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof record.republication.right, "string");
    assert.equal(typeof record.republication.statement, "string");
    assert.equal(record.republication.mayStoreFullBody, false);
    assert.equal(record.republication.mayCommerciallyResell, false);
    assert.equal(record.republication.mustAttribute, true);
    assert.equal(typeof record.attribution.publisher, "string");
    assert.match(record.attribution.canonicalUrl, /^https:\/\//);
    assert.equal(record.coverage.universal, false);
  }
});

test("versions index lists every record and never claims universal coverage", () => {
  const store = loadStore(DATA_ROOT);
  const index = versionsIndex(store);
  assert.equal(index.universalCoverage, false);
  const ids = index.documents.flatMap((doc) => doc.versions.map((row) => row.recordId)).sort();
  assert.deepEqual(ids, store.records.map((item) => item.record.id).sort());
  const committed = JSON.parse(readFileSync(join(DATA_ROOT, "versions.json"), "utf8"));
  assert.deepEqual(committed, index);
});

test("cli validate exits 0 on the committed dataset", () => {
  const proc = spawnSync(process.execPath, [join(PACK_ROOT, "bin/work-terms.mjs"), "validate"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.records, 8);
});
