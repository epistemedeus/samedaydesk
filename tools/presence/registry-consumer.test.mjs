import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CURRENT_REMOTE,
  HISTORICAL_RAILWAY_REMOTE,
  SEARCH_UNFILTERED_URL,
  SEARCH_VERSION_LATEST_URL,
  SERVER_NAME,
  VERSIONS_LATEST_URL,
  firstHitLooksLikeCurrentLatest,
  firstSearchHit,
  fixturePath,
  latestSearchHits,
  liveGetJson,
  loadCaptureMeta,
  loadFixture,
  matchesPin,
  officialMeta,
  remoteUrl,
  sha256File,
  versionOf,
} from "./registry-consumer.mjs";

const capture = loadCaptureMeta();
const unfiltered = loadFixture("search-unfiltered.json");
const searchLatest = loadFixture("search-version-latest.json");
const versionsLatest = loadFixture("versions-latest.json");

test("fixture bytes still match the pinned live-capture sha256s", () => {
  for (const [name, rec] of Object.entries(capture.bodies)) {
    assert.equal(sha256File(fixturePath(name)), rec.sha256, name);
  }
});

test("unfiltered search first hit is historical Railway 1.0.0, not latest", () => {
  const hit = firstSearchHit(unfiltered);
  assert.equal(versionOf(hit), capture.pinnedNaiveFirstHit.version);
  assert.equal(remoteUrl(hit), HISTORICAL_RAILWAY_REMOTE);
  assert.equal(officialMeta(hit).isLatest, false);
  assert.equal(officialMeta(hit).updatedAt, capture.pinnedNaiveFirstHit.updatedAt);
  assert.equal(unfiltered.metadata.nextCursor, capture.pinnedNaiveFirstHit.metadata.nextCursor);
  assert.equal(unfiltered.metadata.count, 30);
  assert.equal(
    unfiltered.servers.some((item) => versionOf(item) === capture.pinnedLatest.version),
    false,
  );
  assert.deepEqual(latestSearchHits(unfiltered), []);
  assert.equal(firstHitLooksLikeCurrentLatest(unfiltered), false);
  assert.equal(matchesPin(hit, capture.pinnedLatest), false);
});

test("treating unfiltered search first hit as latest is a consumer error", () => {
  const naive = firstSearchHit(unfiltered);
  assert.notEqual(versionOf(naive), capture.pinnedLatest.version);
  assert.notEqual(remoteUrl(naive), CURRENT_REMOTE);
  assert.notEqual(officialMeta(naive).isLatest, true);
  assert.equal(remoteUrl(naive), "https://x402-url-extractor-production.up.railway.app/mcp");
});

test("/versions/latest is the current SameDayDesk remote with isLatest true", () => {
  assert.equal(versionsLatest.server.name, SERVER_NAME);
  assert.equal(matchesPin(versionsLatest, capture.pinnedLatest), true);
  assert.equal(remoteUrl(versionsLatest), CURRENT_REMOTE);
  assert.equal(officialMeta(versionsLatest).isLatest, true);
  assert.equal(versionOf(versionsLatest), "1.23.45");
  assert.equal(officialMeta(versionsLatest).updatedAt, "2026-09-08T05:09:17.289155Z");
});

test("search?version=latest agrees with /versions/latest", () => {
  const hits = latestSearchHits(searchLatest);
  assert.equal(hits.length, 1);
  assert.equal(matchesPin(hits[0], capture.pinnedLatest), true);
  assert.equal(matchesPin(searchLatest.servers[0], capture.pinnedLatest), true);
  assert.equal(remoteUrl(hits[0]), remoteUrl(versionsLatest));
  assert.equal(versionOf(hits[0]), versionOf(versionsLatest));
  assert.equal(searchLatest.metadata.nextCursor, undefined);
  assert.equal(searchLatest.metadata.count, 1);
});

test("note documents official OpenAPI citations and both curl shapes", () => {
  const note = readFileSync(new URL("./REGISTRY-CONSUMER.md", import.meta.url), "utf8");
  assert.match(note, /not an upstream bug report/i);
  assert.match(note, /openapi\.json/);
  assert.match(note, /Filter by version/);
  assert.match(note, /for latest version/);
  assert.match(note, /Use the special version/);
  assert.match(note, /to get the latest version/);
  assert.match(note, /official-registry-api\.md/);
  assert.match(note, /versioning\.mdx/);
  assert.match(note, /search=x402-data-gateway/);
  assert.match(note, /versions\/latest/);
  assert.match(note, /version=latest/);
  assert.match(note, /4a6e5a825a8c443786d9c748877a41f5d129379900f61acc9464914bd44675b9/);
  assert.match(note, /d9d9ad0bd8bd252750467101fed3208ae17b0ed6727afe47f1f0421662cd86a6/);
  assert.match(note, /905b7d59f72e7278c99dab5131e323f7b90014ab93320064c33e23d913993f89/);
  assert.equal(note.includes("modelcontextprotocol/registry/issues"), false);
  assert.equal(note.toLowerCase().includes("fully deployed"), false);
});

const liveEnabled = process.env.SAMEDAYDESK_LIVE_MCP_REGISTRY === "1";

test(
  "live /versions/latest still returns isLatest with the agents.samedaydesk.com remote",
  { skip: liveEnabled ? false : "set SAMEDAYDESK_LIVE_MCP_REGISTRY=1" },
  async () => {
    const latest = await liveGetJson(VERSIONS_LATEST_URL);
    assert.equal(latest.ok, true, `HTTP ${latest.status}`);
    assert.equal(latest.body.server.name, SERVER_NAME);
    assert.equal(officialMeta(latest.body).isLatest, true);
    assert.equal(remoteUrl(latest.body), CURRENT_REMOTE);

    const filtered = await liveGetJson(SEARCH_VERSION_LATEST_URL);
    assert.equal(filtered.ok, true, `HTTP ${filtered.status}`);
    assert.equal(officialMeta(filtered.body.servers[0]).isLatest, true);
    assert.equal(remoteUrl(filtered.body.servers[0]), CURRENT_REMOTE);

    const naive = await liveGetJson(SEARCH_UNFILTERED_URL);
    assert.equal(naive.ok, true, `HTTP ${naive.status}`);
    assert.equal(firstHitLooksLikeCurrentLatest(naive.body), false);
  },
);
