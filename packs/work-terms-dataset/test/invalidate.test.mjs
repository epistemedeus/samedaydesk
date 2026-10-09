import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DATA_ROOT } from "../lib/paths.mjs";
import { invalidateById, refuseRepublication } from "../lib/invalidate.mjs";
import { loadStore, validateStore } from "../lib/store.mjs";

function copyStore() {
  const root = mkdtempSync(join(tmpdir(), "work-terms-inv-"));
  cpSync(DATA_ROOT, root, { recursive: true });
  return root;
}

test("invalidation removes current status and forbids republication", () => {
  const root = copyStore();
  const before = loadStore(root);
  const target = before.records.find((item) => item.record.id === "moltjobs-terms-2026-08-02");
  assert.equal(target.record.status, "current");
  const result = invalidateById(root, target.record.id, {
    write: true,
    reason: "rights_withdrawn",
    note: "test invalidation: republication withdrawn",
    actor: "operator",
    at: "2026-09-17T00:00:00.000Z",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.invalidated, true);
  const after = loadStore(root);
  const reloaded = after.records.find((item) => item.record.id === "moltjobs-terms-2026-08-02");
  assert.equal(reloaded.record.status, "invalidated");
  assert.equal(reloaded.record.invalidation.reason, "rights_withdrawn");
  const current = after.records.filter(
    (item) =>
      item.record.platformId === "moltjobs" &&
      item.record.documentKind === "terms" &&
      item.record.status === "current",
  );
  assert.equal(current.length, 0);
  const reuse = refuseRepublication(reloaded.record);
  assert.equal(reuse.allowed, false);
  assert.equal(reuse.code, "invalidated_not_republishable");
  const log = readFileSync(join(root, "invalidations.jsonl"), "utf8");
  assert.match(log, /moltjobs-terms-2026-08-02/);
  assert.match(log, /rights_withdrawn/);
});

test("committed SameDayDesk stub is already invalidated as not operative", () => {
  const store = loadStore(DATA_ROOT);
  const stub = store.records.find((item) => item.record.id === "samedaydesk-terms-stub-2026-09-17");
  assert.equal(stub.record.status, "invalidated");
  assert.equal(stub.record.invalidation.reason, "placeholder_not_operative");
  const reuse = refuseRepublication(stub.record);
  assert.equal(reuse.allowed, false);
  assert.equal(reuse.code, "invalidated_not_republishable");
});

test("unknown invalidation reason is refused", () => {
  const result = invalidateById(DATA_ROOT, "moltjobs-terms-2026-08-02", {
    write: false,
    reason: "because-i-said-so",
    note: "not a real reason",
  });
  assert.equal(result.ok, false);
  assert.equal(result.invalidated, false);
  assert.equal(result.code, "invalid_invalidation_reason");
});

test("invalid actor or timestamp is refused before write", () => {
  const actor = invalidateById(DATA_ROOT, "moltjobs-terms-2026-08-02", {
    write: true,
    reason: "rights_withdrawn",
    note: "test invalidation actor drift xx",
    actor: "not-an-actor",
    at: "2026-09-17T00:00:00.000Z",
  });
  assert.equal(actor.ok, false);
  assert.equal(actor.invalidated, false);
  const when = invalidateById(DATA_ROOT, "moltjobs-terms-2026-08-02", {
    write: true,
    reason: "rights_withdrawn",
    note: "test invalidation timestamp drift",
    actor: "operator",
    at: "yesterday",
  });
  assert.equal(when.ok, false);
  assert.equal(when.invalidated, false);
  const store = loadStore(DATA_ROOT);
  const moltjobs = store.records.find((item) => item.record.id === "moltjobs-terms-2026-08-02");
  assert.equal(moltjobs.record.status, "current");
});

test("dry-run currentAfter does not still list the target as current", () => {
  const result = invalidateById(DATA_ROOT, "moltjobs-terms-2026-08-02", {
    write: false,
    reason: "rights_withdrawn",
    note: "dry run currentAfter check xx",
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.currentAfter.includes("moltjobs-terms-2026-08-02"), false);
});

test("unknown_counsel is fail-closed for republication", () => {
  const store = loadStore(DATA_ROOT);
  const rec = structuredClone(store.records.find((item) => item.record.id === "gofrantic-charter-2026-08-08").record);
  rec.republication.right = "unknown_counsel";
  rec.republication.excerptMaxChars = 0;
  rec.republication.statement = "Counsel has not reviewed republication of these terms yet.";
  rec.clauses = rec.clauses.map((clause) => ({ ...clause, quote: null }));
  const reuse = refuseRepublication(rec);
  assert.equal(reuse.allowed, false);
  assert.equal(reuse.code, "republication_not_granted");
  assert.equal(reuse.right, "unknown_counsel");
});

test("invalidation rewrites versions.json so the index is not stale", () => {
  const root = copyStore();
  const result = invalidateById(root, "moltjobs-terms-2026-08-02", {
    write: true,
    reason: "rights_withdrawn",
    note: "test invalidation: republication withdrawn",
    actor: "operator",
    at: "2026-09-17T00:00:00.000Z",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const after = loadStore(root);
  const validated = validateStore(after);
  assert.equal(validated.ok, true, JSON.stringify(validated.errors, null, 2));
  const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
  const row = versions.documents.find((doc) => doc.key === "moltjobs::terms").versions[0];
  assert.equal(row.status, "invalidated");
});
