export function decideBundle({ bundle, acceptance, effort, economics }) {
  const reasons = [];
  let action;

  if (effort.disclosure === "costs_unknown" || effort.comparison === "costs_unknown") {
    action = "undecided_costs_unknown";
    reasons.push("costs_unknown");
  } else if (effort.comparison === "bundle_lowers_measured_effort") {
    action = "suggest_bundle";
    reasons.push("bundle_lowers_measured_effort");
  } else if (effort.comparison === "direct_lower_measured_effort") {
    action = "keep_separate";
    reasons.push("direct_lower_measured_effort");
  } else {
    action = "keep_separate";
    reasons.push("measured_effort_equal");
  }

  const exceptionTasks = acceptance.tasks.filter((row) => row.outcome === "needs_reviewer_exception");
  const rejectedTasks = acceptance.tasks.filter((row) => row.outcome === "objective_not_met");
  if (exceptionTasks.length > 0) reasons.push("acceptance_needs_reviewer_exception");
  if (rejectedTasks.length > 0) reasons.push("acceptance_objective_not_met");

  const delta = economics.bundled?.cumulativeFloorDelta;
  if (typeof delta === "string" && delta !== "0") {
    reasons.push("bundled_fee_differs_from_separate_sum");
  }

  return {
    action,
    reasons: [...new Set(reasons)],
    taskIds: bundle.tasks.map((task) => task.taskId),
    reservationIds: bundle.tasks
      .map((task) => task.reservationId)
      .filter((value) => typeof value === "string"),
    autoAccept: false,
    autoAcceptedToLowerCost: false,
    acceptanceBlocksCheapAutoAccept: exceptionTasks.length > 0 || rejectedTasks.length > 0,
    exceptionTaskIds: exceptionTasks.map((row) => row.taskId),
    rejectedTaskIds: rejectedTasks.map((row) => row.taskId),
  };
}
