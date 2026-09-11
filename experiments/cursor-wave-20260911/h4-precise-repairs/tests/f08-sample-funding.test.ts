import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FIXTURE_BECOMES_SALE } from "../src/failures.ts";
import { acceptRepairIntake } from "../src/intake.ts";
import { REPO_ROOT } from "../src/paths.ts";
import {
  PAID_USEFUL_JOBS_DIR,
  SAMPLE_NOT_A_SALE,
  detectSample,
  livePaidUsefulJobsPresent,
  rejectSampleFundingAsNotASale,
  reproduceSampleReservedFunding,
} from "../src/f08-sample-funding.ts";
import type { CorpusFixture } from "../src/corpus-types.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = join(packRoot, "fixtures/corpus/M-SDS-F08.json");

const digest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function assertNeverSold(result: ReturnType<typeof rejectSampleFundingAsNotASale>): void {
  assert.equal(result.ok, false);
  assert.equal(result.rejected, true);
  assert.equal(result.sold, false);
  assert.equal(result.saleState, "not_a_sale");
  assert.equal(result.provenance, "fixture");
  assert.equal(result.fundingState, "rejected");
  assert.notEqual(result.fundingState, "reserved-fixture");
  assert.notEqual(result.provenance, "customer");
  assert.notEqual(result.saleState, "sold");
}

test("server/paid-useful-jobs is absent on this tree", () => {
  assert.equal(livePaidUsefulJobsPresent(), false);
  assert.equal(existsSync(join(REPO_ROOT, PAID_USEFUL_JOBS_DIR)), false);
  assert.equal(existsSync(join(REPO_ROOT, "server/paid-useful-jobs")), false);
});

test("reproduces unguarded SAMPLE + reserved-fixture funding", () => {
  const result = reproduceSampleReservedFunding({
    labels: ["SAMPLE"],
    example: true,
    flags: ["--example"],
    fundingIntent: "reserved-fixture",
    payment: { fixture: true, label: "fixture", live: false, purchaseAuthority: false },
  });
  assert.deepEqual(result, {
    reproduced: true,
    unguardedFundingState: "reserved-fixture",
    sample: true,
    saleState: "not_a_sale",
    liveProductPresent: false,
  });
  assert.equal(result.liveProductPresent, livePaidUsefulJobsPresent());
});

test("unguarded path also reproduces SAMPLE with only a fixture-labeled payment", () => {
  const result = reproduceSampleReservedFunding({
    sourceKind: "sample",
    payment: { fixture: true, label: "fixture" },
  });
  assert.equal(result.reproduced, true);
  assert.equal(result.unguardedFundingState, "reserved-fixture");
  assert.equal(result.sample, true);
  assert.equal(result.saleState, "not_a_sale");
});

test("wrapper rejects SAMPLE funding as not-a-sale", () => {
  const result = rejectSampleFundingAsNotASale({
    labels: ["SAMPLE"],
    exampleFlag: "--example",
    fundingIntent: "reserved-fixture",
    payment: { fixture: true, label: "fixture" },
  });
  assertNeverSold(result);
  assert.equal(result.code, "sample-not-a-sale");
  assert.equal(result.failure, SAMPLE_NOT_A_SALE);
  assert.equal(result.sample, true);
  assert.equal(result.saleState, SAMPLE_NOT_A_SALE.saleState);
  assert.equal(result.rejected, SAMPLE_NOT_A_SALE.rejected);
});

test("regression fails if wrapper treats SAMPLE as sold/customer/reserved-fixture success", () => {
  const attempts = [
    { labels: ["SAMPLE"], fundingIntent: "reserved-fixture" },
    { labels: ["SAMPLE"], paid: true, settled: true, provenance: "customer" },
    { example: true, fundingIntent: "sale", sold: true },
    { sourceKind: "fixture", fundingIntent: "reserved-fixture" },
    { flags: ["--example"], funding: "reserved-fixture", payment: { label: "fixture" } },
  ];
  for (const attempt of attempts) {
    const result = rejectSampleFundingAsNotASale(attempt);
    assertNeverSold(result);
    assert.equal(result.code, "sample-not-a-sale");
    if (result.ok === true || result.sold === true || result.provenance === "customer") {
      assert.fail("SAMPLE funding must not succeed as sold/customer");
    }
    if (result.fundingState === "reserved-fixture") {
      assert.fail("SAMPLE funding must not succeed as reserved-fixture");
    }
  }
});

