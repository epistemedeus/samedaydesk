import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { MERCHANT_PIN } from "../../../client/src/data/machineEntry.mjs";
import { mountedPublicRead } from "../../../vendor/hosted-wallet-market/src/public-route-limit.mjs";
import { loadCoverage, REPO_ROOT } from "../src/coverage.mjs";
import { ORIGINAL_TERMS, produceVerification, publicManifest, runCase } from "../src/cases.mjs";
import { walkRepeatUse } from "../src/journey.mjs";
import { CLOCK, INSTALLED_MERCHANT, PUBLIC_ACCEPTED_WORK, PUBLIC_PREFIX, RECIPE_MERCHANT_PIN } from "../src/pins.mjs";

function gitBytes(path) {
  return execFileSync("git", ["show", `HEAD:${path}`], { cwd: REPO_ROOT });
}

function echoesPrice(value, price = "50000") {
  if (value == null || typeof value !== "object") return value === price || value === Number(price);
  if (Array.isArray(value)) return value.some((item) => echoesPrice(item, price));
  return Object.values(value).some((item) => echoesPrice(item, price));
}

test("coverage starts from AGL-ROOT15599 and merchant 9fba328c without collapsing older pins", () => {
  const coverage = loadCoverage();
  assert.equal(coverage.ok, true, coverage.problems?.join("; "));
  assert.equal(coverage.agl.id, "AGL-ROOT15599");
  assert.equal(coverage.agl.pr, 377);
  assert.equal(coverage.agl.installedAtThatReceiving, false);
  assert.equal(coverage.agl.rebuiltHere, false);
  assert.equal(coverage.merchant.id, "9fba328c");
  assert.equal(coverage.merchant.railway, "9a8c2f97");
  assert.equal(coverage.merchant.paidMpp, "off");
  assert.equal(coverage.merchant.called, false);
  assert.equal(coverage.merchant.independentReuse, false);
  assert.equal(coverage.outsideUse, false);
  assert.equal(coverage.paymentEvidence, "none");
  assert.notEqual(coverage.distinctPins.machineEntry, INSTALLED_MERCHANT.id);
  assert.notEqual(coverage.distinctPins.recipeInput, INSTALLED_MERCHANT.id);
  assert.equal(MERCHANT_PIN, coverage.distinctPins.machineEntry);
  assert.equal(coverage.distinctPins.recipeInput, RECIPE_MERCHANT_PIN);
  assert.equal(mountedPublicRead(PUBLIC_PREFIX, PUBLIC_ACCEPTED_WORK, "GET"), true);
  assert.equal(coverage.existingRails.acceptedWork, "9bb30906");

  for (const path of [
    "tools/result-reuse/src/export.mjs",
    "tools/result-reuse/src/portable.mjs",
    "docs/receiving/h155030-sds-consumer-composition-20261106/ENROLLMENT.json",
    "package.json",
    "client/src/data/machineEntry.mjs",
  ]) {
    const current = createHash("sha256").update(readFileSync(join(REPO_ROOT, path))).digest("hex");
    const head = createHash("sha256").update(gitBytes(path)).digest("hex");
    assert.equal(current, head, path);
  }
});

