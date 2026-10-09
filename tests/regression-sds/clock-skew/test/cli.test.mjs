import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(PACK, "run.mjs");

function run(args, { timeout = 60_000 } = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    cwd: PACK,
    timeout,
  });
}

test("CLI --help exits 0 without network", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sds-regression-clock-skew/);
  assert.match(result.stdout, /Does not pay/);
});

test("CLI --seeded-failure list names future-as-ok", () => {
  const result = run(["--seeded-failure", "list"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.mode, "seeded-failure-list");
  assert.ok(body.ids.includes("future-as-ok"));
});

test("CLI refuses --checkout", () => {
  const result = run(["--checkout"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
});

test("CLI refuses --pay", () => {
  const result = run(["--pay"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
});

test("CLI refuses --payment=1 as payment-forbidden, not unknown option", () => {
  const result = run(["--payment=1"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
  assert.match(body.error.message, /--payment=1/);
});

test("CLI refuses --publish=registry", () => {
  const result = run(["--publish=registry"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "payment-forbidden");
});

test("CLI seeded future-as-ok is refused", () => {
  const result = run(["--seeded-failure", "future-as-ok"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.rejected, true);
  assert.equal(body.code, "future_skew_not_ok");
  assert.equal(body.engineState, "invalid");
  assert.equal(body.naiveState, "ok");
});

test("CLI --seeded-failure without id is usage", () => {
  const result = run(["--seeded-failure"]);
  assert.equal(result.status, 2, result.stderr);
  const body = JSON.parse(result.stderr);
  assert.equal(body.error.code, "usage");
  assert.match(body.error.message, /missing --seeded-failure id/);
});

test("CLI cold run pins market-obs 1h boundary and published windows", () => {
  const result = run(["cold"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.caseCount, 15);
  assert.equal(body.invariants.windowsMatchPublished, true);
  assert.equal(body.invariants.requiredCasesPresent, true);
  assert.equal(body.invariants.marketObsBoundaryOk, true);
  const byId = Object.fromEntries(body.cases.map((item) => [item.id, item]));
  assert.equal(byId["stale-market-obs-boundary"].marketObsState, "ok");
  assert.equal(byId["stale-market-obs-just-stale"].marketObsState, "stale");
  assert.equal(byId["stale-market-obs-just-stale"].observatoryState, "ok");
});

test("CLI seeded market-obs-boundary-as-stale is refused", () => {
  const result = run(["--seeded-failure", "market-obs-boundary-as-stale"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.rejected, true);
  assert.equal(body.code, "market_obs_boundary_not_stale");
  assert.equal(body.engineMarketObsState, "ok");
  assert.equal(body.naiveMarketObsState, "stale");
});
