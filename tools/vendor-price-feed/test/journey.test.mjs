import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixture, parseStdout, runCli, tmpStore, TOOL_DIR } from "./helpers.mjs";

describe("literal user journey", () => {
  it("ingest observation → list current → older digest is stale not current → SAMPLE rejected as upstream", () => {
    const r = runCli(["journey", "--fixture", "fixtures/ok.json"], { cwd: TOOL_DIR });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseStdout(r);
    assert.equal(body.ok, true);
    assert.equal(body.command, "journey");
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.liveCatalogWritten, false);

    const first = body.steps.ingest;
    assert.equal(first.ok, true);
    assert.equal(first.status, "current");
    assert.match(first.id, /^[0-9a-f]{64}$/);
    assert.equal(first.observation.provenance, "fixture");
    assert.equal(first.observation.unit, "USD/1M-tokens");
    assert.equal(first.observation.amount, "2.0");
    assert.equal(first.observation.priorObservationId, null);
    assert.equal(typeof first.observation.sourceUrl, "string");
    assert.equal(first.observation.sourceUrl.includes("useful-jobs-1.0.0.tar.gz"), true);

    const listed = body.steps.listCurrentAfterIngest;
    assert.equal(listed.currentIds.includes(first.id), true);
    assert.equal(listed.current[0].status, "current");

    const later = body.steps.ingestLater;
    assert.equal(later.ok, true);
    assert.equal(later.status, "current");
    assert.equal(later.priorObservationId, first.id);
    assert.equal(later.priorStatus, "stale");
    assert.notEqual(later.id, first.id);

    const after = body.steps.listCurrentAfterLater;
    assert.equal(after.olderStatus, "stale");
    assert.equal(after.olderIsCurrent, false);
    assert.equal(after.currentIds.includes(first.id), false);
    assert.equal(after.currentIds.includes(later.id), true);
    assert.equal(after.staleIds.includes(first.id), true);
    assert.equal(
      after.stale.find((row) => row.id === first.id).status,
      "stale",
    );
    assert.equal(
      after.current.every((row) => row.status === "current"),
      true,
    );

    const sample = body.steps.sampleAsUpstream;
    assert.equal(sample.ok, false);
    assert.equal(sample.refused, true);
    assert.equal(sample.code, "sample-not-upstream");
    assert.equal(sample.liveCatalogWritten, false);

    assert.equal(body.olderDigest, first.id);
    assert.equal(body.currentDigest, later.id);
  });

  it("list-current after a chained ingest does not return the older digest as current", () => {
    const storeDir = tmpStore("vpf-list-");
    const ingest = runCli(["ingest", "--file", fixture("ok.json")], { storeDir });
    assert.equal(ingest.status, 0, ingest.stderr + ingest.stdout);
    const first = parseStdout(ingest);
    const listed = runCli(["list-current"], { storeDir });
    assert.equal(listed.status, 0, listed.stderr + listed.stdout);
    const current = parseStdout(listed);
    assert.deepEqual(current.currentIds, [first.id]);
    assert.equal(current.current[0].status, "current");
  });
});
