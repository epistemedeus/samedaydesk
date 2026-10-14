import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const packageRoot = join(here, "..");
export const priorPath = join(packageRoot, "fixtures/prior.json");
export const changedPath = join(packageRoot, "fixtures/current-changed.json");
export const unchangedPath = join(packageRoot, "fixtures/current-unchanged.json");
export const missingSkuPath = join(packageRoot, "fixtures/current-missing-sku.json");

export function request(overrides = {}) {
  const base = {
    schema: "samedaydesk.compat-maintenance-request.v1",
    occurrenceId: "compat-maint-cedar-1",
    clock: "2026-10-14T16:40:00.000Z",
    expiry: "2026-10-14T18:00:00.000Z",
    taskId: "cedar-chair-reuse",
    distinctTaskId: "desk-batch-retain",
    subject: "compat-contract-fields",
    sequence: 2,
    priorPath,
    currentFixturePath: changedPath,
    fields: ["contractVersion", "sku"],
    tenant: "owner",
    authorityTenant: "owner",
    applicability: {
      sourceChanged: true,
      licensePlane: "mit",
      accessWithdrawn: false,
      rightsCleared: true,
      applicabilityMiss: false,
      inheritFull: false,
    },
    procurement: {
      mandateState: "revoked",
      coldProfile: "agency-harbor",
      incumbentProfile: "incumbent-desk",
      incumbentPid: 111,
      actorPid: 222,
      actorIsMandatePrincipal: false,
      priorSpend: "outcome_unknown",
      reusableOutput: true,
      inheritedAuthorityRequested: false,
    },
    economics: {
      termsVersion: "new-market",
      grossAtoms: "20",
      declaredEffort: "declared",
      observedEffort: "unknown",
      reviewBurden: "unknown",
      modeledCost: "unknown",
      operation: "quote",
      feeMode: "per-capture",
      tokenPriceRecommendation: null,
    },
    review: {
      reviewer: "authorized-reviewer",
      decision: "accept",
      operatorCapture: false,
      presentedReceipt: false,
      expectedReviewer: "authorized-reviewer",
    },
  };
  const out = { ...base, ...overrides };
  for (const key of ["applicability", "procurement", "economics", "review"]) {
    if (overrides[key]) out[key] = { ...base[key], ...overrides[key] };
  }
  return out;
}
