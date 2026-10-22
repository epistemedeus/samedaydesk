import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DATA_ROOT, PACK_ROOT } from "../lib/paths.mjs";
import { loadStore, validateStore, versionsIndex } from "../lib/store.mjs";
import { validateRecord } from "../lib/validate.mjs";
import { RFC3339_RE } from "../lib/schema.mjs";

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

test("impossible calendar timestamps are not accepted as RFC3339", () => {
  const store = loadStore(DATA_ROOT);
  const rec = structuredClone(store.records.find((item) => item.record.id === "gofrantic-charter-2026-08-08").record);
  rec.id = "gofrantic-charter-bad-date";
  rec.version.id = "gofrantic-charter-bad-date-v";
  rec.version.observedAt = "2026-13-40T25:61:61.000Z";
  assert.equal(RFC3339_RE.test(rec.version.observedAt), true);
  const result = validateRecord(rec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path === "version.observedAt"));
});

test("link-local metadata hosts are refused as private terms", () => {
  const store = loadStore(DATA_ROOT);
  const rec = structuredClone(store.records.find((item) => item.record.id === "gofrantic-charter-2026-08-08").record);
  rec.id = "gofrantic-charter-link-local";
  rec.version.id = "gofrantic-charter-link-local-v";
  rec.attribution.canonicalUrl = "https://169.254.169.254/latest/meta-data";
  rec.attribution.retrievedFrom = "https://169.254.169.254/latest/meta-data";
  const result = validateRecord(rec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.code === "private_terms_scrape"));
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
