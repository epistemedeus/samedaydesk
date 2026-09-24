import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_COLD_CASE,
  REPO_ROOT,
  SEEDED_FAILURE,
  designatedSeedPath,
  diffBazaarToOrigin,
  evaluateCold,
  evaluateFile,
  evaluateSeededFailure,
  loadBazaarPin,
  loadCatalog,
  loadJson,
  loadOriginPin,
  loadRepoAgent402ReadConflict,
  loadRepoBazaarListings,
  loadRepoOriginOps,
  loadRepoSdsObservation,
  naiveVerdict,
  resolveReadable,
  runSuite,
} from "./lib.mjs";
import { atomicToDecimal, decimalToAtomic } from "./money.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const catalog = loadCatalog();

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
}

test("USDC six-decimal roundtrip matches SDS pins", () => {
  assert.equal(decimalToAtomic("0.005"), "5000");
  assert.equal(decimalToAtomic("0.05"), "50000");
  assert.equal(decimalToAtomic("0.2"), "200000");
  assert.equal(decimalToAtomic("0.25"), "250000");
  assert.equal(decimalToAtomic("0.01"), "10000");
  assert.equal(decimalToAtomic("0.002"), "2000");
  assert.equal(atomicToDecimal("5000"), "0.005");
  assert.equal(atomicToDecimal("50000"), "0.05");
});

test("bundled pins match committed origin table, bazaar merchant, and SDS observation", () => {
  const originPin = loadOriginPin();
  const bazaarPin = loadBazaarPin();
  const repoOps = loadRepoOriginOps();
  const repoListings = loadRepoBazaarListings();
  const observation = loadRepoSdsObservation();
  const agent402 = loadRepoAgent402ReadConflict();

  assert.equal(originPin.paidOperationCount, 25);
  assert.equal(originPin.operations.length, 25);
  assert.equal(repoOps.length, 25);
  assert.equal(bazaarPin.listings.length, 8);
  assert.equal(repoListings.length, 8);
  assert.equal(observation.rowCount, 8);
  assert.equal(agent402.priceConflict, true);

  const readOrigin = originPin.operations.find((op) => op.route === "/read");
  const readBazaar = bazaarPin.listings.find((row) => row.route === "/read");
  assert.equal(readOrigin.amount, "0.005");
  assert.equal(readOrigin.amountAtomic, "5000");
  assert.equal(readBazaar.amount, "0.05");
  assert.equal(readBazaar.amountAtomic, "50000");
  assert.equal(repoListings.find((row) => row.route === "/read").amountAtomic, "50000");
  assert.equal(repoOps.find((op) => op.route === "/read" && op.method === "GET").amount, "0.005");
});

test("diff reports GET /read amount drift and live-untracked settlement-proof", () => {
  const diff = diffBazaarToOrigin(loadBazaarPin(), loadOriginPin());
  assert.equal(diff.bazaarSdsRouteCount, 8);
  assert.equal(diff.originPaidOpCount, 25);
  assert.equal(diff.priceConflicts.length, 1);
  assert.deepEqual(
    {
      method: diff.priceConflicts[0].method,
      route: diff.priceConflicts[0].route,
      originAmount: diff.priceConflicts[0].originAmount,
      bazaarAmount: diff.priceConflicts[0].bazaarAmount,
      originAtomic: diff.priceConflicts[0].originAtomic,
      bazaarAtomic: diff.priceConflicts[0].bazaarAtomic,
    },
    {
      method: "GET",
      route: "/read",
      originAmount: "0.005",
      bazaarAmount: "0.05",
      originAtomic: "5000",
      bazaarAtomic: "50000",
    },
  );
  assert.equal(
    diff.liveUntracked.some((row) => row.method === "GET" && row.route === "/commerce/settlement-proof"),
    true,
  );
  assert.equal(
    diff.liveUntracked.some((row) => row.method === "GET" && row.route === "/commerce/seller-integrity-audit"),
    true,
  );
  assert.equal(diff.liveUntracked.every((row) => row.buyerDemand === false), true);
});

test("cold committed case holds on /read and does not rematerialize or pay", () => {
  const result = evaluateCold();
  assert.equal(result.ok, true);
  assert.equal(result.decision, "hold");
  assert.equal(result.code, "bazaar_price_conflict");
  assert.equal(result.rematerialized, false);
  assert.equal(result.liveSdsPricesUnchanged, true);
  assert.equal(result.paid, false);
  assert.equal(result.paymentSent, false);
  assert.equal(result.catalogAbsenceIsDemand, false);
  assert.equal(result.liveCdp, false);
  assert.equal(result.bazaarSdsRouteCount, 8);
  assert.equal(result.originPaidOpCount, 25);
  assert.equal(result.receipt.route, "/read");
  assert.equal(result.receipt.originAmount, "0.005");
  assert.equal(result.receipt.bazaarAmount, "0.05");
  assert.equal(result.artifacts.agent402ReadConflict.priceConflict, true);
});

