const RECIPE_RESULT_REQUIRED = Object.freeze([
  "ok",
  "schema",
  "recipeId",
  "outcome",
  "clock",
  "meta",
  "cost",
  "recovery",
  "evidence",
]);

const PRIOR_REQUIRED = Object.freeze([
  "schema",
  "recipeId",
  "createdAt",
  "sequence",
  "immutable",
  "payload",
  "payment",
]);

export function validateRecipeResult(result) {
  const errors = [];
  if (!result || typeof result !== "object") {
    return { ok: false, errors: ["result must be an object"] };
  }
  for (const key of RECIPE_RESULT_REQUIRED) {
    if (!(key in result)) errors.push(`missing field: ${key}`);
  }
  if (result.schema !== "samedaydesk.recurring-job-recipe-result.v1") {
    errors.push(`unexpected schema: ${result.schema}`);
  }
  if (!["unchanged", "changed", "partial", "error", "stale_baseline", "timed_out"].includes(result.outcome)) {
    errors.push(`unexpected outcome: ${result.outcome}`);
  }
  if (!result.meta?.recipeId) errors.push("meta.recipeId required");
  if (!result.recovery?.action) errors.push("recovery.action required");
  if (!result.cost?.primary?.kind) errors.push("cost.primary.kind required");
  if (result.payment?.replayBlocked !== true && result.payment?.ok === true) {
    // payment block is expected on successful guard paths
  }
  return { ok: errors.length === 0, errors };
}

export function validatePriorDocument(prior) {
  const errors = [];
  for (const key of PRIOR_REQUIRED) {
    if (!(key in prior)) errors.push(`prior missing ${key}`);
  }
  if (prior.schema !== "samedaydesk.recurring-job-prior.v1") {
    errors.push(`prior schema mismatch: ${prior.schema}`);
  }
  if (prior.immutable !== true) errors.push("prior must be immutable");
  return { ok: errors.length === 0, errors };
}

export function assertRecipeResult(result) {
  const check = validateRecipeResult(result);
  if (!check.ok) {
    throw new Error(`invalid recipe result: ${check.errors.join("; ")}`);
  }
  return result;
}
