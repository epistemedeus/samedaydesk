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
  BAZAAR_FRESHNESS_MS,
  crawl,
  feedContainsOnlyCurrentEvidence,
  feedMatchesCurrentCrawl,
  feedRejectsForeignMalformedAndUnchecked,
  formatAtomicUsdc,
  generateVerifiedFeed,
  hasLiveContractEvidence,
  isSingleNetworkIdentifier,
  routeFromCrawl,
  verifiedRowsHaveCompleteEvidence,
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

test("badge requires live OpenAPI, unpaid 402, matching Bazaar, and fresh Bazaar evidence", () => {
  const complete = {
    openapi: true,
    unpaid402OutputSchema: true,
    cdpBazaarRow: true,
    cdpBazaarFresh: true,
  };
  assert.equal(assignBadge(complete, false), "verified");
  assert.equal(assignBadge({ ...complete, cdpBazaarFresh: false }, false), "unverified");
  assert.equal(assignBadge({ ...complete, openapi: false }, true), "drift");
});

test("Bazaar agreement binds resource, seller, terms, output, and freshness", () => {
  const extract = crawl.routes.find((route) => route.route === "/extract");
  assert.ok(extract);
  assert.deepEqual(bazaarAgrees(extract), {
    agrees: true,
    conflict: false,
    fresh: true,
    observedAt: "2026-08-30T15:18:51.498Z",
  });
  assert.deepEqual(bazaarAgrees({ ...extract, cdpBazaar: null }), {
    agrees: false,
    conflict: false,
    fresh: false,
    observedAt: null,
  });
  const foreign = {
    ...extract,
    cdpBazaar: { ...extract.cdpBazaar, resource: "https://seller.example/extract" },
  };
  assert.equal(bazaarAgrees(foreign).conflict, true);
  assert.equal(bazaarAgrees(foreign).agrees, false);
  const stale = {
    ...extract,
    cdpBazaar: { ...extract.cdpBazaar, lastUpdated: "2026-08-20T09:55:27Z" },
  };
  assert.equal(bazaarAgrees(stale).agrees, true);
  assert.equal(bazaarAgrees(stale).fresh, false);
  const malformed = {
    ...extract,
    cdpBazaar: { ...extract.cdpBazaar, lastUpdated: "not-a-time", outputExampleKeys: {} },
  };
  assert.deepEqual(bazaarAgrees(malformed), {
    agrees: false,
    conflict: true,
    fresh: false,
    observedAt: null,
  });
});

test("current SameDayDesk crawl route preserves exact observed evidence", () => {
  const source = crawl.routes.find((route) => route.route === "/extract");
  const extract = routeFromCrawl(source);
  assert.ok(extract);
  assert.equal(extract.seller, "SameDayDesk");
  assert.equal(extract.route, "/extract");
  assert.equal(extract.price.amount, "5000");
  assert.equal(extract.price.display, "0.005 USDC");
  assert.equal(extract.network, "eip155:8453");
  assert.equal(extract.price.source, "live_unpaid_402");
  assert.match(extract.contractHash, /^[a-f0-9]{64}$/);
  assert.equal(extract.bazaarObservedAt, "2026-08-30T15:18:51.498Z");
  assert.deepEqual(extract.agreement, {
    openapi: true,
    unpaid402OutputSchema: true,
    cdpBazaarRow: true,
    cdpBazaarFresh: true,
  });
  assert.equal(extract.badge, "verified");
});

test("foreign, unchecked, and non-live source routes cannot enter the feed", () => {
  const source = crawl.routes.find((route) => route.route === "/extract");
  const hostile = [
    { ...source, seller: "Foreign Seller" },
    { ...source, origin: "https://foreign.example" },
    { ...source, lastVerified: null },
    { ...source, lastVerified: "2026-09-02T09:55:27Z" },
    { ...source, contractHash: null },
    { ...source, contractHash: "not-a-hash" },
    { ...source, unpaid402: { ...source.unpaid402, source: "x402_manifest" } },
    { ...source, outputExampleKeys: {} },
  ];
  for (const route of hostile) {
    assert.equal(hasLiveContractEvidence(route), false);
    assert.equal(routeFromCrawl(route), null);
  }
  const feed = generateVerifiedFeed(crawl.checkedAt, {
    routes: [source, ...hostile],
    findings: crawl.findings,
  });
  assert.equal(feed.routes.length, 1);
  assert.equal(feed.routes[0].seller, "SameDayDesk");
});

test("OpenAPI agreement bit is observed from the crawl, never synthesized", () => {
  const source = crawl.routes.find((route) => route.route === "/extract");
  const withoutDoc = routeFromCrawl({ ...source, openapiPresent: false });
  assert.equal(withoutDoc.agreement.openapi, false);
  assert.notEqual(withoutDoc.badge, "verified");
  const omitted = routeFromCrawl({ ...source, openapiPresent: undefined });
  assert.equal(omitted.agreement.openapi, false);
  assert.notEqual(omitted.badge, "verified");
});

test("malformed compound networks cannot enter or promote", () => {
  assert.equal(isSingleNetworkIdentifier("eip155:8453"), true);
  assert.equal(isSingleNetworkIdentifier("Base or Polygon"), false);
  assert.equal(isSingleNetworkIdentifier("Base or Solana"), false);
  assert.equal(isSingleNetworkIdentifier("base"), false);
  const source = crawl.routes.find((route) => route.route === "/extract");
  for (const network of ["Base or Polygon", "Base or Solana", "Base", ""]) {
    const route = { ...source, unpaid402: { ...source.unpaid402, network } };
    assert.equal(hasLiveContractEvidence(route), false);
    assert.equal(routeFromCrawl(route), null);
  }
});

