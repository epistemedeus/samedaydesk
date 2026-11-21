import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { INPUT_MAX_BYTES } from "./limits.mjs";

export const STRUCTURED_EXTRACT_SCHEMA = "pilot.task-bundle-economics.structured-extract.v1";
export const STRUCTURED_EXTRACT_CLASS = "bounded_structured_extract";
export const STRUCTURED_EXTRACT_FIELDS = Object.freeze(["heading", "headingDigest", "sourceLabel"]);

const OBSERVABLE_VALUE_TYPES = new Set(["string", "number", "boolean"]);

function isPresentValue(value) {
  return value !== undefined;
}

export function isObservableValue(value) {
  if (!isPresentValue(value)) return false;
  if (value === null) return true;
  return OBSERVABLE_VALUE_TYPES.has(typeof value);
}

export function parseStructuredExtract(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "artifact_invalid" };
  }
  if (raw.schema !== STRUCTURED_EXTRACT_SCHEMA) {
    return { ok: false, reason: "artifact_schema_unsupported", schema: raw.schema };
  }
  if (raw.artifactClass !== STRUCTURED_EXTRACT_CLASS) {
    return { ok: false, reason: "artifact_class_unsupported", artifactClass: raw.artifactClass };
  }
  const fields = {};
  for (const key of STRUCTURED_EXTRACT_FIELDS) {
    if (raw[key] !== undefined) {
      if (!isObservableValue(raw[key])) {
        return { ok: false, reason: "artifact_field_invalid", field: key };
      }
      fields[key] = raw[key];
    }
  }
  return {
    ok: true,
    artifactClass: STRUCTURED_EXTRACT_CLASS,
    schema: STRUCTURED_EXTRACT_SCHEMA,
    fields,
    raw,
  };
}

function readBoundedFile(path) {
  const descriptor = openSync(path, "r");
  try {
    if (fstatSync(descriptor).size > INPUT_MAX_BYTES) {
      throw new Error("oversized");
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } finally {
    closeSync(descriptor);
  }
}

export function resolveArtifactPath(artifactPath, baseDir) {
  if (typeof artifactPath !== "string" || artifactPath.length < 1) return null;
  if (isAbsolute(artifactPath)) return artifactPath;
  if (typeof baseDir !== "string" || baseDir.length < 1) return artifactPath;
  return join(baseDir, artifactPath);
}

export function loadDeliveryArtifact(delivery, options = {}) {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return { status: "missing", reason: "delivery_missing" };
  }
  const hasEmbedded = delivery.artifact !== undefined;
  const hasPath = delivery.artifactPath !== undefined;
  if (hasEmbedded && hasPath) {
    return { status: "ambiguous", reason: "artifact_source_ambiguous" };
  }
  if (!hasEmbedded && !hasPath) {
    return { status: "absent", reason: "artifact_absent" };
  }
  let raw;
  let source;
  if (hasEmbedded) {
    raw = delivery.artifact;
    source = "embedded";
  } else {
    if (typeof delivery.artifactPath !== "string" || delivery.artifactPath.length < 1) {
      return { status: "missing", reason: "artifact_path_invalid" };
    }
    const resolved = resolveArtifactPath(delivery.artifactPath, options.baseDir);
    try {
      raw = readBoundedFile(resolved);
    } catch {
      return {
        status: "missing",
        reason: "artifact_unreadable",
        artifactPath: delivery.artifactPath,
        resolvedPath: resolved,
      };
    }
    source = "path";
  }
  const parsed = parseStructuredExtract(raw);
  if (!parsed.ok) {
    return {
      status: parsed.reason === "artifact_schema_unsupported" || parsed.reason === "artifact_class_unsupported"
        ? "unsupported"
        : "invalid",
      reason: parsed.reason,
      schema: parsed.schema,
      artifactClass: parsed.artifactClass,
      field: parsed.field,
      source,
    };
  }
  return {
    status: "loaded",
    source,
    artifactClass: parsed.artifactClass,
    schema: parsed.schema,
    fields: parsed.fields,
    artifactPath: hasPath ? delivery.artifactPath : undefined,
  };
}

export function observeFromArtifact(objectiveCriterion, artifactFields) {
  if (!objectiveCriterion || typeof objectiveCriterion !== "object" || Array.isArray(objectiveCriterion)) {
    return { ok: false, reason: "objective_criterion_invalid" };
  }
  const check = objectiveCriterion.check;
  const observe = objectiveCriterion.observe;
  if (typeof observe !== "string" || observe.length < 1) {
    return { ok: false, reason: "observe_field_missing" };
  }
  if (!STRUCTURED_EXTRACT_FIELDS.includes(observe)) {
    return { ok: false, reason: "observe_field_unsupported", observe };
  }
  if (!Object.prototype.hasOwnProperty.call(artifactFields, observe)) {
    return { ok: false, reason: "observe_field_absent", observe };
  }
  if (objectiveCriterion.expected === undefined && check !== "present") {
    return { ok: false, reason: "expected_absent", observe, check };
  }
  return {
    ok: true,
    observation: {
      check,
      expected: objectiveCriterion.expected,
      observed: artifactFields[observe],
      observe,
      fromArtifact: true,
    },
  };
}

