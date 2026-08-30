import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  });
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
