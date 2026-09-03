import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  CDP_DISCOVERY_SOURCE,
  createFixtureFetch,
  diffObservations,
  diffSnapshots,
  editSnapshot,
  flattenComparable,
  loadCohort,
  matchesSeller,
  observationRecordFromSnapshot,
  previousSnapshotPath,
  readChangelog,
  readObservation,
  readSnapshot,
  readbackReport,
  runTracker,
  snapshotFromRows,
  writeObservation,
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
    assert.deepEqual(Object.keys(log[0]).sort(), ["after", "before", "field", "observedAt", "route", "source"]);
    assert.equal(previousSnapshotPath(dataDir), second.snapshotPath);
    const observation = readObservation(dataDir);
    assert.equal(observation.schema, "samedaydesk.bazaar-observation.v2");
    assert.ok(observation.sources[CDP_DISCOVERY_SOURCE].sellers.gblin.routes[baselineRow.resource]);
    const human = readFileSync(second.humanChangelogPath, "utf8");
    assert.match(human, /synthetically rematerialized output schema/);
    assert.match(human, /accepts\.0\.amount/);
    assert.match(human, /# Bazaar rematerialization changelog/);
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

test("CLI without --live, --from, --fixture, or --readback does not probe the network", () => {
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pilot-vm-job/);
  assert.match(result.stderr, /no cron, no daemon/);
  assert.match(result.stderr, /--readback/);
});

test("compact observations stay source-separated and digest bulky extensions", () => {
  const snapshot = snapshotFromRows([baselineRow], { observedAt: "2026-09-03T09:54:04.798Z", source: "live" });
  const record = observationRecordFromSnapshot(snapshot);
  const route = record.sources[CDP_DISCOVERY_SOURCE].sellers.gblin.routes[baselineRow.resource];
  assert.equal(route.description, baselineRow.description);
  assert.equal(route.accepts[0].amount, "3000");
  assert.equal(route.accepts[0].scheme, "exact");
  assert.equal(Object.hasOwn(route.accepts[0], "extra"), false);
  assert.match(route.extensionsDigest, /^[0-9a-f]{64}$/);
  assert.match(route.comparableDigest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(record).includes("EIP-712"), true);
  assert.equal(JSON.stringify(record).includes("l30DaysTotalCalls"), false);
});

