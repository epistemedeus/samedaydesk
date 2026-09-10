import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CAPTURE_SCHEMA_VERSION,
  DEFAULT_REGISTRY_PATH,
  DELTA_SCHEMA_VERSION,
  OBSERVATORY_SCHEMA_VERSION,
  assertUniqueSourceIds,
  compareCaptures,
  createFixtureRegistry,
  createHttpRegistry,
  formatCaptureId,
  importRegistry,
  loadCapture,
  normalizeSourceList,
  runCapture,
  runCli,
  runDelta,
  writeCapture,
} from "./observatory-capture.mjs";
import { SCHEMA_VERSION } from "../lib/observatory/contract.js";
import { USER_AGENT } from "../lib/observatory/bounded-fetch.js";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "observatory-capture.mjs");
const FETCHED_A = "2026-09-09T23:00:00.000Z";
const FETCHED_B = "2026-09-09T23:05:00.000Z";

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function metric(overrides = {}) {
  return {
    key: "jobCount",
    value: 12,
    unit: "count",
    state: "ok",
    definition: "provider-reported job count for this snapshot",
    population: "provider_listed_jobs",
    window: "unspecified",
    ...overrides,
  };
}

function envelope(overrides = {}) {
  const sourceId = overrides.sourceId || "moltjobs";
  const fetchedAt = overrides.fetchedAt || FETCHED_A;
  return {
    schemaVersion: OBSERVATORY_SCHEMA_VERSION,
    sourceId,
    sourceKind: overrides.sourceKind || "work_market",
    upstreamUrl: overrides.upstreamUrl || "https://api.moltjobs.io/v1/stats",
    fetchedAt,
    providerTimestamp: overrides.providerTimestamp === undefined
      ? "2026-09-09T22:55:00.000Z"
      : overrides.providerTimestamp,
    providerTimestampState: overrides.providerTimestampState || "ok",
    availability: overrides.availability || "ok",
    httpStatus: overrides.httpStatus === undefined ? 200 : overrides.httpStatus,
    cache: overrides.cache || {
      hit: false,
      ageMs: 0,
      stale: false,
      ttlMs: 30_000,
      fetchedAt,
    },
    metrics: overrides.metrics || [metric()],
    coverage: overrides.coverage || { kind: "point_snapshot", complete: false },
    errors: overrides.errors || [],
    warnings: overrides.warnings || [],
    evidenceClass: overrides.evidenceClass || "fixture",
    rawSourceLink: overrides.rawSourceLink || "https://api.moltjobs.io/v1/stats",
    withheldConclusions: overrides.withheldConclusions || [
      "agent_traffic",
      "customers",
      "demand",
    ],
    ...pick(overrides, [
      "sourceKind",
      "upstreamUrl",
      "httpStatus",
      "metrics",
      "errors",
      "warnings",
      "coverage",
      "cache",
      "evidenceClass",
    ]),
    sourceId,
    fetchedAt,
    providerTimestamp: overrides.providerTimestamp === undefined
      ? "2026-09-09T22:55:00.000Z"
      : overrides.providerTimestamp,
    providerTimestampState: overrides.providerTimestampState || "ok",
    availability: overrides.availability || "ok",
  };
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) out[key] = object[key];
  }
  return out;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sourceOf(delta, sourceId) {
  return delta.sources.find((row) => row.sourceId === sourceId) || null;
}

function assertNoInventedGrowth(delta) {
  assert.equal(delta.growth.invented, false);
  assert.equal(delta.growth.trafficGrowth, null);
  assert.equal(delta.growth.percentChange, null);
  assert.deepEqual(delta.growth.charts, []);
  assert.equal(delta.continuity.invented, false);
  assert.equal(delta.providerCadenceKnown, false);
  assert.equal(delta.continuity.reason, "cadence_unknown");
  for (const source of delta.sources) {
    for (const row of [...(source.metrics?.changed || []), ...(source.metrics?.added || []), ...(source.metrics?.removed || [])]) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, "percentChange"), false, row.key);
      assert.equal(Object.prototype.hasOwnProperty.call(row, "growthRate"), false, row.key);
      assert.equal(Object.prototype.hasOwnProperty.call(row, "trafficGrowth"), false, row.key);
    }
  }
}