test("a later distinct agent reuses the approved walletless result without signup, a new price, or a debt change", async () => {
  const before = { ...ORIGINAL_TERMS };
  const result = await runCase("fitting");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.ok, true);
  assert.equal(result.fitting, true);
  assert.equal(result.independentReuse, true);
  assert.equal(result.reason, "approved_contribution_reused");
  assert.equal(result.accountCreated, false);
  assert.equal(result.debtCreated, false);
  assert.equal(result.charged, false);
  assert.equal(result.newPrice, false);
  assert.equal(result.newLedger, false);
  assert.equal(result.outsideUse, false);
  assert.equal(result.paymentEvidence, "none");
  assert.equal(result.merchantCalled, false);
  assert.equal(result.identity.attached, false);
  assert.equal(result.retained, true);
  assert.equal(result.rights, "CC0-1.0");
  assert.equal(result.producerInvoked, false);
  assert.equal(result.qualitySame, true);
  assert.equal(result.reusedDigest, result.approvedDigest);
  assert.equal(result.effort.reuseProducerCalls, 0);
  assert.equal(result.effort.directProducerCalls, 1);
  assert.equal(result.effort.quality, "same_approved_body");
  assert.equal(result.effort.reuseCheaperOnProducerCalls, true);
  assert.equal(result.effort.money, "costs_unknown");
  assert.equal(result.effort.wallClockSampleMs.claim, "single_sample_not_an_economic_advantage");
  assert.equal(result.paidChoice.eligible, true);
  assert.equal(result.paidChoice.taken, false);
  assert.equal(result.paidChoice.charged, false);
  assert.equal(result.paidChoice.newPrice, false);
  assert.equal(result.paidChoice.authority, "existing_x402_on_installed_merchant");
  assert.equal(result.paidChoice.merchant, "9fba328c");
  assert.equal(result.paidChoice.paidMpp, "off");
  assert.equal(result.paidChoice.changesOriginalTerms, false);
  assert.equal(result.paidChoice.debtCreated, false);
  assert.equal(result.originalTerms.termsDigest, before.termsDigest);
  assert.equal(result.originalTerms.earnedDebtAtomic, "21");
  assert.equal(result.originalTerms.changed, false);
  assert.deepEqual(ORIGINAL_TERMS, before);
  assert.equal(result.coverage.agl, "AGL-ROOT15599");
  assert.equal(result.coverage.merchant, "9fba328c");
  assert.equal(result.coverage.merchantCalled, false);
  assert.equal(echoesPrice(result), false);
});

test("optional identity does not create an account", async () => {
  const result = await runCase("identity");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.fitting, true);
  assert.equal(result.independentReuse, true);
  assert.equal(result.identity.attached, true);
  assert.equal(result.identity.label, "later-agent");
  assert.equal(result.identity.accountCreated, false);
  assert.equal(result.accountCreated, false);
  assert.equal(result.effort.reuseCheaperOnProducerCalls, true);
});

test("signup is refused for an already-public artifact and does not run the producer", async () => {
  let calls = 0;
  const coverage = loadCoverage();
  const result = await walkRepeatUse({
    coverage,
    clock: CLOCK,
    originalTerms: { ...ORIGINAL_TERMS },
    task: {
      class: "already_public",
      signup: true,
      taskId: "walletless-public-verify",
      subject: "example-domain-observation",
      sequence: 1,
    },
    producer: { actorId: "agl-producer-owner", party: "first_party_owner" },
    consumer: { actorId: "later-distinct-agent", party: "later_distinct_agent" },
    produce: async () => {
      calls += 1;
      return produceVerification();
    },
  });
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.ok, false);
  assert.equal(result.code, "signup_refused_already_public");
  assert.equal(result.accountCreated, false);
  assert.equal(result.charged, false);
  assert.equal(result.originalTerms.termsDigest, ORIGINAL_TERMS.termsDigest);
  assert.equal(result.originalTerms.earnedDebtAtomic, "21");
  assert.equal(calls, 0);
});

test("first-party owner control is not independent reuse", async () => {
  const result = await runCase("first-party");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.ok, true);
  assert.equal(result.independentReuse, false);
  assert.equal(result.reason, "first_party_owner_control");
  assert.equal(result.ownerRead, true);
  assert.equal(result.paidChoice.eligible, false);
  assert.equal(result.effort.reuseCheaperOnProducerCalls, false);
  assert.equal(result.directAlternative.path, "owner_read_is_not_reuse");
});

