import { fileURLToPath } from "node:url";
import { hash, SCHEMA } from "./contracts.mjs";
import { runChild, JourneyError } from "./budget.mjs";

export const RECIPE_CHILD = fileURLToPath(new URL("./recipe-child.mjs", import.meta.url));

// Repackage existing outputs into the owning prior contract; no decisions are
// made here. Only useful observed fields/fingerprints can be a later baseline.
function nextPrior(request, result) {
  if (!result.ok || !["changed", "unchanged"].includes(result.outcome)) return null;
  let payload;
  if (request.recipeId === "source-change-alert" && result.evidence?.kind === "field_diff") {
    payload = { fields: Object.fromEntries([
      ...result.evidence.changed.map(x => [x.field, x.after]),
      ...result.evidence.unchanged.map(x => [x.field, x.value]),
    ]) };
  } else if (request.recipeId === "issue-to-work-brief" && result.evidence?.fingerprint) {
    payload = { fingerprint: result.evidence.fingerprint, brief: result.evidence.brief };
  } else if (request.recipeId === "comparable-record-extraction") {
    payload = { records: result.evidence.rows.filter(x => x.status === "success" && !x.partial).map(x => ({ sourceKey: x.sourceKey, fields: x.fields })) };
  } else if (request.recipeId === "verification-reconcile") payload = request.input.candidate;
  if (!payload) return null;
  return { schema: "samedaydesk.recurring-job-prior.v1", recipeId: request.recipeId, createdAt: request.input.clock,
    sequence: (request.input.prior?.sequence || 0) + 1, immutable: true, sha256: hash(payload).slice(7), payload, payment: { attempted: false } };
}

export async function executeRecipe(request, budget, options = {}) {
  const inputDigest = hash(request.input);
  const observed = await runChild(options.childScript || RECIPE_CHILD, { ...request, inputDigest }, budget, options);
  if (!observed?.result || observed.result.schema !== "samedaydesk.recurring-job-recipe-result.v1"
      || observed.result.recipeId !== request.recipeId || observed.source?.inputDigest !== inputDigest) throw new JourneyError(502, "unbound_executor_result");
  budget.spend((observed.childUsage?.stages?.["materialized-input"] || 0)
    + (observed.childUsage?.stages?.["source-read"] || 0), "child-source-io");
  const result = { schema: SCHEMA, taskId: request.taskId, recipeId: request.recipeId, inputDigest,
    execution: "completed", recipe: observed.result, source: observed.source,
    nextPrior: nextPrior(request, observed.result),
    facts: { qa: "caller-input execution", sourceAccepted: false, publicationVerified: false,
      independentlyUseful: "unobserved", earnedWorkAccepted: false, paymentAttempted: false, settledPayment: "unobserved" },
    measurement: { child: observed.childUsage, owner: budget.snapshot(), reviewMs: null, adaptationMs: null,
      cashMarginalCost: null, inferenceCost: null, includedQuotaOpportunityCost: null } };
  if (Buffer.byteLength(JSON.stringify(result)) > budget.outputBytes - 1024) throw new JourneyError(413, "output_too_large");
  return { result, digest: hash(result) };
}

export function failedExecution(request, error, budget) {
  const result = { schema: SCHEMA, taskId: request.taskId, recipeId: request.recipeId, inputDigest: hash(request.input), execution: "failed",
    recipe: { ok: false, recipeId: request.recipeId, outcome: error.code === "execution_deadline" ? "timed_out" : "error",
      evidence: { kind: "execution_error", code: error.code || "executor_failed" }, recovery: { action: "review_then_new_operation", nextAction: "The bounded execution did not deliver a useful recipe result. Inspect this retained failure before creating a new operation." } },
    nextPrior: null, facts: { sourceAccepted: false, publicationVerified: false, earnedWorkAccepted: false, paymentAttempted: false, settledPayment: "unobserved" }, measurement: { owner: budget.snapshot(), reviewMs: null, adaptationMs: null, cashMarginalCost: null } };
  return { result, digest: hash(result) };
}