test("seeded rematerialized-read is naive-accept honest-reject", () => {
  const seed = evaluateSeededFailure();
  assert.equal(seed.caught, true);
  assert.equal(seed.ok, false);
  assert.equal(seed.error.code, "SEED_REJECT");
  assert.equal(seed.result.naiveVerdict, "accept");
  assert.equal(seed.result.honestVerdict, "reject");
  assert.equal(seed.result.codes.includes("rematerialized_claim"), true);
  assert.equal(seed.result.rematerialized, false);
  assert.equal(seed.result.liveSdsPricesUnchanged, true);
  assert.equal(seed.result.priceConflicts[0].bazaarAtomic, "50000");
  const input = loadJson(designatedSeedPath());
  assert.equal(naiveVerdict(input), "accept");
  assert.equal(input.claims.rematerialized, true);
});

test("suite holds the cold case and rejects every seeded fixture", () => {
  const report = runSuite();
  assert.equal(report.ok, true, JSON.stringify(report.results.filter((item) => !item.ok), null, 2));
  assert.equal(report.total, 8);
});

test("CLI --cold exits 0 and quotes GET /read 0.05 vs 0.005", () => {
  const proc = runCli(["--cold", "--pretty"]);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "cold");
  assert.equal(body.decision, "hold");
  assert.equal(body.code, "bazaar_price_conflict");
  assert.equal(body.priceConflicts[0].route, "/read");
  assert.equal(body.priceConflicts[0].bazaarAmount, "0.05");
  assert.equal(body.priceConflicts[0].originAmount, "0.005");
  assert.equal(body.rematerialized, false);
  assert.equal(body.paid, false);
  assert.equal(body.bazaarSdsRouteCount, 8);
  assert.equal(body.originPaidOpCount, 25);
});

test("CLI --from-repo matches --cold against the same committed artifacts", () => {
  const proc = runCli(["--from-repo", "--pretty"]);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.command, "from-repo");
  assert.equal(body.artifacts.originTable, "docs/lqdist1-distribution-audit/per-route-table.json");
  assert.equal(body.artifacts.bazaarMerchant, "fixtures/presence/listings/bazaar-merchant.json");
  assert.equal(body.artifacts.observation, "data/bazaar-tracker/observations.json");
  assert.equal(body.priceConflicts[0].bazaarAtomic, "50000");
});

test("CLI --seeded-failure rematerialized-read exits 1", () => {
  const proc = runCli(["--seeded-failure", SEEDED_FAILURE, "--pretty"]);
  assert.equal(proc.status, 1, proc.stderr || proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.caught, true);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.equal(body.result.codes.includes("rematerialized_claim"), true);
  assert.equal(body.result.liveSdsPricesUnchanged, true);
  assert.equal(body.result.rematerialized, false);
  assert.equal(
    body.result.file,
    "tools/commerce-receipts/bazaar-drift/fixtures/reject/rematerialized-read.json",
  );
  const alias = runCli(["--seeded-failure", "read-claimed-match"]);
  assert.equal(alias.status, 1, alias.stderr || alias.stdout);
  assert.equal(JSON.parse(alias.stdout).error.code, "SEED_REJECT");
});

test("CLI --live and --pay are refused with exit 2", () => {
  for (const flag of ["--live", "--pay", "--publish", "--rematerialize", "--checkout", "--neo-kernel-vendor"]) {
    const proc = runCli([flag]);
    assert.equal(proc.status, 2, flag);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "REFUSED");
    assert.equal(body.rematerialized, false);
    assert.equal(body.liveSdsPricesUnchanged, true);
  }
});

test("CLI --expect-reject catches rewrite-origin and absence-as-demand", () => {
  const rewrite = runCli([
    "--case",
    "tools/commerce-receipts/bazaar-drift/fixtures/reject/rewrite-origin.json",
    "--expect-reject",
    "edit_live_prices",
    "--pretty",
  ]);
  assert.equal(rewrite.status, 0, rewrite.stderr || rewrite.stdout);
  const absence = runCli([
    "--case",
    "tools/commerce-receipts/bazaar-drift/fixtures/reject/absence-as-demand.json",
    "--expect-reject",
    "treat_absence_as_demand",
  ]);
  assert.equal(absence.status, 0, absence.stderr || absence.stdout);
});

