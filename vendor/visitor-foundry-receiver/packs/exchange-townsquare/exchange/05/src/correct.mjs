import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CORRECTION_STATUS, ERROR_CODES, SCHEMA } from "./constants.mjs";
import { assertNoForbidden, correctionError, isPlainObject, requireBrief } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exchange01 = await import(pathToFileURL(join(__dirname, "../../01/src/index.mjs")).href);

/**
 * Turn failed objective checks into a minimal amend request.
 * Retains accepted (passed) parts — does not restart the whole task.
 */
export function buildCorrectionRequest(
  { brief, artifact, priorCheck = null, artifactRef = "artifact" },
  { clock = () => Date.now() } = {},
) {
  const acceptedBrief = requireBrief(brief);
  assertNoForbidden(artifact === null ? {} : artifact || {}, "artifact");

  let check = null;
  let checkProvenance = "runAcceptanceChecks";
  if (artifact !== undefined && artifact !== null) {
    // Artifact present: always recompute — imported checks cannot override.
    check = exchange01.runAcceptanceChecks(acceptedBrief, artifact, { clock });
    checkProvenance = "runAcceptanceChecks";
  } else if (priorCheck) {
    if (!isPlainObject(priorCheck) || !Array.isArray(priorCheck.objective?.results)) {
      throw correctionError(ERROR_CODES.INVALID_INPUT, "priorCheck must include objective.results");
    }
    const requiredIds = (acceptedBrief.objectiveChecks || []).map((c) => c.id);
    const gotIds = priorCheck.objective.results.map((r) => r.id);
    const missing = requiredIds.filter((id) => !gotIds.includes(id));
    const dupes = gotIds.filter((id, i) => gotIds.indexOf(id) !== i);
    if (missing.length || dupes.length || requiredIds.length === 0 && gotIds.length === 0) {
      // Empty/partial imports cannot clear required work.
      check = {
        objective: {
          results: requiredIds.map((id) => ({
            id,
            passed: false,
            detail: missing.includes(id) ? "imported_check_missing_criterion" : "imported_check_incomplete",
          })),
          complete: false,
          passed: 0,
          failed: requiredIds.length,
        },
        subjective: { results: [], unresolved: (acceptedBrief.subjectiveCriteria || []).length },
      };
    } else {
      check = priorCheck;
    }
    checkProvenance = "imported_unverified";
  } else {
    throw correctionError(ERROR_CODES.INVALID_INPUT, "artifact or priorCheck is required");
  }

  const passed = [];
  const failed = [];
  for (const result of check.objective.results) {
    const criterion = (acceptedBrief.objectiveChecks || []).find((c) => c.id === result.id);
    const entry = {
      criterionId: result.id,
      description: criterion?.description ?? null,
      detail: result.detail ?? null,
      check: criterion?.check ?? null,
      artifactRef,
      // Field hint when check has a path
      targetPath: criterion?.check?.path ?? null,
    };
    if (result.passed === true) passed.push(entry);
    else failed.push(entry);
  }

  const subjectiveUnresolved = (acceptedBrief.subjectiveCriteria || []).map((c) => ({
    criterionId: c.id,
    status: "unresolved",
    detail: c.reviewHint || "Human review required",
    note: "Subjective criteria stay unresolved; correction request does not auto-clear them.",
  }));

  let status =
    failed.length === 0 ? CORRECTION_STATUS.NONE_NEEDED : CORRECTION_STATUS.AMEND_REQUESTED;
  // Imported checks cannot yield none_needed / accepted parts without artifact recompute.
  if (checkProvenance === "imported_unverified") {
    status = CORRECTION_STATUS.NEEDS_VERIFICATION;
  }

  const amendItems = failed.map((f, index) => ({
    seq: index + 1,
    criterionId: f.criterionId,
    action: "fix",
    targetPath: f.targetPath,
    artifactRef: f.artifactRef,
    instruction: f.targetPath
      ? `Amend ${artifactRef} at path ${f.targetPath} so objective check ${f.criterionId} passes (${f.detail}).`
      : `Amend ${artifactRef} so objective check ${f.criterionId} passes (${f.detail}).`,
    retain: true,
  }));

  return {
    schema: SCHEMA,
    createdAt: new Date(clock()).toISOString(),
    taskId: acceptedBrief.taskId ?? null,
    status,
    restartTask: false,
    retainAcceptedParts: true,
    checkProvenance,
    acceptedParts:
      checkProvenance === "imported_unverified"
        ? []
        : passed.map((p) => ({
            criterionId: p.criterionId,
            description: p.description,
            targetPath: p.targetPath,
            retain: true,
          })),
    amendItems,
    subjectiveUnresolved,
    objectiveSummary: {
      passed: passed.length,
      failed: failed.length,
      total: passed.length + failed.length,
    },
    minimalRequest: {
      title: failed.length
        ? `Amend ${failed.length} failed objective check(s); keep ${passed.length} accepted part(s)`
        : "No objective amend needed",
      items: amendItems.map((a) => ({
        criterionId: a.criterionId,
        targetPath: a.targetPath,
        instruction: a.instruction,
      })),
      doNot: [
        "Do not restart the entire task",
        "Do not drop acceptedParts that already passed",
        "Do not invent revenue, ranking, or claim authority",
        "Do not auto-pass subjectiveUnresolved criteria",
      ],
    },
    consumerInstructions: [
      "1. Run buildCorrectionRequest({ brief, artifact }) after objective checks fail.",
      "2. Apply only amendItems; keep acceptedParts unchanged.",
      "3. Re-run objective checks; repeat until none_needed or escalate subjective review.",
      "4. restartTask is always false for this workflow.",
    ].join("\n"),
  };
}

/**
 * Apply a corrected artifact: re-check and optionally nest a follow-up correction.
 */
export function recheckAfterAmend(brief, correctedArtifact, options) {
  const check = exchange01.runAcceptanceChecks(brief, correctedArtifact, options);
  const request = buildCorrectionRequest(
    { brief, artifact: correctedArtifact, priorCheck: check },
    options,
  );
  return { check, request };
}

export { exchange01 };
