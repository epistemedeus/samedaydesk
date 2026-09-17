import { SCHEMA } from "./cohort.mjs";
import {
  ENGINE_CLASSIFY,
  ENGINE_MARKET,
  ENGINE_MOLTJOBS,
  ENGINE_X402STATS,
  seededFixture,
} from "./paths.mjs";
import {
  PINNED_FETCHED_AT,
  PINNED_NOW_MS,
  classifyPair,
  metricValue,
  naiveClassify,
  naiveStaleRewrite,
  runAdapters,
} from "./engine.mjs";

const ENGINES = {
  classify: ENGINE_CLASSIFY,
  marketObs: ENGINE_MARKET,
  moltjobs: ENGINE_MOLTJOBS,
  x402stats: ENGINE_X402STATS,
};

function report({ id, rejected, code, message, extra = {} }) {
  return {
    schema: SCHEMA,
    ok: rejected === true,
    mode: "seeded-failure",
    id,
    rejected,
    code,
    message,
    engine: ENGINES,
    paymentSent: false,
    checkout: false,
    publish: false,
    ...extra,
  };
}

function futureAsOk() {
  const probe = seededFixture("future-as-ok.json");
  const pair = classifyPair(probe.providerTimestamp, probe.fetchedAt, PINNED_NOW_MS);
  const naive = naiveClassify(probe.providerTimestamp);
  const adapters = runAdapters(probe.fetchedAt, probe.providerTimestamp, PINNED_NOW_MS);
  const rejected =
    pair.observatory.state === "invalid" &&
    naive.state === "ok" &&
    probe.claim.observatoryState === "ok" &&
    adapters.moltjobs.providerTimestampState === "invalid" &&
    adapters.x402stats.providerTimestampState === "invalid" &&
    adapters.x402stats.availability === "partial" &&
    metricValue(adapters.moltjobs, "jobCount") === 12 &&
    metricValue(adapters.x402stats, "sellers_30d") === 47303;
  return report({
    id: "future-as-ok",
    rejected,
    code: rejected ? "future_skew_not_ok" : "future_skew_accepted",
    message: rejected
      ? "Published classifyProviderTimestamp rejects a provider clock more than FUTURE_SKEW_MS ahead; naive ok-claim is refused"
      : "future-skewed provider clock was accepted as ok",
    extra: {
      fetchedAt: probe.fetchedAt,
      providerTimestamp: probe.providerTimestamp,
      engineState: pair.observatory.state,
      naiveState: naive.state,
      claim: probe.claim,
      moltjobsState: adapters.moltjobs.providerTimestampState,
      x402statsState: adapters.x402stats.providerTimestampState,
      x402statsAvailability: adapters.x402stats.availability,
      jobCount: metricValue(adapters.moltjobs, "jobCount"),
      sellers_30d: metricValue(adapters.x402stats, "sellers_30d"),
    },
  });
}

function staleAsFreshZero() {
  const probe = seededFixture("stale-as-fresh-zero.json");
  const pair = classifyPair(probe.providerTimestamp, probe.fetchedAt, PINNED_NOW_MS);
  const adapters = runAdapters(probe.fetchedAt, probe.providerTimestamp, PINNED_NOW_MS);
  const naive = naiveStaleRewrite(adapters.moltjobs);
  const rejected =
    pair.observatory.state === "stale" &&
    adapters.moltjobs.availability === "stale" &&
    adapters.x402stats.availability === "stale" &&
    metricValue(adapters.moltjobs, "jobCount") === 12 &&
    metricValue(adapters.x402stats, "sellers_30d") === 47303 &&
    naive.availability === "ok" &&
    naive.metrics[0].value === 0 &&
    probe.claim.availability === "ok" &&
    probe.claim.jobCount === 0;
  return report({
    id: "stale-as-fresh-zero",
    rejected,
    code: rejected ? "stale_not_rewritten_as_fresh_zero" : "stale_rewritten",
    message: rejected
      ? "Stale provider clock stays stale and keeps metric values; naive fresh-zero rewrite is refused"
      : "stale provider clock was rewritten as a fresh zero",
    extra: {
      engineState: pair.observatory.state,
      moltjobsAvailability: adapters.moltjobs.availability,
      x402statsAvailability: adapters.x402stats.availability,
      jobCount: metricValue(adapters.moltjobs, "jobCount"),
      sellers_30d: metricValue(adapters.x402stats, "sellers_30d"),
      naiveAvailability: naive.availability,
      claim: probe.claim,
    },
  });
}

function collapseClocks() {
  const probe = seededFixture("collapse-clocks.json");
  const pair = classifyPair(probe.providerTimestamp, probe.fetchedAt, PINNED_NOW_MS);
  const adapters = runAdapters(probe.fetchedAt, probe.providerTimestamp, PINNED_NOW_MS);
  const rejected =
    pair.observatory.timestamp === probe.providerTimestamp &&
    pair.observatory.timestamp !== probe.fetchedAt &&
    adapters.moltjobs.providerTimestamp !== adapters.moltjobs.fetchedAt &&
    adapters.x402stats.providerTimestamp !== adapters.x402stats.fetchedAt &&
    probe.claim.providerTimestamp === probe.fetchedAt;
  return report({
    id: "collapse-clocks",
    rejected,
    code: rejected ? "clocks_must_stay_distinct" : "clocks_collapsed",
    message: rejected
      ? "Provider timestamp stays distinct from observer fetchedAt; naive collapse is refused"
      : "provider clock was collapsed onto fetchedAt",
    extra: {
      fetchedAt: probe.fetchedAt,
      providerTimestamp: pair.observatory.timestamp,
      moltjobsProviderTimestamp: adapters.moltjobs.providerTimestamp,
      moltjobsFetchedAt: adapters.moltjobs.fetchedAt,
      claim: probe.claim,
    },
  });
}

function paymentToCorrectClock() {
  const probe = seededFixture("payment-to-correct-clock.json");
  const refused =
    probe.action === "checkout" ||
    probe.action === "pay" ||
    probe.payment === true ||
    probe.checkout === true;
  return report({
    id: "payment-to-correct-clock",
    rejected: refused === true,
    code: refused ? "payment_forbidden" : "payment_not_refused",
    message: refused
      ? "Clock-skew pack refuses payment/checkout as a way to correct a skewed provider clock"
      : "payment path was not refused",
    extra: {
      action: probe.action || null,
      fetchedAt: PINNED_FETCHED_AT,
    },
  });
}

const HANDLERS = {
  "future-as-ok": futureAsOk,
  "stale-as-fresh-zero": staleAsFreshZero,
  "collapse-clocks": collapseClocks,
  "payment-to-correct-clock": paymentToCorrectClock,
};

export function listSeededFailures() {
  return Object.keys(HANDLERS);
}

export function runSeededFailure(id) {
  const handler = HANDLERS[id];
  if (!handler) {
    return report({
      id,
      rejected: false,
      code: "unknown_seeded_failure",
      message: `unknown seeded failure ${id}`,
    });
  }
  return handler();
}
