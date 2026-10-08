import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compareAggregates } from "../src/compare.mjs";
import { foundryConnectionMath, readFoundryPools } from "../src/envelope.mjs";
import { quantile } from "../src/metrics.mjs";
import { CORPUS_BODY_BYTES, OFFERED_CLIENTS, WORKLOAD_PLAN, corpusBody, loadPins } from "../src/plan.mjs";
import { rejectSeed } from "../src/reject.mjs";
import { classifyCell } from "../src/status.mjs";

const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

function cell(overrides) {
  return {
    offeredClients: 8,
    acquiredClients: 8,
    refusedClients: 0,
    unknownClients: 0,
    offeredUnits: 8,
    actualUnits: 8,
    leftover: 0,
    badRows: 0,
    accountingMismatch: false,
    errorCodes: {},
    ...overrides,
  };
}

test("offered plan is the four synthetic client counts", () => {
  assert.deepEqual(OFFERED_CLIENTS, [1, 8, 32, 128]);
  assert.deepEqual(WORKLOAD_PLAN.axes, ["concurrency", "corpus", "backlog"]);
  assert.equal(WORKLOAD_PLAN.traffic, "synthetic");
  assert.equal(Buffer.byteLength(corpusBody()), CORPUS_BODY_BYTES);
  const pins = loadPins();
  assert.deepEqual(pins.offeredClients, [1, 8, 32, 128]);
  assert.equal(pins.sds254, "39a1ed7ceff813e9f490bd399fcea30f3451a53b");
  assert.equal(pins.neoReceiver, "1652533b1823ac33b86591ec4e931a8c4ea4aa97");
});

test("classify keeps partial offers limited and full offers qualified", () => {
  assert.equal(classifyCell(cell({})), "qualified");
  assert.equal(classifyCell(cell({
    offeredClients: 32,
    acquiredClients: 21,
    refusedClients: 11,
    offeredUnits: 32,
    actualUnits: 21,
    errorCodes: { "53300": 11 },
  })), "limited");
  assert.equal(classifyCell(cell({
    offeredClients: 32,
    acquiredClients: 21,
    refusedClients: 11,
    offeredUnits: 128,
    actualUnits: 128,
    errorCodes: { "53300": 11 },
  })), "limited");
  assert.equal(classifyCell(cell({
    offeredClients: 32,
    acquiredClients: 21,
    refusedClients: 11,
    offeredUnits: 256,
    actualUnits: 168,
    errorCodes: { "53300": 11 },
  })), "limited");
  assert.equal(classifyCell(cell({ unknownClients: 1, acquiredClients: 7, errorCodes: { "XX000": 1 } })), "failed");
  assert.equal(classifyCell(cell({ acquiredClients: 7, offeredUnits: 8, actualUnits: 8, refusedClients: 0 })), "failed");
  assert.equal(classifyCell(cell({ leftover: 1 })), "failed");
});

test("seeded fixtures are rejected and a blank fixture is not treated as a rejection", () => {
  assert.throws(() => rejectSeed(JSON.parse(readFileSync(fixture("seeded-foreign-database-url.json"), "utf8"))), /external database URL/);
  assert.throws(() => rejectSeed(JSON.parse(readFileSync(fixture("seeded-live-traffic.json"), "utf8"))), /traffic live/);
  assert.throws(() => rejectSeed(JSON.parse(readFileSync(fixture("seeded-incomplete-offered-clients.json"), "utf8"))), /offered client set/);
  assert.throws(() => rejectSeed(JSON.parse(readFileSync(fixture("seeded-empty.json"), "utf8"))), (err) => err.code === "VF17_SEED_MISSED");
});

test("reject-seed command exits 1 for a foreign database URL and does not echo it", () => {
  const foreign = runCli(["reject-seed", "--fixture", fixture("seeded-foreign-database-url.json")]);
  assert.equal(foreign.status, 1, foreign.stderr);
  assert.match(foreign.stdout, /rejected seeded fixture: external database URL/);
  assert.equal(foreign.stdout.includes("example.invalid"), false);
  const live = runCli(["reject-seed", "--fixture", fixture("seeded-live-traffic.json")]);
  assert.equal(live.status, 1, live.stderr);
  assert.match(live.stdout, /traffic live/);
  const shortened = runCli(["reject-seed", "--fixture", fixture("seeded-incomplete-offered-clients.json")]);
  assert.equal(shortened.status, 1, shortened.stderr);
  const empty = runCli(["reject-seed", "--fixture", fixture("seeded-empty.json")]);
  assert.equal(empty.status, 2, empty.stdout + empty.stderr);
});

test("incomplete aggregate comparison is refused", () => {
  const current = JSON.parse(readFileSync(fixture("seeded-incomplete-aggregate.json"), "utf8"));
  const baseline = {
    status: "complete",
    workloadPlan: WORKLOAD_PLAN,
    cells: [{ axis: "concurrency", offeredClients: 1 }],
  };
  assert.equal(compareAggregates(baseline, current).status, "incomparable-workload-plan");
  assert.equal(compareAggregates({ status: "failed" }, { status: "failed" }).status, "incomplete-run");
});

test("cited foundry envelope matches the receiving owner pins", () => {
  const math = foundryConnectionMath(readFoundryPools());
  assert.deepEqual(math.pools, { entry: 2, workCells: 2, integration: 2, worker: 2, baseMax: 4 });
  assert.equal(math.oneWebPlusWorker, 10);
  assert.equal(math.twoWebAtBaseMax, 20);
  assert.equal(math.twoWebAtBaseMaxPlusWorker, 22);
  assert.equal(math.connectionEnvelope, 24);
});

test("quantile uses the VF11 nearest rank and harness source does not consume a database URL", () => {
  assert.equal(quantile([10, 20, 30], 0.5), 20);
  assert.equal(quantile([], 0.95), null);
  const src = fileURLToPath(new URL("../src", import.meta.url));
  for (const name of readdirSync(src)) {
    const text = readFileSync(`${src}/${name}`, "utf8");
    assert.equal(text.includes("process.env.DATABASE_URL"), false, name);
    assert.equal(text.includes("process.env.CORRESPONDENCE_DATABASE_URL"), false, name);
  }
  const digest = createHash("sha256").update(corpusBody()).digest("hex");
  assert.equal(digest.length, 64);
});
