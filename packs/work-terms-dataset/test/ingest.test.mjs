import assert from "node:assert/strict";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DATA_ROOT, SEEDED_FAILURES_DIR } from "../lib/paths.mjs";
import { ingestFile } from "../lib/ingest.mjs";
import { loadStore } from "../lib/store.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

test("seeded private-terms scrape is refused and not accepted", () => {
  const result = ingestFile(DATA_ROOT, join(SEEDED_FAILURES_DIR, "private-terms-scrape.json"), {
    write: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.accepted, false);
  assert.equal(result.refused, true);
  assert.equal(result.code, "private_terms_scrape");
});

test("universal coverage claim is refused", () => {
  const result = ingestFile(DATA_ROOT, join(SEEDED_FAILURES_DIR, "universal-coverage-claim.json"), {
    write: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.accepted, false);
  assert.equal(result.code, "universal_coverage_claim");
});

test("valid public reobservation is accepted and supersedes the previous current version", () => {
  const root = mkdtempSync(join(tmpdir(), "work-terms-ingest-"));
  cpSync(DATA_ROOT, root, { recursive: true });
  const file = join(fixtures, "ingest", "valid-public-reobservation.json");
  const result = ingestFile(root, file, { write: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.accepted, true);
  assert.deepEqual(result.superseded, ["gofrantic-charter-2026-08-08"]);
  const store = loadStore(root);
  const previous = store.records.find((item) => item.record.id === "gofrantic-charter-2026-08-08");
  const newest = store.records.find((item) => item.record.id === "gofrantic-charter-2026-09-17-reobservation");
  assert.equal(previous.record.status, "superseded");
  assert.equal(newest.record.status, "current");
  const current = store.records.filter(
    (item) => item.record.platformId === "gofrantic" && item.record.documentKind === "charter" && item.record.status === "current",
  );
  assert.equal(current.length, 1);
  assert.equal(current[0].record.id, "gofrantic-charter-2026-09-17-reobservation");
});
