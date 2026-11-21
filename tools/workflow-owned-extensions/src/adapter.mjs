import {
  bindUsefulDecision,
  decideOrReuse,
  exportReuse,
  previewReuse,
} from "../../result-reuse/src/export.mjs";
import { detectKind } from "../../result-reuse/src/kinds.mjs";
import {
  DEFAULT_CONSUMER,
  DIRECT_FALLBACK,
  REQUIRED_RESULT_KINDS,
  RUNTIME_EXECUTION_STATUS,
  TOOLS,
  resolveConsumer,
} from "./pins.mjs";
import { invocationEnvelope } from "./status.mjs";

export function invoke(params = {}) {
  const resolved = resolveConsumer(params.consumer || DEFAULT_CONSUMER);
  if (!resolved.ok) {
    return invocationEnvelope({
      consumer: params.consumer,
      tool: params.tool,
      fitting: false,
      capabilityApplied: false,
      message: resolved.message,
    });
  }
  const consumer = resolved.consumer.key;
  const tool = params.tool;
  if (!TOOLS.includes(tool)) {
    return invocationEnvelope({
      consumer,
      tool,
      fitting: false,
      capabilityApplied: false,
      message: `unknown tool; supported tools are ${TOOLS.join(", ")}`,
    });
  }
  const input = readJsonField(params.input ?? params.input_json, "input_json");
  if (!input.ok) {
    return invocationEnvelope({
      consumer,
      tool,
      fitting: false,
      capabilityApplied: false,
      message: input.message,
    });
  }
  if (tool === "decide_or_reuse") {
    return invokeDecide({ consumer, params, input: input.value });
  }
  if (isUnrecognizedResult(input.value)) {
    return invocationEnvelope({
      consumer,
      tool,
      fitting: false,
      capabilityApplied: false,
      message: `task does not fit ${REQUIRED_RESULT_KINDS}`,
      extra: {
        recognizedKind: "unknown",
        usefulDirectRoute: DIRECT_FALLBACK,
      },
    });
  }
  const options = readReuseOptions(params);
  if (!options.ok) {
    return invocationEnvelope({
      consumer,
      tool,
      fitting: true,
      capabilityApplied: false,
      ok: false,
      message: options.message,
      extra: { recognizedKind: detectKind(input.value).kind },
    });
  }
  const sdk = tool === "export_reuse"
    ? exportReuse(input.value, options.value)
    : previewReuse(input.value, options.value);
  return wrapSdk({ consumer, tool, fitting: true, sdk, input: input.value });
}

function invokeDecide({ consumer, params, input }) {
  const produced = optionalJson(params.produced, "produced");
  if (!produced.ok) {
    return invocationEnvelope({ consumer, tool: "decide_or_reuse", fitting: false, capabilityApplied: false, message: produced.message });
  }
  const decision = optionalJson(params.decision, "decision");
  if (!decision.ok) {
    return invocationEnvelope({ consumer, tool: "decide_or_reuse", fitting: false, capabilityApplied: false, message: decision.message });
  }
  if (produced.value && decision.value) {
    return invocationEnvelope({
      consumer,
      tool: "decide_or_reuse",
      fitting: false,
      capabilityApplied: false,
      message: "decide_or_reuse accepts either produced or decision, not both",
    });
  }
  if (!produced.value && !decision.value) {
    return invocationEnvelope({
      consumer,
      tool: "decide_or_reuse",
      fitting: false,
      capabilityApplied: false,
      message: "decide_or_reuse requires produced or decision",
    });
  }
  const fitting = produced.value ? isBeforeWork(input) : isBeforeWork(input) || looksLikeObservation(decision.value);
  if (!fitting) {
    return invocationEnvelope({
      consumer,
      tool: "decide_or_reuse",
      fitting: false,
      capabilityApplied: false,
      message: "task does not fit a source-change-alert before-work manifest or saved decision",
    });
  }
  const options = readReuseOptions(params, { requireHorizon: true });
  if (!options.ok) {
    return invocationEnvelope({
      consumer,
      tool: "decide_or_reuse",
      fitting: true,
      capabilityApplied: false,
      ok: false,
      message: options.message,
    });
  }
  const sdk = produced.value
    ? bindUsefulDecision(input, produced.value, options.value)
    : decideOrReuse(decision.value, input, options.value);
  return wrapSdk({ consumer, tool: "decide_or_reuse", fitting: true, sdk, input });
}

