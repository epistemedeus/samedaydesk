export const OUTCOME_KIND = Object.freeze({
  delivered: "delivered",
  analysisRefused: "analysis-refused",
  analysisUnchanged: "analysis-unchanged",
  engineFailure: "engine-failure",
  transportFailure: "transport-failure",
  incompleteOutputs: "incomplete-outputs",
});

export const FAILURE_KINDS = Object.freeze([
  OUTCOME_KIND.engineFailure,
  OUTCOME_KIND.transportFailure,
  OUTCOME_KIND.incompleteOutputs,
]);

export function isReplayFailure(ticket) {
  if (!ticket) return false;
  if (ticket.status === "rejected") return true;
  if (ticket.executionOk === false) return true;
  return FAILURE_KINDS.includes(ticket.outcomeKind);
}

export function classifyExecution({
  spawnStatus,
  engineJson,
  expectedNames = [],
  presentNames = [],
} = {}) {
  const expected = [...expectedNames];
  const present = [...presentNames];
  const missing = expected.filter((name) => !present.includes(name));
  const hasEngineJson = Boolean(engineJson) && typeof engineJson === "object";
  const analysisStatus = typeof engineJson?.status === "string" ? engineJson.status : null;

  if (!hasEngineJson && spawnStatus !== 0) {
    return {
      outcomeKind: OUTCOME_KIND.transportFailure,
      analysisOutcome: null,
      executionOk: false,
      ticketStatus: "rejected",
      missing,
    };
  }

  if (missing.length) {
    return {
      outcomeKind: OUTCOME_KIND.incompleteOutputs,
      analysisOutcome: analysisStatus,
      executionOk: false,
      ticketStatus: "rejected",
      missing,
    };
  }

  if (analysisStatus === "refused" || engineJson?.refused === true) {
    return {
      outcomeKind: OUTCOME_KIND.analysisRefused,
      analysisOutcome: analysisStatus || "refused",
      executionOk: true,
      ticketStatus: "completed",
      missing: [],
    };
  }

  if (analysisStatus === "unchanged" || analysisStatus === "no-change") {
    return {
      outcomeKind: OUTCOME_KIND.analysisUnchanged,
      analysisOutcome: analysisStatus,
      executionOk: true,
      ticketStatus: "completed",
      missing: [],
    };
  }

  if (hasEngineJson && engineJson.ok === false) {
    return {
      outcomeKind: OUTCOME_KIND.engineFailure,
      analysisOutcome: analysisStatus,
      executionOk: false,
      ticketStatus: "rejected",
      missing: [],
    };
  }

  return {
    outcomeKind: OUTCOME_KIND.delivered,
    analysisOutcome: analysisStatus || "ok",
    executionOk: true,
    ticketStatus: "completed",
    missing: [],
  };
}
