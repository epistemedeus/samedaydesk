import test from "node:test";
import assert from "node:assert/strict";
import { registrableDomain, decideFromCounts, isFresh, ipHash, CACHE_TTL_MS } from "../server/lib/report-bounds.js";

test("registrable domain folds www and subdomains, including two part suffixes", () => {
  assert.equal(registrableDomain("www.example.com"), "example.com");
  assert.equal(registrableDomain("shop.example.com"), "example.com");
  assert.equal(registrableDomain("www.example.co.uk"), "example.co.uk");
  assert.equal(registrableDomain("deep.shop.example.co.uk"), "example.co.uk");
  assert.equal(registrableDomain("example.com"), "example.com");
});

test("a fresh stored copy wins over every other rule", () => {
  const d = decideFromCounts({
    cachedPayload: { cards: [] },
    cacheCreatedAt: new Date().toISOString(),
    domainRunsToday: 99,
    distinctDomainsForIpToday: 99,
    budgetSpentCents: 99999,
    budgetCapCents: 500,
  });
  assert.equal(d.mode, "cache");
});

test("one live run per domain per day", () => {
  const base = { domainRunsToday: 0, distinctDomainsForIpToday: 0, budgetSpentCents: 0, budgetCapCents: 500 };
  assert.equal(decideFromCounts(base).mode, "live");
  assert.equal(decideFromCounts({ ...base, domainRunsToday: 1 }).mode, "eligibility_only");
});

test("five distinct domains per address per day", () => {
  const base = { domainRunsToday: 0, budgetSpentCents: 0, budgetCapCents: 500 };
  assert.equal(decideFromCounts({ ...base, distinctDomainsForIpToday: 4 }).mode, "live");
  assert.equal(decideFromCounts({ ...base, distinctDomainsForIpToday: 5 }).mode, "eligibility_only");
});

test("the daily budget closes the panel before anything else spends", () => {
  const d = decideFromCounts({ domainRunsToday: 0, distinctDomainsForIpToday: 0, budgetSpentCents: 500, budgetCapCents: 500 });
  assert.equal(d.mode, "eligibility_only");
});

test("a stored copy older than the window is not fresh", () => {
  const old = new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString();
  assert.equal(isFresh(old), false);
  assert.equal(isFresh(new Date().toISOString()), true);
  assert.equal(isFresh(null), false);
});

test("address hashing is stable and does not keep the address", () => {
  const h = ipHash("203.0.113.9");
  assert.equal(h, ipHash("203.0.113.9"));
  assert.notEqual(h, ipHash("203.0.113.10"));
  assert.ok(!h.includes("203"));
});