test("--example + reserved-fixture rejected", () => {
  const byFlag = rejectSampleFundingAsNotASale({
    flags: ["--example"],
    fundingIntent: "reserved-fixture",
  });
  assertNeverSold(byFlag);
  assert.equal(byFlag.code, "sample-not-a-sale");
  assert.equal(byFlag.sample, true);

  const byExampleTrue = rejectSampleFundingAsNotASale({
    example: true,
    fundingIntent: "reserved-fixture",
    payment: { fixture: true, label: "fixture" },
  });
  assertNeverSold(byExampleTrue);
  assert.equal(byExampleTrue.code, "sample-not-a-sale");

  const reproduced = reproduceSampleReservedFunding({
    flags: ["--example"],
    fundingIntent: "reserved-fixture",
  });
  assert.equal(reproduced.reproduced, true);
  assert.equal(reproduced.unguardedFundingState, "reserved-fixture");
  assert.equal(reproduced.sample, true);
});

test("caller-looking payload without SAMPLE markers classifies reserved-fixture but cannot become a sale", () => {
  const caller = {
    fundingIntent: "reserved-fixture" as const,
    payment: { fixture: true, label: "fixture", live: false, purchaseAuthority: false },
  };
  assert.equal(detectSample(caller), false);

  const reproduced = reproduceSampleReservedFunding(caller);
  assert.equal(reproduced.unguardedFundingState, "reserved-fixture");
  assert.equal(reproduced.sample, false);
  assert.equal(reproduced.saleState, "not_a_sale");
  assert.equal(reproduced.reproduced, false);
  assert.equal(reproduced.liveProductPresent, false);

  const promotion = acceptRepairIntake({
    defectId: "caller-fixture-promotion",
    suppliedInput: { digestSha256: digest, mediaType: "application/json", bytes: 4 },
    scope: "must not promote fixture payment to customer sale",
    acceptanceTest: "fixture-becomes-sale",
    rollback: "discard",
    provenance: "customer",
    saleState: "sold",
    paid: true,
    sourceKind: "fixture",
  });
  assert.equal(promotion.ok, false);
  if (!promotion.ok) {
    assert.deepEqual(promotion.failure, FIXTURE_BECOMES_SALE);
    assert.equal(promotion.failure.saleState, "not_a_sale");
    assert.equal(promotion.failure.rejected, true);
  }

  const rejectedPromotion = rejectSampleFundingAsNotASale({
    ...caller,
    provenance: "customer",
    paid: true,
    saleState: "sold",
  });
  assertNeverSold(rejectedPromotion);
  assert.equal(rejectedPromotion.failure, FIXTURE_BECOMES_SALE);
  assert.equal(rejectedPromotion.code, "fixture-becomes-sale");
});

test("sibling SAMPLE marker is treated as sample, not a sale", () => {
  const work = mkdtempSync(join(tmpdir(), "h4r-f08-sample-"));
  writeFileSync(join(work, "SAMPLE.marker"), "SAMPLE - not a customer");
  const input = join(work, "input.json");
  writeFileSync(input, "{}");

  const reproduced = reproduceSampleReservedFunding({
    inputs: { input },
    fundingIntent: "reserved-fixture",
  });
  assert.equal(reproduced.sample, true);
  assert.equal(reproduced.reproduced, true);
  assert.equal(reproduced.unguardedFundingState, "reserved-fixture");
  assert.equal(reproduced.saleState, "not_a_sale");

  const rejected = rejectSampleFundingAsNotASale({
    inputs: { input },
    fundingIntent: "reserved-fixture",
  });
  assertNeverSold(rejected);
  assert.equal(rejected.code, "sample-not-a-sale");
});

test("corpus fixture M-SDS-F08 is a not-a-sale regression quoting F08 facts", () => {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as CorpusFixture;
  assert.equal(corpus.id, "M-SDS-F08");
  assert.equal(corpus.disposition, "fixed_with_regression");
  assert.equal(corpus.inSdsScope, true);
  assert.equal(corpus.saleState, "not_a_sale");
  assert.equal(corpus.provenance, "fixture");
  assert.equal(corpus.authorized, false);
  assert.equal(corpus.kind, "regression");
  assert.equal(corpus.evaluator, "f08-sample-funding");
  const facts = JSON.stringify(corpus.facts);
  assert.match(facts, /fable\/f08-paid-wrappers/);
  assert.match(facts, /RECEIPT-REVIEW/);
  assert.equal(corpus.facts.paidUsefulJobsOnThisTree, false);
  assert.equal(corpus.facts.receiptReviewOnThisTree, false);
  assert.equal(corpus.facts.doNotInventASale, true);
  assert.equal(corpus.facts.draftPrMerged, false);
});
