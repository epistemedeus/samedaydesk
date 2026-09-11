import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runManagedListingRepair } from "../lib/repair.mjs";
import { bindEvidenceDigest } from "../lib/digest.mjs";
import { PR51_ARCHIVE_BYTES, PR51_ARCHIVE_SHA256, PR51_MERGE } from "../lib/pins.mjs";
import { OK_FIXTURE, REPO, TOOL_DIR, runCli, tmpOut } from "./helpers.mjs";

describe("literal user journey", () => {
  it("fixture source + one-field packet → evidence+suggestion, publishAuthorized false", () => {
    const spawned = runCli(["journey", "--fixture", "fixtures/ok.json"], { cwd: TOOL_DIR });
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.accepted_correction, false);
    assert.equal(body.sold, false);
    assert.ok(body.evidence);
    assert.equal(body.evidence.kind, "source_observation");
    assert.match(body.evidence.digest, /^[0-9a-f]{64}$/);
    assert.equal(body.evidence.engine.jobId, "listing-repair-packet");
    assert.equal(body.evidence.engine.pr51, PR51_MERGE);
    assert.equal(body.evidence.engine.bytes, PR51_ARCHIVE_BYTES);
    assert.equal(body.evidence.engine.sha256, PR51_ARCHIVE_SHA256);
    assert.equal(body.evidence.engine.purchaseAuthority, false);

    assert.equal(body.suggestion.kind, "suggestion");
    assert.equal(body.suggestion.notAPublish, true);
    assert.equal(body.suggestion.publishAuthorized, false);
    assert.equal(body.suggestion.accepted_correction, false);
    assert.equal(body.suggestion.fieldCount, 1);
    assert.equal(body.suggestion.changes[0].field, "routes./docs.status");
    assert.equal(body.suggestion.changes[0].from, 404);
    assert.equal(body.suggestion.changes[0].to, 200);
    assert.equal(body.suggestion.note, "Suggestion only. Not a listing publish.");

    const fixture = JSON.parse(readFileSync(OK_FIXTURE, "utf8"));
    assert.equal(body.evidence.digest, bindEvidenceDigest(fixture.source));
  });

  it("SAMPLE packet is rejected and cannot become accepted_correction", () => {
    const spawned = runCli(
      ["journey", "--fixture", "fixtures/invalid/sample-as-accepted.json"],
      { cwd: TOOL_DIR },
    );
    assert.equal(spawned.status, 1, spawned.stdout);
    const body = JSON.parse(spawned.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "sample_accepted_correction_rejected");
    assert.equal(body.accepted_correction, false);
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.sample, true);
  });

  it("library journey matches the CLI on the ok fixture", () => {
    const result = runManagedListingRepair({ fixturePath: OK_FIXTURE });
    assert.equal(result.ok, true);
    assert.equal(result.publishAuthorized, false);
    assert.equal(result.suggestion.notAPublish, true);
    assert.equal(result.claims.published, false);
    assert.ok(Array.isArray(result.suggestion.engineActions));
  });

  it("writes JSON only when --out is a non-catalog path", () => {
    const out = tmpOut();
    const spawned = runCli(
      ["journey", "--fixture", join(TOOL_DIR, "fixtures/ok.json"), "--out", out],
      { cwd: REPO },
    );
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    assert.equal(existsSync(out), true);
    const written = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(written.publishAuthorized, false);
    assert.equal(written.suggestion.accepted_correction, false);
  });
});
