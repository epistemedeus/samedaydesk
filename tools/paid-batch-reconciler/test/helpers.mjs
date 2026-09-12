import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { CURRENT_CORE_BASE } from "../../job-request-desk/lib/current.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const CLI = join(OWNED, "bin/batch.mjs");
export const REPO_ROOT = join(OWNED, "../..");
export const CURRENT_PIN = CURRENT_CORE_BASE;

export function callerBudget() {
  return {
    before: join(OWNED, "fixtures/caller/vendor-budget-impact/before.json"),
    after: join(OWNED, "fixtures/caller/vendor-budget-impact/after.json"),
  };
}

export function sampleBudget() {
  return {
    before: join(OWNED, "fixtures/seeded/sample-before.json"),
    after: join(OWNED, "fixtures/seeded/sample-after.json"),
  };
}

export function loadReservedPayment() {
  return JSON.parse(readFileSync(join(OWNED, "fixtures/payment/reserved-fixture.json"), "utf8"));
}

export function journeyRequest() {
  const files = callerBudget();
  return {
    schema: "samedaydesk.paid-batch-reconciler.request.v1",
    items: [
      {
        id: "ok-caller-pair",
        engineId: "vendor-budget-impact",
        files,
        funding: "reserved-fixture",
        payment: loadReservedPayment(),
      },
      {
        id: "missing-after",
        engineId: "vendor-budget-impact",
        files: { before: files.before },
        funding: "reserved-fixture",
        payment: loadReservedPayment(),
      },
    ],
  };
}

export function liveSettlePayload() {
  const payment = structuredClone(loadReservedPayment());
  delete payment.fixture;
  delete payment.label;
  delete payment.live;
  delete payment.purchaseAuthority;
  payment.accepted = {
    ...payment.accepted,
    payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
  };
  return payment;
}
