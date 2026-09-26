/**
 * Cap02 / Cap03 / Cap06 adapter slots — call REAL Heavy S138 APIs at pin
 * HEAVY_PIN. Keep adapter interface; map readiness/binding/composition honestly.
 * Never invent ready/bound from empty reports. JSON data fixtures only.
 */

import {
  resolvePrerequisites,
  bindEvidence,
  composePartial,
} from "../../../s138-capability-evidence/src/index.mjs";
import { HEAVY_LANE, HEAVY_PIN, IMPORT_PATHS } from "./constants.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Cap02 — install / prerequisite resolver → resolvePrerequisites(manifest data).
 */
export function prereqResolver(input = {}) {
  const role = "prereqResolver";
  const cap = "02";
  const base = {
    heavyLane: HEAVY_LANE,
    heavyPin: HEAVY_PIN,
    cap,
    role,
    adapterWired: true,
    importPath: IMPORT_PATHS.heavy,
    api: "resolvePrerequisites",
  };

  if (!isPlainObject(input) || !isPlainObject(input.manifest)) {
    return {
      ...base,
      status: "not_ready",
      readiness: "not_ready",
      adapterReady: false,
      note: "Cap02 requires JSON manifest object; empty/missing input is not_ready (never default ready).",
      report: null,
      gaps: [{ field: "manifest", reason: "manifest object required; empty input does not imply ready" }],
    };
  }

  try {
    const report = resolvePrerequisites({
      manifest: input.manifest,
      manifestKind: input.manifestKind,
      catalogListed: input.catalogListed === true,
      probe: isPlainObject(input.probe) ? input.probe : {},
    });
    const readiness = report?.readiness || "not_ready";
    return {
      ...base,
      status: readiness,
      readiness,
      adapterReady: true,
      report,
      gaps: report?.gaps || [],
      prerequisites: report?.prerequisites || [],
      note: `Heavy resolvePrerequisites readiness=${readiness} @ ${HEAVY_PIN}`,
    };
  } catch (err) {
    return {
      ...base,
      status: "not_ready",
      readiness: "not_ready",
      adapterReady: true,
      report: null,
      gaps: [{ field: "resolvePrerequisites", reason: err.message }],
      error: { code: err.code || "prereq_error", message: err.message },
      note: "Heavy resolvePrerequisites threw; mapped to not_ready",
    };
  }
}

/**
 * Cap03 — evidence binder → bindEvidence(declaration/source/testOutput data).
 */
export function evidenceBinder(input = {}) {
  const role = "evidenceBinder";
  const cap = "03";
  const base = {
    heavyLane: HEAVY_LANE,
    heavyPin: HEAVY_PIN,
    cap,
    role,
    adapterWired: true,
    importPath: IMPORT_PATHS.heavy,
    api: "bindEvidence",
  };

  if (!isPlainObject(input) || !isPlainObject(input.declaration)) {
    return {
      ...base,
      status: "untested_declaration",
      adapterReady: false,
      note: "Cap03 requires declaration JSON; empty input is untested_declaration (never invent bound).",
      report: null,
      gaps: [{ field: "declaration", reason: "declaration object required" }],
      honesty:
        "Hashing/TAP text does not prove tests ran against claimed source revision.",
    };
  }

  try {
    const report = bindEvidence({
      declaration: input.declaration,
      source: isPlainObject(input.source) ? input.source : undefined,
      testOutput: isPlainObject(input.testOutput) ? input.testOutput : undefined,
      provenance: isPlainObject(input.provenance) ? input.provenance : undefined,
    });
    const status = report?.status || "untested_declaration";
    return {
      ...base,
      status,
      adapterReady: true,
      report,
      gaps: report?.gaps || [],
      claimed: report?.claimed || null,
      observed: report?.observed || null,
      verified: report?.verified || null,
      note: `Heavy bindEvidence status=${status} @ ${HEAVY_PIN}`,
      honesty:
        "Hashing imported test output does not prove those tests ran against the claimed source revision (BOT-INTEGRATION).",
    };
  } catch (err) {
    return {
      ...base,
      status: "untested_declaration",
      adapterReady: true,
      report: null,
      gaps: [{ field: "bindEvidence", reason: err.message }],
      error: { code: err.code || "bind_error", message: err.message },
      note: "Heavy bindEvidence threw; mapped to untested_declaration",
      honesty:
        "Hashing/TAP text does not prove tests ran against claimed source revision.",
    };
  }
}

/**
 * Cap06 — partial composer → composePartial(job + parts data).
 */
export function partialComposer(input = {}) {
  const role = "partialComposer";
  const cap = "06";
  const base = {
    heavyLane: HEAVY_LANE,
    heavyPin: HEAVY_PIN,
    cap,
    role,
    adapterWired: true,
    importPath: IMPORT_PATHS.heavy,
    api: "composePartial",
  };

  if (!isPlainObject(input) || !isPlainObject(input.job) || !Array.isArray(input.parts)) {
    return {
      ...base,
      status: "empty",
      adapterReady: false,
      note: "Cap06 requires job object + parts array; empty input is empty (gaps preserved, never invent complete).",
      report: null,
      gaps: [{ kind: "input", reason: "job object and parts array required" }],
    };
  }

  try {
    const report = composePartial({
      job: input.job,
      parts: input.parts,
    });
    const status = report?.status || "empty";
    return {
      ...base,
      status,
      adapterReady: true,
      report,
      gaps: report?.gaps || [],
      holes: report?.holes || [],
      acceptedParts: report?.acceptedParts || [],
      note: `Heavy composePartial status=${status} @ ${HEAVY_PIN}`,
    };
  } catch (err) {
    return {
      ...base,
      status: "empty",
      adapterReady: true,
      report: null,
      gaps: [{ kind: "compose_error", reason: err.message }],
      error: { code: err.code || "compose_error", message: err.message },
      note: "Heavy composePartial threw; mapped to empty",
    };
  }
}

/**
 * Status table for CLI `status` — honest Heavy-wired view + pin SHA.
 */
export function adapterStatusTable() {
  return {
    heavyLane: HEAVY_LANE,
    heavyPin: HEAVY_PIN,
    heavyImport: IMPORT_PATHS.heavy,
    slots: [
      {
        id: "02",
        role: "prereqResolver",
        api: "resolvePrerequisites",
        wired: true,
        emptyInputStatus: "not_ready",
      },
      {
        id: "03",
        role: "evidenceBinder",
        api: "bindEvidence",
        wired: true,
        emptyInputStatus: "untested_declaration",
      },
      {
        id: "06",
        role: "partialComposer",
        api: "composePartial",
        wired: true,
        emptyInputStatus: "empty",
      },
    ],
    missingCaps: [],
    adapterWired: true,
    note: `Cap02/03/06 call real Heavy APIs at pin ${HEAVY_PIN}; unknown/partial preserved; TAP does not prove execution against claimed revision.`,
  };
}
