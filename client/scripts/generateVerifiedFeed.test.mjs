import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assignBadge,
  bazaarAgrees,
  crawl,
  feedIncludesEveryGreenRoute,
  formatAtomicUsdc,
  generateVerifiedFeed,
  greenRegistryRoutes,
  routeFromCrawl,
  routeFromRepairBrief,
} from "./generateVerifiedFeed.mjs";
import { validateJsonSchema } from "./validateJsonSchema.mjs";
import { loadVerifiedSchema, validateVerifiedFeed } from "./verifiedFeedValidation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("formats unpaid 402 atomic USDC amounts from the crawl", () => {
  assert.equal(formatAtomicUsdc("5000"), "0.005 USDC");
  assert.equal(formatAtomicUsdc("10000"), "0.01 USDC");
  assert.equal(formatAtomicUsdc("200000"), "0.2 USDC");
  assert.equal(formatAtomicUsdc("1"), "0.000001 USDC");
  assert.equal(formatAtomicUsdc(null), null);
});

test("badge is verified only when OpenAPI, unpaid 402 output schema, and Bazaar agree", () => {
  assert.equal(
    assignBadge({ openapi: true, unpaid402OutputSchema: true, cdpBazaarRow: true }, false),
    "verified",
  );
  assert.equal(
    assignBadge({ openapi: true, unpaid402OutputSchema: true, cdpBazaarRow: false }, false),
    "unverified",
  );
  assert.equal(
    assignBadge({ openapi: true, unpaid402OutputSchema: false, cdpBazaarRow: false }, true),
    "drift",
  );
});

test("Bazaar agreement requires matching unpaid 402 amount, network, and output keys", () => {
  const extract = crawl.routes.find((route) => route.route === "/extract");
  assert.ok(extract);
  assert.deepEqual(bazaarAgrees(extract), { agrees: true, conflict: false });
  const drifted = {
    ...extract,
    cdpBazaar: { ...extract.cdpBazaar, amount: "1" },
  };
  assert.deepEqual(bazaarAgrees(drifted), { agrees: false, conflict: true });
  const unread = crawl.routes.find((route) => route.route === "/read");
  assert.ok(unread);
  assert.equal(unread.cdpBazaar, null);
  assert.deepEqual(bazaarAgrees(unread), { agrees: false, conflict: false });
});

test("green SameDayDesk crawl routes keep unpaid 402 price and network", () => {
  const extract = routeFromCrawl(crawl.routes.find((route) => route.route === "/extract"));
  assert.equal(extract.seller, "SameDayDesk");
  assert.equal(extract.route, "/extract");
  assert.equal(extract.price.amount, "5000");
  assert.equal(extract.price.display, "0.005 USDC");
  assert.equal(extract.network, "eip155:8453");
  assert.equal(extract.price.source, "live_unpaid_402");
  assert.match(extract.contractHash || "", /^[a-f0-9]{64}$/);
  assert.deepEqual(extract.agreement, {
    openapi: true,
    unpaid402OutputSchema: true,
    cdpBazaarRow: true,
  });
  assert.equal(extract.badge, "verified");
  assert.equal(extract.registryStatus, "green");
});

test("repair briefs become drift rows and do not invent unpaid 402 fields", () => {
  const brief = crawl.findings.find((item) => item.id === "onesource-erc20-balance-20260830");
  assert.ok(brief);
  const row = routeFromRepairBrief(brief);
  assert.equal(row.seller, "OneSource");
  assert.equal(row.route, "/api/chain/erc20-balance");
  assert.equal(row.price.source, "repair_brief");
  assert.equal(row.price.display, "0.003 USDC");
  assert.equal(row.price.amount, null);
  assert.equal(row.badge, "drift");
  assert.equal(row.registryStatus, "finding");
  assert.equal(row.agreement.unpaid402OutputSchema, false);
  assert.equal(row.agreement.cdpBazaarRow, false);
});

test("generated feed includes every green registry route and validates against the sibling schema", () => {
  const green = greenRegistryRoutes();
  assert.equal(green.length, 22);
  const feed = generateVerifiedFeed();
  assert.equal(feed.qa.label, "internal");
  assert.equal(feed.qa.owner, "Pilot Firstmate");
  assert.equal(feedIncludesEveryGreenRoute(feed), true);
  for (const route of green) {
    const row = feed.routes.find(
      (item) => item.origin === route.origin && item.route === route.route && item.method === route.method,
    );
    assert.ok(row, `${route.method} ${route.route}`);
    assert.equal(row.registryStatus, "green");
    assert.equal(row.network, route.unpaid402.network);
    assert.equal(row.price.amount, route.unpaid402.amount);
  }
  assert.equal(
    feed.routes.filter((route) => route.registryStatus === "finding").length,
    crawl.findings.length,
  );
  const serialized = JSON.parse(JSON.stringify(feed));
  assert.deepEqual(validateJsonSchema(serialized, loadVerifiedSchema()), []);
  validateVerifiedFeed(feed);
  const banned = JSON.stringify(feed).toLowerCase();
  assert.doesNotMatch(banned, /"demand"|revenue/);
});

test("writeVerifiedFeed emits schema-valid JSON beside the committed schema", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verified-feed-"));
  const out = path.join(dir, "verified.json");
  try {
    const result = spawnSync(process.execPath, [path.join(here, "writeVerifiedFeed.mjs"), out], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const feed = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(validateJsonSchema(feed, loadVerifiedSchema()), []);
    assert.equal(feedIncludesEveryGreenRoute(feed), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
