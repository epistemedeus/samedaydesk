import {
  ADAPTERS,
  AUTH_BOUNDARIES,
  MOLTJOBS_LIST_URL,
  VENDOR_ADAPTERS,
} from "../constants.mjs";
import { buildRecord } from "../record.mjs";
import { unwrapFixture, readJson } from "../fixture.mjs";
import { httpGet, jsonBody } from "../http.mjs";
import { sha256Bytes } from "../hash.mjs";
import { nowIso } from "../clock.mjs";
import { FUNDING, CLAIM_STATE } from "../constants.mjs";

export const name = ADAPTERS.MOLTJOBS;
export const vendorAdapter = VENDOR_ADAPTERS.moltjobs;
export const liveUrl = MOLTJOBS_LIST_URL;

function forumKind(data) {
  const inputData = data.inputData && typeof data.inputData === "object" ? data.inputData : {};
  const purpose = String(data.purpose || "");
  const participation = String(data.participationMode || inputData.participationMode || "");
  const slot = data.forumRewardSlot && typeof data.forumRewardSlot === "object" ? data.forumRewardSlot : {};
  const campaign = inputData.forumRewardCampaignId || slot.campaignId;
  if (purpose === "PLATFORM_REFERRAL" || purpose.includes("REFERRAL")) {
    return "referral_campaign";
  }
  if (purpose === "PLATFORM_MARKETING" || participation.toUpperCase().includes("FORUM_REWARD") || campaign) {
    return "forum_marketing";
  }
  if (data.sourceForumThreadId || data.sourceForumReplyId) return "forum_linked";
  return "moltjobs_list_job";
}

function fundingOf(data) {
  if (data.escrowTxHash) {
    return {
      status: FUNDING.RESERVED,
      evidenceKind: "platform_escrow_hash_assertion",
      present: true,
      escrowTxHash: data.escrowTxHash,
    };
  }
  if (data.funded === true) {
    return {
      status: FUNDING.RESERVED,
      evidenceKind: "platform_funded_flag",
      present: true,
      escrowTxHash: null,
    };
  }
  if (data.funded === false) {
    return {
      status: FUNDING.UNFUNDED,
      evidenceKind: "platform_funded_flag",
      present: false,
      escrowTxHash: null,
    };
  }
  return {
    status: FUNDING.UNKNOWN,
    evidenceKind: "unknown",
    present: null,
    escrowTxHash: null,
  };
}

function lifecycleOf(status) {
  const raw = String(status || "unknown");
  const u = raw.toUpperCase();
  if (["CANCELLED", "CANCELED"].includes(u)) return { lifecycle: "cancelled", cancelled: true, closed: false };
  if (["COMPLETED", "COMPLETE", "CLOSED", "PAID"].includes(u)) {
    return { lifecycle: "closed", cancelled: false, closed: true };
  }
  if (["OPEN", "BIDDING"].includes(u)) return { lifecycle: "open", cancelled: false, closed: false };
  return { lifecycle: "unknown", cancelled: false, closed: false };
}

