import {
  ADAPTERS,
  AUTH_BOUNDARIES,
  NEOMORPHIC_BOUNTIES_URL,
  FUNDING,
  CLAIM_STATE,
} from "../constants.mjs";
import { buildRecord } from "../record.mjs";
import { unwrapFixture, readJson } from "../fixture.mjs";
import { httpGet, jsonBody } from "../http.mjs";
import { sha256Bytes } from "../hash.mjs";
import { nowIso } from "../clock.mjs";

export const name = ADAPTERS.NEOMORPHIC;
export const vendorAdapter = null;
export const liveUrl = NEOMORPHIC_BOUNTIES_URL;

export function normalizeScheduleItem(item, ctx) {
  const state = String(item.state || "unknown").toLowerCase();
  const acceptance = Array.isArray(item.acceptance) ? item.acceptance.join("\n") : null;
  const terms = [item.scope, acceptance, item.consideration, ctx.boundary].filter(Boolean).join("\n\n");
  return buildRecord({
    now: ctx.now,
    dataLabel: ctx.dataLabel,
    fixtureKind: ctx.fixtureKind,
    adapter: name,
    kind: "lab_schedule_item",
    url: NEOMORPHIC_BOUNTIES_URL,
    nativeId: item.id || null,
    vendorAdapter: null,
    labSchedule: true,
    classificationKind: "lab_schedule",
    title: item.title || "",
    description: item.scope || item.consideration || null,
    lifecycle: state === "open" ? "open" : state === "staged" ? "staged" : state || "unknown",
    statusRaw: item.state || null,
    cancelled: false,
    closed: state === "closed",
    rewardAmount: null,
    rewardAsset: null,
    rewardNetwork: null,
    rewardProvenance: "lab_consideration_not_cash",
    fundingStatus: FUNDING.UNKNOWN,
    fundingEvidenceKind: "not_applicable",
    fundingPresent: false,
    fundingDisclaimer:
      "Neomorphic bounty schedule is a lab listing. Stated consideration is not a cash bounty and not a paid agent job.",
    claimState: CLAIM_STATE.NOT_CLAIMABLE,
    prerequisites: [
      "Lab schedule — not a paid agent job",
      item.consideration || "No cash bounty implied",
    ],
    identityRequired: "unknown",
    firstDollar: "unknown",
    walletlessEligibility: "unknown",
    deadlineAt: null,
    sourceCreatedAt: ctx.publishedAt || null,
    sourceUpdatedAt: ctx.publishedAt || null,
    observedAt: ctx.observedAt,
    captureMode: ctx.captureMode,
    httpStatus: ctx.httpStatus,
    bodySha256: ctx.bodySha256,
    verificationPaymentTerms: terms,
    authBoundary: AUTH_BOUNDARIES["neomorphic-schedule"],
    raw: {
      id: item.id,
      state: item.state,
      evidenceClass: item.evidenceClass || null,
      experimentSlug: item.experimentSlug || null,
    },
  });
}

export async function fetchList({
  mode = "fixture",
  fixturePath,
  now,
  limit = 5,
  httpGet: get = httpGet,
} = {}) {
  const observedAt = nowIso(now);
  if (mode === "fixture") {
    if (!fixturePath) throw new Error("neomorphic fixture mode requires fixturePath");
    const wrapped = unwrapFixture(readJson(fixturePath));
    const inner = wrapped.inner;
    const items = Array.isArray(inner?.bounties) ? inner.bounties : [];
    const body = Buffer.from(JSON.stringify(inner));
    const ctx = {
      now: observedAt,
      dataLabel: wrapped.dataLabel,
      fixtureKind: wrapped.fixtureKind,
      observedAt: wrapped.capturedAt || observedAt,
      captureMode: "captured_fixture",
      httpStatus: 200,
      bodySha256: sha256Bytes(body),
      publishedAt: inner?.publishedAt || wrapped.capturedAt,
      boundary: inner?.boundary || AUTH_BOUNDARIES["neomorphic-schedule"],
    };
    const records = items.slice(0, limit).map((item) => normalizeScheduleItem(item, ctx));
    return {
      adapter: name,
      records,
      listingMeta: {
        schema: "s277.bounty-intelligence.listing-meta.v1",
        kind: "lab_schedule",
        labSchedule: true,
        notPaidAgentJobs: true,
        claimAuthority: "none",
        boundary: inner?.boundary || null,
      },
      fetchMeta: {
        mode: "captured_fixture",
        httpStatus: 200,
        fetchedAt: ctx.observedAt,
        bodySha256: ctx.bodySha256,
        partial: false,
      },
      error: null,
    };
  }

  const result = await get(NEOMORPHIC_BOUNTIES_URL, { now: observedAt });
  if (!result.ok) {
    return {
      adapter: name,
      records: [],
      listingMeta: {
        schema: "s277.bounty-intelligence.listing-meta.v1",
        kind: "outage",
        outage: true,
        labSchedule: true,
        claimAuthority: "none",
      },
      fetchMeta: {
        mode: "partial",
        httpStatus: result.httpStatus,
        fetchedAt: result.fetchedAt,
        bodySha256: result.sha256,
        partial: true,
        error: result.error,
      },
      error: result.error,
    };
  }
  const payload = jsonBody(result);
  const items = Array.isArray(payload?.bounties) ? payload.bounties : [];
  const ctx = {
    now: observedAt,
    dataLabel: "live-capture",
    fixtureKind: null,
    observedAt: result.fetchedAt,
    captureMode: "live_public",
    httpStatus: result.httpStatus,
    bodySha256: result.sha256,
    publishedAt: payload?.publishedAt,
    boundary: payload?.boundary,
  };
  const records = items.slice(0, limit).map((item) => normalizeScheduleItem(item, ctx));
  return {
    adapter: name,
    records,
    listingMeta: {
      schema: "s277.bounty-intelligence.listing-meta.v1",
      kind: "lab_schedule",
      labSchedule: true,
      notPaidAgentJobs: true,
      claimAuthority: "none",
      boundary: payload?.boundary || null,
    },
    fetchMeta: {
      mode: "live_public",
      httpStatus: result.httpStatus,
      fetchedAt: result.fetchedAt,
      bodySha256: result.sha256,
      partial: false,
      url: NEOMORPHIC_BOUNTIES_URL,
    },
    error: null,
  };
}
