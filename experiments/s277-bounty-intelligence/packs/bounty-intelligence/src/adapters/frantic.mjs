import {
  ADAPTERS,
  AUTH_BOUNDARIES,
  FRANTIC_BOARD_URL,
  VENDOR_ADAPTERS,
  FUNDING,
  CLAIM_STATE,
} from "../constants.mjs";
import { buildRecord } from "../record.mjs";
import { unwrapFixture, readJson } from "../fixture.mjs";
import { httpGet, jsonBody } from "../http.mjs";
import { sha256Bytes } from "../hash.mjs";
import { nowIso } from "../clock.mjs";
import { atomicDecimalString, isPositiveAmount } from "../money.mjs";

export const name = ADAPTERS.FRANTIC;
export const vendorAdapter = VENDOR_ADAPTERS.frantic;
export const liveUrl = FRANTIC_BOARD_URL;

const MARKETING_KEYS = [
  "bounties_open",
  "funded_usd",
  "season_total_usd",
  "moved_usd",
  "goodwill_granted",
  "goodwill_granted_cents",
  "operators_enlisted",
  "sworn_count",
];

function lifeOf(workStatus) {
  const raw = String(workStatus || "unknown").toLowerCase();
  if (["cancelled", "canceled", "withdrawn"].includes(raw)) {
    return { lifecycle: "cancelled", cancelled: true, closed: false };
  }
  if (["paid", "delivered", "accepted", "closed", "complete", "completed", "claimed"].includes(raw)) {
    return { lifecycle: "closed", cancelled: false, closed: true };
  }
  if (raw === "open") return { lifecycle: "open", cancelled: false, closed: false };
  return { lifecycle: "unknown", cancelled: false, closed: false };
}

function slotsOf(item) {
  const s = item.claim_slots && typeof item.claim_slots === "object" ? item.claim_slots : {};
  const available = Number.isInteger(s.available) ? s.available : null;
  const capacity = Number.isInteger(s.capacity) ? s.capacity : null;
  const occupied = Number.isInteger(s.occupied) ? s.occupied : null;
  return { available, capacity, occupied };
}

export function normalizeBounty(item, ctx) {
  const life = lifeOf(item.work_status);
  const slots = slotsOf(item);
  const price = atomicDecimalString(item.price_usd);
  const funded = item.funded;
  let fundingStatus = FUNDING.UNKNOWN;
  let evidenceKind = "unknown";
  let present = null;
  if (funded === true) {
    fundingStatus = FUNDING.RESERVED;
    evidenceKind = "platform_funded_flag";
    present = true;
  } else if (funded === false) {
    fundingStatus = FUNDING.UNFUNDED;
    evidenceKind = "platform_funded_flag";
    present = false;
  }
  if (String(item.work_status || "").toLowerCase() === "paid") {
    fundingStatus = FUNDING.RELEASED;
  }

  const claim = item.actions && item.actions.claim && typeof item.actions.claim === "object" ? item.actions.claim : {};
  const requires = Array.isArray(claim.requires) ? claim.requires.map(String) : [];
  const claimAvailable = claim.available === true;
  const noSlots = slots.available === 0;
  const goodwill = price === "0";

  let classificationKind = "external_task";
  if (life.cancelled) classificationKind = "cancelled_bounty";
  else if (life.closed) classificationKind = "settled_bounty";
  else if (goodwill) classificationKind = "goodwill";

  let claimState = CLAIM_STATE.UNKNOWN;
  if (life.closed || life.cancelled || noSlots || claim.available === false) {
    claimState = CLAIM_STATE.NOT_CLAIMABLE;
  } else if (claimAvailable && life.lifecycle === "open" && (slots.available == null || slots.available > 0)) {
    claimState = CLAIM_STATE.CLAIMABLE_WITH_PREREQS;
  }

  const prerequisites = [];
  if (requires.length) prerequisites.push(...requires.map((r) => `frantic.claim.requires:${r}`));
  if (claim.reason) prerequisites.push(String(claim.reason));
  if (claim.endpoint) prerequisites.push(`claim endpoint ${claim.method || "POST"} ${claim.endpoint} (this pack never calls it)`);
  if (!prerequisites.length && claimState === CLAIM_STATE.UNKNOWN) {
    prerequisites.push("Claim path not stated on this row");
  }

  const publicUrl = item.url
    ? item.url.startsWith("http")
      ? item.url
      : `https://gofrantic.com${item.url}`
    : `https://gofrantic.com/bounties/${item.number}`;

  return buildRecord({
    now: ctx.now,
    dataLabel: ctx.dataLabel,
    fixtureKind: ctx.fixtureKind,
    adapter: name,
    kind: "frantic_bounty",
    url: publicUrl,
    nativeId: item.number != null ? String(item.number) : null,
    vendorAdapter,
    classificationKind,
    title: item.title || "",
    description: typeof item.note === "string" ? item.note : null,
    lifecycle: life.lifecycle,
    statusRaw: item.work_status || null,
    cancelled: life.cancelled,
    closed: life.closed,
    rewardAmount: item.price_usd,
    rewardAsset: price != null ? "USD" : null,
    rewardNetwork: null,
    rewardProvenance: price != null ? "sponsor_stated" : "unknown",
    fundingStatus,
    fundingEvidenceKind: evidenceKind,
    fundingPresent: present,
    fundingDisclaimer:
      "On-board funded flag is not verified funding, not remaining claimable balance, and not claim authority. Board marketing counts are not this bounty's funding.",
    claimState,
    prerequisites,
    identityRequired:
      requires.includes("agent_kid") ||
      requires.includes("verified_email_or_runx_github_identity") ||
      claim.state === "requires_identity"
        ? true
        : requires.length
          ? true
          : "unknown",
    firstDollar: "unknown",
    walletlessEligibility: "unknown",
    slotsAvailable: slots.available,
    sourceClaimAvailable: claim.available,
    deadlineAt: item.expires_at || item.expiry || item.deadline_at || null,
    sourceCreatedAt: item.posted_at || null,
    sourceUpdatedAt: item.settled_at || item.posted_at || null,
    observedAt: ctx.observedAt,
    captureMode: ctx.captureMode,
    httpStatus: ctx.httpStatus,
    bodySha256: ctx.bodySha256,
    verificationPaymentTerms: typeof item.note === "string" ? item.note : claim.reason || null,
    authBoundary: AUTH_BOUNDARIES.frantic,
    raw: {
      number: item.number,
      work_status: item.work_status,
      funded: item.funded,
      price_usd: item.price_usd,
      claim_slots: item.claim_slots || null,
    },
  });
}

