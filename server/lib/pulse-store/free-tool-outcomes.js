// Terminal GET /api/tools/ai-readiness observations.
// Fixed classes only: no checked URL, prompt, address, credential, or referrer.

const OBSERVED_FROM_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const FREE_TOOL_OUTCOME_KEYS = Object.freeze([
  "completed",
  "invalid_host",
  "unreachable",
  "timeout",
  "abandoned",
  "other_failure",
]);

export const FREE_TOOL_CALLER_KEYS = Object.freeze(["human", "bot", "ai", "unknown"]);

const OUTCOME_KEYS = new Set(FREE_TOOL_OUTCOME_KEYS);
const CALLER_KEYS = new Set(FREE_TOOL_CALLER_KEYS);

function invalid() {
  throw new Error("pulse_invalid_field:freeToolOutcomes");
}

function emptyNamed(keys) {
  const out = Object.create(null);
  for (const key of keys) out[key] = 0;
  return out;
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function emptyFreeToolOutcomes(observedFrom) {
  return {
    observedFrom,
    requests: 0,
    outcomes: emptyNamed(FREE_TOOL_OUTCOME_KEYS),
    callers: emptyNamed(FREE_TOOL_CALLER_KEYS),
  };
}

function readPartition(map, allowed, label) {
  if (!map || typeof map !== "object" || Array.isArray(map)) invalid();
  const keys = Object.keys(map);
  if (keys.length !== allowed.size) invalid();
  const out = emptyNamed(label);
  for (const key of keys) {
    if (!allowed.has(key) || !isCount(map[key])) invalid();
    out[key] = map[key];
  }
  return out;
}

export function validateFreeToolOutcomes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const keys = Object.keys(value);
  if (keys.length !== 4 || keys.some((key) => !["observedFrom", "requests", "outcomes", "callers"].includes(key))) {
    invalid();
  }
  if (typeof value.observedFrom !== "string" || !OBSERVED_FROM_RE.test(value.observedFrom)) invalid();
  const observedMs = Date.parse(value.observedFrom);
  if (!Number.isFinite(observedMs) || new Date(observedMs).toISOString() !== value.observedFrom) invalid();
  if (!isCount(value.requests)) invalid();
  const outcomes = readPartition(value.outcomes, OUTCOME_KEYS, FREE_TOOL_OUTCOME_KEYS);
  const callers = readPartition(value.callers, CALLER_KEYS, FREE_TOOL_CALLER_KEYS);
  const outcomeSum = FREE_TOOL_OUTCOME_KEYS.reduce((sum, key) => sum + outcomes[key], 0);
  const callerSum = FREE_TOOL_CALLER_KEYS.reduce((sum, key) => sum + callers[key], 0);
  if (outcomeSum !== value.requests || callerSum !== value.requests) invalid();
  return {
    observedFrom: value.observedFrom,
    requests: value.requests,
    outcomes,
    callers,
  };
}

export function mergeFreeToolOutcomes(base, add) {
  if (!add) return base ? validateFreeToolOutcomes(base) : null;
  const validated = validateFreeToolOutcomes(add);
  if (!base) return validated;
  const left = validateFreeToolOutcomes(base);
  const outcomes = emptyNamed(FREE_TOOL_OUTCOME_KEYS);
  const callers = emptyNamed(FREE_TOOL_CALLER_KEYS);
  for (const key of FREE_TOOL_OUTCOME_KEYS) outcomes[key] = left.outcomes[key] + validated.outcomes[key];
  for (const key of FREE_TOOL_CALLER_KEYS) callers[key] = left.callers[key] + validated.callers[key];
  return validateFreeToolOutcomes({
    observedFrom: left.observedFrom <= validated.observedFrom ? left.observedFrom : validated.observedFrom,
    requests: left.requests + validated.requests,
    outcomes,
    callers,
  });
}
