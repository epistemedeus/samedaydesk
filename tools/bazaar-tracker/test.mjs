import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  createFixtureFetch,
  diffSnapshots,
  editSnapshot,
  flattenComparable,
  loadCohort,
  matchesSeller,
  previousSnapshotPath,
  readChangelog,
  readSnapshot,
  runTracker,
  snapshotFromRows,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");
const fixturePath = join(here, "fixtures/search.json");
const cohort = loadCohort();

function tempDataDir() {
  return mkdtempSync(join(tmpdir(), "bazaar-tracker-"));
}

const baselineRow = {
  seller: "GBLIN",
  sellerId: "gblin",
  resource: "https://gblin.digital/api/x402/attestation",
  type: "http",
  x402Version: 2,
  description: "EIP-712-signed risk attestation",
  accepts: [{ scheme: "exact", amount: "3000", network: "eip155:8453" }],
  extensions: {
    bazaar: {
      schema: { properties: { output: { required: ["type"] } } },
    },
  },
  lastUpdated: "2026-08-30T16:48:56.745Z",
  quality: { l30DaysTotalCalls: 9 },
};

test("cohort names every repaired-seller plus SameDayDesk hosts", () => {
  assert.deepEqual(
    cohort.sellers.map((seller) => seller.name),
    [
      "GBLIN",
      "LoyalSpark",
      "Palmyr",
      "ArgonautWorks",
      "AgentServices",
      "The Stall",
      "KR-DART",
      "402.com.tr",
      "Grey Ridge",
      "AgentToll",
      "SameDayDesk",
    ],
  );
  const hosts = cohort.sellers.flatMap((seller) => seller.hosts);
  for (const host of [
    "gblin.digital",
    "api.loyalspark.online",
    "palmyr.ai",
    "official-fx-reference.vercel.app",
    "api.agentservices.to",
    "the-stall.intuitek.ai",
    "dartapi.ljaysk.com",
    "402.com.tr",
    "api.greyridgesignals.ai",
    "agenttoll.app",
    "agents.samedaydesk.com",
  ]) {
    assert.ok(hosts.includes(host), host);
  }
});

test("matches only the seller host, not a lookalike path", () => {
  const gblin = cohort.sellers.find((seller) => seller.id === "gblin");
  assert.equal(matchesSeller("https://gblin.digital/api/x402/attestation", gblin), true);
  assert.equal(matchesSeller("https://gblin-sentinel.vercel.app/api/data/gblin-analytics", gblin), false);
});

test("flattenComparable skips lastUpdated and quality", () => {
  const flat = flattenComparable(baselineRow);
  assert.equal(flat.description, "EIP-712-signed risk attestation");
  assert.equal(flat["accepts.0.amount"], "3000");
  assert.equal(flat["extensions.bazaar.schema.properties.output.required.0"], "type");
  assert.equal(Object.hasOwn(flat, "lastUpdated"), false);
  assert.equal(Object.hasOwn(flat, "quality.l30DaysTotalCalls"), false);
});

test("diffSnapshots reports route, field, before, after, observedAt", () => {
  const observedAt = "2026-09-03T10:00:00.000Z";
  const previous = snapshotFromRows([baselineRow], { observedAt: "2026-09-01T00:00:00.000Z" });
  const current = snapshotFromRows(
    [
      {
        ...baselineRow,
        description: "rematerialized attestation contract",
        accepts: [{ scheme: "exact", amount: "4000", network: "eip155:8453" }],
        extensions: {
          bazaar: {
            schema: { properties: { output: { required: ["type", "example"] } } },
          },
        },
        lastUpdated: "2026-09-03T09:00:00.000Z",
        quality: { l30DaysTotalCalls: 99 },
      },
      {
        seller: "SameDayDesk",
        sellerId: "samedaydesk",
        resource: "https://agents.samedaydesk.com/extract",
        type: "http",
        x402Version: 2,
        description: "Extract a public page",
        accepts: [{ scheme: "exact", amount: "10000" }],
        extensions: null,
        lastUpdated: null,
        quality: null,
      },
    ],
    { observedAt },
  );

  const changes = diffSnapshots(previous, current, observedAt);
  assert.deepEqual(
    changes.map((row) => row.field).sort(),
    [
      "accepts.0.amount",
      "description",
      "extensions.bazaar.schema.properties.output.required.1",
      "resource",
    ],
  );
  const amount = changes.find((row) => row.field === "accepts.0.amount");
  assert.deepEqual(amount, {
    route: baselineRow.resource,
    field: "accepts.0.amount",
    before: "3000",
    after: "4000",
    observedAt,
  });
  const added = changes.find((row) => row.field === "resource");
  assert.equal(added.before, null);
  assert.equal(added.after, "https://agents.samedaydesk.com/extract");
  assert.ok(!changes.some((row) => row.field.startsWith("lastUpdated") || row.field.startsWith("quality")));
});