function wrapSdk({ consumer, tool, fitting, sdk, input }) {
  const extra = {};
  if (consumer === "ghost") {
    extra.ghostDraft = projectGhostDraft(sdk);
  }
  extra.recognizedKind = detectKind(input).kind;
  if (isBeforeWork(input)) extra.recognizedKind = extra.recognizedKind === "unknown" ? "before_work_public_input" : extra.recognizedKind;
  extra.runtimeNote = RUNTIME_EXECUTION_STATUS;
  return invocationEnvelope({
    consumer,
    tool,
    fitting,
    capabilityApplied: sdk?.ok === true,
    sdk,
    message: sdk?.ok === false ? sdk.message : `executed through ${DIRECT_FALLBACK.package} because the runtime path is unavailable`,
    extra,
  });
}

export function projectGhostDraft(sdk) {
  const observation = sdk?.observation
    || sdk?.decision?.observation
    || (sdk?.decision?.schema ? sdk.decision : null);
  if (!observation || typeof observation !== "object") {
    return {
      projected: false,
      published: false,
      status: "draft",
      runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
      reason: sdk?.ok === false ? "sdk refused the input" : "no observation is available to project",
    };
  }
  const title = firstLine(observation.statement || "SameDayDesk result-reuse observation");
  return {
    projected: true,
    published: false,
    status: "draft",
    title: title.slice(0, 191),
    custom_excerpt: `${observation.schema || "observation"}; ${RUNTIME_EXECUTION_STATUS}`,
    tags: [{ name: "samedaydesk-result-reuse" }],
    plaintext: typeof observation.statement === "string" ? observation.statement : null,
    sourceObservationId: observation.observationId ?? null,
    sourceRevisionId: observation.revisionId ?? null,
    installationStatus: "source_only_not_installed",
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

function readReuseOptions(params, { requireHorizon = false } = {}) {
  const taskId = stringField(params.task_id ?? params.taskId);
  const subject = stringField(params.subject);
  const clock = stringField(params.clock);
  const sequence = integerField(params.sequence);
  if (!taskId || !subject) {
    return { ok: false, message: "--task-id and --subject are required" };
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    return { ok: false, message: "--sequence must be a positive integer" };
  }
  if (!clock) {
    return { ok: false, message: "--clock is required" };
  }
  const horizonHours = params.horizon == null && params.horizonHours == null
    ? undefined
    : numberField(params.horizon ?? params.horizonHours);
  if (requireHorizon && (typeof horizonHours !== "number" || !Number.isFinite(horizonHours) || horizonHours < 0)) {
    return { ok: false, message: "decide-or-reuse requires a recipe window in hours" };
  }
  const select = Array.isArray(params.select)
    ? params.select
    : typeof params.select === "string"
      ? params.select.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
  return {
    ok: true,
    value: {
      taskId,
      subject,
      sequence,
      clock,
      select,
      optIn: Boolean(params.opt_in ?? params.optIn),
      optInWithdrawn: Boolean(params.withdraw_opt_in ?? params.optInWithdrawn),
      ownerScope: stringField(params.owner_scope ?? params.ownerScope) || undefined,
      recordClass: stringField(params.class ?? params.recordClass) || undefined,
      correctsSequence: params.corrects_sequence == null && params.correctsSequence == null
        ? undefined
        : integerField(params.corrects_sequence ?? params.correctsSequence),
      note: stringField(params.note) || undefined,
      horizonHours,
    },
  };
}

function readJsonField(value, name) {
  if (value == null) return { ok: false, message: `${name} is required` };
  if (typeof value === "string") {
    try {
      return { ok: true, value: JSON.parse(value) };
    } catch {
      return { ok: false, message: `${name} must be JSON` };
    }
  }
  if (typeof value === "object") return { ok: true, value };
  return { ok: false, message: `${name} must be a JSON object or string` };
}

function optionalJson(value, name) {
  if (value == null || value === "") return { ok: true, value: null };
  return readJsonField(value, name);
}

function isUnrecognizedResult(input) {
  return detectKind(input).kind === "unknown";
}

function isBeforeWork(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.recipeId === "source-change-alert"
    && value.prior
    && typeof value.prior === "object"
    && value.capture
    && typeof value.capture === "object",
  );
}

function looksLikeObservation(value) {
  return Boolean(value && typeof value === "object" && (value.schema || value.observation));
}

function stringField(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function integerField(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return NaN;
}

function numberField(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return NaN;
}

function firstLine(text) {
  return String(text).split(/\r?\n/)[0].trim();
}