test("repair briefs and crawl findings cannot reach the public feed", () => {
  const src = readFileSync(path.join(here, "generateVerifiedFeed.mjs"), "utf8");
  assert.doesNotMatch(src, /routeFromRepairBrief/);
  assert.doesNotMatch(src, /networkFromBriefPrice/);
  assert.doesNotMatch(src, /\.findings\s*\|\|\s*\[\]\s*\)\.map/);
  const feed = generateVerifiedFeed(crawl.checkedAt, {
    routes: crawl.routes,
    findings: crawl.findings,
  });
  const named = [
    "HyperNatt",
    "OneSource",
    "scrape402",
    "Vibe Springs",
    "BlockRun",
    "Driftflight",
    "AgentToll",
    "ArgonautWorks",
  ];
  for (const finding of crawl.findings) {
    assert.equal(
      feed.routes.some(
        (row) =>
          row.seller === finding.seller ||
          (row.origin === finding.origin && row.route === finding.route),
      ),
      false,
      finding.seller,
    );
  }
  for (const name of named) {
    assert.equal(
      feed.routes.some((row) => row.seller.includes(name) || row.origin.includes(name.toLowerCase())),
      false,
      name,
    );
  }
  assert.equal(
    feed.routes.some((row) => row.origin.includes("402.com.tr") || row.origin.includes("exa.ai")),
    false,
  );
  assert.equal(feed.routes.some((row) => row.price.source === "repair_brief"), false);
  assert.equal(feed.routes.some((row) => row.registryStatus === "finding"), false);
  assert.notEqual(feed.routes.length, crawl.findings.length);
});

test("stale Bazaar evidence cannot promote a route to verified", () => {
  const source = crawl.routes.find((route) => route.route === "/extract");
  const stale = {
    ...source,
    cdpBazaar: { ...source.cdpBazaar, lastUpdated: "2026-08-20T09:55:27Z" },
  };
  const row = routeFromCrawl(stale);
  assert.ok(row);
  assert.equal(row.agreement.cdpBazaarRow, true);
  assert.equal(row.agreement.cdpBazaarFresh, false);
  assert.equal(row.badge, "unverified");
});

test("generated feed excludes repair briefs and unchecked routes, then validates", () => {
  const feed = generateVerifiedFeed();
  assert.equal(feed.qa.label, "internal");
  assert.equal(feed.qa.owner, "Pilot Firstmate");
  assert.equal(feed.routes.length, 20);
  assert.equal(feed.routes.every((route) => route.seller === "SameDayDesk"), true);
  assert.equal(feed.routes.every((route) => route.origin === "https://agents.samedaydesk.com"), true);
  assert.equal(feed.routes.some((route) => route.registryStatus === "finding"), false);
  assert.equal(feed.routes.every((route) => route.lastVerified && route.contractHash), true);
  assert.equal(feed.routes.every((route) => isSingleNetworkIdentifier(route.network)), true);
  assert.equal(feedContainsOnlyCurrentEvidence(feed), true);
  assert.equal(feedMatchesCurrentCrawl(feed), true);
  assert.equal(verifiedRowsHaveCompleteEvidence(feed), true);
  assert.equal(feedRejectsForeignMalformedAndUnchecked(feed), true);
  const serialized = JSON.parse(JSON.stringify(feed));
  assert.deepEqual(validateJsonSchema(serialized, loadVerifiedSchema()), []);
  validateVerifiedFeed(feed);
  const banned = JSON.stringify(feed).toLowerCase();
  assert.doesNotMatch(banned, /"demand"|revenue|repair_brief/);
});

test("POST routes without live verification time and contract hash stay out of the feed", () => {
  const posts = crawl.routes.filter(
    (route) =>
      route.method === "POST" &&
      (route.lastVerified == null || route.contractHash == null || route.unpaid402?.source !== "live_unpaid_402"),
  );
  assert.equal(posts.length, 2);
  const feed = generateVerifiedFeed();
  for (const route of posts) {
    assert.equal(hasLiveContractEvidence(route), false);
    assert.equal(routeFromCrawl(route), null);
    assert.equal(
      feed.routes.some((row) => row.method === "POST" && row.route === route.route),
      false,
    );
  }
  assert.equal(feed.routes.some((row) => row.badge === "verified" && (row.lastVerified == null || row.contractHash == null)), false);
});

test("README and code define the seven-day Bazaar freshness bound", () => {
  assert.equal(BAZAAR_FRESHNESS_MS, 7 * 24 * 60 * 60 * 1000);
  const readme = readFileSync(path.join(here, "../public/x402/README.md"), "utf8");
  assert.match(readme, /seven days/i);
  assert.match(readme, /BAZAAR_FRESHNESS_MS/);
  assert.match(readme, /bazaarObservedAt/);
});

test("writeVerifiedFeed emits the exact schema-valid committed candidate", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verified-feed-"));
  const out = path.join(dir, "verified.json");
  try {
    const result = spawnSync(process.execPath, [path.join(here, "writeVerifiedFeed.mjs"), out], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const feed = JSON.parse(readFileSync(out, "utf8"));
    assert.deepEqual(validateJsonSchema(feed, loadVerifiedSchema()), []);
    assert.equal(feedContainsOnlyCurrentEvidence(feed), true);
    assert.equal(feedMatchesCurrentCrawl(feed), true);
    assert.equal(verifiedRowsHaveCompleteEvidence(feed), true);
    assert.equal(feedRejectsForeignMalformedAndUnchecked(feed), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