test("first snapshot writes and a second run against a synthetically edited snapshot reports the diff", async () => {
  const dataDir = tempDataDir();
  try {
    const fetchImpl = createFixtureFetch(JSON.parse(readFileSync(fixturePath, "utf8")));
    const first = await runTracker({
      cohort,
      dataDir,
      fetchImpl,
      observedAt: "2026-09-03T09:00:00.000Z",
      source: "fixture",
    });
    assert.equal(first.ok, true);
    assert.equal(first.changeCount, 0);
    assert.equal(first.previousSnapshotPath, null);
    assert.ok(first.rowCount >= 3);
    assert.equal(readChangelog(dataDir).length, 0);
    const written = readSnapshot(first.snapshotPath);
    assert.equal(written.rows.some((row) => row.resource.includes("gblin.digital")), true);
    assert.equal(written.rows.some((row) => row.resource.includes("loyalspark.online/x402-gateway/offers")), true);

    const edited = editSnapshot(written, (snapshot) => {
      const attestation = snapshot.rows.find((row) => row.resource.endsWith("/attestation"));
      attestation.description = "synthetically rematerialized output schema";
      attestation.accepts[0].amount = "9999";
      snapshot.rows = snapshot.rows.filter((row) => !row.resource.endsWith("/extract"));
      snapshot.rows.push({
        seller: "402.com.tr",
        sellerId: "402-com-tr",
        resource: "https://402.com.tr/api/x402/morpho-health",
        type: "http",
        x402Version: 2,
        description: "Morpho liquidation health",
        accepts: [{ scheme: "exact", amount: "40000" }],
        extensions: null,
        lastUpdated: null,
        quality: null,
      });
    });
    const editedPath = join(dataDir, "edited.json");
    writeFileSync(editedPath, `${JSON.stringify(edited, null, 2)}\n`);

    const second = await runTracker({
      cohort,
      dataDir,
      incomingSnapshot: edited,
      observedAt: "2026-09-03T10:00:00.000Z",
      source: "synthetic",
    });
    assert.equal(second.previousSnapshotPath, first.snapshotPath);
    assert.ok(second.changeCount >= 4);
    const fields = new Set(second.changes.map((row) => row.field));
    assert.ok(fields.has("description"));
    assert.ok(fields.has("accepts.0.amount"));
    assert.ok(fields.has("resource"));
    const description = second.changes.find((row) => row.field === "description");
    assert.equal(description.before, "EIP-712-signed risk attestation");
    assert.equal(description.after, "synthetically rematerialized output schema");
    assert.equal(description.observedAt, "2026-09-03T10:00:00.000Z");
    const removed = second.changes.find((row) => row.after === null && row.field === "resource");
    assert.equal(removed.before, "https://agents.samedaydesk.com/extract");
    const added = second.changes.find((row) => row.before === null && row.field === "resource");
    assert.equal(added.after, "https://402.com.tr/api/x402/morpho-health");
    const log = readChangelog(dataDir);
    assert.equal(log.length, second.changeCount);
    assert.deepEqual(Object.keys(log[0]).sort(), ["after", "before", "field", "observedAt", "route"]);
    assert.equal(previousSnapshotPath(dataDir), second.snapshotPath);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("CLI --fixture writes the first snapshot and --from reports the synthetic diff", () => {
  const dataDir = tempDataDir();
  try {
    const first = spawnSync(
      process.execPath,
      [cli, "--fixture", fixturePath, "--data-dir", dataDir, "--observed-at", "2026-09-03T11:00:00.000Z"],
      { encoding: "utf8" },
    );
    assert.equal(first.status, 0, first.stderr);
    const firstReport = JSON.parse(first.stdout);
    assert.equal(firstReport.changeCount, 0);
    assert.ok(firstReport.snapshotPath.endsWith(".json"));

    const snapshot = readSnapshot(firstReport.snapshotPath);
    const edited = editSnapshot(snapshot, (copy) => {
      copy.rows[0].description = "cli synthetic edit";
    });
    const editedPath = join(dataDir, "cli-edited.json");
    writeFileSync(editedPath, `${JSON.stringify(edited, null, 2)}\n`);

    const second = spawnSync(
      process.execPath,
      [cli, "--from", editedPath, "--data-dir", dataDir, "--observed-at", "2026-09-03T12:00:00.000Z"],
      { encoding: "utf8" },
    );
    assert.equal(second.status, 0, second.stderr);
    const secondReport = JSON.parse(second.stdout);
    assert.ok(secondReport.changeCount >= 1);
    assert.equal(secondReport.changes.some((row) => row.field === "description" && row.after === "cli synthetic edit"), true);
    assert.match(readFileSync(secondReport.changelogPath, "utf8"), /cli synthetic edit/);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("CLI without --live, --from, or --fixture does not probe the network", () => {
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pilot-vm-job/);
  assert.match(result.stderr, /no cron, no daemon/);
});
