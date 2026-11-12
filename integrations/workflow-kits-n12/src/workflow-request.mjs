/**
 * The request body both kits post to the SameDayDesk client endpoint (Make module
 * "Evaluate Period", n8n node "Evaluate Period"), and its mapping to a kit period input.
 */
import { PERIOD_INPUT_KIND } from "./period-map.mjs";

export const WORKFLOW_REQUEST_KIND = "samedaydesk.workflow-kits-n12.workflow-request.v1";
export const PLATFORMS = Object.freeze(["make", "n8n", "native"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function fromWorkflowRequest(body, { clock = null, platform = null } = {}) {
  if (!isPlainObject(body)) throw new Error("workflow request body must be a JSON object");
  const source = body.platform ?? platform;
  if (!PLATFORMS.includes(source)) throw new Error(`workflow request platform must be one of ${PLATFORMS.join(", ")}`);
  if (platform && source !== platform) throw new Error(`workflow request platform is ${source}, expected ${platform}`);
  const period = isPlainObject(body.period) ? body.period : {};
  return {
    kind: PERIOD_INPUT_KIND,
    source,
    periodId: period.periodId ?? null,
    taskId: period.taskId ?? null,
    contextId: period.contextId ?? null,
    followsTaskId: period.followsTaskId ?? null,
    clock: body.clock ?? clock ?? new Date().toISOString(),
    // Passed through unchanged: preview / readAccepted termsVersion come from the exchange.
    termsInput: period.termsInput ?? null,
    ingestion: period.capture ?? null,
    workflowOutput: body.workflowOutput ?? null,
    committed: body.committed === true,
    comparisonRecord: body.comparisonRecord ?? null,
    caller: isPlainObject(period.caller) ? period.caller : {},
    schemaAdapter: period.schemaAdapter ?? null,
    sameTaskTerms: period.sameTaskTerms ?? undefined,
    sameTaskTermsVersion: period.sameTaskTermsVersion ?? undefined,
    execution: isPlainObject(body.execution) ? body.execution : null,
  };
}

/** Build the request a workflow would post, from the record it received and its output. */
export function buildWorkflowRequest({ platform, period, workflowOutput, committed, execution = null, clock = undefined }) {
  return {
    kind: WORKFLOW_REQUEST_KIND,
    platform,
    committed: committed === true,
    period,
    workflowOutput,
    comparisonRecord: { expected: "accepted-output", observed: "accepted-output" },
    ...(execution ? { execution } : {}),
    ...(clock ? { clock } : {}),
  };
}
