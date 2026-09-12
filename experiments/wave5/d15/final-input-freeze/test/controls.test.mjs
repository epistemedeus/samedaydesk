import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ARCHIVE_120, D01_RC_SHA, PUBLIC_PR114_SHA } from "../lib/pins.mjs";
import { ensureProductRoot, gitBlobId, inspectArchive120 } from "../lib/product.mjs";
import { stageLock, stagePage, stageRoute, stageSchema } from "../lib/fixtures.mjs";
import { outcomeOf } from "../lib/invoke.mjs";
import { runControl } from "../lib/run.mjs";
import { listedBindings } from "../lib/bind.mjs";
import { sha256File } from "../lib/sha.mjs";

const root = ensureProductRoot();

describe("RC archive and deliver.mjs controls", { timeout: 180_000 }, () => {
  it("public 1.2.0 archive at 46f2b7f matches PR114 blob and pinned digest", () => {
    const archive = inspectArchive120(root);
    assert.equal(archive.bytes, ARCHIVE_120.bytes);
    assert.equal(archive.sha256, ARCHIVE_120.sha256);
    assert.equal(gitBlobId(D01_RC_SHA, ARCHIVE_120.publicPath), gitBlobId(PUBLIC_PR114_SHA, ARCHIVE_120.publicPath));
  });

  it("lockfile no-change is informational; changed is actionable", () => {
    const same = stageLock(root, { same: true });
    const quiet = runControl(root, "lockfile-pin-delta", same);
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.body.ok, true);
    assert.equal(outcomeOf(quiet.body), "informational");
    const changed = stageLock(root);
    const hit = runControl(root, "lockfile-pin-delta", changed);
    assert.equal(hit.status, 0, hit.stderr);
    assert.equal(outcomeOf(hit.body), "actionable");
    assert.notEqual(quiet.body.runOutDir, hit.body.runOutDir);
  });

  it("schema no-change, partial unused-path, and changed are distinct", () => {
    const same = runControl(root, "json-schema-webhook-drift", stageSchema(root, "same"));
    assert.equal(same.status, 0, same.stderr);
    assert.equal(outcomeOf(same.body), "informational");
    const partial = runControl(root, "json-schema-webhook-drift", stageSchema(root, "partial"));
    assert.equal(partial.status, 0, partial.stderr);
    assert.equal(outcomeOf(partial.body), "partial");
    const changed = runControl(root, "json-schema-webhook-drift", stageSchema(root, "changed"));
    assert.equal(changed.status, 0, changed.stderr);
    assert.equal(outcomeOf(changed.body), "actionable");
  });

  it("route changed is actionable; page --job-file no-change vs changed", () => {
    const route = runControl(root, "route-table-diff", stageRoute(root));
    assert.equal(route.status, 0, route.stderr);
    assert.equal(outcomeOf(route.body), "actionable");
    const same = runControl(root, "page-change-offline-job", stagePage(root, { same: true }));
    assert.equal(same.status, 0, same.stderr);
    assert.equal(outcomeOf(same.body), "informational");
    const changed = runControl(root, "page-change-offline-job", stagePage(root));
    assert.equal(changed.status, 0, changed.stderr);
    assert.equal(outcomeOf(changed.body), "actionable");
  });

  it("--http POST /execute still delivers lockfile through the same CLI", () => {
    const fx = stageLock(root);
    const hit = runControl(root, "lockfile-pin-delta", fx, ["--http"]);
    assert.equal(hit.status, 0, hit.stderr);
    assert.equal(hit.body.ok, true);
    assert.match(String(hit.body.executeUrl), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(outcomeOf(hit.body), "actionable");
  });

  it("--second-after keeps disjoint runOutDir and mailbox request ids", () => {
    const first = stageLock(root);
    const secondAfter = stageLock(root, { same: true }).after;
    const hit = runControl(root, "lockfile-pin-delta", first, ["--second-after", sameAfter(secondAfter)]);
    assert.equal(hit.status, 0, hit.stderr);
    assert.equal(hit.body.ok, true);
    assert.equal(hit.body.disjoint, true);
    assert.notEqual(hit.body.first.runOutDir, hit.body.second.runOutDir);
    assert.notEqual(hit.body.first.mailbox.requestId, hit.body.second.mailbox.requestId);
    assert.equal(outcomeOf(hit.body.first), "actionable");
    assert.equal(hit.body.second.order.wrapper.analysis.outcome, "informational");
  });

  it("shared --out-dir is last-writer published copy; receipts stay on runOutDir", () => {
    const shared = mkdtempSync(join(tmpdir(), "d15-final-shared-"));
    const changed = stageLock(root);
    const quiet = stageLock(root, { same: true });
    const a = runControl(root, "lockfile-pin-delta", { ...changed, outDir: shared });
    const b = runControl(root, "lockfile-pin-delta", { ...quiet, outDir: shared });
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.notEqual(a.body.runOutDir, b.body.runOutDir);
    assert.equal(existsSync(join(a.body.runOutDir, "pin-delta.json")), true);
    assert.equal(existsSync(join(b.body.runOutDir, "pin-delta.json")), true);
    assert.equal(sha256File(join(shared, "pin-delta.json")), sha256File(join(b.body.runOutDir, "pin-delta.json")));
    assert.notEqual(a.body.order.wrapper.receipt.outputsDigest, b.body.order.wrapper.receipt.outputsDigest);
  });

  it("order binds catalog lock sha256s; mailbox envelope does not", () => {
    const fx = stageLock(root);
    const hit = runControl(root, "lockfile-pin-delta", fx);
    const bound = listedBindings(hit.body, [
      { name: "before", sha256: fx.inspectBefore },
      { name: "after", sha256: fx.inspectAfter },
    ]);
    assert.equal(bound.every((row) => row.inOrderInputs && row.inReceiptInputs), true);
    assert.equal(bound.every((row) => row.inMailboxEnvelope === false), true);
  });
});

function sameAfter(path) {
  return path;
}
