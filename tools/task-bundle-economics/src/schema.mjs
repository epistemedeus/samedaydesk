import { BUNDLE_MAX_TASKS, CRITERIA_MAX, checkInputBounds } from "./limits.mjs";

export const BUNDLE_SCHEMA = "pilot.task-bundle-economics.bundle.v1";
export const ATOMIC_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
export const PROVENANCE_VALUES = Object.freeze(["public", "synthetic"]);
export const COST_LINE_STATUSES = Object.freeze(["measured", "unknown"]);

export const KNOWN_BUNDLE_KEYS = Object.freeze([
  "schema",
  "bundleId",
  "requesterNote",
  "tasks",
  "bundleEffort",
  "provenance",
  "costLines",
  "directRoute",
]);

export const KNOWN_TASK_KEYS = Object.freeze([
  "taskId",
  "title",
  "summary",
  "criteria",
  "objectiveCriteria",
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
  "provenance",
  "costLines",
  "directRoute",
]);

export const KNOWN_TERMS_KEYS = Object.freeze(["feeBps", "feeBasis", "fee"]);
export const KNOWN_FEE_KEYS = Object.freeze(["bps", "basis", "profile", "schemaVersion"]);
export const KNOWN_DELIVERY_KEYS = Object.freeze([
  "observations",
  "artifact",
  "artifactPath",
  "verifier",
  "verifierPayload",
  "execute",
  "code",
  "autoAcceptToLowerCost",
  "notes",
  "citedEvidence",
  "acquisition",
]);
export const KNOWN_EFFORT_KEYS = Object.freeze([
  "directCostAtomic",
  "bundledShareAtomic",
  "measured",
  "status",
]);
export const KNOWN_BUNDLE_EFFORT_KEYS = Object.freeze(["costAtomic", "measured", "status"]);
export const KNOWN_COST_LINE_KEYS = Object.freeze(["kind", "status", "atomic"]);
export const KNOWN_CITED_EVIDENCE_KEYS = Object.freeze(["source", "locator", "digest"]);
export const KNOWN_ACQUISITION_KEYS = Object.freeze(["processId", "processKind"]);
export const KNOWN_DIRECT_ROUTE_KEYS = Object.freeze(["description", "provenance"]);

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

function validateProvenance(value, label) {
  if (value === undefined) return null;
  if (!PROVENANCE_VALUES.includes(value)) {
    return fail(`${label} must be "public" or "synthetic" when present`);
  }
  return null;
}

function validateCostLines(costLines, label) {
  if (costLines === undefined) return { ok: true, unknown: [] };
  if (!Array.isArray(costLines)) return fail(`${label} must be an array when present`);
  const unknown = [];
  for (let index = 0; index < costLines.length; index += 1) {
    const line = costLines[index];
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      return fail(`${label}[${index}] must be an object`);
    }
    if (typeof line.kind !== "string" || line.kind.length < 1) {
      return fail(`${label}[${index}].kind must be a nonempty string`);
    }
    if (line.status !== undefined && !COST_LINE_STATUSES.includes(line.status)) {
      return fail(`${label}[${index}].status must be "measured" or "unknown" when present`);
    }
    if (line.atomic !== undefined && !isAtomicString(line.atomic)) {
      return fail(`${label}[${index}].atomic must be an integer atomic decimal string when present`);
    }
    unknown.push(preserveUnknown(line, KNOWN_COST_LINE_KEYS));
  }
  return { ok: true, unknown };
}

function validateDirectRoute(directRoute, label) {
  if (directRoute === undefined) return { ok: true, unknown: {} };
  if (!directRoute || typeof directRoute !== "object" || Array.isArray(directRoute)) {
    return fail(`${label} must be an object when present`);
  }
  if (directRoute.description !== undefined && typeof directRoute.description !== "string") {
    return fail(`${label}.description must be a string when present`);
  }
  const provenanceError = validateProvenance(directRoute.provenance, `${label}.provenance`);
  if (provenanceError) return provenanceError;
  return { ok: true, unknown: preserveUnknown(directRoute, KNOWN_DIRECT_ROUTE_KEYS) };
}

function validateCitedEvidence(citedEvidence, label) {
  if (citedEvidence === undefined) return { ok: true, unknown: [] };
  if (!Array.isArray(citedEvidence)) return fail(`${label} must be an array when present`);
  const unknown = [];
  for (let index = 0; index < citedEvidence.length; index += 1) {
    const item = citedEvidence[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail(`${label}[${index}] must be an object`);
    }
    for (const key of ["source", "locator", "digest"]) {
      if (item[key] !== undefined && typeof item[key] !== "string") {
        return fail(`${label}[${index}].${key} must be a string when present`);
      }
    }
    unknown.push(preserveUnknown(item, KNOWN_CITED_EVIDENCE_KEYS));
  }
  return { ok: true, unknown };
}

