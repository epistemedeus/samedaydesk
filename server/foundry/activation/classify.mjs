import { isDeepStrictEqual } from "node:util";

export const PRODUCTION_ACTIVATE = "HOLD";

const DISABLED_REASONS = new Set(["unconfigured", "invalid_config", "store_unavailable"]);
const PORTABLE_OUTCOMES = new Set(["observed", "unknown", "error", "unsupported"]);

function portableOutput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!PORTABLE_OUTCOMES.has(value.outcome)) return false;
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return false;
  return true;
}

function readyFacade(receiver) {
  const body = receiver?.body;
  return receiver?.status === 200
    && body?.optIn === true
    && body?.facade === true
    && body?.rawMounted === false
    && body?.publicExecution === false
    && body?.extension === true
    && body?.schema === "pilot_correspondence"
    && body?.wholeHostSandbox === false;
}

export function factsFrom(observation) {
  const health = observation?.sdsHealth || {};
  const healthz = observation?.correspondenceHealthz || {};
  const hz = healthz.body || {};
  const sdsOk = health.status === 200 && health.service === "samedaydesk" && health.ok === true;
  const facade = readyFacade(observation?.foundryReceiver);
  const entry = observation?.visitorEntry?.status === 200 && observation?.visitorEntry?.hasProfile === true;
  const uploadsHold = observation?.uploads?.status === 501;
  const disabledBody = healthz.status === 200
    && hz.ok === false
    && hz.enabled === false
    && DISABLED_REASONS.has(hz.reason);
  const hostedDiscovery = sdsOk
    && healthz.status === 200
    && hz.ok === true
    && hz.enabled === true
    && hz.store === "postgres"
    && facade
    && entry
    && uploadsHold;
  const task = observation?.task;
  const taskResult = hostedDiscovery
    && task?.published === true
    && typeof task?.candidateId === "string"
    && task.candidateId.length > 0
    && portableOutput(task.output)
    && portableOutput(task.expected)
    && isDeepStrictEqual(task.output, task.expected);
  const retrieval = observation?.retrieval;
  const durableRetrieval = taskResult
    && retrieval?.processRestarted === true
    && retrieval?.databaseSurvived === true
    && retrieval?.sameCandidate === true
    && portableOutput(retrieval.output)
    && isDeepStrictEqual(retrieval.output, task.expected);
  const disabledOptionalMount = sdsOk && disabledBody && !facade && !hostedDiscovery && !taskResult && !durableRetrieval;
  return {
    disabledOptionalMount,
    hostedDiscovery,
    taskResult,
    durableRetrieval,
  };
}

function rejected(reason, facts = null) {
  return {
    ok: false,
    exitCode: 2,
    code: "false_green_rejected",
    reason,
    facts,
    productionActivate: PRODUCTION_ACTIVATE,
  };
}

export function judge(observation) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    return rejected("observation_missing");
  }
  if (observation.productionActivate !== PRODUCTION_ACTIVATE) {
    return rejected("production_activate_not_hold");
  }
  const facts = factsFrom(observation);
  const claims = observation.claims;
  if (claims) {
    for (const key of ["disabledOptionalMount", "hostedDiscovery", "taskResult", "durableRetrieval"]) {
      if (typeof claims[key] !== "boolean") return rejected("claim_not_boolean", facts);
    }
    if (claims.durableRetrieval && !facts.durableRetrieval) return rejected("durable_claim_without_retrieval", facts);
    if (claims.taskResult && !facts.taskResult) return rejected("task_claim_without_result", facts);
    if (claims.hostedDiscovery && !facts.hostedDiscovery) return rejected("discovery_claim_without_facade", facts);
    if ((claims.hostedDiscovery || claims.taskResult || claims.durableRetrieval) && facts.disabledOptionalMount) {
      return rejected("disabled_mount_is_not_success", facts);
    }
    for (const key of ["disabledOptionalMount", "hostedDiscovery", "taskResult", "durableRetrieval"]) {
      if (claims[key] !== facts[key]) return rejected(`claim_${key}`, facts);
    }
  }
  return {
    ok: true,
    exitCode: 0,
    code: "classified",
    facts,
    productionActivate: PRODUCTION_ACTIVATE,
  };
}

const REQUIREMENTS = {
  disabled: "disabledOptionalMount",
  discovery: "hostedDiscovery",
  task: "taskResult",
  durable: "durableRetrieval",
};

export function requireFact(observation, name) {
  const judged = judge(observation);
  if (!judged.ok) return judged;
  const key = REQUIREMENTS[name];
  if (!key) return rejected("unknown_requirement", judged.facts);
  if (!judged.facts[key]) {
    return {
      ok: false,
      exitCode: 1,
      code: "acceptance_unmet",
      reason: key,
      facts: judged.facts,
      productionActivate: PRODUCTION_ACTIVATE,
    };
  }
  return judged;
}
