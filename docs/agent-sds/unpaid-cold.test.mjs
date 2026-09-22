import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = realpathSync(resolve(here, "../.."));
const journey = join(here, "unpaid-cold.mjs");

function run(args, cwd) {
  return spawnSync(process.execPath, [journey, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function assertJourney(proc, cwd) {
  assert.equal(proc.status, 0, proc.stderr || proc.stdout.slice(0, 2000));
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.paid, false);
  assert.equal(body.paymentSent, false);
  assert.equal(body.liveCatalogScan, false);
  assert.equal(body.catalog.role, "dated-fixture");
  assert.equal(body.catalog.liveServiceClaim, false);
  assert.equal(body.catalog.readOriginAmount, "0.005");
  assert.equal(body.catalog.readBazaarAmount, "0.05");
  assert.equal(typeof body.catalog.x402LastUpdated, "number");
  assert.ok(body.catalog.originObservedAt);
  assert.equal(body.discovery.entrypoint, "packs/e4-maintained-runtime-discovery/bin/discover.mjs");
  assert.equal(body.discovery.duplicated, false);
  assert.equal(body.discovery.mode, "committed");
  assert.equal(body.discovery.package, "useful-jobs");
  assert.equal(body.discovery.version, "1.4.7");
  assert.equal(body.unknownVersusZero.distinct, true);
  assert.equal(body.unknownVersusZero.unknownClass, "unknown");
  assert.equal(body.unknownVersusZero.observedZeroClass, "observed_zero");
  assert.notEqual(body.unknownVersusZero.unknownClass, body.unknownVersusZero.observedZeroClass);
  assert.equal(body.unknownVersusZero.unknownStoredAsZeroRejected, true);
  assert.equal(body.forgedSettlement.caught, true);
  assert.equal(body.forgedSettlement.code, "forged_settle");
  assert.equal(body.forgedSettlement.exit, 1);
  const byId = Object.fromEntries(body.checks.map((item) => [item.id, item]));
  for (const id of [
    "useful-jobs-discovery",
    "402-matrix",
    "forged-settle",
    "absence",
    "absence-seed",
    "bazaar-drift",
    "bazaar-seed",
    "howto-loopback",
    "howto-paid-refuse",
  ]) {
    assert.equal(byId[id].ok, true, `${id} ${JSON.stringify(byId[id])}`);
    assert.equal(byId[id].exit, byId[id].expectedExit, id);
  }
  assert.equal(byId["forged-settle"].exit, 1);
  assert.equal(byId["absence-seed"].exit, 1);
  assert.equal(byId["bazaar-seed"].exit, 1);
  assert.equal(byId["402-matrix"].exit, 0);
  assert.equal(byId["howto-paid-refuse"].code, "PAID_REFUSE");
  assert.equal(byId["howto-paid-refuse"].nodeExit, 1);
  assert.ok(body.exportedPaths.length > 10);
  const cwdReal = realpathSync(cwd);
  const outsideCaller = cwdReal !== repoRoot && !cwdReal.startsWith(`${repoRoot}/`);
  for (const item of body.exportedPaths) {
    assert.equal(item.ok, true, JSON.stringify(item));
    assert.equal(realpathSync(item.absolute), realpathSync(resolve(repoRoot, item.repoRelative)));
    if (outsideCaller) {
      assert.equal(item.absolute.startsWith(`${cwdReal}/`), false, item.absolute);
    }
    assert.equal(existsSync(item.absolute), true);
  }
  return body;
}

test("cold journey passes from the repository root", () => {
  const proc = run([], repoRoot);
  const body = assertJourney(proc, repoRoot);
  assert.equal(realpathSync(body.repoRoot), repoRoot);
});

test("cold journey from another cwd still exports repository paths", () => {
  const tmp = mkdtempSync(join(tmpdir(), "unpaid-cold-"));
  const proc = run([], tmp);
  const body = assertJourney(proc, tmp);
  assert.equal(realpathSync(body.callerCwd), realpathSync(tmp));
  assert.notEqual(realpathSync(body.callerCwd), realpathSync(body.repoRoot));
});

test("missing and refused journey inputs exit 2", () => {
  const pay = run(["--pay"], repoRoot);
  assert.equal(pay.status, 2, pay.stdout);
  assert.equal(JSON.parse(pay.stdout).error.code, "REFUSED");
  const live = run(["--live"], repoRoot);
  assert.equal(live.status, 2);
  assert.equal(JSON.parse(live.stdout).error.code, "REFUSED");
  const unknown = run(["--not-a-real-flag"], repoRoot);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, "USAGE");
  const positional = run(["nope.json"], repoRoot);
  assert.equal(positional.status, 2);
  assert.equal(JSON.parse(positional.stdout).error.code, "USAGE");
});
