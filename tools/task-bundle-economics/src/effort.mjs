import { atomic, breakEvenGrossAtomic } from "./economics.mjs";

function costFrom(effort, key) {
  if (!effort || typeof effort !== "object") {
    return { known: false, disclosure: "costs_unknown", reason: "effort_missing" };
  }
  if (effort.status === "costs_unknown") {
    return { known: false, disclosure: "costs_unknown", reason: "status_costs_unknown" };
  }
  if (effort.measured !== true) {
    return { known: false, disclosure: "costs_unknown", reason: "not_measured" };
  }
  if (effort[key] === undefined) {
    return { known: false, disclosure: "costs_unknown", reason: `${key}_missing` };
  }
  return { known: true, atomic: effort[key], disclosure: "measured" };
}

export function compareEffort(bundle) {
  const rows = [];
  let directSum = 0n;
  let shareSum = 0n;
  let directKnown = true;
  let sharesKnown = true;
  const reasons = [];

  for (const task of bundle.tasks) {
    const direct = costFrom(task.effort, "directCostAtomic");
    const share = costFrom(task.effort, "bundledShareAtomic");
    rows.push({
      taskId: task.taskId,
      reservationId: task.reservationId,
      directCost: direct.known ? direct.atomic : "costs_unknown",
      bundledShare: share.known ? share.atomic : "costs_unknown",
      directDisclosure: direct.disclosure,
      bundledShareDisclosure: share.disclosure,
    });
    if (direct.known) directSum += atomic(direct.atomic);
    else {
      directKnown = false;
      reasons.push(direct.reason);
    }
    if (share.known) shareSum += atomic(share.atomic);
    else {
      sharesKnown = false;
      reasons.push(share.reason);
    }
  }

  const whole = costFrom(bundle.bundleEffort, "costAtomic");
  let bundledKnown = false;
  let bundledAtomic;
  let bundledSource;
  if (whole.known) {
    bundledKnown = true;
    bundledAtomic = whole.atomic;
    bundledSource = "bundleEffort";
  } else if (sharesKnown) {
    bundledKnown = true;
    bundledAtomic = shareSum.toString();
    bundledSource = "sum_of_bundled_shares";
  } else {
    bundledAtomic = "costs_unknown";
    bundledSource = whole.reason || "bundled_cost_unknown";
    reasons.push(bundledSource);
  }

  const directAtomic = directKnown ? directSum.toString() : "costs_unknown";
  let comparison = "costs_unknown";
  let disclosure = "costs_unknown";
  if (directKnown && bundledKnown) {
    disclosure = "measured";
    const directValue = atomic(directAtomic);
    const bundledValue = atomic(bundledAtomic);
    if (bundledValue < directValue) comparison = "bundle_lowers_measured_effort";
    else if (directValue < bundledValue) comparison = "direct_lower_measured_effort";
    else comparison = "measured_effort_equal";
  }

  const breakEven = {};
  if (directKnown) {
    breakEven.direct = {
      measuredCostAtomic: directAtomic,
      breakEvenGrossAtomic: breakEvenGrossAtomic(directAtomic),
      note: "Variable-cost lower bound only (20 times measured direct cost). Fixed costs and profit stay outside this bound.",
    };
  } else {
    breakEven.direct = { measuredCostAtomic: "costs_unknown", breakEvenGrossAtomic: "costs_unknown" };
  }
  if (bundledKnown) {
    breakEven.bundled = {
      measuredCostAtomic: bundledAtomic,
      breakEvenGrossAtomic: breakEvenGrossAtomic(bundledAtomic),
      note: "Variable-cost lower bound only (20 times measured bundled cost). Fixed costs and profit stay outside this bound.",
    };
  } else {
    breakEven.bundled = { measuredCostAtomic: "costs_unknown", breakEvenGrossAtomic: "costs_unknown" };
  }

  return {
    disclosure,
    comparison,
    directCostAtomic: directAtomic,
    bundledCostAtomic: bundledAtomic,
    bundledSource,
    tasks: rows,
    breakEven,
    reasons: [...new Set(reasons)],
    inventedPricing: false,
  };
}
