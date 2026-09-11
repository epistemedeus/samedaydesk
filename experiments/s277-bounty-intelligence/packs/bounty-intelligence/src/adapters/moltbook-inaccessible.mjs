import {
  ADAPTERS,
  AUTH_BOUNDARIES,
  MOLTBOOK_LIST_URL,
  CLAIM_STATE,
  FUNDING,
} from "../constants.mjs";
import { buildRecord } from "../record.mjs";
import { unwrapFixture, readJson } from "../fixture.mjs";
import { httpGet } from "../http.mjs";
import { nowIso } from "../clock.mjs";

export const name = ADAPTERS.MOLTBOOK;
export const vendorAdapter = null;
export const liveUrl = MOLTBOOK_LIST_URL;

function inaccessibleRecord(ctx) {
  return buildRecord({
    now: ctx.now,
    dataLabel: ctx.dataLabel,
    fixtureKind: ctx.fixtureKind,
    adapter: name,
    kind: "inaccessible_source",
    url: MOLTBOOK_LIST_URL,
    nativeId: "api.moltbook.com",
    inaccessible: true,
    inaccessibleReason: ctx.reason || "NXDOMAIN",
    classificationKind: "inaccessible",
    title: "Moltbook API inaccessible",
    description: "api.moltbook.com does not resolve. No listings invented.",
    lifecycle: "unknown",
    statusRaw: "inaccessible",
    cancelled: false,
    closed: false,
    rewardAmount: null,
    fundingStatus: FUNDING.UNKNOWN,
    fundingEvidenceKind: "unknown",
    fundingPresent: null,
    claimState: CLAIM_STATE.NOT_CLAIMABLE,
    prerequisites: ["Source inaccessible; no task"],
    firstDollar: "unknown",
    walletlessEligibility: "unknown",
    observedAt: ctx.observedAt,
    captureMode: "inaccessible",
    httpStatus: ctx.httpStatus ?? null,
    bodySha256: ctx.bodySha256 || null,
    authBoundary: AUTH_BOUNDARIES.moltbook,
    raw: { error: ctx.reason || "NXDOMAIN" },
  });
}

export async function fetchList({
  mode = "fixture",
  fixturePath,
  now,
  httpGet: get = httpGet,
} = {}) {
  const observedAt = nowIso(now);
  if (mode === "fixture") {
    const wrapped = fixturePath ? unwrapFixture(readJson(fixturePath)) : { dataLabel: "fixture", inner: { error: "NXDOMAIN" } };
    const reason =
      wrapped.inner?.error || wrapped.inner?.message || "NXDOMAIN";
    const rec = inaccessibleRecord({
      now: observedAt,
      dataLabel: wrapped.dataLabel || "fixture",
      fixtureKind: wrapped.fixtureKind || "moltbook_inaccessible",
      observedAt: wrapped.capturedAt || observedAt,
      reason,
      httpStatus: null,
    });
    return {
      adapter: name,
      records: [rec],
      listingMeta: {
        schema: "s277.bounty-intelligence.listing-meta.v1",
        kind: "inaccessible",
        inaccessible: true,
        reason,
        claimAuthority: "none",
        listingsInvented: false,
      },
      fetchMeta: {
        mode: "inaccessible",
        httpStatus: null,
        fetchedAt: wrapped.capturedAt || observedAt,
        bodySha256: null,
        partial: true,
        error: reason,
      },
      error: reason,
    };
  }

  const result = await get(MOLTBOOK_LIST_URL, { now: observedAt, timeoutMs: 8000 });
  const reason = result.ok ? `unexpected_http_${result.httpStatus}` : result.error || "NXDOMAIN";
  const rec = inaccessibleRecord({
    now: observedAt,
    dataLabel: "live-capture",
    fixtureKind: null,
    observedAt: result.fetchedAt,
    reason,
    httpStatus: result.httpStatus,
    bodySha256: result.sha256,
  });
  return {
    adapter: name,
    records: [rec],
    listingMeta: {
      schema: "s277.bounty-intelligence.listing-meta.v1",
      kind: "inaccessible",
      inaccessible: true,
      reason,
      claimAuthority: "none",
      listingsInvented: false,
    },
    fetchMeta: {
      mode: result.ok ? "live_public" : "inaccessible",
      httpStatus: result.httpStatus,
      fetchedAt: result.fetchedAt,
      bodySha256: result.sha256,
      partial: true,
      error: reason,
    },
    error: reason,
  };
}