export function bindCitedEvidence(citedEvidence, artifactFields) {
  if (!Array.isArray(citedEvidence) || citedEvidence.length < 1) {
    return {
      coverage: "missing",
      items: [],
      allBound: false,
    };
  }
  const items = citedEvidence.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { index, status: "unbound", reason: "citation_invalid" };
    }
    const locator = item.locator;
    if (typeof locator !== "string" || locator.length < 1) {
      return {
        index,
        status: "unbound",
        reason: "citation_locator_missing",
        source: item.source,
        digest: item.digest,
      };
    }
    if (!STRUCTURED_EXTRACT_FIELDS.includes(locator)) {
      return {
        index,
        status: "unbound",
        reason: "citation_locator_unbound",
        source: item.source,
        locator,
        digest: item.digest,
      };
    }
    if (!Object.prototype.hasOwnProperty.call(artifactFields, locator)) {
      return {
        index,
        status: "unbound",
        reason: "citation_field_absent",
        source: item.source,
        locator,
        digest: item.digest,
      };
    }
    const observed = artifactFields[locator];
    if (item.digest !== undefined) {
      if (typeof item.digest !== "string" || item.digest !== observed) {
        return {
          index,
          status: "unbound",
          reason: "citation_digest_mismatch",
          source: item.source,
          locator,
          digest: item.digest,
          observed,
        };
      }
    }
    if (locator === "sourceLabel" && item.source !== undefined && item.source !== observed) {
      return {
        index,
        status: "unbound",
        reason: "citation_source_mismatch",
        source: item.source,
        locator,
        digest: item.digest,
        observed,
      };
    }
    return {
      index,
      status: "bound",
      source: item.source,
      locator,
      digest: item.digest,
      observed,
    };
  });
  const allBound = items.every((row) => row.status === "bound");
  return {
    coverage: allBound ? "bound" : "unbound",
    items,
    allBound,
  };
}

export function materializeTaskForArtifactInspection(task, options = {}) {
  const delivery = task.delivery && typeof task.delivery === "object" && !Array.isArray(task.delivery)
    ? task.delivery
    : undefined;
  const loaded = loadDeliveryArtifact(delivery, options);
  const objectiveCriteria = task.objectiveCriteria && typeof task.objectiveCriteria === "object" && !Array.isArray(task.objectiveCriteria)
    ? task.objectiveCriteria
    : undefined;
  const criteria = Array.isArray(task.criteria) ? task.criteria : [];

  if (loaded.status === "absent") {
    return {
      mode: "declared_evidence",
      artifactInspection: false,
      loaded,
      task,
      reasons: [],
    };
  }

  if (loaded.status === "ambiguous") {
    return {
      mode: "ambiguous",
      artifactInspection: false,
      loaded,
      task,
      reasons: ["artifact_source_ambiguous"],
    };
  }

  if (loaded.status !== "loaded") {
    return {
      mode: "artifact_inspection",
      artifactInspection: true,
      loaded,
      task,
      reasons: [loaded.reason || loaded.status],
    };
  }

  if (!objectiveCriteria) {
    return {
      mode: "artifact_inspection",
      artifactInspection: true,
      loaded,
      task,
      reasons: ["objective_criteria_missing"],
      citationBinding: bindCitedEvidence(delivery?.citedEvidence, loaded.fields),
    };
  }

  const observations = {};
  const reasons = [];
  for (const criterion of criteria) {
    const objective = objectiveCriteria[criterion];
    if (objective === undefined) {
      reasons.push("objective_criterion_missing");
      continue;
    }
    const observed = observeFromArtifact(objective, loaded.fields);
    if (!observed.ok) {
      reasons.push(observed.reason);
      continue;
    }
    observations[criterion] = observed.observation;
  }

  const citationBinding = bindCitedEvidence(delivery?.citedEvidence, loaded.fields);
  if (citationBinding.coverage === "missing") reasons.push("cited_evidence_missing");
  else if (!citationBinding.allBound) reasons.push("cited_evidence_unbound");

  const nextDelivery = {
    ...delivery,
    observations,
  };
  // Contributor-supplied observed values must not masquerade as inspection.
  delete nextDelivery.artifact;
  // Keep artifactPath for echo; content already loaded.

  return {
    mode: "artifact_inspection",
    artifactInspection: true,
    loaded,
    citationBinding,
    reasons: [...new Set(reasons)],
    task: {
      ...task,
      delivery: nextDelivery,
    },
  };
}

export function prepareBundleForInspection(bundle, options = {}) {
  const inspections = [];
  const tasks = bundle.tasks.map((task) => {
    const prepared = materializeTaskForArtifactInspection(task, options);
    inspections.push({
      taskId: task.taskId,
      mode: prepared.mode,
      artifactInspection: prepared.artifactInspection,
      loaded: prepared.loaded,
      citationBinding: prepared.citationBinding,
      reasons: prepared.reasons,
    });
    return prepared.task;
  });
  return {
    bundle: { ...bundle, tasks },
    inspections,
  };
}