test("capture writes dated source JSON plus manifest with fetchedAt and source list", async () => {
  const out = tempDir("obs-capture-");
  const result = await runCapture({
    out,
    now: FETCHED_A,
    label: "fixture",
    registry: createFixtureRegistry([
      envelope({ sourceId: "moltjobs" }),
      envelope({
        sourceId: "x402stats",
        sourceKind: "settlement",
        upstreamUrl: "https://x402stats.io/api/stats",
        metrics: [
          metric({
            key: "sellers_30d",
            value: 40,
            definition: "provider-indexed sellers",
            population: "provider_indexed_sellers",
            window: "30d",
          }),
        ],
      }),
    ]),
  });

  assert.equal(result.manifest.schemaVersion, CAPTURE_SCHEMA_VERSION);
  assert.equal(result.manifest.captureId, "20260909T230000Z");
  assert.equal(result.manifest.fetchedAt, FETCHED_A);
  assert.equal(result.manifest.label, "fixture");
  assert.equal(result.manifest.evidenceClass, "fixture");
  assert.equal(result.manifest.polling, false);
  assert.equal(result.manifest.heartbeat, false);
  assert.equal(result.manifest.database, false);
  assert.deepEqual(result.manifest.sources.map((row) => row.sourceId), ["moltjobs", "x402stats"]);
  assert.equal(result.dir, join(out, "20260909T230000Z"));

  const moltjobs = JSON.parse(readFileSync(join(result.dir, "moltjobs.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(result.dir, "manifest.json"), "utf8"));
  assert.equal(moltjobs.sourceId, "moltjobs");
  assert.equal(moltjobs.availability, "ok");
  assert.equal(manifest.fetchedAt, FETCHED_A);
  assert.equal(formatCaptureId(new Date(FETCHED_A)), "20260909T230000Z");
});

test("delta errors when baseline is missing", async () => {
  const out = tempDir("obs-missing-");
  const next = await writeCapture(out, [envelope({ fetchedAt: FETCHED_B })], {
    now: FETCHED_B,
    label: "fixture",
  });

  await assert.rejects(
    async () => runDelta({ a: join(out, "no-such-baseline"), b: next.dir }),
    (error) => {
      assert.equal(error.code, "baseline_missing");
      assert.match(error.message, /baseline missing/);
      return true;
    },
  );

  await assert.rejects(
    async () => runDelta({ b: next.dir }),
    (error) => {
      assert.equal(error.code, "baseline_missing");
      return true;
    },
  );

  const spawned = spawnSync(
    process.execPath,
    [cli, "delta", "--a", join(out, "does-not-exist"), "--b", next.dir],
    { encoding: "utf8" },
  );
  assert.equal(spawned.status, 2);
  const payload = JSON.parse(spawned.stderr);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "baseline_missing");
  assert.match(payload.message, /baseline missing/);
});

test("changed definition is incomparable and is not a growth rate", async () => {
  const out = tempDir("obs-def-");
  const prior = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_A,
    metrics: [metric({ value: 12, definition: "provider-reported job count for this snapshot" })],
  })], { now: FETCHED_A, label: "fixture" });
  const next = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_B,
    metrics: [metric({
      value: 48,
      definition: "completed jobs only, different population",
      population: "completed_jobs",
    })],
  })], { now: FETCHED_B, label: "fixture" });

  const delta = compareCaptures(loadCapture(prior.dir, { role: "baseline" }), loadCapture(next.dir, { role: "next" }));
  assert.equal(delta.schemaVersion, DELTA_SCHEMA_VERSION);
  const moltjobs = sourceOf(delta, "moltjobs");
  assert.equal(moltjobs.metrics.definitionChanged.length, 1);
  assert.equal(moltjobs.metrics.changed[0].definitionChanged, true);
  assert.equal(moltjobs.metrics.changed[0].comparable, false);
  assert.equal(moltjobs.metrics.changed[0].reason, "definition_changed");
  assert.equal(moltjobs.metrics.changed[0].prior.value, 12);
  assert.equal(moltjobs.metrics.changed[0].next.value, 48);
  assertNoInventedGrowth(delta);
});

test("duplicate source ids fail capture and fail delta load", async () => {
  const out = tempDir("obs-dup-");
  const registry = createFixtureRegistry(
    [envelope({ sourceId: "moltjobs" })],
    [
      { sourceId: "moltjobs", sourceKind: "work_market" },
      { sourceId: "moltjobs", sourceKind: "work_market" },
    ],
  );

  await assert.rejects(
    async () => runCapture({ out, now: FETCHED_A, label: "fixture", registry }),
    (error) => {
      assert.equal(error.code, "duplicate_source_ids");
      assert.match(error.message, /duplicate source ids/);
      assert.deepEqual(error.duplicates, ["moltjobs"]);
      return true;
    },
  );

  const dupDir = join(out, "dup-manifest");
  mkdirSync(dupDir);
  writeFileSync(join(dupDir, "moltjobs.json"), `${JSON.stringify(envelope({ sourceId: "moltjobs" }), null, 2)}\n`);
  writeFileSync(join(dupDir, "manifest.json"), `${JSON.stringify({
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId: "dup",
    fetchedAt: FETCHED_A,
    sources: [
      { sourceId: "moltjobs", file: "moltjobs.json" },
      { sourceId: "moltjobs", file: "moltjobs.json" },
    ],
  }, null, 2)}\n`);

  assert.throws(
    () => loadCapture(dupDir, { role: "baseline" }),
    (error) => {
      assert.equal(error.code, "duplicate_source_ids");
      return true;
    },
  );
});

