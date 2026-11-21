const VERIFIER_KEYS = Object.freeze(["verifier", "verifierPayload", "execute", "code"]);

function isAbsent(value) {
  return value === undefined;
}

export function evaluateCheck(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    return { decided: false, ok: false, reason: "observation_invalid" };
  }
  const check = observation.check;
  if (check === "exact_equal") {
    if (isAbsent(observation.expected) || isAbsent(observation.observed)) {
      return { decided: false, ok: false, reason: "value_absent", check };
    }
    return {
      decided: true,
      ok: Object.is(observation.expected, observation.observed),
      check,
    };
  }
  if (check === "digest_match") {
    return {
      decided: true,
      ok: typeof observation.expected === "string"
        && typeof observation.observed === "string"
        && observation.expected === observation.observed,
      check,
    };
  }
  if (check === "present") {
    const value = observation.observed;
    return {
      decided: true,
      ok: value !== undefined && value !== null && value !== "",
      check,
    };
  }
  if (check === "enum_in") {
    return {
      decided: true,
      ok: Array.isArray(observation.expected) && observation.expected.includes(observation.observed),
      check,
    };
  }
  return { decided: false, ok: false, reason: "check_not_deterministic", check };
}

export function evaluateTaskAcceptance(task) {
  const reasons = [];
  const notes = [];
  if (task.autoAcceptToLowerCost === true || task.delivery?.autoAcceptToLowerCost === true) {
    reasons.push("auto_accept_to_lower_cost_refused");
  }

  const criteria = Array.isArray(task.criteria) ? task.criteria : [];
  if (criteria.length < 1) {
    return {
      taskId: task.taskId,
      reservationId: task.reservationId,
      outcome: "needs_reviewer_exception",
      reasons: [...reasons, "delivery_criteria_missing"],
      checks: [],
      verifierExecuted: false,
    };
  }

  const delivery = task.delivery;
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return {
      taskId: task.taskId,
      reservationId: task.reservationId,
      outcome: "needs_reviewer_exception",
      reasons: [...reasons, "delivery_evidence_missing"],
      checks: [],
      verifierExecuted: false,
    };
  }

  const verifierPresent = VERIFIER_KEYS.some((key) => delivery[key] !== undefined);
  if (verifierPresent) {
    notes.push("verifier_payload_not_executed");
  }

  const observations = delivery.observations && typeof delivery.observations === "object" && !Array.isArray(delivery.observations)
    ? delivery.observations
    : {};

  const checks = [];
  let allDecided = true;
  let allPass = true;
  for (const criterion of criteria) {
    const observation = observations[criterion];
    if (observation === undefined) {
      allDecided = false;
      allPass = false;
      checks.push({ criterion, decided: false, ok: false, reason: "criterion_unobserved" });
      reasons.push("criterion_unobserved");
      continue;
    }
    const checked = evaluateCheck(observation);
    checks.push({ criterion, ...checked });
    if (!checked.decided) {
      allDecided = false;
      allPass = false;
      reasons.push(checked.reason || "check_not_deterministic");
    } else if (!checked.ok) {
      allPass = false;
      reasons.push("deterministic_check_failed");
    }
  }

  let outcome;
  if (allDecided && allPass) outcome = "objective_acceptance_met";
  else if (allDecided && !allPass) outcome = "objective_not_met";
  else outcome = "needs_reviewer_exception";

  if (verifierPresent && outcome !== "objective_acceptance_met") {
    reasons.push("verifier_payload_not_executed");
  }

  return {
    taskId: task.taskId,
    reservationId: task.reservationId,
    outcome,
    reasons: [...new Set(reasons)],
    notes,
    checks,
    verifierExecuted: false,
    autoAcceptedToLowerCost: false,
  };
}

export function evaluateAcceptance(bundle) {
  const tasks = bundle.tasks.map(evaluateTaskAcceptance);
  const exceptionCount = tasks.filter((row) => row.outcome === "needs_reviewer_exception").length;
  const rejectedCount = tasks.filter((row) => row.outcome === "objective_not_met").length;
  const acceptedCount = tasks.filter((row) => row.outcome === "objective_acceptance_met").length;
  return {
    tasks,
    summary: {
      acceptedCount,
      rejectedCount,
      exceptionCount,
      verifierExecuted: false,
      autoAcceptedToLowerCost: false,
    },
  };
}
