import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EARNINGS_STATUS,
  ERROR_CODES,
  EVENT_KINDS,
  PROVIDERS,
  SUMMARY_SCHEMA,
  SUMMARY_STATUS,
  assertCaptureDistinct,
  assertNoSyntheticRevenue,
  collectReadback,
  validateEvents,
  validateSummary,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T19:15:00.000Z");

test("positive: Grexal listed PUBLIC_ACTIVE + priced 0.02 + runs; Agensi reviewed; earnings unavailable", () => {
  const summary = collectReadback(load("events.positive.json"), { clock });
  assert.equal(summary.schema, SUMMARY_SCHEMA);
  assert.equal(summary.status, SUMMARY_STATUS.RECORDED);
  assert.equal(summary.generatedAt, "2026-09-10T19:15:00.000Z");
  assert.equal(summary.countsByKind[EVENT_KINDS.LISTED], 1);
  assert.equal(summary.countsByKind[EVENT_KINDS.DRAFT], 0);
  assert.equal(summary.countsByKind[EVENT_KINDS.RUN], 2);
  assert.equal(summary.countsByKind[EVENT_KINDS.REVIEWED], 1);
  assert.equal(summary.countsByKind[EVENT_KINDS.EARNINGS], 0);
  assert.equal(summary.countsByKind[EVENT_KINDS.INSTALL], 0);
  assert.equal(summary.countsByProvider[PROVIDERS.GREXAL], 3);
  assert.equal(summary.countsByProvider[PROVIDERS.AGENSI], 1);
  assert.equal(summary.installCount, 0);
  assert.equal(summary.runCount, 2);
  assert.equal(summary.lastObserved.grexal.kind, EVENT_KINDS.LISTED);
  assert.match(summary.lastObserved.grexal.evidenceRef, /receipts-grexal-s149\.json/);
  assert.equal(summary.lastObserved.agensi.kind, EVENT_KINDS.REVIEWED);
  // Pricing from S149 is observed but is NOT earnings
  assert.equal(summary.pricingObserved.length, 1);
  assert.equal(summary.pricingObserved[0].run_completed_usd, 0.02);
  assert.equal(summary.pricingObserved[0].estimate_reserve_usd, 0.025);
  assert.equal(summary.pricingObserved[0].estimateReserveIsCharge, false);
  assert.match(summary.pricingObserved[0].evidenceRef, /receipts-grexal-s149\.json/);
  assert.equal(summary.earnings.status, EARNINGS_STATUS.UNAVAILABLE);
  assert.equal(summary.earnings.amounts.length, 0);
  assert.match(summary.earnings.reason, /unavailable|pricing/i);
  assert.equal(summary.mutationBoundary.executesProviderMutations, false);
  assert.equal(assertNoSyntheticRevenue(summary), true);
  validateSummary(summary);
});

