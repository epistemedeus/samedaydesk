import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DIAGNOSIS_SCHEMA,
  DIAGNOSIS_STATUS,
  ERROR_CODES,
  GREXAL_S149,
  assertCaptureDistinct,
  assertNoInventedConversion,
  assertUnknownsDefault,
  diagnoseConversion,
  isCompatible,
  validateBundle,
  validateDiagnosis,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

test("positive: compatible grexal join → available; causation/independence unknown by default", () => {
  const d = diagnoseConversion(load("bundle.positive.json"), { clock });
  assert.equal(d.schema, DIAGNOSIS_SCHEMA);
  assert.equal(d.status, DIAGNOSIS_STATUS.AVAILABLE);
  assert.equal(d.generatedAt, "2026-09-10T20:00:00.000Z");
  assert.ok(d.joined.length >= 1);
  assert.equal(d.grexalS149.pricingRunCompletedUsd, GREXAL_S149.pricingRunCompletedUsd);
  assert.equal(d.grexalS149.customerExecutionRevenuePayout, false);
  for (const j of d.joined) {
    assert.equal(j.causationKnown, false);
    assert.equal(j.customerIndependenceKnown, false);
    assert.ok(Array.isArray(j.unknowns) && j.unknowns.length >= 2);
    assert.ok(j.unknowns.some((u) => /causation/i.test(u)));
    assert.ok(j.unknowns.some((u) => /customerIndependence|independence/i.test(u)));
    assert.equal(j.claims.conversionFromClick, false);
    assert.equal(j.claims.revenueFromListPrice, false);
    assert.equal(j.claims.buyerIntentFromActivation, false);
    assert.ok(j.compatibilityKeys.includes("provider") || j.compatibilityKeys.includes("jobRef") || j.compatibilityKeys.includes("sourceTag"));
  }
  assert.equal(assertUnknownsDefault(d), true);
  assert.equal(assertNoInventedConversion(d), true);
  validateDiagnosis(d);
});

test("causationKnown=true only when sharedEvidenceId matches; independence still unknown", () => {
  const d = diagnoseConversion(load("bundle.causation-known.json"), { clock });
  assert.equal(d.status, DIAGNOSIS_STATUS.AVAILABLE);
  assert.equal(d.joined.length, 1);
  const j = d.joined[0];
  assert.equal(j.causationKnown, true);
  assert.equal(j.sharedEvidenceId, "ev-shared-001");
  assert.equal(j.customerIndependenceKnown, false);
  assert.ok(j.unknowns.some((u) => /customerIndependence|independence/i.test(u)));
  assert.equal(j.claims.conversionFromClick, false);
  validateDiagnosis(d);
});

test("negative: incompatible grexal↔agensi pairs go to unjoined with reason", () => {
  const d = diagnoseConversion(load("bundle.neg-incompatible.json"), { clock });
  assert.equal(d.joined.length, 0);
  assert.ok(d.unjoined.length >= 1);
  for (const u of d.unjoined) {
    assert.ok(typeof u.reason === "string" && u.reason.length > 0);
    assert.match(u.reason, /incompatible/i);
  }
  assert.equal(assertNoInventedConversion(d), true);
});

