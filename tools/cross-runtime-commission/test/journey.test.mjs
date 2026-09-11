import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fingerprintForIndependence } from "../lib/environment.mjs";
import { runFixtureFile } from "../lib/commission.mjs";
import { ENGINE_PIN, JOURNEY_JOB_ID, LIVE_EXTRACT, OWNED_DIR, SCHEMA } from "../lib/pins.mjs";

const BIN = join(OWNED_DIR, "bin/cross-runtime.mjs");

function cliJourney(fixture) {
  return spawnSync(process.execPath, [BIN, "journey", "--fixture", fixture], {
    encoding: "utf8",
    cwd: OWNED_DIR,
    timeout: 120_000,
  });
}

describe("literal two-runtime journey", { timeout: 120_000 }, () => {
  it("runs the same listing-repair-packet fixture on two labelled runtimes", () => {
    const spawned = cliJourney("fixtures/ok.json");
    assert.equal(spawned.status, 0, spawned.stderr || spawned.stdout);
    const result = JSON.parse(spawned.stdout);
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.ok, true);
    assert.equal(result.refused, undefined);
    assert.equal(result.jobId, JOURNEY_JOB_ID);
    assert.equal(result.input.sha256.length, 64);
    assert.equal(result.runtimes.length, 2);
    assert.deepEqual(
      result.runtimes.map((row) => row.label),
      ["node22-local", "node22-container-fixture"],
    );
    assert.equal(result.runtimes[0].input.sha256, result.input.sha256);
    assert.equal(result.runtimes[1].input.sha256, result.input.sha256);
    assert.equal(result.runtimes[0].ok, true);
    assert.equal(result.runtimes[1].ok, true);
    assert.equal(result.comparable, true);
    assert.equal(result.resultDigestMatch, true);
    assert.equal(result.independent, true);
    assert.equal(result.independentReason, "environments-differ-by-more-than-cwd");
    assert.equal(result.commissionedCustomer, false);
    assert.equal(result.payingMaintainer, false);
    assert.equal(result.purchaseAuthority, false);
    assert.equal(result.sold, false);
    assert.equal(result.sample, false);
    assert.equal(result.demo, false);
    assert.equal(result.label, "scaffold");
    assert.equal(result.engine.pin, ENGINE_PIN.merge);
    assert.equal(result.liveExtract.usdc, LIVE_EXTRACT.usdc);

    for (const row of result.runtimes) {
      assert.ok(Array.isArray(row.command.argv));
      assert.equal(row.command.argv.includes("listing-repair-packet"), true);
      assert.ok(row.command.cwd);
      assert.equal(row.result.engineStatus, "actionable");
      assert.ok(row.result.outputs.some((out) => out.name === "repair-packet.json"));
    }

    const localPrint = JSON.stringify(fingerprintForIndependence(result.runtimes[0].environment));
    const containerPrint = JSON.stringify(fingerprintForIndependence(result.runtimes[1].environment));
    assert.notEqual(localPrint, containerPrint);
    assert.equal(result.runtimes[0].environment.kind, "local");
    assert.equal(result.runtimes[1].environment.kind, "container-fixture");
    assert.equal(result.runtimes[0].environment.nodeMajor, 22);
    assert.equal(result.runtimes[1].environment.nodeMajor, 22);
  });

  it("demo-labelled single-runtime run cannot claim independent: true", () => {
    const result = runFixtureFile(join(OWNED_DIR, "fixtures/demo-single-runtime.json"), {
      cwd: OWNED_DIR,
    });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.demo, true);
    assert.equal(result.runtimes.length, 1);
    assert.equal(result.independent, false);
    assert.match(result.independentReason, /single-runtime|fewer-than-two/);
    assert.equal(result.commissionedCustomer, false);
    assert.equal(result.comparable, false);
  });

  it("two locals that differ only by cwd are not independent", () => {
    const result = runFixtureFile(join(OWNED_DIR, "fixtures/cwd-only.json"), { cwd: OWNED_DIR });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.comparable, true);
    assert.equal(result.independent, false);
    assert.equal(result.independentReason, "environments-differ-only-by-cwd-or-are-identical");
    assert.notEqual(result.runtimes[0].environment.cwd, result.runtimes[1].environment.cwd);
  });
});
