import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  crawl,
  feedContainsOnlyCurrentEvidence,
  feedMatchesSourceCrawl,
  feedRejectsForeignMalformedAndUnchecked,
  generateVerifiedFeed,
  verifiedRowsHaveCompleteEvidence,
} from "./generateVerifiedFeed.mjs";
import { validateJsonSchema } from "./validateJsonSchema.mjs";
import { loadVerifiedSchema, validateVerifiedFeed } from "./verifiedFeedValidation.mjs";
import {
  assertAllowlistedUrl,
  assertNoSecrets,
  buildCandidateCrawl,
  collectObservations,
  dedupeObservations,
  isBlockedHost,
  loadAllowlistedProbeUrls,
  observationFromFixture,
  observationFromPriorEvidence,
  observeProbe,
  parseUnpaid402Payload,
} from "./verifiedFeedObservation.mjs";
import { refreshVerifiedFeed, writeRefreshArtifacts, PRODUCTION_FEED } from "./refreshVerifiedFeed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const AS_OF_FRESH = "2026-09-03T12:00:00.000Z";
const AS_OF_STALE = "2026-09-07T17:00:00.000Z";

function extractProbe() {
  return loadAllowlistedProbeUrls().find((row) => row.route === "/extract");
}

function currentExtractFixture() {
  return JSON.parse(
    readFileSync(
      path.join(here, "../../fixtures/verified-feed/observations/extract-current.json"),
      "utf8",
    ),
  );
}

test("allowlist is exact SameDayDesk example URLs only", () => {
  const probes = loadAllowlistedProbeUrls();
  assert.ok(probes.length >= 20);
  assert.equal(probes.every((row) => row.origin === "https://agents.samedaydesk.com"), true);
  assert.equal(probes.every((row) => row.exampleUrl.startsWith("https://agents.samedaydesk.com/")), true);
  const extract = probes.find((row) => row.route === "/extract");
  assert.equal(
    extract.exampleUrl,
    "https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com",
  );
  assert.throws(
    () => assertAllowlistedUrl("https://evil.example/extract", probes),
    /non-allowlisted origin/,
  );
  assert.throws(
    () => assertAllowlistedUrl("https://agents.samedaydesk.com/extract?url=https://other.example", probes),
    /outside exact allowlisted example set/,
  );
  assert.equal(isBlockedHost("127.0.0.1"), true);
  assert.equal(isBlockedHost("10.0.0.2"), true);
  assert.equal(isBlockedHost("agents.samedaydesk.com"), false);
});

test("prior evidence becomes stale when asOf advances without re-observation", () => {
  const source = crawl.routes.find((row) => row.route === "/extract");
  const stale = observationFromPriorEvidence(source, AS_OF_STALE);
  assert.equal(stale.status, "stale");
  assert.equal(stale.lastObservation.observedAt, source.lastVerified);
  assert.notEqual(stale.lastObservation.observedAt, AS_OF_STALE);
  const currentAtCrawlTime = observationFromPriorEvidence(source, crawl.checkedAt);
  assert.equal(currentAtCrawlTime.status, "current");
});

test("unknown and failed observations keep lastObservation null", () => {
  const source = crawl.routes.find((row) => row.route === "/extract");
  const unknown = observationFromPriorEvidence(
    { ...source, lastVerified: null, contractHash: null, unpaid402: { source: "x402_manifest" } },
    AS_OF_FRESH,
  );
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.lastObservation, null);

  const probe = extractProbe();
  const failed = observationFromFixture(probe, AS_OF_FRESH, {
    kind: "failed",
    failureKind: "http_status",
    detail: "status_500",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastObservation, null);
  assert.equal(failed.failure.kind, "http_status");
});

