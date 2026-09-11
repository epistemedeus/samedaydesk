import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { REPO_ROOT } from "../lib/pins.mjs";
import { CLI, FIXTURES } from "./helpers.mjs";

function run(args, { timeout = 30_000 } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("readout CLI process", () => {
  it("status names the PR52 pin and missing execution contract on this checkout", () => {
    const r = run(["status"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.contract, "samedaydesk.wave5.m20.readout.v1");
    assert.equal(body.testedWrapperPin, "aeef964fa188443078958d9d6d393afae1d542ee");
    assert.equal(body.wrapperExport, "runPaidOffer");
    assert.equal(body.executionContractOnThisCheckout, null);
    assert.equal(body.liveSettlement, "out-of-scope");
  });

  it("classify no-reply fixture exits 0 with useClass no-reply", () => {
    const r = run(["classify", "--in", join(FIXTURES, "observations/no-reply.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.rows[0].useClass, "no-reply");
    assert.equal(body.nextAdjustment.one, true);
  });

  it("classify paid-return join exits 0 with paid-return", () => {
    const r = run(["classify", "--in", join(FIXTURES, "observations/paid-return-exact-join.json")]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.counts.paidReturn, 1);
    assert.equal(body.independentDemand, false);
  });

  it("terms --force-equal on unlike documents exits 2", () => {
    const r = run([
      "terms",
      "--left",
      join(FIXTURES, "reject/disclosure-terms.json"),
      "--right",
      join(FIXTURES, "reject/kernel-terms.json"),
      "--force-equal",
    ]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, "unlike_terms_forced_equal");
  });

  it("classify independent run label exits 2", () => {
    const r = run(["classify", "--in", join(FIXTURES, "reject/independent-run-label.json")]);
    assert.equal(r.status, 2, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.rows[0].code, "analytics_count_is_independent_demand");
  });

  it("siblings lists D27 and M15-M19 as pending on this checkout", () => {
    const r = run(["siblings"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    const slots = body.siblings.map((slot) => slot.slot);
    assert.deepEqual(slots, ["W5-D27", "W5-M15", "W5-M16", "W5-M17", "W5-M18", "W5-M19"]);
    assert.equal(body.siblings.every((slot) => slot.present === false), true);
  });

  it("unknown command exits 2", () => {
    const r = run(["not-a-command"]);
    assert.equal(r.status, 2);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, "unknown_command");
  });

  it("classify writes --out", () => {
    const dir = mkdtempSync(join(tmpdir(), "m20-cli-"));
    const out = join(dir, "readout.json");
    const r = run(["classify", "--in", join(FIXTURES, "observations/no-reply.json"), "--out", out]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const written = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(written.rows[0].useClass, "no-reply");
  });
});
