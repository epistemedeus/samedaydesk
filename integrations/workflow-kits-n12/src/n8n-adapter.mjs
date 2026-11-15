/**
 * n8n adapter: turn an n8n execution into a kit period input.
 *
 * Supported inputs:
 * 1. The request body the workflow's "Evaluate Period" node posts (`fromN8nRequest`).
 * 2. A stored execution export (`fromN8nExecution`): the public API
 *    GET /api/v1/executions/{id}?includeData=true document
 *    ({ id, status, workflowId, data: { resultData: { runData } } }) or the sibling
 *    shape ({ execution: metadata, data: { resultData: { runData } } }).
 *
 * The record metadata comes from the trigger node "Receive Period Capture"
 * (json.body.period). The payload comes from the node "Shape Capture Fields", the
 * default node name of the vendored projectN8nEquivalentEnvelope, which is used
 * unchanged for successful executions.
 *
 * n8n stores runData[node][i].startTime as epoch milliseconds (a number). The vendored
 * projection parses startTime with Date.parse and refuses a number, so the adapter
 * passes it a copy whose startTime values are ISO strings. The capture time itself is
 * taken from the record (capture.capturedAt), never from the node start time.
 *
 * The adapter never computes a termsVersion and never migrates a payload.
 */
import { N8N_EQUIVALENT_NODE, projectN8nEquivalentEnvelope } from "./vendor-paths.mjs";
import { buildWorkflowRequest, fromWorkflowRequest } from "./workflow-request.mjs";

export const N8N_NODE_NAMES = Object.freeze({
  trigger: "Receive Period Capture",
  shape: N8N_EQUIVALENT_NODE,
  evaluate: "Evaluate Period",
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function locate(exportDoc) {
  if (isPlainObject(exportDoc.data?.resultData?.runData)) {
    const metadata = isPlainObject(exportDoc.execution) ? exportDoc.execution : exportDoc;
    return { runData: exportDoc.data.resultData.runData, metadata };
  }
  if (isPlainObject(exportDoc.execution?.data?.resultData?.runData)) {
    return { runData: exportDoc.execution.data.resultData.runData, metadata: exportDoc.execution };
  }
  return null;
}

function firstJson(runData, nodeName) {
  const runs = runData?.[nodeName];
  const item = Array.isArray(runs) ? runs[0]?.data?.main?.[0]?.[0]?.json : null;
  return isPlainObject(item) ? item : null;
}

function isoStartTimes(exportDoc) {
  const copy = structuredClone(exportDoc);
  const located = locate(copy);
  for (const runs of Object.values(located.runData)) {
    if (!Array.isArray(runs)) continue;
    for (const run of runs) {
      if (isPlainObject(run) && typeof run.startTime === "number" && Number.isFinite(run.startTime)) {
        run.startTime = new Date(run.startTime).toISOString();
      }
    }
  }
  return copy;
}

export function fromN8nRequest(body, options = {}) {
  return fromWorkflowRequest(body, { ...options, platform: "n8n" });
}

export function fromN8nExecution(exportDoc, { clock = null, nodeNames = N8N_NODE_NAMES } = {}) {
  if (!isPlainObject(exportDoc)) throw new Error("n8n execution export must be an object");
  const located = locate(exportDoc);
  if (!located) throw new Error("n8n execution export has no data.resultData.runData");
  const status = String(located.metadata?.status ?? "").toLowerCase();
  const triggerJson = firstJson(located.runData, nodeNames.trigger);
  const period = isPlainObject(triggerJson?.body?.period) ? triggerJson.body.period : {};

  let workflowOutput = null;
  let projection = null;
  if (status === "success") {
    projection = projectN8nEquivalentEnvelope(isoStartTimes(exportDoc), nodeNames.shape);
    workflowOutput = projection.ok ? projection.payload : null;
  } else {
    workflowOutput = firstJson(located.runData, nodeNames.shape);
  }

  const request = buildWorkflowRequest({
    platform: "n8n",
    period,
    workflowOutput,
    committed: status === "success" && workflowOutput !== null,
    execution: {
      platform: "n8n",
      id: located.metadata?.id ?? null,
      workflowId: located.metadata?.workflowId ?? null,
      status: status || null,
      projection: projection ? { ok: projection.ok, reason: projection.reason ?? null } : null,
    },
    clock: clock ?? undefined,
  });
  return fromWorkflowRequest(request, { platform: "n8n", clock });
}