export function listingMetaFromBoard(board) {
  const counts = {};
  for (const k of MARKETING_KEYS) {
    if (board && k in board) counts[k] = board[k];
  }
  return {
    schema: "s277.bounty-intelligence.listing-meta.v1",
    kind: "board_marketing_counts",
    notTasks: true,
    claimAuthority: "none",
    fundingAuthority: "none",
    counts,
    openBountyCount: Array.isArray(board?.open_bounties) ? board.open_bounties.length : null,
    completedBountyCount: Array.isArray(board?.completed_bounties) ? board.completed_bounties.length : null,
    disclaimer:
      "Board marketing counts (bounties_open, funded_usd, operators_enlisted, and similar) are not tasks and are not funded claim authority. They are never used as demand or rank.",
  };
}

function collectItems(board, limit) {
  const open = Array.isArray(board?.open_bounties) ? board.open_bounties : [];
  const completed = Array.isArray(board?.completed_bounties) ? board.completed_bounties : [];
  const extras = [];
  if (Array.isArray(board?.bounties)) {
    const seen = new Set([...open, ...completed].map((b) => b && b.number));
    for (const b of board.bounties) {
      if (b && !seen.has(b.number)) extras.push(b);
    }
  }
  const closedSlice = completed.slice(0, Math.min(3, completed.length));
  const openSlice = open.slice(0, limit);
  return [...openSlice, ...closedSlice, ...extras.slice(0, 2)];
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
    if (!fixturePath) throw new Error("frantic fixture mode requires fixturePath");
    const wrapped = unwrapFixture(readJson(fixturePath));
    const inner = wrapped.inner;
    const board = inner?.board && typeof inner.board === "object" ? inner.board : inner;
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
    const items = collectItems(board, limit);
    const records = items.filter((x) => x && typeof x === "object").map((item) => normalizeBounty(item, ctx));
    return {
      adapter: name,
      records,
      listingMeta: listingMetaFromBoard(board),
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

  const result = await get(FRANTIC_BOARD_URL, { now: observedAt });
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
  const board = payload?.board && typeof payload.board === "object" ? payload.board : {};
  const ctx = {
    now: observedAt,
    dataLabel: "live-capture",
    fixtureKind: null,
    observedAt: result.fetchedAt,
    captureMode: "live_public",
    httpStatus: result.httpStatus,
    bodySha256: result.sha256,
  };
  const items = collectItems(board, limit);
  const records = items.filter((x) => x && typeof x === "object").map((item) => normalizeBounty(item, ctx));
  return {
    adapter: name,
    records,
    listingMeta: listingMetaFromBoard(board),
    fetchMeta: {
      mode: "live_public",
      httpStatus: result.httpStatus,
      fetchedAt: result.fetchedAt,
      bodySha256: result.sha256,
      partial: false,
      url: FRANTIC_BOARD_URL,
    },
    error: null,
    rawBoardMeta: {
      openCount: Array.isArray(board.open_bounties) ? board.open_bounties.length : null,
      completedCount: Array.isArray(board.completed_bounties) ? board.completed_bounties.length : null,
    },
  };
}

export { isPositiveAmount };
