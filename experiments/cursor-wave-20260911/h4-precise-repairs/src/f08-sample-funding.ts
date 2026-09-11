import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { FIXTURE_BECOMES_SALE } from "./failures.ts";
import { REPO_ROOT } from "./paths.ts";

/** This H4R tree has no `server/paid-useful-jobs/`; do not copy F08 engines. */
export const PAID_USEFUL_JOBS_DIR = "server/paid-useful-jobs";

export const SAMPLE_NOT_A_SALE = Object.freeze({
  code: "sample-not-a-sale",
  rejected: true,
  sold: false,
  saleState: "not_a_sale",
  fundingState: "rejected",
  provenance: "fixture",
  reason:
    "SAMPLE/--example/fixture cannot receive reserved-fixture, paid, settled, customer, or sale funding",
});

export type SampleFundingRequest = {
  flags?: unknown;
  labels?: unknown;
  argv?: unknown;
  example?: unknown;
  exampleFlag?: unknown;
  exampleMode?: unknown;
  sourceKind?: unknown;
  provenance?: unknown;
  fundingIntent?: unknown;
  funding?: unknown;
  payment?: unknown;
  paid?: unknown;
  settled?: unknown;
  sold?: unknown;
  saleState?: unknown;
  settle?: unknown;
  liveSettle?: unknown;
  inputs?: unknown;
  fromFixturePath?: unknown;
  defectId?: unknown;
  label?: unknown;
  sampleLabel?: unknown;
};

export type UnguardedSampleFunding = {
  reproduced: boolean;
  unguardedFundingState: "reserved-fixture" | "unfunded" | "rejected";
  sample: boolean;
  saleState: "not_a_sale";
  liveProductPresent: false;
};

