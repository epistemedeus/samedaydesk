import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_ROOT, SEEDED_FAILURES_DIR, loadPin } from "./paths.mjs";
import { ingestFile } from "./ingest.mjs";
import { invalidateById, refuseRepublication } from "./invalidate.mjs";
import { loadStore, validateStore, versionsIndex } from "./store.mjs";

function copyStore() {
  const dir = mkdtempSync(join(tmpdir(), "work-terms-"));
  cpSync(DATA_ROOT, dir, { recursive: true });
  return dir;
}

export function seededFailurePrivateTerms() {
  const filePath = join(SEEDED_FAILURES_DIR, "private-terms-scrape.json");
  const result = ingestFile(DATA_ROOT, filePath, { write: false });
  const rejected =
    result.accepted === false &&
    result.refused === true &&
    result.ok === false &&
    result.code === "private_terms_scrape";
  return {
    name: "private-terms-scrape",
    file: filePath,
    rejected,
    accepted: result.accepted,
    code: result.code,
    message: result.message,
    errors: result.errors,
  };
}

export function proveInvalidation() {
  const root = copyStore();
  const before = loadStore(root);
  const target = before.records.find((item) => item.record.status === "current");
  if (!target) {
    return { ok: false, code: "no_current_record", message: "dataset has no current record to invalidate" };
  }
  const documentKind = target.record.documentKind;
  const platformId = target.record.platformId;
  const currentBefore = before.records.filter(
    (item) =>
      item.record.platformId === platformId &&
      item.record.documentKind === documentKind &&
      item.record.status === "current",
  );
  const result = invalidateById(root, target.record.id, {
    write: true,
    reason: "rights_withdrawn",
    note: "seeded invalidation proof: republication withdrawn for this copy",
    actor: "operator",
    at: "2026-09-17T00:00:00.000Z",
  });
  const after = loadStore(root);
  const reloaded = after.records.find((item) => item.record.id === target.record.id);
  const stillCurrent = after.records.filter(
    (item) =>
      item.record.platformId === platformId &&
      item.record.documentKind === documentKind &&
      item.record.status === "current",
  );
  const reuse = refuseRepublication(reloaded.record);
  return {
    ok:
      result.ok === true &&
      reloaded.record.status === "invalidated" &&
      reloaded.record.invalidation?.reason === "rights_withdrawn" &&
      stillCurrent.length === currentBefore.length - 1 &&
      reuse.allowed === false &&
      reuse.code === "invalidated_not_republishable",
    root,
    recordId: target.record.id,
    platformId,
    documentKind,
    currentBefore: currentBefore.map((item) => item.record.id),
    currentAfter: stillCurrent.map((item) => item.record.id),
    status: reloaded.record.status,
    invalidation: reloaded.record.invalidation,
    republicationAfter: reuse,
  };
}

export function proveSupersession() {
  const root = copyStore();
  const fixture = JSON.parse(readFileSync(join(SEEDED_FAILURES_DIR, "..", "ingest", "valid-public-reobservation.json"), "utf8"));
  const result = ingestFile(root, join(SEEDED_FAILURES_DIR, "..", "ingest", "valid-public-reobservation.json"), {
    write: true,
  });
  const after = loadStore(root);
  const previous = after.records.find((item) => item.record.id === fixture.version.supersedes);
  const newest = after.records.find((item) => item.record.id === fixture.id);
  const current = after.records.filter(
    (item) =>
      item.record.platformId === fixture.platformId &&
      item.record.documentKind === fixture.documentKind &&
      item.record.status === "current",
  );
  return {
    ok:
      result.ok === true &&
      result.accepted === true &&
      previous?.record.status === "superseded" &&
      newest?.record.status === "current" &&
      current.length === 1 &&
      current[0].record.id === fixture.id,
    supersededId: fixture.version.supersedes,
    newId: fixture.id,
    previousStatus: previous?.record.status || null,
    newStatus: newest?.record.status || null,
    currentIds: current.map((item) => item.record.id),
    ingest: { ok: result.ok, code: result.code, superseded: result.superseded },
  };
}

export function versionsAndRightsExplicit(store) {
  const missing = [];
  for (const item of store.records) {
    const record = item.record;
    if (!record.version?.id || !record.version?.label || !record.version?.observedAt) {
      missing.push({ id: record.id, missing: "version" });
    }
    if (!record.republication?.right || !record.republication?.statement) {
      missing.push({ id: record.id, missing: "republication" });
    }
    if (!record.attribution?.publisher || !record.attribution?.canonicalUrl) {
      missing.push({ id: record.id, missing: "attribution" });
    }
  }
  return { ok: missing.length === 0, missing, count: store.records.length };
}

export function verify(root = DATA_ROOT) {
  const pin = loadPin();
  const store = loadStore(root);
  const validated = validateStore(store);
  const explicit = versionsAndRightsExplicit(store);
  const seeded = seededFailurePrivateTerms();
  const invalidation = proveInvalidation();
  const supersession = proveSupersession();
  const versions = versionsIndex(store);
  const current = store.records.filter((item) => item.record.status === "current");
  const ok =
    validated.ok &&
    explicit.ok &&
    seeded.rejected &&
    invalidation.ok &&
    supersession.ok &&
    pin.universalCoverage === false &&
    pin.liveScrape === false &&
    store.catalog.coverage.universal === false &&
    store.catalog.liveScrape === false;

  return {
    ok,
    pack: "work-terms-dataset",
    datasetRoot: root,
    pin: {
      sourceCommit: pin.sourceCommit,
      liveScrape: pin.liveScrape,
      universalCoverage: pin.universalCoverage,
      disjointFrom: pin.disjointFrom,
    },
    store: {
      ok: validated.ok,
      errors: validated.errors,
      recordCount: store.records.length,
      currentCount: current.length,
      platformCount: store.catalog.coverage.includedPlatformCount,
    },
    versionsAndRepublicationExplicit: explicit,
    versions,
    seededFailure: {
      name: seeded.name,
      rejected: seeded.rejected,
      accepted: seeded.accepted,
      code: seeded.code,
      message: seeded.message,
    },
    invalidation: {
      ok: invalidation.ok,
      recordId: invalidation.recordId,
      status: invalidation.status,
      reason: invalidation.invalidation?.reason || null,
      republicationAllowed: invalidation.republicationAfter?.allowed ?? null,
      republicationCode: invalidation.republicationAfter?.code || null,
    },
    supersession: {
      ok: supersession.ok,
      supersededId: supersession.supersededId,
      newId: supersession.newId,
      previousStatus: supersession.previousStatus,
      newStatus: supersession.newStatus,
    },
    coverage: store.catalog.coverage,
    disjointFrom: store.catalog.disjointFrom,
  };
}