test("float-money and paid-as-unpaid fixtures fail closed", () => {
  const floatCase = evaluateFile(join(here, "fixtures/reject/float-money.json"));
  assert.equal(floatCase.ok, false);
  assert.equal(floatCase.codes.includes("float_money"), true);
  const paid = evaluateFile(join(here, "fixtures/reject/paid-as-unpaid.json"));
  assert.equal(paid.ok, false);
  assert.equal(paid.codes.includes("paid_as_unpaid"), true);
  const clock = evaluateFile(join(here, "fixtures/reject/lastCalledAt-removal.json"));
  assert.equal(clock.ok, false);
  assert.equal(clock.codes.includes("last_called_at_is_not_a_clock"), true);
});

test("catalog designated seed and cold case paths exist", () => {
  assert.equal(catalog.designatedSeed.id, SEEDED_FAILURE);
  assert.equal(catalog.designatedSeed.code, "rematerialized_claim");
  assert.equal(loadJson(DEFAULT_COLD_CASE).caseId, "cold-committed");
  assert.equal(loadJson(designatedSeedPath()).caseId, "rematerialized-read");
});

test("an accepted cold case is not a caught seeded failure", () => {
  const seed = evaluateSeededFailure({
    ...catalog,
    designatedSeed: { ...catalog.designatedSeed, file: "cases/cold-committed.json" },
  });
  assert.equal(seed.caught, false);
  assert.equal(seed.error.code, "SEED_ACCEPTED");
});

test("CLI --case from another cwd exports the repository path", () => {
  const tmp = mkdtempSync(join(tmpdir(), "bazaar-cwd-"));
  const file = "tools/commerce-receipts/bazaar-drift/fixtures/reject/rewrite-origin.json";
  const proc = spawnSync(process.execPath, [cli, "--case", file], {
    cwd: tmp,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(proc.status, 1, proc.stderr || proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.codes.includes("edit_live_prices"), true);
  assert.equal(body.filePath, file);
  assert.equal(realpathSync(resolve(REPO_ROOT, body.filePath)), realpathSync(join(REPO_ROOT, file)));
  assert.equal(existsSync(resolve(tmp, body.filePath)), false);
  assert.equal(String(body.filePath).startsWith(tmp), false);
});

test("relative ../outside.json is rejected even when the file exists", () => {
  const outside = resolve(REPO_ROOT, "../outside.json");
  writeFileSync(outside, readFileSync(DEFAULT_COLD_CASE));
  try {
    assert.equal(existsSync(outside), true);
    assert.throws(
      () => resolveReadable("../outside.json"),
      (err) => {
        assert.equal(err.code, "PATH_OUTSIDE_REPO");
        return true;
      },
    );
    const proc = runCli(["--case", "../outside.json"]);
    assert.notEqual(proc.status, 0, proc.stdout);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "PATH_OUTSIDE_REPO");
    assert.notEqual(body.decision, "hold");
    assert.notEqual(body.caseId, "cold-committed");
    assert.equal(proc.stdout.includes(outside), false);
  } finally {
    rmSync(outside, { force: true });
  }
});

test("caller cwd shadow case.json is not read", () => {
  const tmp = mkdtempSync(join(tmpdir(), "bazaar-shadow-"));
  const shadow = join(tmp, "case.json");
  writeFileSync(shadow, readFileSync(DEFAULT_COLD_CASE));
  try {
    assert.equal(existsSync(join(REPO_ROOT, "case.json")), false);
    assert.equal(resolveReadable("case.json"), resolve(REPO_ROOT, "case.json"));
    const proc = spawnSync(process.execPath, [cli, "--case", "case.json"], {
      cwd: tmp,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.notEqual(proc.status, 0, proc.stdout);
    const body = JSON.parse(proc.stdout);
    assert.equal(body.ok, false);
    assert.notEqual(body.decision, "hold");
    assert.notEqual(body.caseId, "cold-committed");
    assert.equal(String(body.filePath).startsWith(tmp), false);
    assert.equal(proc.stdout.includes(tmp), false);
    assert.equal(resolveReadable("/etc/hosts"), "/etc/hosts");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("missing case and unknown flag are non-zero", () => {
  const missing = runCli(["--case", "tools/commerce-receipts/bazaar-drift/fixtures/reject/nope.json"]);
  assert.equal(missing.status, 1, missing.stderr || missing.stdout);
  assert.equal(JSON.parse(missing.stdout).code, "invalid_json");
  const unknown = runCli(["--not-a-real-flag"]);
  assert.equal(unknown.status, 2, unknown.stderr || unknown.stdout);
  const none = runCli([]);
  assert.equal(none.status, 2);
});

test("foreign-origin bazaar pin is not joined as SameDayDesk", () => {
  const pin = structuredClone(loadBazaarPin());
  pin.listings = pin.listings.map((row) =>
    row.route === "/read" ? { ...row, resource: "https://evil.example/read" } : row,
  );
  const result = evaluateCold({ bazaarPin: pin });
  assert.equal(result.ok, false);
  assert.equal(result.codes.includes("foreign_origin"), true);
});
