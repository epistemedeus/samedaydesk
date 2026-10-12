import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ERROR_CODES,
  SCHEMA_ID,
  SCHEMA_VERSION,
  TERMS_VERSION_KIND,
  USDC_DECIMALS,
  assertTerms,
  decimalToAtomic,
  hashTermsVersion,
  parseTerms,
  TermsValidationError,
  type FundedTaskTerms,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function golden(): Record<string, unknown> {
  return loadJson("fixtures/golden/complete.terms.json") as Record<string, unknown>;
}

test("stable package API is exported", () => {
  assert.equal(typeof parseTerms, "function");
  assert.equal(typeof assertTerms, "function");
  assert.equal(typeof hashTermsVersion, "function");
  assert.equal(TERMS_VERSION_KIND, "content-hash");
  assert.equal(SCHEMA_ID, "neomorphic.funded-task-terms.v1");
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(USDC_DECIMALS, 6);
});

test("golden fixture parses and pins canonical termsVersion", () => {
  const parsed = parseTerms(golden());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.execute, false);
  assert.equal(parsed.value.reward.amount, "1.50");
  assert.equal(parsed.value.reward.amountAtomic, "1500000");
  assert.equal(parsed.value.reward.decimals, 6);
  assert.equal(parsed.value.fundTransferAuthority.llmVerdictAlone, false);
  assert.equal(parsed.value.paymentTiming.railMayPay, "outside_this_pack");
  assert.match(parsed.value.termsVersion, /^sha256:[0-9a-f]{64}$/);
  assert.equal(hashTermsVersion(parsed.value), parsed.value.termsVersion);
  if (typeof golden().termsVersion === "string") {
    assert.equal(parsed.value.termsVersion, golden().termsVersion);
  }
});

test("assertTerms returns the same hash as parseTerms", () => {
  const value = assertTerms(golden());
  assert.equal(value.schema, SCHEMA_ID);
  assert.equal(hashTermsVersion(value), value.termsVersion);
});

test("assertTerms throws TermsValidationError on seeded failure", () => {
  assert.throws(
    () => assertTerms(loadJson("fixtures/negatives/float-reward.json")),
    (error: unknown) => {
      assert.ok(error instanceof TermsValidationError);
      assert.equal(error.code, ERROR_CODES.FLOAT_REWARD);
      return true;
    },
  );
});

test("USDC amountAtomic is amount * 10^6 without IEEE float", () => {
  assert.equal(decimalToAtomic("1.50", 6), "1500000");
  assert.equal(decimalToAtomic("0.000001", 6), "1");
  assert.equal(decimalToAtomic("100", 6), "100000000");
});

test("unknown effort and ISO reservation duration are accepted", () => {
  const doc = golden();
  doc.effort = { kind: "unknown" };
  doc.reservationDuration = "PT24H";
  doc.correctionPolicy = { maxCorrections: 0, window: "P3D" };
  delete doc.termsVersion;
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.effort.kind, "unknown");
  assert.equal(parsed.value.reservationDuration, "PT24H");
  assert.equal(parsed.value.correctionPolicy.maxCorrections, 0);
});

test("custom contributor license text is accepted", () => {
  const doc = golden();
  doc.contributorLicense = {
    kind: "custom",
    text: "Contributor retains copyright; requester receives a non-exclusive use license for the accepted artifact only.",
  };
  delete doc.termsVersion;
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, true);
});

test("mismatched termsVersion is rejected", () => {
  const parsedOk = parseTerms(golden());
  assert.equal(parsedOk.ok, true);
  if (!parsedOk.ok) return;
  const tampered: FundedTaskTerms = {
    ...parsedOk.value,
    termsVersion: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const parsed = parseTerms(tampered);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.code, ERROR_CODES.TERMS_VERSION_MISMATCH);
});

test("JS integer money is rejected", () => {
  const doc = golden();
  (doc.reward as Record<string, unknown>).amount = 2;
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.code, ERROR_CODES.FLOAT_REWARD);
});

test("exponent amount string is rejected", () => {
  const doc = golden();
  (doc.reward as Record<string, unknown>).amount = "1.5e6";
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.code, ERROR_CODES.FLOAT_REWARD);
});

test("LLM verdict as fund-transfer authority is rejected", () => {
  const doc = golden();
  doc.fundTransferAuthority = {
    requesterAcceptRequired: false,
    llmVerdictAlone: true,
  };
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
});

test("javascript: artifact ref is rejected", () => {
  const doc = golden();
  (doc.artifact as Record<string, unknown>).ref = "javascript:alert(1)";
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
});

test("atomic mismatch is rejected", () => {
  const doc = golden();
  (doc.reward as Record<string, unknown>).amountAtomic = "1";
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
});

test("zero ISO duration is rejected", () => {
  const doc = golden();
  doc.reservationDuration = "PT0S";
  const parsed = parseTerms(doc);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.code, ERROR_CODES.MISSING_RESERVATION_DURATION);
});

test("all committed negative fixtures are rejected", () => {
  const dir = join(root, "fixtures/negatives");
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 7);
  for (const name of files) {
    const parsed = parseTerms(loadJson(`fixtures/negatives/${name}`));
    assert.equal(parsed.ok, false, name);
  }
});

test("hashTermsVersion ignores an attached termsVersion field", () => {
  const a = hashTermsVersion(golden());
  const withHash = { ...golden(), termsVersion: a };
  assert.equal(hashTermsVersion(withHash), a);
});

test("F17 does not claim F01 terms hashes are equal", async () => {
  const { FUNDED_TASK_TERMS_SCHEMA, EARNED_WORK_TERMS_SCHEMA, UNLIKE_TERMS_SCHEMAS_ARE_NOT_EQUAL, EARNED_WORK_MAX_REVISIONS_CAP } =
    await import("../src/schema-mapping.js");
  assert.equal(FUNDED_TASK_TERMS_SCHEMA, SCHEMA_ID);
  assert.equal(EARNED_WORK_TERMS_SCHEMA, "neomorphic.earned-work.terms.v1");
  assert.equal(UNLIKE_TERMS_SCHEMAS_ARE_NOT_EQUAL, true);
  assert.equal(EARNED_WORK_MAX_REVISIONS_CAP, 1);
  assert.notEqual(FUNDED_TASK_TERMS_SCHEMA, EARNED_WORK_TERMS_SCHEMA);
});
