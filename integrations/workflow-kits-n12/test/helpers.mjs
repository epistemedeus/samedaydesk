import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runRecordToAcceptedOutput } from "../vendor/payment-rail/recurring-journey/journey.mjs";
import {
  agentEntryCaller,
  CLOCK,
  periodNCapture,
  termsInputFromCaller,
  usefulDelivery,
  workExchangeCaller,
} from "../vendor/payment-rail/recurring-journey/fixtures/load-synthetic-recurring.mjs";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export { CLOCK };

export function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

export function readText(rel) {
  return readFileSync(join(root, rel), "utf8");
}

export function readVendorFixture(name) {
  return readJson(`vendor/payment-rail/recurring-journey/fixtures/${name}`);
}

/** The native (installed / direct) run, built exactly as the vendored PR 684 tests build it. */
export function nativePeriodN(overrides = {}) {
  const caller = workExchangeCaller();
  const entry = agentEntryCaller();
  return runRecordToAcceptedOutput({
    periodId: "period-N",
    taskId: caller.periodNTaskId,
    contextId: caller.contextId,
    clock: CLOCK,
    termsInput: termsInputFromCaller(caller),
    ingestion: periodNCapture(),
    delivery: usefulDelivery,
    correlationId: entry.correlationId,
    token: entry.token,
    tool: entry.tool,
    measurement: entry.measurement,
    step: entry.step,
    acquisitionPath: "installed",
    ...overrides,
  });
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
