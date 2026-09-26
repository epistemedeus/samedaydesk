import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildCensus,
  evaluateFile,
  invalidFixtureDir,
  runSuite,
  validFixtureDir,
} from "./lib.mjs";
import { runCli } from "./cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");

function spawnCli(args) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env,
    cwd: join(here, "../../.."),
  });
}

function parseOut(stdout) {
  const start = stdout.indexOf("{");
  assert.notEqual(start, -1, stdout);
  return JSON.parse(stdout.slice(start));
}

test("cold census is local, unpaid, and unprobed", async () => {
  const census = await buildCensus();
  assert.equal(census.ok, true, JSON.stringify(census.runtime));
  assert.equal(census.origin, "local-source");
  assert.equal(census.live, false);
  assert.equal(census.payment, false);
  assert.equal(census.neo, false);
  assert.equal(census.publish, false);
  assert.equal(census.probed, false);
  assert.equal(census.moneyMovement, false);
  assert.equal(census.mode, "read_only");
  assert.equal(census.schemaVersion, "samedaydesk.ops.sds-route-census.w7.v1");
  assert.equal(census.counts.total, 44);
  assert.equal(census.counts.readOnly, 32);
  assert.equal(census.counts.api, 20);
  assert.equal(census.counts.spa, 16);
});

test("GET /api/health is read-only against the real health router", async () => {
  const census = await buildCensus();
  const row = census.routes.find((item) => item.key === "GET /api/health");
  assert.ok(row, "missing GET /api/health");
  assert.equal(row.class, "read_only");
  assert.equal(row.readOnly, true);
  assert.equal(row.moneyMovement, false);
  assert.equal(row.probed, false);
  assert.equal(row.file, "server/routes/health.js");
});

test("POST /api/checkout/create-payment-intent cannot be read-only", async () => {
  const census = await buildCensus();
  const row = census.routes.find((item) => item.key === "POST /api/checkout/create-payment-intent");
  assert.ok(row);
  assert.equal(row.class, "payment");
  assert.equal(row.readOnly, false);
  assert.equal(row.moneyMovement, true);
  assert.equal(row.probed, false);
  assert.equal(row.file, "server/routes/checkout.js");
});

test("runtime Express 5 leaves match source", async () => {
  const census = await buildCensus();
  assert.equal(census.runtime.ok, true, JSON.stringify(census.runtime));
  assert.equal(census.runtime.skipped, false);
  assert.equal(census.runtime.checked, 25);
  assert.equal(census.runtime.runtimeLeaves, 25);
  assert.deepEqual(census.runtime.missing, []);
  assert.equal(census.runtime.error, null);
});

test("React history routes match SPA_HISTORY_ROUTES", async () => {
  const census = await buildCensus();
  assert.deepEqual(census.spaDrift, { inReactNotHistory: [], inHistoryNotReact: [] });
});

test("GET /checkout is payment UI, not a read-only API", async () => {
  const census = await buildCensus();
  const row = census.routes.find((item) => item.key === "GET /checkout");
  assert.ok(row);
  assert.equal(row.class, "payment_ui");
  assert.equal(row.readOnly, false);
  assert.equal(row.spa, true);
  assert.equal(census.counts.payment, 5);
  assert.equal(census.counts.paymentUi, 1);
  assert.equal(census.counts.mutating, 5);
  assert.equal(census.counts.webhook, 1);
  assert.equal(census.counts.moneyAdjacent, 12);
});

test("CLI cold census exits 0 with 44 routes", () => {
  const spawned = spawnCli([]);
  assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
  const body = parseOut(spawned.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "census");
  assert.equal(body.origin, "local-source");
  assert.equal(body.live, false);
  assert.equal(body.counts.total, 44);
  assert.equal(body.runtime.checked, 25);
  assert.deepEqual(body.paymentRoutes, [
    "POST /api/checkout/create-payment-intent",
    "POST /api/checkout/prepare-payment",
    "POST /api/checkout/seller-repair-session",
    "POST /api/checkout/verify",
    "POST /api/stripe/webhook",
    "GET /checkout",
  ]);
});

test("seeded payment-as-readonly is rejected", async () => {
  const census = await buildCensus();
  const result = await evaluateFile(join(invalidFixtureDir(), "payment-as-readonly.json"), census);
  assert.equal(result.naiveVerdict, "accept");
  assert.equal(result.honestVerdict, "reject");
  assert.ok(result.codes.includes("payment_as_readonly"));
});

test("CLI --seeded-failure payment-as-readonly exits 1", () => {
  const spawned = spawnCli(["--seeded-failure", "payment-as-readonly"]);
  assert.equal(spawned.status, 1, spawned.stderr + spawned.stdout);
  const body = parseOut(spawned.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.command, "seeded-failure");
  assert.equal(body.seed, "payment-as-readonly");
  assert.equal(body.designated, true);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.result.naiveVerdict, "accept");
  assert.equal(body.result.honestVerdict, "reject");
  assert.deepEqual(body.result.codes, ["payment_as_readonly"]);
  assert.equal(body.result.caught, true);
});

test("CLI --expect-reject payment_as_readonly exits 0", () => {
  const spawned = spawnCli([
    "--expect-reject",
    "payment_as_readonly",
    "tools/ops/sds-route-census-w7/fixtures/invalid/payment-as-readonly.json",
  ]);
  assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
  const body = parseOut(spawned.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.command, "expect-reject");
  assert.equal(body.naiveVerdict, "accept");
  assert.equal(body.honestVerdict, "reject");
  assert.ok(body.codes.includes("payment_as_readonly"));
});

test("CLI --live and --pay are refused with exit 2", () => {
  const live = spawnCli(["--live"]);
  assert.equal(live.status, 2, live.stderr + live.stdout);
  const liveBody = parseOut(live.stdout);
  assert.equal(liveBody.ok, false);
  assert.equal(liveBody.error.code, "REFUSED");
  assert.match(liveBody.error.message, /--live is refused/);

  const pay = spawnCli(["--pay"]);
  assert.equal(pay.status, 2, pay.stderr + pay.stdout);
  const payBody = parseOut(pay.stdout);
  assert.equal(payBody.error.code, "REFUSED");
  assert.match(payBody.error.message, /--pay is refused/);
});

test("CLI --neo is refused", () => {
  const spawned = spawnCli(["--neo"]);
  assert.equal(spawned.status, 2, spawned.stderr + spawned.stdout);
  const body = parseOut(spawned.stdout);
  assert.equal(body.error.code, "REFUSED");
  assert.match(body.error.message, /--neo is refused/);
});

test("fixture suite and honest health claim pass", async () => {
  const suite = await runSuite();
  assert.equal(suite.ok, true, JSON.stringify(suite.results.filter((item) => !item.ok), null, 2));
  assert.equal(suite.passed, 6);
  assert.equal(suite.failed, 0);
  assert.equal(suite.total, 6);
  assert.equal(suite.censusOk, true);

  const census = await buildCensus();
  const health = await evaluateFile(join(validFixtureDir(), "health-readonly.json"), census);
  assert.equal(health.ok, true, JSON.stringify(health));
  assert.equal(health.honestVerdict, "accept");

  const chunks = [];
  const code = await runCli(["--suite"], {
    stdout: { write(chunk) { chunks.push(chunk); return true; } },
  });
  assert.equal(code, 0);
  const body = JSON.parse(chunks.join(""));
  assert.equal(body.ok, true);
  assert.equal(body.passed, 6);
});