export function normalizeJob(data, ctx) {
  const inputData = data.inputData && typeof data.inputData === "object" ? data.inputData : {};
  const kind = forumKind(data);
  const life = lifecycleOf(data.status);
  const fund = fundingOf(data);
  const chainId = data.chainId;
  const network = chainId === 8453 ? "base" : chainId == null ? null : `chainId:${chainId}`;
  const desc = typeof inputData.generalDescription === "string" ? inputData.generalDescription : null;
  const criteria = Array.isArray(data.acceptanceCriteria)
    ? data.acceptanceCriteria
        .filter((x) => x && typeof x === "object")
        .map((x) => x.description)
        .filter(Boolean)
        .join("\n")
    : null;
  const terms = [desc, criteria].filter(Boolean).join("\n\n") || null;

  const isForum = ["referral_campaign", "forum_marketing", "forum_linked"].includes(kind);
  const prerequisites = [];
  if (isForum) {
    prerequisites.push("Forum participation per source note (not a claim-slot job)");
    prerequisites.push("Source says posting/quality review; remaining reward balance is unverified");
  } else {
    prerequisites.push("MoltJobs account; public list does not expose a claim endpoint");
    prerequisites.push("GET /v1/jobs/{id} is auth-gated (401 without credentials)");
  }

  return buildRecord({
    now: ctx.now,
    dataLabel: ctx.dataLabel,
    fixtureKind: ctx.fixtureKind,
    adapter: name,
    kind,
    url: `${MOLTJOBS_LIST_URL}/${data.id}/public`,
    nativeId: data.id || null,
    vendorAdapter,
    classificationKind: kind,
    title: data.title || "",
    description: desc,
    lifecycle: life.lifecycle,
    statusRaw: data.status || null,
    cancelled: life.cancelled,
    closed: life.closed,
    rewardAmount: data.budgetUsdc,
    rewardAsset: data.tokenSymbol || (data.budgetUsdc != null ? "USDC" : null),
    rewardNetwork: network,
    rewardProvenance: data.budgetUsdc != null ? "platform_budget" : "unknown",
    fundingStatus: fund.status,
    fundingEvidenceKind: fund.evidenceKind,
    fundingPresent: fund.present,
    escrowTxHash: fund.escrowTxHash,
    claimState: CLAIM_STATE.UNKNOWN,
    prerequisites,
    identityRequired: true,
    firstDollar: "unknown",
    walletlessEligibility: "unknown",
    deadlineAt: data.deadlineAt || null,
    sourceCreatedAt: data.createdAt || null,
    sourceUpdatedAt: data.updatedAt || null,
    observedAt: ctx.observedAt,
    captureMode: ctx.captureMode,
    httpStatus: ctx.httpStatus,
    bodySha256: ctx.bodySha256,
    verificationPaymentTerms: terms,
    authBoundary: AUTH_BOUNDARIES.moltjobs,
    raw: { id: data.id, status: data.status, purpose: data.purpose, funded: data.funded },
  });
}

function listingMeta(meta, jobs, { includeMarketing }) {
  return {
    schema: "s277.bounty-intelligence.listing-meta.v1",
    kind: "job_list_page",
    notTasks: false,
    marketingTotalsAreNotTasks: true,
    claimAuthority: "none",
    fundingAuthority: "none",
    jobCount: jobs.length,
    nextCursor: meta?.nextCursor ?? null,
    hasMore: meta?.hasMore ?? null,
    publicDetailRoute: meta?.publicDetailRoute ?? "/v1/jobs/:id/public",
    disclaimer:
      "List page is discovery only. Forum marketing/referral rows are not claim-slot jobs. Escrow hash is not remaining claimable balance.",
    includeMarketing,
  };
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
    if (!fixturePath) throw new Error("moltjobs fixture mode requires fixturePath");
    const wrapped = unwrapFixture(readJson(fixturePath));
    const inner = wrapped.inner;
    const rows = Array.isArray(inner?.data) ? inner.data : Array.isArray(inner) ? inner : [];
    const body = Buffer.from(JSON.stringify(inner));
    const ctx = {
      now: observedAt,
      dataLabel: wrapped.dataLabel,
      fixtureKind: wrapped.fixtureKind,
      observedAt: wrapped.capturedAt || observedAt,
      captureMode: "captured_fixture",
      httpStatus: 200,
      bodySha256: sha256Bytes(body),
    };
    const records = rows.slice(0, limit).map((row) => normalizeJob(row, ctx));
    return {
      adapter: name,
      records,
      listingMeta: listingMeta(inner?.meta, records, { includeMarketing: true }),
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

  const url = `${MOLTJOBS_LIST_URL}?limit=${encodeURIComponent(String(limit))}&status=OPEN`;
  const result = await get(url, { now: observedAt });
  if (!result.ok) {
    return {
      adapter: name,
      records: [],
      listingMeta: {
        schema: "s277.bounty-intelligence.listing-meta.v1",
        kind: "outage",
        outage: true,
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
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const ctx = {
    now: observedAt,
    dataLabel: "live-capture",
    fixtureKind: null,
    observedAt: result.fetchedAt,
    captureMode: "live_public",
    httpStatus: result.httpStatus,
    bodySha256: result.sha256,
  };
  const records = rows.map((row) => normalizeJob(row, ctx));
  return {
    adapter: name,
    records,
    listingMeta: listingMeta(payload?.meta, records, { includeMarketing: true }),
    fetchMeta: {
      mode: "live_public",
      httpStatus: result.httpStatus,
      fetchedAt: result.fetchedAt,
      bodySha256: result.sha256,
      partial: false,
      url,
    },
    error: null,
    raw: payload,
  };
}
