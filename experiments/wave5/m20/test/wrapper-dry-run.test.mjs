import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runDryRun } from "../lib/dry-run.mjs";
import { CLI } from "./helpers.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

describe("owner-qa dry run against PR52 runPaidOffer", { timeout: 180_000 }, () => {
  it("library dry-run distinguishes the four classes and does not invent paid return", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "m20-dry-"));
    const body = await runDryRun({ buyerClass: "owner-qa", outDir });
    assert.equal(body.ok, true, JSON.stringify(body.rows?.filter((row) => row.refused), null, 2));
    assert.equal(body.label, "owner-qa");
    assert.equal(body.wrapper.exportName, "runPaidOffer");
    assert.equal(body.wrapper.testedPin, "aeef964fa188443078958d9d6d393afae1d542ee");
    assert.equal(body.wrapper.executionContract, null);
    assert.equal(body.independentDemand, false);
    assert.equal(body.counts.paidReturn, 0);
    assert.equal(body.counts.siblingPending, 6);

    const byId = Object.fromEntries(body.rows.map((row) => [row.id, row]));
    assert.equal(byId["failed-missing-inputs"].useClass, "failed-use");
    assert.equal(byId["failed-missing-inputs"].code, "missing-required-inputs");
    assert.equal(byId["failed-sample-sale"].useClass, "failed-use");
    assert.equal(byId["failed-sample-sale"].code, "sample-not-a-sale");
    assert.equal(byId["useful-first"].useClass, "useful-use");
    assert.equal(byId["useful-first"].fields.sold, false);
    assert.equal(byId["repeat-fixture"].useClass, "useful-use");
    assert.equal(byId["repeat-fixture"].repeat, true);
    assert.equal(byId["repeat-fixture"].payment.state, "reserved-fixture");
    assert.equal(byId["presented-noreply"].useClass, "no-reply");
    assert.equal(byId["presented-budget"].reply, "observed");
    assert.equal(body.nextAdjustment.id, "keep-offer-await-field-receipts");
    assert.equal(existsSync(join(outDir, "readout.json")), true);
    assert.equal(existsSync(join(outDir, "observations.json")), true);
    const written = JSON.parse(readFileSync(join(outDir, "readout.json"), "utf8"));
    assert.equal(written.nextAdjustment.one, true);
  });

  it("CLI dry-run process exits 0 and prints the same recommendation", () => {
    const outDir = mkdtempSync(join(tmpdir(), "m20-cli-dry-"));
    const r = spawnSync(
      process.execPath,
      [CLI, "dry-run", "--buyer-class", "owner-qa", "--out-dir", outDir],
      {
        encoding: "utf8",
        cwd: REPO_ROOT,
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.counts.noReply, 1);
    assert.equal(body.counts.failedUse >= 2, true);
    assert.equal(body.counts.usefulUse >= 2, true);
    assert.equal(body.counts.paidReturn, 0);
    assert.equal(body.nextAdjustment.change, "keep-current-pr52-nonsettling-offer");
  });
});
