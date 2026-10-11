import { performance } from "node:perf_hooks";
import { DECIMAL_AMOUNT, EFFORT_SCHEMA, FEATURE, INTEGER_AMOUNT, MEASUREMENT_RULE, RECEIPT_SCHEMA, FEEDBACK_SCHEMA } from "./constants.mjs";
import { selectTask } from "./select.mjs";

function assertMeasured(value, unit) {
  if (unit === "count" || unit === "atomic") {
    if (typeof value !== "string" || !INTEGER_AMOUNT.test(value)) throw new Error("measurement_rejected");
    if (value.length > 15) throw new Error("measurement_rejected");
    return { state: "measured", value, unit, unitClass: unit === "atomic" ? "atomic" : "count" };
  }
  if (unit === "USD") {
    if (typeof value !== "string" || !DECIMAL_AMOUNT.test(value)) throw new Error("measurement_rejected");
    return { state: "measured", value, unit, unitClass: "money", revenue: false };
  }
  throw new Error("measurement_rejected");
}

export function buildFeedback({ result, optIn, accept = false, now }) {
  if (optIn !== true) {
    const error = new Error("feedback_opt_in_required");
    error.code = "feedback_opt_in_required";
    throw error;
  }
  if (!result || result.schema !== "samedaydesk.task-native-selection.result.v1") {
    throw new Error("feedback_result_required");
  }
  const accepted = accept === true;
  const selected = result.stages?.selected || {};
  const measurements = [
    assertMeasured(String(result.stages?.render?.eligible?.length || 0), "count"),
    assertMeasured(selected.state === "selected" ? "1" : "0", "count"),
    assertMeasured(result.stages?.executed?.state === "synthetic_loopback" ? "1" : "0", "count"),
  ];
  if (selected.cost?.state === "known" && typeof selected.cost.amount === "string") {
    measurements.push(assertMeasured(selected.cost.amount, "USD"));
  } else if (selected.cost?.state === "known_free") {
    measurements.push({ ...assertMeasured("0", "USD"), observedZero: true });
  }
  const atomic = selected.cost?.atomicAmount;
  if (typeof atomic === "string") measurements.push(assertMeasured(atomic, "atomic"));
  return {
    schema: FEEDBACK_SCHEMA,
    feature: FEATURE,
    measurementRule: MEASUREMENT_RULE,
    send: false,
    telemetry: "opt_in_local_file",
    occurredAt: now || result.occurredAt,
    independentCustomer: false,
    ownerQa: true,
    receipt: {
      schema: RECEIPT_SCHEMA,
      stage: accepted ? "triaged" : "submitted",
      disposition: accepted ? "scoped_result" : "pending_qualification",
      submitted: true,
      triaged: accepted,
      delivered: false,
      accepted,
      reused: false,
      published: false,
      exampleConsent: true,
      contributionRequired: false,
      taskRef: result.stages?.query?.taskRef || null,
      operationId: selected.operationId || null,
      occurredAt: result.occurredAt,
      synthetic: result.stages?.executed?.synthetic === true,
      ownerQa: true,
    },
    stages: {
      query: result.stages?.query?.state || null,
      render: result.stages?.render?.state || null,
      selected: selected.state || null,
      executed: result.stages?.executed?.state || null,
      usefulAcceptance: accepted ? "caller_opt_in" : "not_observed",
    },
    measurements,
  };
}

export function compareEffort({ catalog, task, now }) {
  const plainStart = performance.now();
  const listed = (catalog?.entries || []).map((entry) => ({
    id: entry.id,
    operationId: entry.operationId,
    summary: entry.summaryUntrusted || "",
  }));
  const plainMs = performance.now() - plainStart;
  const selectStart = performance.now();
  const selected = selectTask({ catalog, task, now });
  const selectMs = performance.now() - selectStart;
  return {
    schema: EFFORT_SCHEMA,
    feature: FEATURE,
    plainCatalog: {
      ms: plainMs,
      listed: listed.length,
      selected: null,
      note: "Lists operation ids and untrusted summaries. Does not match an output contract.",
    },
    selector: {
      ms: selectMs,
      state: selected.stages.selected.state,
      entryId: selected.stages.selected.entryId,
      eligible: selected.stages.render.eligible?.length || 0,
      ineligible: selected.stages.render.ineligible?.length || 0,
    },
    savingsClaim: false,
    customerTime: false,
  };
}
