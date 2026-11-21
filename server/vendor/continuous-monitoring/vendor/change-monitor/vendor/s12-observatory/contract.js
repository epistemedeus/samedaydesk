/**
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 SameDayDesk / Neomorphic LLC
 *
 * Named-source observatory contract consumed by /labs/agent-economy-observatory/.
 * Browser talks to SameDayDesk. Upstreams stay labelled. Sources are not additive.
 */
export const SCHEMA_VERSION = "pilot.external-observatory.v1";
export const BRIDGE_TRANSPORT = "samedaydesk-bridge";
export const DEFAULT_BRIDGE_ORIGIN = "https://samedaydesk.com";
export const OBSERVATORY_ROUTE = "/api/observatory";
export const DEFAULT_BRIDGE_BASE = `${DEFAULT_BRIDGE_ORIGIN}${OBSERVATORY_ROUTE}`;

export const SOURCE_IDS = Object.freeze(["moltjobs", "x402stats", "smithery_mcp"]);

export const SOURCE_KIND = Object.freeze({
  moltjobs: "work_market",
  x402stats: "settlement",
  smithery_mcp: "capability_discovery",
});

export const UPSTREAM_URL = Object.freeze({
  moltjobs: "https://api.moltjobs.io/v1/stats",
  x402stats: "https://x402stats.io/api/stats",
  smithery_mcp: "https://api.smithery.ai/servers?pageSize=1",
});

export const UNAVAILABLE_SOURCES = Object.freeze([
  {
    id: "x402scan",
    reason: "x402scan data endpoints require micropayment",
    called: false,
  },
]);

export const NAMED_SOURCES = Object.freeze([
  {
    sourceId: "moltjobs",
    sourceKind: "work_market",
    title: "Work market",
    upstreamUrl: UPSTREAM_URL.moltjobs,
    establishes:
      "MoltJobs provider aggregates split into totals (including platform programs), ordinary marketplace work, liquidity agent sets, and itemised platform programs at the moment of this fetch. Totals versus marketplace is a composition, not a funnel.",
    doesNotEstablish:
      "Agent traffic, unique users, customers, repeat demand, a registration-to-paid conversion funnel, profit, or a total of the agent economy.",
  },
  {
    sourceId: "x402stats",
    sourceKind: "settlement",
    title: "Settlement",
    upstreamUrl: UPSTREAM_URL.x402stats,
    establishes:
      "x402stats provider rolling-window settlement aggregates for wallets that provider indexed. Organic fields are that provider's heuristic.",
    doesNotEstablish:
      "Global agent traffic, unique customers, independently verified organic demand, a paid-customer population distinct from indexed sellers, or a sum with other sources.",
  },
  {
    sourceId: "smithery_mcp",
    sourceKind: "capability_discovery",
    title: "Capability discovery",
    upstreamUrl: UPSTREAM_URL.smithery_mcp,
    establishes:
      "A Smithery catalog registration count (pagination.totalCount) and, when present, one catalog row from the bounded excerpt.",
    doesNotEstablish:
      "Runtime heartbeats, active traffic, installs, paid customers, or that a capability is safe or paid.",
  },
]);