test("a changed capture is a non-fit and names competent direct execution", async () => {
  const result = await runCase("nonfitting-capture");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.ok, true);
  assert.equal(result.fitting, false);
  assert.equal(result.independentReuse, false);
  assert.equal(result.reason, "capture_digest_mismatch");
  assert.equal(result.directAlternative.path, "competent_direct_execution");
  assert.equal(result.directAlternative.honest, true);
  assert.equal(result.directAlternative.producerCalls, 1);
  assert.equal(result.directAlternative.outcome, "changed");
  assert.equal(result.effort.reuseCheaperOnProducerCalls, false);
  assert.equal(result.effort.quality, "reuse_does_not_answer");
  assert.equal(result.paidChoice.eligible, false);
  assert.equal(result.paidChoice.existingRailUntouched, true);
  assert.equal(result.originalTerms.earnedDebtAtomic, "21");
  assert.equal(result.originalTerms.changed, false);
});

test("a private new task is refused instead of being reused or run", async () => {
  const result = await runCase("private");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.fitting, false);
  assert.equal(result.reason, "private_field");
  assert.equal(result.directAlternative.available, false);
  assert.equal(result.directAlternative.reason, "private_field");
  assert.equal(result.directAlternative.producerCalls, 0);
  assert.equal(result.paidChoice.eligible, false);
  assert.equal(result.charged, false);
});

test("an unsupported recipe stays a direct alternative outside the approved contribution", async () => {
  const result = await runCase("unsupported");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.fitting, false);
  assert.equal(result.independentReuse, false);
  assert.equal(result.reason, "input_not_before_work");
  assert.equal(result.directAlternative.aglSupported, false);
  assert.equal(result.directAlternative.path, "competent_direct_execution");
  assert.equal(result.directAlternative.producerCalls, 1);
  assert.equal(result.directAlternative.directCompleted, false);
  assert.equal(result.paidChoice.eligible, false);
});

test("withdrawn permission keeps the direct alternative and does not reuse", async () => {
  const result = await runCase("withdrawn");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.fitting, false);
  assert.equal(result.independentReuse, false);
  assert.equal(result.reason, "permission_withdrawn");
  assert.equal(result.portable, false);
  assert.equal(result.directAlternative.path, "competent_direct_execution");
  assert.equal(result.directAlternative.producerCalls, 1);
  assert.equal(result.directAlternative.outcome, "unchanged");
  assert.equal(result.originalTerms.termsDigest, ORIGINAL_TERMS.termsDigest);
});

test("a supplied new price is refused and not echoed", async () => {
  const result = await runCase("new-price");
  assert.equal(result.seam, "demonstrated");
  assert.equal(result.fitting, true);
  assert.equal(result.paidChoice.refused, "new_price_refused");
  assert.equal(result.paidChoice.eligible, false);
  assert.equal(result.paidChoice.charged, false);
  assert.equal(result.newPrice, false);
  assert.equal(echoesPrice(result), false);
  assert.equal(result.originalTerms.termsDigest, ORIGINAL_TERMS.termsDigest);
  assert.equal(result.originalTerms.earnedDebtAtomic, "21");
});

test("rewriting original terms or earned debt is refused before reuse", async () => {
  const terms = await runCase("terms-rewrite");
  const debt = await runCase("debt-rewrite");
  assert.equal(terms.seam, "demonstrated");
  assert.equal(terms.ok, false);
  assert.equal(terms.code, "terms_unchanged_required");
  assert.equal(debt.seam, "demonstrated");
  assert.equal(debt.ok, false);
  assert.equal(debt.code, "earned_debt_unchanged_required");
  assert.equal(terms.charged, false);
  assert.equal(debt.charged, false);
});

test("the public manifest used by the journey matches the retained recipe identity", () => {
  const manifest = publicManifest();
  assert.equal(manifest.recipeId, "verification-reconcile");
  assert.equal(manifest.capture.url, "https://example.com/");
  assert.equal(manifest.capture.contentHash, "sha256:fixture-example-domain-v1");
  assert.equal(Object.hasOwn(manifest, "payment"), false);
  assert.equal(Object.hasOwn(manifest.prior, "payment"), false);
});