test("stale vs fresh reports timestamp state, not manufactured growth", async () => {
  const out = tempDir("obs-stale-");
  const stale = envelope({
    fetchedAt: FETCHED_A,
    availability: "stale",
    providerTimestamp: "2020-01-01T00:00:00.000Z",
    providerTimestampState: "stale",
    metrics: [metric({ value: 12 })],
  });
  const fresh = envelope({
    fetchedAt: FETCHED_B,
    availability: "ok",
    providerTimestamp: "2026-09-09T23:04:00.000Z",
    providerTimestampState: "ok",
    metrics: [metric({ value: 12 })],
  });
  const prior = await writeCapture(out, [stale], { now: FETCHED_A, label: "fixture" });
  const next = await writeCapture(out, [fresh], { now: FETCHED_B, label: "fixture" });
  const delta = runDelta({ a: prior.dir, b: next.dir });
  const moltjobs = sourceOf(delta, "moltjobs");
  assert.deepEqual(moltjobs.availability, { prior: "stale", next: "ok" });
  assert.deepEqual(moltjobs.providerTimestampState, { prior: "stale", next: "ok" });
  assert.equal(moltjobs.metrics.changed.length, 0);
  assert.equal(moltjobs.metrics.unchanged.some((row) => row.key === "jobCount"), true);
  assert.ok(moltjobs.warnings.some((row) => row.code === "stale_observation"));
  assert.ok(moltjobs.warnings.some((row) => row.code === "cadence_unknown"));
  assertNoInventedGrowth(delta);
});

test("partial availability keeps missing metrics as missing, not zeros or growth", async () => {
  const out = tempDir("obs-partial-");
  const ok = envelope({
    fetchedAt: FETCHED_A,
    availability: "ok",
    metrics: [
      metric({ key: "jobCount", value: 12 }),
      metric({ key: "registeredAgents", value: 3, definition: "provider-reported registered agents" }),
    ],
  });
  const partial = envelope({
    fetchedAt: FETCHED_B,
    availability: "partial",
    metrics: [
      metric({ key: "jobCount", value: 12 }),
      metric({
        key: "registeredAgents",
        value: null,
        state: "missing",
        definition: "provider-reported registered agents",
      }),
    ],
  });
  const prior = await writeCapture(out, [ok], { now: FETCHED_A, label: "fixture" });
  const next = await writeCapture(out, [partial], { now: FETCHED_B, label: "fixture" });
  const delta = runDelta({ a: prior.dir, b: next.dir });
  const moltjobs = sourceOf(delta, "moltjobs");
  assert.deepEqual(moltjobs.availability, { prior: "ok", next: "partial" });
  const agents = moltjobs.metrics.changed.find((row) => row.key === "registeredAgents");
  assert.equal(agents.prior.value, 3);
  assert.equal(agents.next.value, null);
  assert.equal(agents.next.state, "missing");
  assert.equal(agents.comparable, false);
  assert.ok(moltjobs.warnings.some((row) => row.code === "partial_availability"));
  assertNoInventedGrowth(delta);
  assert.equal(agents.next.value === 0, false);
});

test("added and removed metrics carry prior/next values without percent change", async () => {
  const out = tempDir("obs-addrm-");
  const prior = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_A,
    metrics: [metric({ key: "jobCount", value: 12 }), metric({ key: "posts", value: 2, definition: "posts" })],
  })], { now: FETCHED_A, label: "fixture" });
  const next = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_B,
    metrics: [
      metric({ key: "jobCount", value: 15 }),
      metric({ key: "completedCount", value: 4, definition: "completed" }),
    ],
  })], { now: FETCHED_B, label: "fixture" });
  const delta = runDelta({ a: prior.dir, b: next.dir });
  const moltjobs = sourceOf(delta, "moltjobs");
  assert.equal(moltjobs.metrics.removed[0].key, "posts");
  assert.equal(moltjobs.metrics.removed[0].prior.value, 2);
  assert.equal(moltjobs.metrics.added[0].key, "completedCount");
  assert.equal(moltjobs.metrics.added[0].next.value, 4);
  const jobCount = moltjobs.metrics.changed.find((row) => row.key === "jobCount");
  assert.equal(jobCount.prior.value, 12);
  assert.equal(jobCount.next.value, 15);
  assert.equal(Object.prototype.hasOwnProperty.call(jobCount, "percentChange"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(jobCount, "trafficGrowth"), false);
  assertNoInventedGrowth(delta);
});