export const REFUSED_RATIO_CATALOG = Object.freeze([
  Object.freeze({
    sourceId: "moltjobs",
    key: "everPaid_over_registered",
    numeratorKey: "liquidityAgentsEverPaid",
    denominatorKey: "liquidityRegisteredAgents",
    reason: "data.liquidity.agentsEverPaid and data.liquidity.registeredAgents are different populations, not a conversion funnel.",
  }),
  Object.freeze({
    sourceId: "moltjobs",
    key: "bidding30d_over_registered",
    numeratorKey: "liquidityAgentsBidding30d",
    denominatorKey: "liquidityRegisteredAgents",
    reason: "agentsBidding30d is a 30-day window; registeredAgents is the lifetime agent-record population.",
  }),
  Object.freeze({
    sourceId: "moltjobs",
    key: "everPaid_over_bidding30d",
    numeratorKey: "liquidityAgentsEverPaid",
    denominatorKey: "liquidityAgentsBidding30d",
    reason: "Lifetime ever-paid vs 30-day bidding. Populations and windows do not align.",
  }),
  Object.freeze({
    sourceId: "moltjobs",
    key: "marketplaceCompleted_over_totalCompleted",
    numeratorKey: "marketplaceCompleted",
    denominatorKey: "completedCount",
    reason: "marketplace.completed excludes platform programs; data.totalCompleted includes them.",
  }),
  Object.freeze({
    sourceId: "moltjobs",
    key: "marketplaceSettledVolume_over_totalVolume",
    numeratorKey: "marketplaceSettledVolumeUsdc",
    denominatorKey: "volumeUsdc",
    reason: "Ordinary settled volume vs totals that include platform programs.",
  }),
  Object.freeze({
    sourceId: "moltjobs",
    key: "marketplaceJobs_over_totalJobs_as_conversion",
    numeratorKey: "marketplaceJobs",
    denominatorKey: "jobCount",
    reason: "Totals vs marketplace is composition (programs + ordinary), not conversion from attention to paid demand.",
  }),
  Object.freeze({
    sourceId: "x402stats",
    key: "organicSellers_over_sellers_as_paid_conversion",
    numeratorKey: "organic_sellers_30d",
    denominatorKey: "sellers_30d",
    reason: "organicSellers is a provider heuristic, not a paid-customer population.",
  }),
  Object.freeze({
    sourceId: "smithery_mcp",
    key: "registered_servers_as_paid_customers",
    numeratorKey: "registered_servers",
    denominatorKey: null,
    reason: "A catalog registration count is not paid demand, traffic, or unique customers.",
  }),
  Object.freeze({
    sourceId: "cross_source",
    key: "any_moltjobs_over_x402stats_or_smithery",
    numeratorKey: null,
    denominatorKey: null,
    reason: "Named sources are not additive. Any MoltJobs metric over any x402stats or smithery metric is refused.",
  }),
  Object.freeze({
    sourceId: "cross_source",
    key: "moltjobs_marketplace_volume_plus_x402_volume",
    numeratorKey: "marketplaceSettledVolumeUsdc",
    denominatorKey: "volume_usd_30d",
    reason: "Named sources are not additive. MoltJobs USDC and x402stats USD do not share a definition.",
  }),
]);

