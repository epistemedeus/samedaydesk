/**
 * Optional local import of recipe/receipt evidence into Neomorphic observation.
 * Shared/deployed task-memory mode is not fabricated when undeployed.
 */

import { exportReuse, previewReuse } from "../../result-reuse/src/export.mjs";

export const LOCAL_MODE = "local_filesystem";
export const SHARED_MODE_STATUS = "undeployed_not_fabricated";

/**
 * Wrap a recurring-job recipe result into a shape result-reuse can project,
 * or pass through page-change / extract-batch inputs unchanged.
 */
export function adaptRecipeResultForReuse(result) {
  if (!result || typeof result !== "object") {
    return { ok: false, message: "result must be an object" };
  }
  const report = result.report && typeof result.report === "object" ? result.report : result;
  if (
    result.schema === "pilot/page-change-brief/v1" ||
    report.schema === "pilot/page-change-brief/v1" ||
    result.product === "samedaydesk-extract-batch" ||
    result.schemaVersion === "samedaydesk.extract-batch.v0" ||
    result.schema === "pilot.task-commons.page-change-result.v1"
  ) {
    return { ok: true, input: result, adapted: false };
  }
  if (result.schema === "samedaydesk.recurring-job-recipe-result.v1") {
    // Project as an explicit record-like artifact for local observation export.
    return {
      ok: true,
      adapted: true,
      input: {
        schemaVersion: "samedaydesk.recurring-job-recipe-result.v1",
        product: "samedaydesk-recurring-job-recipe",
        status: result.outcome === "partial" ? "partial" : result.ok ? "success" : "invalid",
        ok: result.ok === true,
        networkUsed: false,
        records: [
          {
            recordId: `recipe:${result.recipeId}`,
            status: result.ok ? "success" : "invalid",
            fields: {
              recipeId: result.recipeId,
              outcome: result.outcome,
              contentHash: result.evidence?.contentHash ?? null,
              title: result.evidence?.brief?.issue?.title || result.evidence?.source?.url || result.recipeId,
            },
            missing: { required: [], optional: [] },
            provenance: {
              artifact: result.recipeId,
              kind: result.evidence?.kind ?? null,
            },
          },
        ],
        invalidRecords: [],
        partialRecords: result.outcome === "partial" ? [{ recordId: `recipe:${result.recipeId}` }] : [],
        claims: {
          paymentImpliesUsefulOutput: false,
          localImportOnly: true,
          sharedMode: SHARED_MODE_STATUS,
        },
      },
    };
  }
  return { ok: false, message: "unrecognized input for Neomorphic local import" };
}

export function previewLocalNeomorphicImport(result, options = {}) {
  const adapted = adaptRecipeResultForReuse(result);
  if (!adapted.ok) return adapted;
  const preview = previewReuse(adapted.input, options);
  if (!preview.ok) return preview;
  return {
    ...preview,
    importMode: LOCAL_MODE,
    sharedMode: SHARED_MODE_STATUS,
    adapted: adapted.adapted === true,
  };
}

export function exportLocalNeomorphicImport(result, options = {}) {
  if (!options.optIn) {
    return { ok: false, message: "refusing to write without --opt-in" };
  }
  const adapted = adaptRecipeResultForReuse(result);
  if (!adapted.ok) return adapted;
  const exported = exportReuse(adapted.input, options);
  if (!exported.ok) return exported;
  return {
    ...exported,
    importMode: LOCAL_MODE,
    sharedMode: SHARED_MODE_STATUS,
    adapted: adapted.adapted === true,
    note: "Local filesystem observation only. Shared Neomorphic task-memory mode remains undeployed and was not fabricated.",
  };
}
