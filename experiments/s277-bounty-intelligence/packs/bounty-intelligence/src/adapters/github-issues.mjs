import {
  ADAPTERS,
  AUTH_BOUNDARIES,
  VENDOR_ADAPTERS,
  FUNDING,
  CLAIM_STATE,
} from "../constants.mjs";
import { buildRecord } from "../record.mjs";
import { unwrapFixture, readJson } from "../fixture.mjs";
import { httpGet, jsonBody } from "../http.mjs";
import { sha256Bytes } from "../hash.mjs";
import { nowIso } from "../clock.mjs";

export const name = ADAPTERS.GITHUB;
export const vendorAdapter = VENDOR_ADAPTERS["github-issues"];
export const liveUrl = "https://api.github.com/repos/epistemedeus/samedaydesk/issues";

const DEFAULT_REPO = "epistemedeus/samedaydesk";

export function normalizeIssue(issue, ctx) {
  const isPr = Boolean(issue.pull_request);
  const state = String(issue.state || "unknown").toLowerCase();
  const closed = state === "closed";
  const url = issue.html_url || null;
  const body = typeof issue.body === "string" ? issue.body : null;
  return buildRecord({
    now: ctx.now,
    dataLabel: ctx.dataLabel,
    fixtureKind: ctx.fixtureKind,
    adapter: name,
    kind: isPr ? "github_pull_request" : "github_issue",
    url,
    nativeId: issue.number != null ? `${ctx.repo || DEFAULT_REPO}#${issue.number}` : String(issue.id || ""),
    vendorAdapter,
    classificationKind: "unfunded_work_request",
    title: issue.title || "",
    description: body,
    lifecycle: closed ? "closed" : state === "open" ? "open" : "unknown",
    statusRaw: issue.state || null,
    cancelled: false,
    closed,
    rewardAmount: null,
    rewardAsset: null,
    rewardNetwork: null,
    rewardProvenance: "unknown",
    fundingStatus: FUNDING.UNKNOWN,
    fundingEvidenceKind: "not_applicable",
    fundingPresent: false,
    fundingDisclaimer:
      "GitHub issue/comment/PR has no trusted public price field. Bounty prose in the body is not funding. Never invented.",
    claimState: CLAIM_STATE.NOT_CLAIMABLE,
    prerequisites: ["Not a paid agent job on this source", "No public funding field"],
    identityRequired: "unknown",
    firstDollar: "unknown",
    walletlessEligibility: "unknown",
    deadlineAt: null,
    sourceCreatedAt: issue.created_at || null,
    sourceUpdatedAt: issue.updated_at || null,
    observedAt: ctx.observedAt,
    captureMode: ctx.captureMode,
    httpStatus: ctx.httpStatus,
    bodySha256: ctx.bodySha256,
    verificationPaymentTerms: body,
    authBoundary: AUTH_BOUNDARIES["github-issues"],
    contributorPublicId: issue.user && issue.user.login ? `github:${issue.user.login}` : null,
    raw: {
      number: issue.number,
      state: issue.state,
      pull_request: isPr,
      comments: issue.comments ?? null,
    },
  });
}

export async function fetchList({
  mode = "fixture",
  fixturePath,
  now,
  limit = 5,
  repo = DEFAULT_REPO,
  httpGet: get = httpGet,
} = {}) {
  const observedAt = nowIso(now);
  if (mode === "fixture") {
    if (!fixturePath) throw new Error("github fixture mode requires fixturePath");
    const wrapped = unwrapFixture(readJson(fixturePath));
    const inner = wrapped.inner;
    const issues = Array.isArray(inner?.issues) ? inner.issues : Array.isArray(inner) ? inner : [];
    const body = Buffer.from(JSON.stringify(inner));
    const ctx = {
      now: observedAt,
      dataLabel: wrapped.dataLabel,
      fixtureKind: wrapped.fixtureKind,
      observedAt: wrapped.capturedAt || observedAt,
      captureMode: "captured_fixture",
      httpStatus: 200,
      bodySha256: sha256Bytes(body),
      repo: inner?.repo || repo,
    };
    const records = issues.slice(0, limit).map((issue) => normalizeIssue(issue, ctx));
    return {
      adapter: name,
      records,
      listingMeta: {
        schema: "s277.bounty-intelligence.listing-meta.v1",
        kind: "github_issue_list",
        repo: ctx.repo,
        claimAuthority: "none",
        fundingAuthority: "none",
        disclaimer: "Public issues/PRs are work requests, not available paid jobs.",
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

  const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=${encodeURIComponent(String(limit))}`;
  const result = await get(url, {
    now: observedAt,
    accept: "application/vnd.github+json",
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
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
  const issues = Array.isArray(payload) ? payload : [];
  const ctx = {
    now: observedAt,
    dataLabel: "live-capture",
    fixtureKind: null,
    observedAt: result.fetchedAt,
    captureMode: "live_public",
    httpStatus: result.httpStatus,
    bodySha256: result.sha256,
    repo,
  };
  const records = issues.map((issue) => normalizeIssue(issue, ctx));
  return {
    adapter: name,
    records,
    listingMeta: {
      schema: "s277.bounty-intelligence.listing-meta.v1",
      kind: "github_issue_list",
      repo,
      claimAuthority: "none",
      fundingAuthority: "none",
    },
    fetchMeta: {
      mode: "live_public",
      httpStatus: result.httpStatus,
      fetchedAt: result.fetchedAt,
      bodySha256: result.sha256,
      partial: false,
      url,
    },
    error: null,
  };
}