export const METRIC_COPY = Object.freeze({
  moltjobs: {
    jobCount: { label: "Listed jobs", not: "agent traffic, customers, or demand" },
    completedCount: { label: "Completed jobs", not: "customers or profit" },
    registeredAgents: { label: "Registered agents (provider count)", not: "customers, unique users, or live traffic" },
    posts: { label: "Posts", not: "job count or traffic" },
    volumeUsdc: { label: "Reported volume", not: "profit, Neomorphic revenue, or banked settlement" },
    escrowDeposits: { label: "Currently escrowed", not: "profit or available cash" },
    settledTransfers: { label: "Settled transfers", not: "volume, profit, or chain settlement" },
    avgCompletionTimeMs: { label: "Average completion time", not: "a guarantee for future jobs" },
    medianCompletionTimeMs: { label: "Median completion time", not: "a guarantee for future jobs" },
    avgTimeToFillMs: { label: "Average time to fill", not: "a live SLA" },
    medianTimeToFillMs: { label: "Median time to fill", not: "a live SLA" },
    completionSampleSize: { label: "Completion-time sample size", not: "the full completed-job count" },
    disputeRate: { label: "Dispute rate (provider)", not: "a legal finding" },
    completionRatio: { label: "Completed jobs / listed jobs", not: "traffic share or paid conversion" },
    escrowToVolumeRatio: { label: "Escrowed / reported volume", not: "utilization or locked profit" },
    marketplaceJobs: { label: "Ordinary marketplace jobs", not: "totals (which include platform programs) or a conversion from attention" },
    marketplaceCompleted: { label: "Ordinary marketplace jobs that settled", not: "repeat demand or unique customers" },
    marketplaceSettledVolumeUsdc: { label: "USDC released on ordinary work", not: "totals volume, SameDayDesk revenue, or repeat demand" },
    marketplaceEmployers: { label: "Ordinary employers who posted work", not: "unique humans or paid customers" },
    marketplaceFundedEmployers: { label: "Ordinary employers who funded escrow", not: "unique humans or repeat demand" },
    marketplaceCompletionRatio: { label: "Marketplace settled / ordinary jobs", not: "a registration-to-paid funnel or repeat demand" },
    marketplaceFundedEmployerRatio: { label: "Funded employers / ordinary employers", not: "unique humans or a traffic conversion" },
    liquidityRegisteredAgents: { label: "Registered agent records (liquidity)", not: "a conversion-funnel denominator, unique users, or paid demand" },
    liquidityAgentsEverPaid: { label: "Agents ever paid (liquidity)", not: "unique humans or a conversion from registrations" },
    liquidityAgentsBidding30d: { label: "Agents bidding in 30 days", not: "lifetime registered agents or paid customers" },
    platformProgramJobs: { label: "Platform-program jobs (sum)", not: "ordinary marketplace demand" },
    platformProgramBudgetUsdc: { label: "Platform-program budget USDC (sum)", not: "ordinary marketplace volume or SameDayDesk revenue" },
  },
  x402stats: {
    sellers_30d: { label: "Indexed sellers", not: "unique customers or global agent traffic" },
    volume_usd_30d: { label: "Indexed volume USD", not: "global agent traffic or Neomorphic revenue" },
    organic_sellers_30d: {
      label: "Organic sellers (provider heuristic)",
      not: "unique customers or independently verified organic demand",
    },
    organic_volume_usd_30d: {
      label: "Organic volume USD (provider heuristic)",
      not: "independently verified organic demand or a sum with other sources",
    },
    median_seller_revenue_usd_30d: { label: "Median seller revenue USD", not: "typical agent income" },
    avg_payment_usd_30d: { label: "Average payment USD", not: "a price index for the agent economy" },
    top10_volume_share_30d: { label: "Top-10 volume share", not: "a market-concentration legal finding" },
  },
  smithery_mcp: {
    registered_servers: { label: "Catalog registrations", not: "runtime heartbeats, active traffic, or installs" },
  },
});

export function originBase(origin) {
  const text = String(origin || DEFAULT_BRIDGE_ORIGIN);
  return text.endsWith("/") ? text : `${text}/`;
}

export function resolveBridgeBase(value, { currentOrigin } = {}) {
  const raw = typeof value === "string" ? value.trim() : "";
  const fallbackOrigin =
    currentOrigin ||
    (typeof location !== "undefined" && location.origin) ||
    DEFAULT_BRIDGE_ORIGIN;
  if (!raw) return DEFAULT_BRIDGE_BASE;

  let url;
  try {
    url = new URL(raw, originBase(fallbackOrigin));
  } catch {
    return DEFAULT_BRIDGE_BASE;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return DEFAULT_BRIDGE_BASE;

  let path = url.pathname || "/";
  path = path.replace(/\/+$/, "") || "/";
  if (path === "/") {
    url.pathname = OBSERVATORY_ROUTE;
  } else if (/\/api\/observatory(?:\/|$)/.test(path)) {
    url.pathname = path.replace(/\/(snapshot|sources(?:\/[^/]+)?)\/?$/, "") || OBSERVATORY_ROUTE;
    if (!/\/api\/observatory$/.test(url.pathname.replace(/\/+$/, ""))) {
      url.pathname = OBSERVATORY_ROUTE;
    }
  } else {
    url.pathname = OBSERVATORY_ROUTE;
  }
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

export function observatoryUrls(bridgeBase, { currentOrigin } = {}) {
  const base = resolveBridgeBase(bridgeBase, { currentOrigin });
  return {
    base,
    snapshot: `${base}/snapshot`,
    sources: `${base}/sources`,
    source(id) {
      return `${base}/sources/${encodeURIComponent(id)}`;
    },
  };
}

export function namedSource(sourceId) {
  return NAMED_SOURCES.find((entry) => entry.sourceId === sourceId) || null;
}

export function isNamedSourceId(sourceId) {
  return SOURCE_IDS.includes(sourceId);
}