export const KNOWN_OBJECTIVE_CRITERION_KEYS = Object.freeze([
  "check",
  "observe",
  "expected",
]);

function validateObjectiveCriteria(objectiveCriteria, criteria, label) {
  if (objectiveCriteria === undefined) return { ok: true, unknown: {} };
  if (!objectiveCriteria || typeof objectiveCriteria !== "object" || Array.isArray(objectiveCriteria)) {
    return fail(`${label} must be an object when present`);
  }
  const criterionSet = new Set(Array.isArray(criteria) ? criteria : []);
  const unknown = {};
  for (const [key, value] of Object.entries(objectiveCriteria)) {
    if (!criterionSet.has(key)) {
      return fail(`${label} key "${key}" must match a declared criterion`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return fail(`${label}.${key} must be an object`);
    }
    if (value.check !== undefined && typeof value.check !== "string") {
      return fail(`${label}.${key}.check must be a string when present`);
    }
    if (value.observe !== undefined && typeof value.observe !== "string") {
      return fail(`${label}.${key}.observe must be a string when present`);
    }
    unknown[key] = preserveUnknown(value, KNOWN_OBJECTIVE_CRITERION_KEYS);
  }
  return { ok: true, unknown };
}

function validateDeliveryArtifactFields(delivery, label) {
  if (delivery === undefined) return null;
  if (delivery.artifactPath !== undefined && typeof delivery.artifactPath !== "string") {
    return fail(`${label}.artifactPath must be a string when present`);
  }
  if (delivery.artifact !== undefined) {
    if (!delivery.artifact || typeof delivery.artifact !== "object" || Array.isArray(delivery.artifact)) {
      return fail(`${label}.artifact must be an object when present`);
    }
  }
  return null;
}

function validateAcquisition(acquisition, label) {
  if (acquisition === undefined) return { ok: true, unknown: {} };
  if (!acquisition || typeof acquisition !== "object" || Array.isArray(acquisition)) {
    return fail(`${label} must be an object when present`);
  }
  for (const key of ["processId", "processKind"]) {
    if (acquisition[key] !== undefined && typeof acquisition[key] !== "string") {
      return fail(`${label}.${key} must be a string when present`);
    }
  }
  return { ok: true, unknown: preserveUnknown(acquisition, KNOWN_ACQUISITION_KEYS) };
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
  const provenanceError = validateProvenance(task.provenance, `tasks[${index}].provenance`);
  if (provenanceError) return provenanceError;
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
  const costLines = validateCostLines(task.costLines, `tasks[${index}].costLines`);
  if (!costLines.ok) return costLines;
  const directRoute = validateDirectRoute(task.directRoute, `tasks[${index}].directRoute`);
  if (!directRoute.ok) return directRoute;
  const citedEvidence = validateCitedEvidence(task.delivery?.citedEvidence, `tasks[${index}].delivery.citedEvidence`);
  if (!citedEvidence.ok) return citedEvidence;
  const acquisition = validateAcquisition(task.delivery?.acquisition, `tasks[${index}].delivery.acquisition`);
  if (!acquisition.ok) return acquisition;
  const artifactFieldsError = validateDeliveryArtifactFields(task.delivery, `tasks[${index}].delivery`);
  if (artifactFieldsError) return artifactFieldsError;
  const objectiveCriteria = validateObjectiveCriteria(
    task.objectiveCriteria,
    criteria.criteria,
    `tasks[${index}].objectiveCriteria`,
  );
  if (!objectiveCriteria.ok) return objectiveCriteria;
  return {
    ok: true,
    unknown: {
      task: preserveUnknown(task, KNOWN_TASK_KEYS),
      terms: preserveUnknown(task.terms, KNOWN_TERMS_KEYS),
      fee: preserveUnknown(task.terms?.fee, KNOWN_FEE_KEYS),
      delivery: preserveUnknown(task.delivery, KNOWN_DELIVERY_KEYS),
      effort: effort.unknown,
      costLines: costLines.unknown,
      directRoute: directRoute.unknown,
      citedEvidence: citedEvidence.unknown,
      acquisition: acquisition.unknown,
      objectiveCriteria: objectiveCriteria.unknown,
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
  const provenanceError = validateProvenance(input.provenance, "provenance");
  if (provenanceError) return provenanceError;
  const bundleEffort = validateEffort(input.bundleEffort, KNOWN_BUNDLE_EFFORT_KEYS, "bundleEffort");
  if (!bundleEffort.ok) return bundleEffort;
  const costLines = validateCostLines(input.costLines, "costLines");
  if (!costLines.ok) return costLines;
  const directRoute = validateDirectRoute(input.directRoute, "directRoute");
  if (!directRoute.ok) return directRoute;

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
      costLines: costLines.unknown,
      directRoute: directRoute.unknown,
      tasks: unknownTasks,
    },
  };
}
