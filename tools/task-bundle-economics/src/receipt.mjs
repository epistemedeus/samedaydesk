export function buildReceipt(evaluation) {
  const reservations = evaluation.tasks
    .map((task) => task.reservationId)
    .filter((value) => typeof value === "string");

  return {
    ok: true,
    schema: "pilot.task-bundle-economics.receipt.v1",
    kind: "requester_receipt",
    signer: false,
    paymentCommand: false,
    fundedCommission: false,
    verifierExecuted: false,
    rails: evaluation.rails,
    bundleId: evaluation.bundleId,
    requesterNote: evaluation.requesterNote,
    tasks: evaluation.tasks.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      summary: task.summary,
      criteria: task.criteria,
      reservationId: task.reservationId,
      acceptance: {
        outcome: task.acceptance.outcome,
        reasons: task.acceptance.reasons,
        verifierExecuted: false,
      },
      economics: summarizeEconomics(task.economics),
      unknown: task.unknown,
    })),
    bundledEconomics: summarizeEconomics(evaluation.bundledEconomics),
    feeDisclosure: {
      takeRateInvented: false,
      feeBps: evaluation.rails.feeBps,
      feeBasis: evaluation.rails.feeBasis,
      feeModule: evaluation.rails.feeModule,
      bundledFeeDiffersFromSeparateSum: evaluation.bundledEconomics?.bundledFeeDiffersFromSeparateSum === true,
      cumulativeFloorDelta: evaluation.bundledEconomics?.cumulativeFloorDelta,
      equalNetNote: evaluation.bundledEconomics?.equalNetNote,
    },
    effort: evaluation.effort,
    bundleDecision: evaluation.bundleDecision,
    acceptanceSummary: evaluation.acceptanceSummary,
    reservations,
    preservedUnknown: evaluation.preservedUnknown,
    notes: [
      "This receipt does not pay, sign, reserve funds, or commission work.",
      "Platform fee arithmetic uses the existing FEE_BPS=500 policy imported from vendor/hosted-wallet-market/src/fee.mjs.",
      "When effort evidence is missing, the comparison is costs_unknown.",
      "Objective acceptance is never flipped to accepted in order to lower cost.",
      "Verifier payloads are recorded as data and are not executed.",
    ],
  };
}

function summarizeEconomics(row) {
  if (!row) return { feeReadout: "absent" };
  if (row.feeReadout !== "authorized_existing_terms") {
    return {
      feeReadout: row.feeReadout,
      reservationId: row.reservationId,
    };
  }
  return {
    feeReadout: row.feeReadout,
    reservationId: row.reservationId,
    feeBps: row.feeBps,
    feeBasis: row.feeBasis,
    roundingProfile: row.roundingProfile,
    grossAtomic: row.grossAtomic,
    railCostAtomic: row.railCostAtomic,
    railCostOmitted: row.railCostOmitted,
    platformFeeAtomic: row.platformFeeAtomic,
    contributorNetAtomic: row.contributorNetAtomic,
    thisQuoteFeeIsExactFivePercent: row.thisQuoteFeeIsExactFivePercent,
    separateFeeSumAtomic: row.separateFeeSumAtomic,
    separateContributorNetSumAtomic: row.separateContributorNetSumAtomic,
    cumulativeFloorDelta: row.cumulativeFloorDelta,
    bundledFeeDiffersFromSeparateSum: row.bundledFeeDiffersFromSeparateSum,
    equalNetNote: row.equalNetNote,
  };
}
