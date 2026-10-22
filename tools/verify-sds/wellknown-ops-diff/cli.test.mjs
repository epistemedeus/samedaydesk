import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMPACT_TRACKER,
  COMPACT_WELLKNOWN,
  DEFAULT_TRACKER_ARTIFACT,
  DEFAULT_WELLKNOWN_ARTIFACT,
  EXPECTED_TRACKER_COUNT,
  EXPECTED_TRACKER_PATHS,
  EXPECTED_WELLKNOWN_COUNT,
  FORBIDDEN_OUTPUT_FIELDS,
  loadTracker,
  loadWellKnown,
  opsFromWellKnown,
  outputTouchesForbidden,
  routesFromTracker,
} from "./lib/catalog.mjs";
import { runDiff } from "./lib/diff.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const cli = join(here, "cli.mjs");
const harness = join(here, "run-harness.mjs");

function runCli(args, { cwd = repoRoot } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
  });
  let json = null;
  const stdout = result.stdout || "";
  const line = stdout.trim().split("\n").find((row) => row.startsWith("{"));
  if (line) json = JSON.parse(line);
  return { ...result, json };
}

test("real well-known artifact has 23 ops and no payment terms in the compact pin", () => {
  const wellKnown = loadWellKnown(DEFAULT_WELLKNOWN_ARTIFACT);
  assert.equal(wellKnown.ops.length, EXPECTED_WELLKNOWN_COUNT);
  const compact = loadWellKnown(COMPACT_WELLKNOWN);
  assert.equal(compact.ops.length, EXPECTED_WELLKNOWN_COUNT);
  assert.deepEqual(
    wellKnown.ops.map((op) => `${op.method} ${op.path}`),
    compact.ops.map((op) => `${op.method} ${op.path}`),
  );
  assert.equal(outputTouchesForbidden(compact.ops).length, 0);
});

test("real tracker artifact has the eight SDS routes", () => {
  const tracker = loadTracker(DEFAULT_TRACKER_ARTIFACT);
  assert.equal(tracker.routes.length, EXPECTED_TRACKER_COUNT);
  assert.deepEqual(tracker.routes.map((row) => row.path), [...EXPECTED_TRACKER_PATHS]);
  const compact = loadTracker(COMPACT_TRACKER);
  assert.deepEqual(compact.routes.map((row) => row.path), [...EXPECTED_TRACKER_PATHS]);
});

test("cold diff of real artifacts is 8 vs 23 with settlement-proof untracked", () => {
  const report = runDiff({
    wellKnown: loadWellKnown(DEFAULT_WELLKNOWN_ARTIFACT),
    tracker: loadTracker(DEFAULT_TRACKER_ARTIFACT),
  });
  assert.equal(report.ok, true, report.reasons.join(","));
  assert.equal(report.aligned, false);
  assert.equal(report.catalogAbsenceIsDemand, false);
  assert.equal(report.wellKnownCount, 23);
  assert.equal(report.trackerCount, 8);
  assert.equal(report.trackerOnlyCount, 0);
  assert.ok(report.wellKnownOnlyPathCount >= 15);
  assert.ok(report.wellKnownOnlyPaths.includes("/commerce/settlement-proof"));
  assert.ok(report.wellKnownOnlyPaths.includes("/security/wallet-policy-conformance"));
  assert.equal(outputTouchesForbidden(report).length, 0);
  for (const field of FORBIDDEN_OUTPUT_FIELDS) {
    assert.equal(JSON.stringify(report).includes(`"${field}"`), false, field);
  }
});