test("synthetic --from diffs against compact observations when no snapshot is tracked", async () => {
  const dataDir = tempDataDir();
  try {
    const baseline = snapshotFromRows([baselineRow], {
      observedAt: "2026-09-03T09:54:04.798Z",
      source: "live",
      endpoint: cohort.endpoint,
      sellers: [{ id: "gblin", name: "GBLIN", hosts: ["gblin.digital"], queries: ["gblin.digital"], partial: false, rowCount: 1 }],
    });
    writeObservation(dataDir, observationRecordFromSnapshot(baseline));

    const edited = editSnapshot(baseline, (copy) => {
      copy.rows[0].description = "observation-only synthetic edit";
      copy.rows[0].accepts[0].amount = "12345";
    });
    const editedPath = join(dataDir, "edited-snapshot.json");
    writeFileSync(editedPath, `${JSON.stringify(edited, null, 2)}\n`);

    const replay = spawnSync(
      process.execPath,
      [cli, "--from", editedPath, "--data-dir", dataDir, "--observed-at", "2026-09-03T13:00:00.000Z"],
      { encoding: "utf8" },
    );
    assert.equal(replay.status, 0, replay.stderr);
    const report = JSON.parse(replay.stdout);
    assert.ok(report.changeCount >= 2, JSON.stringify(report.changes, null, 2));
    assert.equal(
      report.changes.some((row) => row.field === "description" && row.after === "observation-only synthetic edit"),
      true,
    );
    assert.equal(
      report.changes.some((row) => row.field === "accepts.0.amount" && row.before === "3000" && row.after === "12345"),
      true,
    );
    assert.match(readFileSync(report.humanChangelogPath, "utf8"), /observation-only synthetic edit/);
    assert.equal(readObservation(dataDir).sources[CDP_DISCOVERY_SOURCE].sellers.gblin.routes[baselineRow.resource].description, "observation-only synthetic edit");
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("CLI --readback is cron-free and does not write a snapshot", () => {
  const dataDir = tempDataDir();
  try {
    const first = spawnSync(
      process.execPath,
      [cli, "--fixture", fixturePath, "--data-dir", dataDir, "--observed-at", "2026-09-03T11:00:00.000Z"],
      { encoding: "utf8" },
    );
    assert.equal(first.status, 0, first.stderr);
    const readback = spawnSync(
      process.execPath,
      [cli, "--readback", "--data-dir", dataDir],
      { encoding: "utf8" },
    );
    assert.equal(readback.status, 0, readback.stderr);
    const report = JSON.parse(readback.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.cron, false);
    assert.equal(report.daemon, false);
    assert.ok(report.routeCount >= 3);
    assert.deepEqual(report.sources, [CDP_DISCOVERY_SOURCE]);
    assert.equal(report.observedAt, "2026-09-03T11:00:00.000Z");
    assert.equal(readbackReport(dataDir).routeCount, report.routeCount);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("committed tracker data does not include a full snapshot", () => {
  const listed = spawnSync("git", ["-C", join(here, "../.."), "ls-files", "data/bazaar-tracker"], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  const files = listed.stdout.split("\n").filter(Boolean);
  assert.ok(files.includes("data/bazaar-tracker/observations.json"), files.join(","));
  assert.ok(files.includes("data/bazaar-tracker/CHANGELOG.md"), files.join(","));
  assert.equal(files.some((name) => name.includes("/snapshots/") && name.endsWith(".json")), false, listed.stdout);
  const ignored = spawnSync("git", ["-C", join(here, "../.."), "check-ignore", "-q", "data/bazaar-tracker/snapshots/example.json"]);
  assert.equal(ignored.status, 0);
});

test("CLI --from an edited compact observation reports only the edited fields", () => {
  const dataDir = tempDataDir();
  try {
    const baseline = snapshotFromRows([baselineRow], {
      observedAt: "2026-09-03T09:54:04.798Z",
      source: "live",
      endpoint: cohort.endpoint,
      sellers: [{ id: "gblin", name: "GBLIN", hosts: ["gblin.digital"], queries: ["gblin.digital"], partial: false, rowCount: 1 }],
    });
    writeObservation(dataDir, observationRecordFromSnapshot(baseline));
    const edited = observationRecordFromSnapshot(baseline);
    const route = edited.sources[CDP_DISCOVERY_SOURCE].sellers.gblin.routes[baselineRow.resource];
    route.description = "compact-file synthetic edit";
    route.accepts[0].amount = "12345";
    const editedPath = join(dataDir, "edited-observations.json");
    writeFileSync(editedPath, `${JSON.stringify(edited, null, 2)}\n`);

    const replay = spawnSync(
      process.execPath,
      [cli, "--from", editedPath, "--data-dir", dataDir, "--observed-at", "2026-09-03T14:00:00.000Z"],
      { encoding: "utf8" },
    );
    assert.equal(replay.status, 0, replay.stderr);
    const report = JSON.parse(replay.stdout);
    assert.equal(report.changeCount, 2, JSON.stringify(report.changes, null, 2));
    assert.equal(report.changes.every((row) => row.field !== "extensionsDigest"), true);
    assert.equal(report.changes.some((row) => row.field === "description" && row.after === "compact-file synthetic edit"), true);
    assert.equal(report.changes.some((row) => row.field === "accepts.0.amount" && row.after === "12345"), true);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("diffObservations reports source-separated route field changes", () => {
  const previous = observationRecordFromSnapshot(snapshotFromRows([baselineRow], { observedAt: "2026-09-01T00:00:00.000Z" }));
  const current = observationRecordFromSnapshot(snapshotFromRows([
    { ...baselineRow, description: "compact digest change", accepts: [{ scheme: "exact", amount: "4000", network: "eip155:8453" }] },
  ], { observedAt: "2026-09-03T10:00:00.000Z" }));
  const changes = diffObservations(previous, current, "2026-09-03T10:00:00.000Z");
  assert.equal(changes.some((row) => row.field === "description" && row.source === CDP_DISCOVERY_SOURCE), true);
  assert.equal(changes.some((row) => row.field === "accepts.0.amount" && row.after === "4000"), true);
});