test("negative: other marketplace provider rejected", () => {
  assert.throws(
    () => validateEvents(load("events.other-marketplace.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_PROVIDER,
  );
  assert.throws(
    () => collectReadback(load("events.other-marketplace.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_PROVIDER,
  );
});

test("negative: synthetic earnings rejected", () => {
  assert.throws(
    () => validateEvents(load("events.synthetic-earnings.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
  assert.throws(
    () => collectReadback(load("events.synthetic-earnings.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("negative: earnings without evidenceRef rejected", () => {
  assert.throws(
    () => validateEvents(load("events.earnings-no-ref.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("negative: malformed / forbidden claim fields rejected", () => {
  assert.throws(
    () => validateEvents(load("events.malformed.json")),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_CLAIM || err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("partial: missing evidenceRef → partial status + missingInputs", () => {
  const summary = collectReadback(load("events.partial.json"), { clock });
  assert.equal(summary.status, SUMMARY_STATUS.PARTIAL);
  assert.ok(summary.missingInputs.some((m) => m.includes("evidenceRef")));
  assert.ok(summary.eventsWithGaps >= 1);
  assert.equal(summary.countsByKind[EVENT_KINDS.LISTED], 1);
  assert.equal(summary.countsByKind[EVENT_KINDS.RUN], 1);
  assert.equal(summary.pricingObserved[0]?.run_completed_usd, 0.02);
  validateSummary(summary);
});

test("unavailable: capture unavailable omits installCount/runCount", () => {
  const summary = collectReadback(load("events.unavailable.json"), { clock });
  assert.equal(summary.status, SUMMARY_STATUS.UNAVAILABLE);
  assert.equal(summary.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "installCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, "runCount"), false);
  assert.equal(summary.earnings.status, EARNINGS_STATUS.UNAVAILABLE);
  validateSummary(summary);
});

test("no_users: capture ok with zero install/run is distinct; pricing still not earnings", () => {
  const summary = collectReadback(load("events.no-users.json"), { clock });
  assert.equal(summary.status, SUMMARY_STATUS.NO_USERS);
  assert.equal(summary.code, ERROR_CODES.NO_USERS);
  assert.equal(summary.installCount, 0);
  assert.equal(summary.runCount, 0);
  assert.equal(summary.countsByKind[EVENT_KINDS.LISTED], 1);
  assert.equal(summary.countsByKind[EVENT_KINDS.REVIEWED], 1);
  assert.equal(summary.pricingObserved[0]?.run_completed_usd, 0.02);
  assert.equal(summary.earnings.status, EARNINGS_STATUS.UNAVAILABLE);
  assert.equal(assertNoSyntheticRevenue(summary), true);
  validateSummary(summary);
});

test("explicit: unavailable ≠ no_users (status, codes, install/run fields)", () => {
  const unavailable = collectReadback(load("events.unavailable.json"), { clock });
  const noUsers = collectReadback(load("events.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(unavailable.code, noUsers.code);
  assert.equal(Object.prototype.hasOwnProperty.call(unavailable, "installCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(unavailable, "runCount"), false);
  assert.equal(noUsers.installCount, 0);
  assert.equal(noUsers.runCount, 0);
});

test("validateSummary rejects collapsed unavailable+installCount via labels", () => {
  const summary = collectReadback(load("events.unavailable.json"), { clock });
  summary.labels = { collapsedUnavailableAsNoUsers: true };
  assert.throws(
    () => validateSummary(summary),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("validateSummary rejects unavailable earnings with invented amounts", () => {
  const summary = collectReadback(load("events.positive.json"), { clock });
  assert.equal(summary.earnings.status, EARNINGS_STATUS.UNAVAILABLE);
  summary.earnings.amounts = [
    { value: 0, currency: "USD", evidenceRef: "fake", synthetic: false },
  ];
  assert.throws(
    () => validateSummary(summary),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("validateSummary rejects zeroRevenueClaim on unavailable earnings", () => {
  const summary = collectReadback(load("events.positive.json"), { clock });
  summary.earnings.zeroRevenueClaim = true;
  assert.throws(
    () => validateSummary(summary),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("pricing ≠ earnings: S149 0.02 must not appear in earnings.amounts", () => {
  const summary = collectReadback(load("events.positive.json"), { clock });
  assert.equal(summary.pricingObserved[0].run_completed_usd, 0.02);
  assert.equal(summary.earnings.amounts.length, 0);
  assert.equal(summary.earnings.status, EARNINGS_STATUS.UNAVAILABLE);
  // Poison: copy pricing into earnings
  const poisoned = structuredClone(summary);
  poisoned.earnings.status = EARNINGS_STATUS.OBSERVED;
  poisoned.earnings.amounts = [
    {
      value: 0.02,
      currency: "USD",
      evidenceRef: summary.pricingObserved[0].evidenceRef,
      // still not a payout — but if someone stamps observed without real payout evidence
    },
  ];
  // observed with evidenceRef validates structurally; assertNoSyntheticRevenue allows it
  // The invariant we enforce in DEMO/docs: pricingObserved is separate. Hard reject if
  // unavailable earnings somehow carry the pricing amount:
  const badUnavailable = structuredClone(summary);
  badUnavailable.earnings.amounts = [{ value: 0.02, currency: "USD", evidenceRef: "s149" }];
  assert.throws(
    () => validateSummary(badUnavailable),
    (err) => err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("providers limited to grexal|agensi", () => {
  for (const p of ["grexal", "agensi"]) {
    assert.ok(Object.values(PROVIDERS).includes(p), `missing provider ${p}`);
  }
  assert.equal(Object.values(PROVIDERS).length, 2);
});

test("observed earnings pass through amounts only when evidence present", () => {
  const withEarnings = {
    schema: "pilot.r2.distribution.marketplace_events.v1",
    cite: "synthetic unit — observed earnings with evidenceRef",
    captureStatus: "ok",
    events: [
      {
        kind: "run",
        provider: "grexal",
        at: "2026-09-10T10:50:00.000Z",
        evidenceRef: "s124-run",
      },
      {
        kind: "earnings",
        provider: "grexal",
        at: "2026-09-10T11:00:00.000Z",
        evidenceRef: "hypothetical-receipt-only-for-unit-test",
        amount: { value: 1.25, currency: "USD" },
      },
    ],
  };
  const summary = collectReadback(withEarnings, { clock });
  assert.equal(summary.status, SUMMARY_STATUS.RECORDED);
  assert.equal(summary.earnings.status, EARNINGS_STATUS.OBSERVED);
  assert.equal(summary.earnings.amounts.length, 1);
  assert.equal(summary.earnings.amounts[0].value, 1.25);
  assert.equal(summary.earnings.amounts[0].evidenceRef, "hypothetical-receipt-only-for-unit-test");
  assert.equal(assertNoSyntheticRevenue(summary), true);
  validateSummary(summary);
});