test("HTTP local mount capture uses /api/observatory and does not forward secrets", async () => {
  const out = tempDir("obs-http-");
  const envelopes = [
    envelope({ sourceId: "moltjobs" }),
    envelope({
      sourceId: "smithery_mcp",
      sourceKind: "capability_discovery",
      upstreamUrl: "https://api.smithery.ai/servers?pageSize=1",
      metrics: [metric({
        key: "registered_servers",
        value: 9,
        definition: "catalog registrations",
        population: "smithery_catalog",
      })],
    }),
  ];
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    if (path === "/api/observatory/snapshot") {
      return jsonResponse({ fetchedAt: FETCHED_A, observations: envelopes });
    }
    if (path === "/api/observatory/sources") {
      return jsonResponse({
        sources: envelopes.map((row) => ({
          sourceId: row.sourceId,
          sourceKind: row.sourceKind,
          upstreamUrl: row.upstreamUrl,
        })),
      });
    }
    throw new Error(`unexpected ${path}`);
  };

  const result = await runCapture({
    out,
    now: FETCHED_A,
    label: "fixture",
    base: "http://127.0.0.1:3541",
    fetchImpl,
  });
  assert.deepEqual(result.manifest.sources.map((row) => row.sourceId).sort(), ["moltjobs", "smithery_mcp"]);
  assert.equal(calls[0].init.headers["User-Agent"], "SameDayDeskObservatory/0.1");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.equal(calls[0].init.credentials, "omit");

  const client = createHttpRegistry("http://127.0.0.1:3541", { fetchImpl });
  const listed = await client.listSources();
  assert.equal(listed.length, 2);
});

test("CLI capture and delta round-trip through argv", async () => {
  const out = tempDir("obs-cli-");
  const registry = createFixtureRegistry([
    envelope({ sourceId: "moltjobs", fetchedAt: FETCHED_A }),
    envelope({
      sourceId: "x402stats",
      sourceKind: "settlement",
      fetchedAt: FETCHED_A,
      metrics: [metric({ key: "sellers_30d", value: 10, window: "30d", definition: "sellers" })],
    }),
  ]);
  const first = await runCli([
    "capture", "--out", out, "--now", FETCHED_A, "--label", "fixture",
  ], { registry });
  assert.equal(first.code, 0);
  const secondRegistry = createFixtureRegistry([
    envelope({ sourceId: "moltjobs", fetchedAt: FETCHED_B, metrics: [metric({ value: 13 })] }),
    envelope({
      sourceId: "x402stats",
      sourceKind: "settlement",
      fetchedAt: FETCHED_B,
      availability: "partial",
      metrics: [metric({ key: "sellers_30d", value: 10, window: "30d", definition: "sellers" })],
    }),
  ]);
  const second = await runCli([
    "capture", "--out", out, "--now", FETCHED_B, "--label", "fixture",
  ], { registry: secondRegistry });
  assert.equal(second.code, 0);

  const delta = await runCli(["delta", "--a", first.result.dir, "--b", second.result.dir]);
  assert.equal(delta.code, 0);
  assertNoInventedGrowth(delta.result);
  assert.equal(sourceOf(delta.result, "moltjobs").metrics.changed[0].prior.value, 12);
  assert.equal(sourceOf(delta.result, "moltjobs").metrics.changed[0].next.value, 13);
  assert.equal(sourceOf(delta.result, "x402stats").availability.next, "partial");

  const missingA = await runCli(["delta", "--b", second.result.dir]);
  assert.equal(missingA.code, 2);
  assert.match(missingA.stderr, /baseline missing/);
});

test("unknown cadence never invents continuity even when numeric values move", async () => {
  const out = tempDir("obs-cadence-");
  const prior = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_A,
    metrics: [metric({ value: 10, window: "unspecified" })],
  })], { now: FETCHED_A, label: "fixture" });
  const next = await writeCapture(out, [envelope({
    fetchedAt: FETCHED_B,
    metrics: [metric({ value: 20, window: "unspecified" })],
  })], { now: FETCHED_B, label: "fixture" });
  const delta = runDelta({ a: prior.dir, b: next.dir });
  assert.equal(delta.observerIntervalMs, 5 * 60 * 1000);
  assert.equal(delta.providerCadenceKnown, false);
  assert.equal(delta.continuity.reason, "cadence_unknown");
  assert.equal(sourceOf(delta, "moltjobs").cadence.inventedGrowthRate, false);
  assert.equal(sourceOf(delta, "moltjobs").cadence.inventedContinuity, false);
  assertNoInventedGrowth(delta);
});

