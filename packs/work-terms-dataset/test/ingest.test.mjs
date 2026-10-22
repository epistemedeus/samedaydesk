import assert from "node:assert/strict";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DATA_ROOT, SEEDED_FAILURES_DIR } from "../lib/paths.mjs";
import { ingestFile, ingestRecord } from "../lib/ingest.mjs";
import { loadStore, validateStore } from "../lib/store.mjs";

function gofranticClone(overrides = {}) {
  const store = loadStore(DATA_ROOT);
  const rec = structuredClone(store.records.find((item) => item.record.id === "gofrantic-charter-2026-08-08").record);
  rec.id = "gofrantic-charter-probe-clone";
  rec.version.id = "gofrantic-charter-probe-v";
  rec.version.supersedes = "gofrantic-charter-2026-08-08";
  rec.version.observedAt = "2026-09-18T00:00:00.000Z";
  rec.clauses = rec.clauses.map((clause, i) => ({ ...clause, id: `probe-clause-${i + 1}` }));
  return { ...rec, ...overrides, version: { ...rec.version, ...(overrides.version || {}) } };
}

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
  const validated = validateStore(store);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors, null, 2));
  assert.ok(store.catalog.recordFiles.includes("records/gofrantic-charter-2026-09-17-reobservation.json"));
});

test("unnamed platform ingest is refused (named-source coverage)", () => {
  const rec = gofranticClone({
    id: "mysteryplatform-terms-probe",
    platformId: "mysteryplatform",
    version: { id: "mysteryplatform-terms-v1", supersedes: null, observedAt: "2026-09-18T00:00:00.000Z" },
  });
  rec.attribution.canonicalUrl = "https://mysteryplatform.example/terms";
  rec.attribution.retrievedFrom = "https://mysteryplatform.example/terms";
  rec.attribution.publisher = "Mystery Platform";
  rec.access.robots.sourceUrl = "https://mysteryplatform.example/robots.txt";
  rec.republication.statement = "Cite and link https://mysteryplatform.example/terms. Short excerpts only.";
  rec.clauses[0].quoteSourceUrl = "https://mysteryplatform.example/terms";
  if (rec.clauses[1]) rec.clauses[1].quoteSourceUrl = "https://mysteryplatform.example/charter";
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "unlisted_platform");
});

test("unlisted document kind for a named platform is refused", () => {
  const rec = gofranticClone({
    id: "samedaydesk-aup-probe",
    platformId: "samedaydesk",
    documentKind: "acceptable_use",
    version: { id: "samedaydesk-aup-probe-v", supersedes: null, observedAt: "2026-09-18T00:00:00.000Z" },
  });
  rec.attribution.canonicalUrl = "https://samedaydesk.com/acceptable-use";
  rec.attribution.retrievedFrom = "https://samedaydesk.com/acceptable-use";
  rec.attribution.publisher = "SameDayDesk";
  rec.access.robots.sourceUrl = "https://samedaydesk.com/robots.txt";
  rec.republication.statement = "Cite and link https://samedaydesk.com/acceptable-use. Short excerpts only.";
  rec.clauses = [];
  rec.provenance.method = "committed_first_party_source";
  rec.provenance.sourceNote = "Document kind is not listed for samedaydesk in the catalog.";
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "unlisted_document_kind");
});

test("duplicate version id is refused at ingest, not after write", () => {
  const rec = gofranticClone({
    version: { id: "gofrantic-charter-obs-2026-08-08" },
  });
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "duplicate_version");
});

test("ingest of an invalidated candidate must not supersede the current version", () => {
  const rec = gofranticClone({
    id: "gofrantic-charter-already-invalid",
    status: "invalidated",
    invalidation: {
      at: "2026-09-17T00:00:00.000Z",
      reason: "operator_error",
      note: "incoming record is already invalidated",
      actor: "operator",
    },
  });
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "ingest_requires_current");
});

test("reobservation without version.supersedes pointing at current is refused", () => {
  const rec = gofranticClone({
    version: { supersedes: null },
  });
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "missing_version");
});

test("older observedAt cannot replay as the new current version", () => {
  const rec = gofranticClone({
    version: { observedAt: "2020-01-01T00:00:00.000Z" },
  });
  const result = ingestRecord(loadStore(DATA_ROOT), rec, { write: false });
  assert.equal(result.accepted, false);
  assert.equal(result.code, "stale_observation");
});
