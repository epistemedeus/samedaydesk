import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EXPECTED_ROUTES, PIN, SEEDED_FAILURE, UNIQUE_AMOUNTS } from "./lib/pin.mjs";
import { atomicToDisplay } from "./lib/catalog.mjs";
import { naiveVerdict } from "./lib/evaluate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const cli = join(here, "cli.mjs");

function parseJsonOutput(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  return JSON.parse(text.slice(start));
}

function runCli(args) {
  const ran = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: root,
    env: process.env,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: ran.status,
    stdout: ran.stdout || "",
    stderr: ran.stderr || "",
    json: parseJsonOutput(ran.stdout),
  };
}

test("atomic display conversion is six-decimal USDC", () => {
  assert.equal(atomicToDisplay("2000"), "0.002");
  assert.equal(atomicToDisplay("5000"), "0.005");
  assert.equal(atomicToDisplay("10000"), "0.01");
  assert.equal(atomicToDisplay("250000"), "0.25");
  assert.equal(EXPECTED_ROUTES.length, PIN.catalogItemCount);
  assert.equal(UNIQUE_AMOUNTS.length, PIN.uniqueAmountCount);
});

test("naive verdict accepts any unpaid statusClass", () => {
  assert.equal(naiveVerdict({ statusClass: "unpaid", amountAtomic: "50000" }), "accept");
});

test("cold run exit 0 against in-tree x402.json", () => {
  const ran = runCli(["--cold"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.catalogItems, 23);
  assert.equal(ran.json?.result?.pinMatch, true);
  assert.equal(ran.json?.result?.liveSdsPricesUnchanged, true);
  assert.equal(ran.json?.result?.uniqueAmounts?.length, 8);
  assert.equal(ran.json?.result?.knownStaleCaught, true);
  assert.equal(ran.json?.result?.bazaar?.stale >= 1, true);
  const readStale = ran.json.result.bazaar.staleListings.find(
    (item) => item.route === "/read" && item.listedAmountAtomic === "50000",
  );
  assert.ok(readStale, "real bazaar /read 50000 must be reported");
  assert.equal(readStale.catalogAmountAtomic, "5000");
  assert.equal(ran.json?.boundary?.paymentSent, false);
  assert.equal(ran.json?.boundary?.published, false);
  assert.equal(ran.json?.boundary?.neoAttached, false);
  assert.equal(ran.json?.boundary?.live, false);
});

test("default argv is cold", () => {
  const ran = runCli([]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.command, "cold");
  assert.equal(ran.json?.ok, true);
});

test("seeded stale-listed-amount exit 1 SEED_REJECT", () => {
  const ran = runCli(["--seeded-failure", SEEDED_FAILURE]);
  assert.equal(ran.status, 1, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, false);
  assert.equal(ran.json?.error?.code, "SEED_REJECT");
  assert.equal(ran.json?.result?.naiveVerdict, "accept");
  assert.equal(ran.json?.result?.honestVerdict, "reject");
  assert.equal(ran.json?.result?.caught, true);
  assert.equal(ran.json?.result?.remappedFromNaiveAccept, true);
  assert.ok(ran.json?.result?.codes?.includes("stale_listed_amount"));
  assert.equal(ran.json?.result?.route, "/read");
  assert.equal(ran.json?.result?.amountAtomic, "50000");
});

test("valid extract fixture exit 0", () => {
  const ran = runCli([
    "tools/verify-sds/w1041-402-matrix/fixtures/ok/unpaid-402-extract-5000.json",
  ]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.results?.[0]?.honestVerdict, "accept");
});

test("expect-reject stale_listed_amount on designated seed", () => {
  const ran = runCli([
    "--expect-reject",
    "stale_listed_amount",
    "tools/verify-sds/w1041-402-matrix/fixtures/seeded/stale-listed-amount.json",
  ]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.naiveVerdict, "accept");
  assert.equal(ran.json?.result?.honestVerdict, "reject");
});

test("wrong-units seed is rejected", () => {
  const ran = runCli(["--seeded-failure", "wrong-units"]);
  assert.equal(ran.status, 1);
  assert.ok(ran.json?.result?.codes?.includes("wrong_units"));
  assert.equal(ran.json?.result?.naiveVerdict, "accept");
});

test("paid-as-unpaid seed is rejected", () => {
  const ran = runCli(["--seeded-failure", "paid-as-unpaid"]);
  assert.equal(ran.status, 1);
  assert.ok(ran.json?.result?.codes?.includes("paid_as_unpaid"));
});

test("extract amount drift is amount_mismatch not stale_listed_amount", () => {
  const ran = runCli(["--seeded-failure", "extract-amount-drift"]);
  assert.equal(ran.status, 1);
  assert.ok(ran.json?.result?.codes?.includes("amount_mismatch"));
  assert.equal(ran.json?.result?.codes?.includes("stale_listed_amount"), false);
});

test("refuses --pay --neo --live --publish", () => {
  for (const flag of ["--pay", "--neo", "--live", "--publish"]) {
    const ran = runCli([flag, "--cold"]);
    assert.equal(ran.status, 2, flag);
    assert.equal(ran.json?.error?.code, "REFUSED");
  }
});

test("suite accepts generated catalog 402s and rejects seeds", () => {
  const ran = runCli(["--suite"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.generated, 23);
  assert.ok(ran.json?.result?.total >= 23 + 3 + 6);
});

test("harness run exit 0 coldOk+seedsOk", () => {
  const ran = runCli(["run"]);
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  assert.equal(ran.json?.ok, true);
  assert.equal(ran.json?.result?.coldOk, true);
  assert.equal(ran.json?.result?.seedsOk, true);
});
