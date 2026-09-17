import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT } from "../lib/paths.mjs";
import { verify } from "../lib/verify.mjs";

test("verify proves versions, republication, invalidation, and seeded refusal", () => {
  const report = verify();
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.equal(report.store.ok, true);
  assert.equal(report.versionsAndRepublicationExplicit.ok, true);
  assert.equal(report.seededFailure.rejected, true);
  assert.equal(report.seededFailure.accepted, false);
  assert.equal(report.seededFailure.code, "private_terms_scrape");
  assert.equal(report.invalidation.ok, true);
  assert.equal(report.invalidation.republicationAllowed, false);
  assert.equal(report.supersession.ok, true);
  assert.equal(report.coverage.universal, false);
  assert.deepEqual(report.disjointFrom, ["H04 licensed regression packs"]);
  assert.equal(report.pin.liveScrape, false);
  assert.equal(report.pin.universalCoverage, false);
});

test("verify does not leak copied stores in tmpdir", () => {
  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("work-terms-")));
  const report = verify();
  assert.equal(report.ok, true);
  const leaked = readdirSync(tmpdir()).filter((name) => name.startsWith("work-terms-") && !before.has(name));
  assert.deepEqual(leaked, []);
});

test("cli verify exits 0 against the real dataset", () => {
  const proc = spawnSync(process.execPath, [join(PACK_ROOT, "bin/work-terms.mjs"), "verify"], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.seededFailure.rejected, true);
  assert.equal(body.invalidation.ok, true);
  assert.equal(body.versionsAndRepublicationExplicit.ok, true);
});