test("CLI cold diff against real artifacts exits 0", () => {
  const result = runCli(["diff", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.feature, "wellknown-ops-diff");
  assert.equal(result.json.boundary.paymentSent, false);
  assert.equal(result.json.boundary.liveFetch, false);
  assert.equal(result.json.result.wellKnownCount, 23);
  assert.equal(result.json.result.trackerCount, 8);
  assert.equal(result.json.result.aligned, false);
  assert.equal(result.json.result.catalogAbsenceIsDemand, false);
  assert.match(result.json.result.wellKnownSource, /fixtures\/presence\/catalog\/x402\.json/);
  assert.match(result.json.result.trackerSource, /data\/bazaar-tracker\/observations\.json/);
});

test("bare CLI invocation is the same cold diff", () => {
  const result = runCli(["--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.json.command, "diff");
  assert.equal(result.json.result.trackerCount, 8);
});

test("seeded claim-match is rejected", () => {
  const result = runCli(["--seeded-failure", "claim-match", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "CLAIM_ALIGNED");
  assert.equal(result.json.result.refused, true);
  assert.equal(result.json.result.aligned, false);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("seeded absence-as-demand is rejected", () => {
  const result = runCli(["--seeded-failure", "absence-as-demand", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "ABSENCE_IS_NOT_DEMAND");
  assert.equal(result.json.result.catalogAbsenceIsDemand, false);
  assert.equal(result.json.result.treatAbsenceAsDemand, false);
});

test("seeded ghost-tracker route is rejected", () => {
  const result = runCli(["--seeded-failure", "ghost-tracker", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.error.code, "GHOST_TRACKER_ROUTE");
  const ghosts = result.json.result.trackerOnly.map((row) => row.path);
  assert.ok(ghosts.includes("/invented-ghost-op"));
  assert.equal(result.json.result.inWellKnown, false);
});

test("seeded --live is refused with exit 2", () => {
  const liveFlag = runCli(["--live", "--json"]);
  assert.equal(liveFlag.status, 2, liveFlag.stderr);
  assert.equal(liveFlag.json.error.code, "LIVE_REFUSE");
  assert.equal(liveFlag.json.boundary.liveFetch, false);
  assert.equal(liveFlag.json.boundary.cdpCalled, false);

  const liveSeed = runCli(["--seeded-failure", "live", "--json"]);
  assert.equal(liveSeed.status, 2, liveSeed.stderr);
  assert.equal(liveSeed.json.error.code, "LIVE_REFUSE");
});

test("seeded payment-signature is refused", () => {
  const result = runCli(["--seeded-failure", "payment-signature", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.error.code, "PAYMENT_HEADER_REFUSE");
  assert.equal(result.json.result.headerNeverSent, true);
  assert.equal(result.json.boundary.paymentSent, false);
});

test("--claim absence-as-demand fixture fails the real-artifact diff", () => {
  const result = runCli([
    "diff",
    "--json",
    "--claim",
    "tools/verify-sds/wellknown-ops-diff/fixtures/seeded/absence-as-demand.json",
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.json.ok, false);
  assert.ok(result.json.result.reasons.some((row) => /treat_absence_as_demand/.test(row)));
});

test("run-harness exits 0 after cold diff plus seeded refuses", () => {
  const result = spawnSync(process.execPath, [harness], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout.trim().split("\n").find((row) => row.startsWith("{")));
  assert.equal(json.ok, true);
  assert.equal(json.result.diffOk, true);
  assert.equal(json.result.seedsOk, true);
  assert.equal(json.boundary.paymentSent, false);
});

test("compact and live parsers accept both x402 items and observation records", () => {
  const fromItems = opsFromWellKnown(JSON.parse(
    JSON.stringify({ items: [{ request: { method: "GET", url: "https://agents.samedaydesk.com/extract" }, resource: { routeTemplate: "/extract" } }] }),
  ));
  assert.equal(fromItems[0].path, "/extract");
  const fromObs = routesFromTracker({
    sources: {
      "cdp-discovery": {
        sellers: {
          samedaydesk: {
            routes: { "https://agents.samedaydesk.com/extract": { digest: "abc" } },
          },
        },
      },
    },
  });
  assert.equal(fromObs[0].path, "/extract");
});
