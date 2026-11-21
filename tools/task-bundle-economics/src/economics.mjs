import {
  FEE_BPS,
  ROUNDING_PROFILE,
  atomic,
  feePerCapture,
  quoteEconomics,
} from "../../../vendor/hosted-wallet-market/src/fee.mjs";

export { FEE_BPS, ROUNDING_PROFILE, atomic, feePerCapture, quoteEconomics };

export const FEE_MODULE = "vendor/hosted-wallet-market/src/fee.mjs";
export const SOURCE_PIN = "9f6c0c4e396dd7677f334400eed93e3445fad600";
export const AUTHORIZED_FEE_BASIS = "new_job_gross";
// Matches breakEvenGross(cost) in runtime/agent-economy-foundation/dist/money.js
// (atomic(cost) * 20n). That file is not imported here because it pulls ajv.
export const BREAK_EVEN_MULTIPLE = 20n;

export function railsMeta() {
  return {
    feeModule: FEE_MODULE,
    feeBps: FEE_BPS,
    feeBasis: AUTHORIZED_FEE_BASIS,
    roundingProfile: ROUNDING_PROFILE,
    sourcePin: SOURCE_PIN,
    consumerBranch: "codex/h136010-machine-release-20261103",
  };
}

export function termsAuthorizeFeeReadout(terms) {
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) {
    return { ok: false, reason: "terms_absent" };
  }
  const bps = terms.feeBps ?? terms.fee?.bps;
  const basis = terms.feeBasis ?? terms.fee?.basis;
  if (bps === undefined && basis === undefined) {
    return { ok: false, reason: "terms_fee_fields_absent" };
  }
  if (bps !== FEE_BPS) {
    return { ok: false, reason: "terms_fee_bps_not_authorized" };
  }
  if (basis !== AUTHORIZED_FEE_BASIS) {
    return { ok: false, reason: "terms_fee_basis_not_authorized" };
  }
  return { ok: true, feeBps: FEE_BPS, feeBasis: AUTHORIZED_FEE_BASIS };
}

export function breakEvenGrossAtomic(costAtomic) {
  return (atomic(costAtomic) * BREAK_EVEN_MULTIPLE).toString();
}

export function separateVersusBundledFees(grossAtomics) {
  const separateFeeAtomics = grossAtomics.map((gross) => feePerCapture(gross));
  const separateFeeSum = separateFeeAtomics.reduce((sum, fee) => sum + atomic(fee), 0n);
  const bundledGross = grossAtomics.reduce((sum, gross) => sum + atomic(gross), 0n);
  const bundledFee = atomic(feePerCapture(bundledGross.toString()));
  return {
    separateFeeAtomics,
    separateFeeSumAtomic: separateFeeSum.toString(),
    bundledGrossAtomic: bundledGross.toString(),
    bundledFeeAtomic: bundledFee.toString(),
    // Same identity as agent-economy-rail capturePlan cumulativeFloorDelta:
    // (bundledGross * 500n / 10000n) - sum(per-capture floors).
    cumulativeFloorDelta: (bundledFee - separateFeeSum).toString(),
  };
}

function quoteOrFail({ gross, railCost, railCostOmitted }) {
  try {
    const quote = quoteEconomics({
      gross,
      railCost,
      captures: [gross],
    });
    return { ok: true, railCostOmitted, quote };
  } catch (error) {
    return {
      ok: false,
      reason: error.codeName || error.message || "quote_refused",
    };
  }
}

export function evaluateTaskEconomics(task) {
  const authorized = termsAuthorizeFeeReadout(task.terms);
  if (!authorized.ok) {
    return {
      taskId: task.taskId,
      feeReadout: authorized.reason,
      reservationId: task.reservationId,
    };
  }
  if (task.grossAtomic === undefined) {
    return {
      taskId: task.taskId,
      feeReadout: "gross_unknown",
      reservationId: task.reservationId,
      terms: { feeBps: FEE_BPS, feeBasis: AUTHORIZED_FEE_BASIS },
    };
  }
  const railCostOmitted = task.railCostAtomic === undefined;
  const quoted = quoteOrFail({
    gross: task.grossAtomic,
    railCost: railCostOmitted ? "0" : task.railCostAtomic,
    railCostOmitted,
  });
  if (!quoted.ok) {
    return {
      taskId: task.taskId,
      feeReadout: quoted.reason,
      reservationId: task.reservationId,
    };
  }
  return {
    taskId: task.taskId,
    reservationId: task.reservationId,
    feeReadout: "authorized_existing_terms",
    railCostOmitted,
    ...quoted.quote,
  };
}

export function evaluateBundledEconomics(bundleOrTasks) {
  const tasks = Array.isArray(bundleOrTasks) ? bundleOrTasks : bundleOrTasks.tasks;
  const rows = tasks.map(evaluateTaskEconomics);
  const authorized = rows.filter((row) => row.feeReadout === "authorized_existing_terms");
  if (authorized.length === 0) {
    return { tasks: rows, bundled: { feeReadout: "no_authorized_task_quotes" } };
  }
  if (authorized.length !== tasks.length) {
    return { tasks: rows, bundled: { feeReadout: "mixed_or_missing_terms" } };
  }

  const grossAtomics = tasks.map((task) => task.grossAtomic);
  const floors = separateVersusBundledFees(grossAtomics);
  const railOmitted = tasks.some((task) => task.railCostAtomic === undefined);
  const railSum = tasks.reduce((sum, task) => (
    sum + atomic(task.railCostAtomic === undefined ? "0" : task.railCostAtomic)
  ), 0n);
  const quoted = quoteOrFail({
    gross: floors.bundledGrossAtomic,
    railCost: railSum.toString(),
    railCostOmitted: railOmitted,
  });
  if (!quoted.ok) {
    return { tasks: rows, bundled: { feeReadout: quoted.reason } };
  }

  const separateNet = authorized.reduce((sum, row) => sum + atomic(row.contributorNetAtomic), 0n);
  return {
    tasks: rows,
    bundled: {
      feeReadout: "authorized_existing_terms",
      railCostOmitted: railOmitted,
      ...quoted.quote,
      separateFeeSumAtomic: floors.separateFeeSumAtomic,
      separateContributorNetSumAtomic: separateNet.toString(),
      cumulativeFloorDelta: floors.cumulativeFloorDelta,
      bundledFeeDiffersFromSeparateSum: floors.cumulativeFloorDelta !== "0",
      equalNetNote: floors.cumulativeFloorDelta === "0"
        ? "Bundled contributor net equals the sum of per-task nets under the same 500 bps floor."
        : "Bundled platform fee differs from the sum of separate per-capture floors by cumulativeFloorDelta; bundled contributor net moves by the opposite amount.",
    },
  };
}