test("help and missing --out fail closed", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stderr, /no DB, no daemon/);
  const missingOut = await runCli(["capture"]);
  assert.equal(missingOut.code, 2);
  assert.match(missingOut.stderr, /--out/);
});

test("CLI schema and User-Agent follow the SDS observatory contract", () => {
  assert.equal(OBSERVATORY_SCHEMA_VERSION, SCHEMA_VERSION);
  assert.equal(USER_AGENT, "SameDayDeskObservatory/0.1");
});

test("registry listSources ids are unique when SDS-CORE registry is present", async (t) => {
  if (!existsSync(DEFAULT_REGISTRY_PATH)) {
    t.skip("registry.js not present yet");
    return;
  }
  const registry = await importRegistry(DEFAULT_REGISTRY_PATH);
  const listed = normalizeSourceList(await registry.listSources());
  assert.ok(listed.length >= 1);
  assertUniqueSourceIds(listed.map((row) => row.sourceId), "registry.listSources");
  assert.deepEqual(listed.map((row) => row.sourceId).sort(), ["moltjobs", "smithery_mcp", "x402stats"]);
  for (const row of listed) {
    assert.match(row.sourceId, /^[A-Za-z0-9._-]+$/);
  }
});

test("capture uses registry runtime adapters with injectable fetch, not reimplemented sources", async (t) => {
  if (!existsSync(DEFAULT_REGISTRY_PATH)) {
    t.skip("registry.js not present yet");
    return;
  }
  const out = tempDir("obs-registry-");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), ua: init.headers && init.headers["User-Agent"] });
    const href = String(url);
    if (href.includes("api.moltjobs.io")) {
      return jsonResponse({
        data: {
          totalJobs: 12,
          totalCompleted: 4,
          totalAgents: 3,
          totalVolumeUsdc: "10.50",
          escrowedUsdc: "1.25",
          avgCompletionTimeMs: 1500,
          medianCompletionTimeMs: 900,
          completionSampleSize: 4,
          disputeRate: "0.01",
          updatedAt: "2026-09-09T22:55:00.000Z",
        },
      });
    }
    if (href.includes("x402stats.io")) {
      return jsonResponse({
        updatedAt: "2026-09-09T22:50:00.000Z",
        snapshot: {
          computedAt: "2026-09-09T22:50:00.000Z",
          sellers: 40,
          volumeUsd: "100.00",
          organicSellers: 2,
          organicVolumeUsd: "1.00",
          avgPaymentUsd: "2.50",
          medianSellerRevenueUsd: "3.00",
          top10VolumeShare: "0.4",
          windowDays: 30,
        },
      });
    }
    if (href.includes("api.smithery.ai")) {
      return jsonResponse({ pagination: { totalCount: 9 } });
    }
    throw new Error(`unexpected upstream ${href}`);
  };

  const result = await runCapture({
    out,
    now: FETCHED_A,
    label: "fixture",
    fetchImpl,
  });
  assert.equal(result.manifest.captureId, "20260909T230000Z");
  assert.deepEqual(
    result.manifest.sources.map((row) => row.sourceId).sort(),
    ["moltjobs", "smithery_mcp", "x402stats"],
  );
  assert.equal(calls.length >= 3, true);
  assert.ok(calls.every((call) => call.ua === "SameDayDeskObservatory/0.1"));

  const moltjobs = JSON.parse(readFileSync(join(result.dir, "moltjobs.json"), "utf8"));
  const smithery = JSON.parse(readFileSync(join(result.dir, "smithery_mcp.json"), "utf8"));
  const x402 = JSON.parse(readFileSync(join(result.dir, "x402stats.json"), "utf8"));
  assert.equal(moltjobs.sourceKind, "work_market");
  assert.equal(smithery.sourceKind, "capability_discovery");
  assert.equal(x402.sourceKind, "settlement");
  assert.equal(moltjobs.metrics.find((row) => row.key === "jobCount")?.value, 12);
  assert.equal(smithery.metrics.find((row) => row.key === "registered_servers")?.value, 9);
  assert.equal(x402.metrics.find((row) => row.key === "sellers_30d")?.value, 40);
  assert.equal(x402.metrics.find((row) => row.key === "organic_sellers_30d")?.evidenceClass, "provider_heuristic");
});
