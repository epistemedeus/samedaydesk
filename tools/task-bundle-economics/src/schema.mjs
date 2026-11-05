import { BUNDLE_MAX_TASKS, CRITERIA_MAX, checkInputBounds } from "./limits.mjs";

export const BUNDLE_SCHEMA = "pilot.task-bundle-economics.bundle.v1";
export const ATOMIC_PATTERN = /^(0|[1-9][0-9]{0,18})$/;

export const KNOWN_BUNDLE_KEYS = Object.freeze([
  "schema",
  "bundleId",
  "requesterNote",
  "tasks",
  "bundleEffort",
]);

export const KNOWN_TASK_KEYS = Object.freeze([
  "taskId",
  "title",
  "summary",
  "criteria",
  "payableKinds",
  "terms",
  "grossAtomic",
  "railCostAtomic",
  "reservationId",
  "delivery",
  "effort",
  "termsDigest",
  "artifactDigest",
  "rightsDigest",
  "expectedRevision",
  "publicationConsent",
]);

export const KNOWN_TERMS_KEYS = Object.freeze(["feeBps", "feeBasis", "fee"]);
export const KNOWN_FEE_KEYS = Object.freeze(["bps", "basis", "profile", "schemaVersion"]);
export const KNOWN_DELIVERY_KEYS = Object.freeze([
  "observations",
  "verifier",
  "verifierPayload",
  "execute",
  "code",
  "autoAcceptToLowerCost",
  "notes",
]);
export const KNOWN_EFFORT_KEYS = Object.freeze([
  "directCostAtomic",
  "bundledShareAtomic",
  "measured",
  "status",
]);
export const KNOWN_BUNDLE_EFFORT_KEYS = Object.freeze(["costAtomic", "measured", "status"]);

export function preserveUnknown(value, knownKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const unknown = {};
  for (const [key, child] of Object.entries(value)) {
    if (!knownKeys.includes(key)) unknown[key] = child;
  }
  return unknown;
}

export function isAtomicString(value) {
  return typeof value === "string" && ATOMIC_PATTERN.test(value);
}

function fail(message, extra = {}) {
  return { ok: false, message, ...extra };
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length < 1) return fail(`${label} must be a nonempty string`);
  return null;
}

function validateCriteria(criteria) {
  if (criteria === undefined) return { ok: true, criteria: [] };
  if (!Array.isArray(criteria)) return fail("criteria must be an array of strings");
  if (criteria.length > CRITERIA_MAX) {
    return fail("criteria_limit_refused", { code: "criteria_limit_refused" });
  }
  if (criteria.some((item) => typeof item !== "string" || item.length < 1)) {
    return fail("criteria_refused", { code: "criteria_refused" });
  }
  if (new Set(criteria).size !== criteria.length) {
    return fail("criteria_refused", { code: "criteria_refused" });
  }
  return { ok: true, criteria };
}

function validateEffort(effort, knownKeys, label) {
  if (effort === undefined) return { ok: true, unknown: {} };
  if (!effort || typeof effort !== "object" || Array.isArray(effort)) {
    return fail(`${label} must be an object`);
  }
  for (const key of ["directCostAtomic", "bundledShareAtomic", "costAtomic"]) {
    if (effort[key] !== undefined && !isAtomicString(effort[key])) {
      return fail(`${label}.${key} must be an integer atomic decimal string`);
    }
  }
  if (effort.measured !== undefined && typeof effort.measured !== "boolean") {
    return fail(`${label}.measured must be a boolean when present`);
  }
  if (effort.status !== undefined && typeof effort.status !== "string") {
    return fail(`${label}.status must be a string when present`);
  }
  return { ok: true, unknown: preserveUnknown(effort, knownKeys) };
}

