import { FIXTURE_BECOMES_SALE } from "./failures.ts";
import {
  acceptRepairIntake,
  completeRepair,
  isFixtureSampleOrExample,
  type CompleteResult,
  type IntakeResult,
} from "./intake.ts";
import type { RepairIntakeDraft } from "./types.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function flagStrings(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (Array.isArray(record.flags)) {
    for (const flag of record.flags) {
      if (typeof flag === "string") out.push(flag);
    }
  }
  if (Array.isArray(record.labels)) {
    for (const label of record.labels) {
      if (typeof label === "string") out.push(label);
    }
  }
  if (typeof record.exampleFlag === "string") out.push(record.exampleFlag);
  if (typeof record.flag === "string") out.push(record.flag);
  return out;
}

/** Merge nested `intake` so SAMPLE marks on a fixture survive a customer-use wrapper. */
function unwrap(draft: unknown): Record<string, unknown> {
  if (!isPlainObject(draft)) return {};
  const inner = isPlainObject(draft.intake) ? draft.intake : {};
  return { ...inner, ...draft };
}

function extraSampleShape(record: Record<string, unknown>, extraFlags: string[]): boolean {
  if (record.label === "SAMPLE") return true;
  if (record.sampleLabel === "SAMPLE") return true;
  if (record.exampleMode === true) return true;
  if (record.sourceKind === "sample") return true;
  const flags = [...flagStrings(record), ...extraFlags];
  return flags.includes("--example");
}

export function isF18SampleShape(draft: unknown, extraFlags: string[] = []): boolean {
  const record = unwrap(draft);
  if (extraSampleShape(record, extraFlags)) return true;
  return isFixtureSampleOrExample(record as RepairIntakeDraft, extraFlags);
}

function claimsCustomerUse(record: Record<string, unknown>, extraFlags: string[] = []): boolean {
  if (record.provenance === "customer") return true;
  if (record.paid === true || record.settled === true) return true;
  if (typeof record.saleState === "string" && record.saleState !== "not_a_sale") return true;
  const flags = [...flagStrings(record), ...extraFlags].map((flag) => flag.toLowerCase());
  return flags.includes("--customer") || flags.includes("--paid") || flags.includes("--settled");
}

export type FixtureBecomesSaleRejection = {
  ok: false;
  rejected: true;
  completed: false;
  failure: typeof FIXTURE_BECOMES_SALE;
  saleState: "not_a_sale";
};

function fixtureBecomesSaleRejection(): FixtureBecomesSaleRejection {
  return {
    ok: false,
    rejected: true,
    completed: false,
    failure: FIXTURE_BECOMES_SALE,
    saleState: "not_a_sale",
  };
}

export type F18SampleGuardResult = IntakeResult | CompleteResult | FixtureBecomesSaleRejection;

function sampleCompletionFlippedToCustomer(
  result: IntakeResult | CompleteResult,
  sample: boolean,
): boolean {
  if (!sample || !result.ok) return false;
  return result.intake.provenance === "customer";
}

/**
 * SAMPLE / fixture completion is not customer use.
 * Extra F18 shapes (`label`, `sampleLabel`, `exampleMode`, `--example`, `sourceKind: sample`)
 * are included so completion cannot flip provenance to customer even when intake.ts misses them.
 */
export function assertSampleIsNotCustomerUse(
  draft: unknown,
  extraFlags: string[] = [],
): F18SampleGuardResult {
  const record = unwrap(draft);
  const sample = isF18SampleShape(record, extraFlags);
  if (sample && claimsCustomerUse(record, extraFlags)) {
    return fixtureBecomesSaleRejection();
  }

  const accepted = acceptRepairIntake(record as RepairIntakeDraft, extraFlags);
  if (sampleCompletionFlippedToCustomer(accepted, sample)) {
    return fixtureBecomesSaleRejection();
  }
  if (!accepted.ok) return accepted;

  const completed = completeRepair(record);
  if (sampleCompletionFlippedToCustomer(completed, sample)) {
    return fixtureBecomesSaleRejection();
  }
  if (completed.ok && completed.saleState !== "not_a_sale") {
    return fixtureBecomesSaleRejection();
  }
  return completed;
}

/** Same seeded FIXTURE_BECOMES_SALE failure for any SAMPLE/fixture completion claimed as customer use. */
export function strengthenFixtureBecomesSale(
  draft: unknown,
  extraFlags: string[] = [],
): F18SampleGuardResult {
  const record = unwrap(draft);
  if (isF18SampleShape(record, extraFlags) && claimsCustomerUse(record, extraFlags)) {
    return fixtureBecomesSaleRejection();
  }
  return assertSampleIsNotCustomerUse(draft, extraFlags);
}
