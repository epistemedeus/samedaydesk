import { compareFor, diagnoseFor } from "../../task-bundle-economics/src/evaluate.mjs";
import { FEE_BPS } from "../../task-bundle-economics/src/economics.mjs";
import { FEE_PROJECTION_SCHEMA, capabilityStamp } from "./constants.mjs";
import { dropUndefined, sha256Json } from "./json.mjs";

export { FEE_BPS };

export function bundleFromJourney(journey) {
  const task = journey.task;
  const delivery = journey.delivery;
  const body = {
    schema: "pilot.task-bundle-economics.bundle.v1",
    bundleId: task.taskId,
    requesterNote: task.requesterNote || "Caller-owned two-sided work readout. Not a commission.",
    provenance: task.provenance,
    directRoute: {
      description: "Compare this posted task with the existing task-bundle-economics CLI.",
      provenance: task.provenance,
    },
    tasks: [
      {
        taskId: task.taskId,
        title: task.title,
        summary: task.summary,
        provenance: task.provenance,
        criteria: task.criteria,
        objectiveCriteria: task.objectiveCriteria,
        payableKinds: task.payableKinds,
        terms: task.terms,
        grossAtomic: task.grossAtomic,
        railCostAtomic: task.railCostAtomic,
        termsDigest: task.termsDigest,
        artifactDigest: delivery?.artifactDigest,
        rightsDigest: task.rightsDigest,
        expectedRevision: journey.revision,
        publicationConsent: task.publicationConsent,
        effort: task.effort,
        costLines: task.costLines,
        directRoute: {
          description: "Diagnose this delivery with the existing task-bundle-economics CLI.",
          provenance: task.provenance,
        },
        delivery: delivery
          ? {
              artifact: delivery.artifact,
              citedEvidence: delivery.citedEvidence,
              acquisition: {
                processId: "two-sided-work-consumer",
                processKind: "in_process_library_call",
              },
            }
          : undefined,
      },
    ],
  };
  return dropUndefined(body);
}

export function diagnoseJourney(journey) {
  return diagnoseFor(bundleFromJourney(journey));
}

export function compareJourney(journey) {
  return compareFor(bundleFromJourney(journey));
}

export function projectFee(journey) {
  const compared = compareJourney(journey);
  if (!compared.ok) {
    return { ok: false, reason: "bundle_refused", message: compared.message, ...capabilityStamp() };
  }
  const economics = compared.perTaskEconomics?.[0]?.economics || {};
  const authorized = economics.feeReadout === "authorized_existing_terms";
  if (authorized && economics.feeBps !== FEE_BPS) {
    return { ok: false, reason: "fee_rail_mismatch", ...capabilityStamp() };
  }
  if (authorized && economics.feeBasis !== "new_job_gross") {
    return { ok: false, reason: "fee_rail_mismatch", ...capabilityStamp() };
  }
  const unknownCosts = (journey.task.costLines || [])
    .filter((line) => !line || line.status !== "measured" || line.atomic === undefined)
    .map((line) => ({ kind: line?.kind, status: "unknown" }));
  const projection = {
    schema: FEE_PROJECTION_SCHEMA,
    taskId: journey.task.taskId,
    feeReadout: economics.feeReadout || "absent",
    authorized,
    pricingInvented: false,
    operatorCompute: "costs_unknown",
    effortComparison: compared.effort?.comparison || "costs_unknown",
    effortDisclosure: compared.effort?.disclosure || "costs_unknown",
    unknownCosts,
    source: "tools/task-bundle-economics",
    feeModule: "vendor/hosted-wallet-market/src/fee.mjs",
    ...capabilityStamp(),
  };
  if (authorized) {
    projection.feeBps = FEE_BPS;
    projection.feeBasis = "new_job_gross";
    projection.grossAtomic = economics.grossAtomic;
    projection.platformFeeAtomic = economics.platformFeeAtomic;
    projection.contributorNetAtomic = economics.contributorNetAtomic;
    projection.railCostOmitted = economics.railCostOmitted === true;
    projection.cumulativeFloorDelta = compared.bundledEconomics?.cumulativeFloorDelta;
    projection.equalNet = compared.bundledEconomics?.cumulativeFloorDelta === "0";
    projection.equalNetNote = compared.bundledEconomics?.equalNetNote;
    if (compared.effort?.disclosure === "measured") {
      projection.existingBreakEven = compared.effort.breakEven;
    }
  }
  if (compared.effort?.disclosure !== "measured") {
    projection.directCostAtomic = "costs_unknown";
    projection.bundledCostAtomic = "costs_unknown";
  }
  projection.digest = sha256Json({
    feeReadout: projection.feeReadout,
    authorized: projection.authorized,
    feeBps: projection.feeBps,
    grossAtomic: projection.grossAtomic,
    platformFeeAtomic: projection.platformFeeAtomic,
    contributorNetAtomic: projection.contributorNetAtomic,
    effortComparison: projection.effortComparison,
    effortDisclosure: projection.effortDisclosure,
    unknownCosts: projection.unknownCosts,
  });
  return { ok: true, projection, ...capabilityStamp() };
}