test("negative: invented revenue / buyerIntent fields rejected", () => {
  assert.throws(
    () => validateBundle(load("bundle.neg-revenue.json")),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_INTENT ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM ||
      err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
  assert.throws(
    () => diagnoseConversion(load("bundle.neg-revenue.json"), { clock }),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_INTENT ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM ||
      err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
  );
});

test("partial: missing acquisition/usefulOutput arrays → partial", () => {
  const d = diagnoseConversion(load("bundle.partial.json"), { clock });
  assert.equal(d.status, DIAGNOSIS_STATUS.PARTIAL);
  assert.ok(d.missingInputs.some((m) => m.includes("acquisitionEvidence")));
  assert.ok(d.missingInputs.some((m) => m.includes("usefulOutputEvidence")));
  assert.equal(d.joined.length, 0);
});

test("unavailable: capture failed omits activationCount / usefulOutputActionableCount", () => {
  const d = diagnoseConversion(load("bundle.unavailable.json"), { clock });
  assert.equal(d.status, DIAGNOSIS_STATUS.UNAVAILABLE);
  assert.equal(d.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(Object.prototype.hasOwnProperty.call(d, "activationCount"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(d, "usefulOutputActionableCount"),
    false,
  );
  assert.equal(d.joined.length, 0);
  validateDiagnosis(d);
});

test("no_users: capture ok with zero activations and zero actionable useful outputs", () => {
  const d = diagnoseConversion(load("bundle.no-users.json"), { clock });
  assert.equal(d.status, DIAGNOSIS_STATUS.NO_USERS);
  assert.equal(d.code, ERROR_CODES.NO_USERS);
  assert.equal(d.activationCount, 0);
  assert.equal(d.usefulOutputActionableCount, 0);
  // May still have presentation↔listed joins with unknowns — not conversion claims
  for (const j of d.joined) {
    assert.equal(j.claims.conversionFromClick, false);
    assert.equal(j.causationKnown, false);
  }
  validateDiagnosis(d);
});

test("unavailable ≠ no_users", () => {
  const unavailable = diagnoseConversion(load("bundle.unavailable.json"), { clock });
  const noUsers = diagnoseConversion(load("bundle.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.status, noUsers.status);
  assert.notEqual(unavailable.code, noUsers.code);
});

test("click ≠ conversion: activated join never sets conversionFromClick", () => {
  const d = diagnoseConversion(load("bundle.positive.json"), { clock });
  const activated = d.joined.filter((j) => j.acquisition.kind === "linkActivated");
  assert.ok(activated.length >= 1);
  for (const j of activated) {
    assert.equal(j.claims.conversionFromClick, false);
    assert.equal(j.claims.buyerIntentFromActivation, false);
    assert.ok(j.unknowns.some((u) => /click|conversion|intent/i.test(u)));
  }
});

test("no invented revenue: list pricing observed is not earnings claim", () => {
  const d = diagnoseConversion(load("bundle.positive.json"), { clock });
  assert.equal(d.grexalS149.customerExecutionRevenuePayout, false);
  const listed = d.joined.filter((j) => j.usefulOutput.kind === "listed");
  assert.ok(listed.length >= 1);
  for (const j of listed) {
    assert.equal(j.claims.revenueFromListPrice, false);
    assert.equal(j.usefulOutput.pricingObserved?.isRevenue, false);
    assert.ok(j.unknowns.some((u) => /list pricing|NOT earnings|revenue/i.test(u)));
  }
  const earnings = d.joined.filter((j) => j.usefulOutput.kind === "earnings");
  for (const j of earnings) {
    assert.equal(j.usefulOutput.amount, null);
    assert.ok(j.unknowns.some((u) => /earnings|revenue/i.test(u)));
  }
});

test("isCompatible: provider match joins; mismatch without jobRef/sharedId rejects", () => {
  const ok = isCompatible(
    { id: "a", sourceTag: "grexal", provider: "grexal", kind: "linkActivated" },
    { id: "o", provider: "grexal", kind: "run" },
    {},
  );
  assert.equal(ok.compatible, true);
  assert.ok(ok.keys.includes("provider") || ok.keys.includes("sourceTag"));

  const bad = isCompatible(
    { id: "a", sourceTag: "grexal", provider: "grexal", kind: "linkActivated" },
    { id: "o", provider: "agensi", kind: "run" },
    {},
  );
  assert.equal(bad.compatible, false);
  assert.match(bad.reason, /incompatible/i);

  const viaJob = isCompatible(
    {
      id: "a",
      sourceTag: "catalog",
      kind: "linkActivated",
      jobRef: "job-1",
    },
    { id: "o", provider: "grexal", kind: "run", jobRef: "job-1" },
    {},
  );
  assert.equal(viaJob.compatible, true);
  assert.ok(viaJob.keys.includes("jobRef"));
});

test("validateDiagnosis rejects smuggled conversionFromClick=true", () => {
  const d = diagnoseConversion(load("bundle.positive.json"), { clock });
  const forged = structuredClone(d);
  forged.joined[0].claims.conversionFromClick = true;
  assert.throws(
    () => validateDiagnosis(forged),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );
});

test("validateDiagnosis rejects unavailable with activationCount (collapsed labels)", () => {
  const d = diagnoseConversion(load("bundle.unavailable.json"), { clock });
  const forged = { ...d, activationCount: 0 };
  assert.throws(
    () => validateDiagnosis(forged),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("mutationBoundary forbids login/price/publish and invented conversion", () => {
  const d = diagnoseConversion(load("bundle.positive.json"), { clock });
  assert.equal(d.mutationBoundary.executesProviderMutations, false);
  assert.ok(d.mutationBoundary.forbids.some((f) => /login/i.test(f)));
  assert.ok(d.mutationBoundary.forbids.some((f) => /price|publish/i.test(f)));
  assert.ok(d.mutationBoundary.forbids.some((f) => /conversion|click/i.test(f)));
});
