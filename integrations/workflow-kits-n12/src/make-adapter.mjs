/**
 * Make adapter: turn what the Make scenario produced into a kit period input.
 *
 * Two inputs are supported:
 * 1. The request body the scenario's "Evaluate Period" module (id 4) posts to the
 *    SameDayDesk client endpoint (`fromMakeRequest`).
 * 2. An execution export assembled from Make's per-module output bundles
 *    (`fromMakeExecution`). Make shows each module's output bundles in the execution
 *    inspector; this kit expects them keyed by module id:
 *      { execution: { id, status }, modules: { "1": { output: [webhookBundle] },
 *                                               "2": { output: [{ json: "<payload JSON>" }] } } }
 *    Module 1 is "Receive Period Capture" (gateway:CustomWebHook), module 2 is
 *    "Shape Capture Fields" (json:TransformToJSON). This envelope shape is the kit's
 *    documented contract; a live Make export has not been verified against it yet.
 *
 * The adapter never computes a termsVersion and never migrates a payload.
 */
import { buildWorkflowRequest, fromWorkflowRequest } from "./workflow-request.mjs";

export const MAKE_MODULE_IDS = Object.freeze({
  trigger: 1,
  shape: 2,
  periodJson: 3,
  evaluate: 4,
  router: 5,
});

const COMMITTED_STATUSES = new Set(["success", "1"]);

function firstBundle(modules, id) {
  const entry = modules?.[String(id)];
  const output = Array.isArray(entry?.output) ? entry.output : Array.isArray(entry) ? entry : null;
  return output && output.length ? output[0] : null;
}

export function fromMakeRequest(body, options = {}) {
  return fromWorkflowRequest(body, { ...options, platform: "make" });
}

export function fromMakeExecution(exportDoc, { clock = null, moduleIds = MAKE_MODULE_IDS } = {}) {
  if (!exportDoc || typeof exportDoc !== "object") throw new Error("Make execution export must be an object");
  const status = String(exportDoc.execution?.status ?? "").toLowerCase();
  const trigger = firstBundle(exportDoc.modules, moduleIds.trigger);
  const shaped = firstBundle(exportDoc.modules, moduleIds.shape);
  let workflowOutput = null;
  if (shaped && typeof shaped.json === "string") {
    workflowOutput = JSON.parse(shaped.json);
  } else if (shaped && typeof shaped === "object") {
    workflowOutput = shaped;
  }
  const request = buildWorkflowRequest({
    platform: "make",
    period: trigger?.period ?? {},
    workflowOutput,
    committed: COMMITTED_STATUSES.has(status),
    execution: { platform: "make", id: exportDoc.execution?.id ?? null, status: status || null },
    clock: clock ?? exportDoc.clock ?? undefined,
  });
  return fromWorkflowRequest(request, { platform: "make", clock });
}