test("timeout, redirect, and invalid JSON become failed observations", async () => {
  const probe = extractProbe();
  const timeout = observationFromFixture(probe, AS_OF_FRESH, { kind: "timeout" });
  assert.equal(timeout.status, "failed");
  assert.equal(timeout.failure.kind, "timeout");

  const redirect = await observeProbe(probe, AS_OF_FRESH, {
    allowlist: [probe],
    fetchImpl: async () => ({
      status: 302,
      headers: { get: (name) => (name.toLowerCase() === "location" ? "https://evil.example/" : null) },
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  });
  assert.equal(redirect.status, "failed");
  assert.equal(redirect.failure.kind, "redirect");

  const invalid = parseUnpaid402Payload({
    status: 402,
    headers: {},
    bodyText: "<html>not json</html>",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.failure.kind, "invalid_json");
});

test("duplicate route identities collapse to one observation", () => {
  const probe = extractProbe();
  const a = observationFromFixture(probe, AS_OF_FRESH, currentExtractFixture());
  const b = observationFromFixture(probe, AS_OF_FRESH, currentExtractFixture());
  const deduped = dedupeObservations([a, b, a]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].route, "/extract");
});

test("stale unrechecked evidence cannot retain a verified claim in the candidate feed", async () => {
  const observations = await collectObservations({
    asOf: AS_OF_STALE,
    mode: "prior-only",
    source: crawl,
  });
  assert.ok(observations.some((row) => row.route === "/extract" && row.status === "stale"));
  assert.ok(observations.every((row) => row.status !== "current" || row.lastObservation?.observedAt === AS_OF_STALE));

  const candidateCrawl = buildCandidateCrawl(crawl, observations, AS_OF_STALE);
  const extract = candidateCrawl.routes.find((row) => row.route === "/extract");
  assert.equal(extract.lastVerified, null);
  assert.equal(extract.contractHash, null);
  assert.notEqual(extract.unpaid402?.source, "live_unpaid_402");

  const feed = generateVerifiedFeed(AS_OF_STALE, candidateCrawl);
  assert.equal(feed.routes.some((row) => row.route === "/extract"), false);
  assert.equal(feed.routes.some((row) => row.badge === "verified"), false);
});

test("current fixture observation can mint a schema-valid candidate without touching production", async () => {
  const result = await refreshVerifiedFeed({
    mode: "fixtures",
    asOf: AS_OF_FRESH,
    fixtureMap: { "/extract": currentExtractFixture() },
    feedOut: path.join(tmpdir(), "verified.candidate.test.json"),
    observationsOut: path.join(tmpdir(), "verified.observations.test.json"),
  });
  assert.equal(result.report.counts.current, 1);
  assert.ok(result.report.counts.stale >= 1);
  assert.equal(result.feedValid, true);
  assert.equal(result.feed.routes.length, 1);
  assert.equal(result.feed.routes[0].route, "/extract");
  assert.equal(result.feed.routes[0].lastVerified, AS_OF_FRESH);
  assert.equal(result.feed.routes[0].badge, "verified");
  assert.equal(result.feed.routes[0].bazaarObservedAt, "2026-08-30T15:18:51.498Z");
  validateVerifiedFeed(result.feed, { source: result.candidateCrawl });
  assert.equal(feedMatchesSourceCrawl(result.feed, result.candidateCrawl), true);
  assert.equal(feedContainsOnlyCurrentEvidence(result.feed, AS_OF_FRESH, result.candidateCrawl), true);
  assert.equal(verifiedRowsHaveCompleteEvidence(result.feed), true);
  assert.equal(
    feedRejectsForeignMalformedAndUnchecked(result.feed, AS_OF_FRESH, result.candidateCrawl),
    true,
  );
  assert.deepEqual(validateJsonSchema(result.feed, loadVerifiedSchema()), []);
  assertNoSecrets(result.feed);
  assertNoSecrets(result.report);

  const productionBefore = readFileSync(PRODUCTION_FEED, "utf8");
  const dir = mkdtempSync(path.join(tmpdir(), "verified-refresh-"));
  try {
    result.feedOut = path.join(dir, "verified.candidate.json");
    result.observationsOut = path.join(dir, "verified.observations.json");
    const written = writeRefreshArtifacts(result);
    assert.ok(written.feedOut);
    assert.equal(readFileSync(PRODUCTION_FEED, "utf8"), productionBefore);
    assert.notEqual(path.resolve(written.feedOut), path.resolve(PRODUCTION_FEED));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refresh refuses production overwrite and rejects secret-like payloads", async () => {
  await assert.rejects(
    () =>
      refreshVerifiedFeed({
        mode: "fixtures",
        asOf: AS_OF_FRESH,
        feedOut: PRODUCTION_FEED,
        fixtureMap: { "/extract": currentExtractFixture() },
      }),
    /refusing to overwrite production/,
  );
  assert.throws(
    () => assertNoSecrets({ header: "PAYMENT-SIGNATURE: abc" }),
    /secret-like material/,
  );
});

test("CLI fixture refresh writes candidate + observations and leaves production unchanged", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "verified-cli-"));
  const feedOut = path.join(dir, "verified.candidate.json");
  const obsOut = path.join(dir, "verified.observations.json");
  const productionBefore = readFileSync(PRODUCTION_FEED, "utf8");
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(here, "refreshVerifiedFeed.mjs"),
        "--fixtures",
        "--fixture",
        "extract-current",
        "--as-of",
        AS_OF_FRESH,
        "--feed-out",
        feedOut,
        "--observations-out",
        obsOut,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const feed = JSON.parse(readFileSync(feedOut, "utf8"));
    const report = JSON.parse(readFileSync(obsOut, "utf8"));
    assert.equal(feed.routes[0].route, "/extract");
    assert.equal(report.observations.find((row) => row.route === "/extract").status, "current");
    assert.equal(readFileSync(PRODUCTION_FEED, "utf8"), productionBefore);
    assert.match(result.stdout, /candidate feed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live mode uses bounded fake fetch and records redirect failures without following", async () => {
  const probe = extractProbe();
  let sawRedirect = false;
  const result = await refreshVerifiedFeed({
    mode: "live",
    asOf: AS_OF_FRESH,
    liveRouteLimit: 1,
    feedOut: path.join(tmpdir(), "live.candidate.json"),
    observationsOut: path.join(tmpdir(), "live.observations.json"),
    fetchImpl: async (url, init) => {
      assert.equal(url, probe.exampleUrl);
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal);
      sawRedirect = true;
      return {
        status: 302,
        headers: { get: () => "https://127.0.0.1/secret" },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    },
  });
  assert.equal(sawRedirect, true);
  const extract = result.report.observations.find((row) => row.route === "/extract");
  assert.equal(extract.status, "failed");
  assert.equal(extract.failure.kind, "redirect");
  assert.equal(extract.lastObservation, null);
  assert.equal(result.feed.routes.some((row) => row.route === "/extract"), false);
});

test("schema agreement still holds for the committed build-time feed path", () => {
  const feed = generateVerifiedFeed();
  validateVerifiedFeed(feed);
  assert.deepEqual(validateJsonSchema(feed, loadVerifiedSchema()), []);
});
