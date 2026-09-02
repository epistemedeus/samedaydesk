import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import express from "express";

process.env.PULSE_FILE = "/dev/null";

const { sellerRepairBriefs } = await import("../../client/src/data/sellerRepairBriefs.ts");
const {
  pulseSnapshot,
  recordClientEvent,
  sellerRepairFindingIds,
  sellerRepairFindingRouteClasses,
} = await import("../lib/pulse.js");
const { default: pulseRouter } = await import("../routes/pulse.js");

test("keeps the server event allowlist equal to the canonical public briefs", () => {
  assert.deepEqual(
    [...sellerRepairFindingIds].sort(),
    sellerRepairBriefs.map((brief) => brief.id).sort(),
  );
  assert.deepEqual(
    Object.fromEntries(
      sellerRepairBriefs.map((brief) => [brief.id, brief.routeClass]),
    ),
    sellerRepairFindingRouteClasses,
  );
});

test("records only bounded seller-repair funnel events", () => {
  assert.equal(recordClientEvent("other_event", {}), false);
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "bad id",
      route_class: "paid_get",
    }),
    false,
  );

  const props = {
    finding_id: "vibe-springs-btc-usd-20260830",
    route_class: "paid_get",
  };
  const before = structuredClone(pulseSnapshot().sellerRepair);
  assert.equal(recordClientEvent("seller_repair_brief_viewed", props), true);
  assert.equal(recordClientEvent("seller_repair_scope_clicked", props), true);

  const snapshot = pulseSnapshot();
  assert.equal(snapshot.sellerRepair.briefViews, before.briefViews + 1);
  assert.equal(snapshot.sellerRepair.scopeClicks, before.scopeClicks + 1);
  assert.deepEqual(snapshot.sellerRepair.byFinding[props.finding_id], {
    routeClass: "paid_get",
    briefViews: (before.byFinding[props.finding_id]?.briefViews || 0) + 1,
    scopeClicks: (before.byFinding[props.finding_id]?.scopeClicks || 0) + 1,
    checkoutStarts: before.byFinding[props.finding_id]?.checkoutStarts || 0,
  });
});

test("records seller-repair checkout starts separately from scope clicks", () => {
  const props = {
    finding_id: "blockrun-exa-search-20260830",
    route_class: "paid_post",
  };
  const before = structuredClone(pulseSnapshot().sellerRepair);
  assert.equal(recordClientEvent("seller_repair_checkout_started", props), true);
  const snapshot = pulseSnapshot();
  assert.equal(snapshot.sellerRepair.checkoutStarts, before.checkoutStarts + 1);
  assert.equal(snapshot.sellerRepair.scopeClicks, before.scopeClicks);
  assert.equal(
    snapshot.sellerRepair.byFinding[props.finding_id].checkoutStarts,
    (before.byFinding[props.finding_id]?.checkoutStarts || 0) + 1,
  );
});

test("rejects a conflicting route class for an existing finding", () => {
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "vibe-springs-btc-usd-20260830",
      route_class: "paid_post",
    }),
    false,
  );
});

test("accepts the canonical paid POST finding only with its exact route class", () => {
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "blockrun-exa-search-20260830",
      route_class: "paid_post",
    }),
    true,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "blockrun-exa-search-20260830",
      route_class: "paid_get",
    }),
    false,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: "exa-direct-search-20260830",
      route_class: "paid_post",
    }),
    true,
  );
});

test("keeps the AgentToll finding bound to paid_post", () => {
  const findingId = "agenttoll-market-radar-20260901";
  assert.equal(sellerRepairFindingRouteClasses[findingId], "paid_post");
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: findingId,
      route_class: "paid_post",
    }),
    true,
  );
  assert.equal(
    recordClientEvent("seller_repair_brief_viewed", {
      finding_id: findingId,
      route_class: "paid_get",
    }),
    false,
  );
});

test("exposes only the bounded event write route", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/pulse", pulseRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address.port}/api/pulse/event`;

  const accepted = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "seller_repair_brief_viewed",
      props: {
        finding_id: "hypernatt-liq-radar-20260830",
        route_class: "paid_get",
      },
    }),
  });
  assert.equal(accepted.status, 204);

  const rejected = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "seller_repair_brief_viewed",
      props: { finding_id: "invented-finding", route_class: "paid_get" },
    }),
  });
  assert.equal(rejected.status, 400);
});

test("persists and reloads bounded seller-repair counters", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-test-"));
  const file = join(dir, "pulse.json");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  const env = { ...process.env, PULSE_FILE: file };

  const writer = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { recordClientEvent } = await import(${JSON.stringify(moduleUrl)});\n` +
        `if (!recordClientEvent("seller_repair_brief_viewed", { finding_id: "vibe-springs-btc-usd-20260830", route_class: "paid_get" })) process.exit(2);`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.sellerRepair.byFinding["vibe-springs-btc-usd-20260830"].briefViews, 1);

  const reader = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { pulseSnapshot } = await import(${JSON.stringify(moduleUrl)});\n` +
        `console.log(JSON.stringify(pulseSnapshot().sellerRepair));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(reader.status, 0, reader.stderr);
  const reloaded = JSON.parse(reader.stdout);
  assert.equal(reloaded.briefViews, 1);
  assert.equal(reloaded.byFinding["vibe-springs-btc-usd-20260830"].briefViews, 1);
});

test("uses a durable per-user state path in production and migrates the legacy temp snapshot", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-pulse-production-test-"));
  const home = join(dir, "home");
  const legacyFile = join(dir, "sdd-pulse-v1.json");
  const durableFile = join(home, ".state", "samedaydesk", "pulse-v1.json");
  const moduleUrl = new URL("../lib/pulse.js", import.meta.url).href;
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(home, { recursive: true });
  writeFileSync(
    legacyFile,
    JSON.stringify({
      startedAt: "2026-08-30T00:00:00.000Z",
      sellerRepair: {
        briefViews: 1,
        scopeClicks: 0,
        byFinding: {
          "hypernatt-liq-radar-20260830": {
            routeClass: "paid_get",
            briefViews: 1,
            scopeClicks: 0,
          },
        },
      },
    }),
  );

  const env = {
    ...process.env,
    NODE_ENV: "production",
    HOME: home,
    TMPDIR: dir,
    XDG_STATE_HOME: join(home, ".state"),
  };
  delete env.PULSE_FILE;
  const writer = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { flushPulseSnapshot, pulseSnapshot, recordClientEvent } = await import(${JSON.stringify(moduleUrl)});\n` +
        `if (!recordClientEvent("seller_repair_brief_viewed", { finding_id: "hypernatt-liq-radar-20260830", route_class: "paid_get" })) process.exit(2);\n` +
        `if (!flushPulseSnapshot()) process.exit(3);\n` +
        `console.log(JSON.stringify(pulseSnapshot().storage));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const storage = JSON.parse(writer.stdout);
  assert.equal(storage.mode, "production_state_home");
  assert.equal(storage.loaded, true);
  assert.equal(storage.migratedLegacySnapshot, true);
  assert.equal(storage.lastSaveOk, true);
  assert.equal(
    JSON.parse(readFileSync(durableFile, "utf8")).sellerRepair.briefViews,
    2,
  );
});