function validateTask(task, index) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return fail(`tasks[${index}] must be an object`);
  }
  const idError = requireString(task.taskId, `tasks[${index}].taskId`);
  if (idError) return idError;
  for (const key of ["title", "summary", "termsDigest", "artifactDigest", "rightsDigest", "reservationId"]) {
    if (task[key] !== undefined && typeof task[key] !== "string") {
      return fail(`tasks[${index}].${key} must be a string when present`);
    }
  }
  if (task.expectedRevision !== undefined && !Number.isInteger(task.expectedRevision)) {
    return fail(`tasks[${index}].expectedRevision must be an integer when present`);
  }
  if (task.publicationConsent !== undefined && typeof task.publicationConsent !== "boolean") {
    return fail(`tasks[${index}].publicationConsent must be a boolean when present`);
  }
  if (task.grossAtomic !== undefined && !isAtomicString(task.grossAtomic)) {
    return fail(`tasks[${index}].grossAtomic must be an integer atomic decimal string`);
  }
  if (task.railCostAtomic !== undefined && !isAtomicString(task.railCostAtomic)) {
    return fail(`tasks[${index}].railCostAtomic must be an integer atomic decimal string`);
  }
  const criteria = validateCriteria(task.criteria);
  if (!criteria.ok) return criteria;
  if (task.payableKinds !== undefined) {
    if (!Array.isArray(task.payableKinds) || task.payableKinds.some((item) => typeof item !== "string" || !item)) {
      return fail(`tasks[${index}].payableKinds must be an array of nonempty strings when present`);
    }
  }
  if (task.terms !== undefined && (!task.terms || typeof task.terms !== "object" || Array.isArray(task.terms))) {
    return fail(`tasks[${index}].terms must be an object when present`);
  }
  if (task.delivery !== undefined && (!task.delivery || typeof task.delivery !== "object" || Array.isArray(task.delivery))) {
    return fail(`tasks[${index}].delivery must be an object when present`);
  }
  const effort = validateEffort(task.effort, KNOWN_EFFORT_KEYS, `tasks[${index}].effort`);
  if (!effort.ok) return effort;
  return {
    ok: true,
    unknown: {
      task: preserveUnknown(task, KNOWN_TASK_KEYS),
      terms: preserveUnknown(task.terms, KNOWN_TERMS_KEYS),
      fee: preserveUnknown(task.terms?.fee, KNOWN_FEE_KEYS),
      delivery: preserveUnknown(task.delivery, KNOWN_DELIVERY_KEYS),
      effort: effort.unknown,
    },
  };
}

export function validateBundle(input) {
  const bounds = checkInputBounds(input);
  if (!bounds.ok) return bounds;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fail("bundle must be an object");
  }
  if (!Array.isArray(input.tasks) || input.tasks.length < 1) {
    return fail("bundle requires a nonempty tasks array");
  }
  if (input.tasks.length > BUNDLE_MAX_TASKS) {
    return fail("bundle exceeds the 64-task limit");
  }
  if (input.bundleId !== undefined && (typeof input.bundleId !== "string" || input.bundleId.length < 1)) {
    return fail("bundleId must be a nonempty string when present");
  }
  if (input.requesterNote !== undefined && typeof input.requesterNote !== "string") {
    return fail("requesterNote must be a string when present");
  }
  const bundleEffort = validateEffort(input.bundleEffort, KNOWN_BUNDLE_EFFORT_KEYS, "bundleEffort");
  if (!bundleEffort.ok) return bundleEffort;

  const taskIds = new Set();
  const unknownTasks = [];
  for (let index = 0; index < input.tasks.length; index += 1) {
    const task = input.tasks[index];
    const checked = validateTask(task, index);
    if (!checked.ok) return checked;
    if (taskIds.has(task.taskId)) return fail("taskId values must be unique");
    taskIds.add(task.taskId);
    unknownTasks.push({ taskId: task.taskId, unknown: checked.unknown });
  }

  return {
    ok: true,
    bundle: input,
    bounds,
    unknown: {
      bundle: preserveUnknown(input, KNOWN_BUNDLE_KEYS),
      bundleEffort: bundleEffort.unknown,
      tasks: unknownTasks,
    },
  };
}
