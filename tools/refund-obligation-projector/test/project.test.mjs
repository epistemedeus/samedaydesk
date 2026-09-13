import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createAdapters } from "../lib/adapters.mjs";
import { classifyRefundClaim } from "../lib/claim.mjs";
import { asRevenue, projectDir, projectRecords } from "../lib/project.mjs";
import { ProjectorRefusal } from "../lib/refuse.mjs";
import { I01_TERMS_PIN, isIntegerTermsVersion, isTermsVersionHash } from "../lib/terms.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seeded = join(here, "../fixtures/seeded");
const adapters = createAdapters();

function settlementRecords() {
  return adapters.evidence
    .listJsonFiles(adapters.evidence.settlementFixtureDir())
    .map((filePath) => adapters.evidence.loadJson(filePath));
}

test("I01 termsVersion is a content hash; integers are rejected", () => {
  assert.equal(isTermsVersionHash(I01_TERMS_PIN.golden), true);
  assert.equal(isIntegerTermsVersion(1), true);
  assert.equal(isIntegerTermsVersion("1"), true);
  const terms = adapters.terms.assertKind(1);
  assert.equal(terms.ok, false);
  assert.equal(terms.code, "integer_terms_version");
  const hash = adapters.terms.assertKind(I01_TERMS_PIN.golden);
  assert.equal(hash.ok, true);
  assert.match(adapters.laterBindings.earnedWorkKernel, /I01/);
  assert.equal(adapters.terms.hashTermsVersion, null);
});

test("committed golden matches the published-fixture journey", () => {
  const report = projectDir();
  assert.equal(report.ok, true);
  const golden = adapters.evidence.loadJson(join(here, "../fixtures/golden/projection.json"));
  assert.deepEqual(golden, { ok: true, projection: report.projection });
});

test("journey: published settlement fixtures project without paid-out rows", () => {
  const report = projectDir();
  assert.equal(report.ok, true, JSON.stringify(report.rejected));
  const projection = report.projection;
  assert.equal(projection.schema, "samedaydesk.refund-obligation-projection.v1");
  assert.equal(projection.mode, "read_only");
  assert.equal(projection.nonsettling, true);
  assert.equal(projection.evidenceKind, "fixture");
  assert.equal(projection.citedBankedUsdc, "8.105");
  assert.equal(projection.citedBankedSpendable, false);
  assert.equal(projection.payableAsserted, false);
  assert.equal(projection.stripeRefundsCalled, false);
  assert.equal(projection.obligationsPostedAsPaid, false);
  assert.equal(projection.revenueAcrossBuyerClass, null);
  assert.equal(projection.paidOut, false);
  assert.equal(projection.records.length, 5);

  const byId = Object.fromEntries(projection.records.map((row) => [row.operationId, row]));
  const agent402 = byId["agent402-external-validation-purchase-2026-08-29"];
  assert.ok(agent402);
  assert.equal(agent402.amountUsdc, "0.010");
  assert.equal(agent402.buyerClass, "unknown");
  assert.equal(
    agent402.delivery,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.match(agent402.delivery, /repair_required/);
  assert.ok(agent402.refundClaim === "not-offered" || agent402.refundClaim === "unknown");
  assert.equal(agent402.refundClaim, "not-offered");
  assert.equal(agent402.paidOut, false);

  assert.equal(byId["early-x402-revenue"].refundClaim, "unknown");
  assert.equal(byId["early-x402-revenue"].delivery, "unknown");
  assert.equal(byId["frantic-42-revenue-2026-06-25"].refundClaim, "none");
  assert.equal(byId["frantic-42-revenue-2026-06-25"].buyerClass, "independent");
  assert.equal(byId["what-agents-buy-independent-benchmark-2026-08-30"].refundClaim, "none");
  assert.equal(byId["payapi-verification-revenue-2026-08-09"].refundClaim, "unknown");

  for (const row of projection.records) {
    assert.equal(row.paidOut, false, row.operationId);
    assert.notEqual(row.refundClaim, "paid-out");
    assert.notEqual(row.refundClaim, "payable");
    assert.notEqual(row.refundClaim, "paid");
    assert.ok(["none", "unknown", "not-offered"].includes(row.refundClaim));
  }
});

test("stripe intake_required is not-offered and is not a live Stripe refund", () => {
  const record = adapters.evidence.loadJson(join(seeded, "stripe-intake-required.json"));
  const report = projectRecords([record], adapters);
  assert.equal(report.ok, true, JSON.stringify(report.rejected));
  assert.equal(report.projection.records[0].refundClaim, "not-offered");
  assert.equal(report.projection.records[0].delivery, "intake_required");
  assert.equal(report.projection.stripeRefundsCalled, false);
});

test("seeded failure: organic label on incentivized_trial is refused", () => {
  const record = adapters.evidence.loadJson(join(seeded, "organic-incentivized-trial.json"));
  const report = projectRecords([record], adapters);
  assert.equal(report.ok, false);
  const codes = report.rejected.flatMap((item) => item.errors.map((error) => error.code));
  assert.ok(
    codes.includes("organic_label_for_controlled_or_incentivized_traffic"),
    JSON.stringify(codes),
  );
});

test("seeded failure: summing independent and owner as revenue is refused", () => {
  const report = projectDir();
  assert.equal(report.ok, true);
  assert.throws(
    () => asRevenue(report.projection),
    (error) => error instanceof ProjectorRefusal && error.code === "sum_across_buyer_class_as_revenue",
  );
  assert.throws(
    () => projectDir(undefined, adapters, { sumAsRevenue: true }),
    (error) => error instanceof ProjectorRefusal && error.code === "sum_across_buyer_class_as_revenue",
  );
});

test("seeded failure: execute-refund is refused and Stripe is not called", () => {
  let called = false;
  const local = createAdapters({
    stripe: {
      executeRefund() {
        called = true;
        adapters.stripe.executeRefund();
      },
    },
  });
  assert.throws(
    () => projectRecords(settlementRecords(), local, { executeRefund: true }),
    (error) => error instanceof ProjectorRefusal && error.code === "execute_refund_refused",
  );
  assert.equal(called, true);
});

test("post-paid obligation writes are refused", () => {
  assert.throws(
    () => projectDir(undefined, adapters, { postPaid: true }),
    (error) => error instanceof ProjectorRefusal && error.code === "post_paid_refused",
  );
});

test("classifyRefundClaim preserves the current agent402 delivery token", () => {
  const record = settlementRecords().find(
    (item) => item.recordId === "agent402-external-validation-purchase-2026-08-29",
  );
  assert.equal(
    record.settlement.validDeliveryStatus,
    "seller_http_200_repair_required_no_buyer_owned_output_enforcement",
  );
  assert.equal(classifyRefundClaim(record), "not-offered");
});