export type SampleFundingRejection = {
  ok: false;
  rejected: true;
  fundingState: "rejected";
  sold: false;
  saleState: "not_a_sale";
  provenance: "fixture";
  code: "sample-not-a-sale" | "fixture-becomes-sale";
  failure: typeof SAMPLE_NOT_A_SALE | typeof FIXTURE_BECOMES_SALE;
  sample: boolean;
  liveProductPresent: false;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function siblingSampleMarker(filePath: string): string | null {
  const dir = dirname(filePath);
  if (!existsSync(dir)) return null;
  try {
    const names = readdirSync(dir);
    return names.find((name) => /^SAMPLE(\.|$)/i.test(name) || /\.SAMPLE\./i.test(name)) || null;
  } catch {
    return null;
  }
}

function walkSampleHits(value: unknown, into: string[], skipPayment = false): void {
  if (typeof value === "string") return;
  if (Array.isArray(value)) {
    for (const item of value) walkSampleHits(item, into, false);
    return;
  }
  if (!isPlainObject(value)) return;
  if (value.label === "SAMPLE" || value.sampleLabel === "SAMPLE") into.push("json-sample-label");
  if (value.exampleMode === true) into.push("exampleMode");
  for (const [key, child] of Object.entries(value)) {
    if (skipPayment && key === "payment") continue;
    walkSampleHits(child, into, false);
  }
}

function inputPaths(request: SampleFundingRequest): string[] {
  const paths: string[] = [];
  if (typeof request.fromFixturePath === "string") paths.push(request.fromFixturePath);
  if (typeof request.payment === "string") paths.push(request.payment);
  if (!isPlainObject(request.inputs)) return paths;
  for (const value of Object.values(request.inputs)) {
    if (typeof value === "string") paths.push(value);
  }
  return paths;
}

export function livePaidUsefulJobsPresent(): boolean {
  return existsSync(join(REPO_ROOT, PAID_USEFUL_JOBS_DIR));
}

export function detectSample(request: SampleFundingRequest): boolean {
  if (request.example === true || request.example === "true") return true;
  if (request.exampleMode === true) return true;
  const source = typeof request.sourceKind === "string" ? request.sourceKind.toLowerCase() : "";
  if (source === "sample" || source === "example" || source === "fixture") return true;
  const hay = [
    ...stringList(request.flags),
    ...stringList(request.labels),
    ...stringList(request.argv),
    ...stringList(request.exampleFlag),
    typeof request.defectId === "string" ? request.defectId : "",
    typeof request.label === "string" ? request.label : "",
    typeof request.sampleLabel === "string" ? request.sampleLabel : "",
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes("--example") || hay.includes("sample")) return true;
  const hits: string[] = [];
  walkSampleHits(request, hits, true);
  if (hits.length > 0) return true;
  return inputPaths(request).some((filePath) => Boolean(siblingSampleMarker(filePath)));
}

function isFixtureLabeledPayment(payment: unknown): boolean {
  if (typeof payment === "string") {
    return /fixture/i.test(payment);
  }
  if (!isPlainObject(payment)) return false;
  if (payment.fixture === true) return true;
  if (typeof payment.label === "string" && payment.label.toLowerCase() === "fixture") return true;
  if (payment.live === false && payment.label === "fixture") return true;
  return false;
}

function fundingIntentOf(request: SampleFundingRequest): string {
  const intent = request.fundingIntent ?? request.funding;
  if (typeof intent === "string" && intent.trim() !== "") return intent;
  if (isFixtureLabeledPayment(request.payment)) return "reserved-fixture";
  return "unfunded";
}

function flagHay(request: SampleFundingRequest): string {
  return [...stringList(request.flags), ...stringList(request.argv), ...stringList(request.labels)]
    .join(" ")
    .toLowerCase();
}

function isReservedFixtureFunding(request: SampleFundingRequest): boolean {
  const intent = fundingIntentOf(request);
  if (intent === "reserved-fixture") return true;
  return isFixtureLabeledPayment(request.payment);
}

function isSaleLikeFunding(request: SampleFundingRequest): boolean {
  if (isReservedFixtureFunding(request)) return true;
  const intent = fundingIntentOf(request);
  if (intent === "live-sale" || intent === "sale" || intent === "customer" || intent === "paid" || intent === "settled") {
    return true;
  }
  if (request.paid === true || request.settled === true || request.sold === true) return true;
  if (request.settle === true || request.liveSettle === true) return true;
  if (request.provenance === "customer") return true;
  if (typeof request.saleState === "string" && request.saleState !== "not_a_sale") return true;
  const flags = flagHay(request);
  return (
    flags.includes("--paid") ||
    flags.includes("--settled") ||
    flags.includes("--customer") ||
    flags.includes("--sale") ||
    flags.includes("live-sale")
  );
}

function isCustomerOrSalePromotion(request: SampleFundingRequest): boolean {
  if (request.provenance === "customer") return true;
  if (request.paid === true || request.settled === true || request.sold === true) return true;
  if (typeof request.saleState === "string" && request.saleState !== "not_a_sale") return true;
  const flags = flagHay(request);
  return flags.includes("--customer") || flags.includes("--paid") || flags.includes("--settled");
}

/** Unguarded path: SAMPLE + reserved-fixture classified as reserved-fixture (pre-95d9d21 gap). */
export function reproduceSampleReservedFunding(
  request: SampleFundingRequest,
): UnguardedSampleFunding {
  const sample = detectSample(request);
  const reserved = isReservedFixtureFunding(request);
  const unguardedFundingState = reserved
    ? "reserved-fixture"
    : fundingIntentOf(request) === "live-sale" ||
        fundingIntentOf(request) === "sale" ||
        request.settle === true ||
        request.liveSettle === true
      ? "rejected"
      : "unfunded";
  return {
    reproduced: sample && unguardedFundingState === "reserved-fixture",
    unguardedFundingState,
    sample,
    saleState: "not_a_sale",
    liveProductPresent: false,
  };
}

export function rejectSampleFundingAsNotASale(
  request: SampleFundingRequest,
): SampleFundingRejection {
  const sample = detectSample(request);
  const saleLike = isSaleLikeFunding(request);
  const promotion = isCustomerOrSalePromotion(request);
  const failure =
    sample && saleLike
      ? SAMPLE_NOT_A_SALE
      : promotion && !sample
        ? FIXTURE_BECOMES_SALE
        : SAMPLE_NOT_A_SALE;
  return {
    ok: false,
    rejected: true,
    fundingState: "rejected",
    sold: false,
    saleState: "not_a_sale",
    provenance: "fixture",
    code: failure.code,
    failure,
    sample,
    liveProductPresent: false,
  };
}
