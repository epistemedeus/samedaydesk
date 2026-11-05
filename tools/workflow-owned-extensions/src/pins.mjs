export const PACKAGE_FAMILY = "workflow-owned-extensions";
export const PACKAGE_VERSION = "0.1.0";
export const EXTENSION_SCHEMA = "samedaydesk.workflow-owned-extension.v1";
export const INTERFACE_SCHEMA = "samedaydesk.workflow-owned-extension-interface.v1";
export const INVOCATION_SCHEMA = "samedaydesk.workflow-owned-extension-invocation.v1";
export const CAPABILITY = "result-reuse";
export const CAPABILITY_SOURCE = "tools/result-reuse";
export const INSTALLATION_STATUS = "source_only_not_installed";
export const RUNTIME_EXECUTION_STATUS = "not yet executed on runtime";
export const EXECUTION_PATH = "direct_sdk_fallback";
export const RESULT_REUSE_CLI = "node tools/result-reuse/cli.mjs";
export const REQUIRED_RESULT_KINDS =
  "extract-batch, page-change brief, record report, or n45 page-change result JSON";

export const TOOLS = Object.freeze(["preview_reuse", "export_reuse", "decide_or_reuse"]);

export const CONSUMERS = Object.freeze({
  dify: Object.freeze({
    key: "dify",
    id: "dify-result-reuse",
    runtime: "dify",
    kind: "workflow_runtime_embedding",
    label: "Dify tool interface",
  }),
  ghost: Object.freeze({
    key: "ghost",
    id: "ghost-result-reuse",
    runtime: "ghost",
    kind: "consumer_adapter",
    label: "Ghost draft integration",
  }),
});

export const DEFAULT_CONSUMER = "dify";

export function resolveConsumer(value = DEFAULT_CONSUMER) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  const consumer = CONSUMERS[key];
  if (!consumer) {
    return { ok: false, message: "consumer must be dify or ghost" };
  }
  return { ok: true, consumer };
}

export const FORBIDDEN_INSTALLATION_STATUSES = Object.freeze([
  "passed",
  "installed",
  "succeeded",
  "success",
  "complete",
  "completed",
  "verified",
]);

export const FORBIDDEN_RUNTIME_STATUSES = Object.freeze([
  "executed",
  "passed",
  "succeeded",
  "success",
  "installed",
]);

export const DIRECT_FALLBACK = Object.freeze({
  package: CAPABILITY_SOURCE,
  cli: `${RESULT_REUSE_CLI} preview --input <accepted-result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC>`,
  exportCli: `${RESULT_REUSE_CLI} export --input <accepted-result.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --opt-in --out <observation.json>`,
  decideCli: `${RESULT_REUSE_CLI} decide-or-reuse --input <before-work.json> --produced <decision.json> --out <observation.json> --task-id <id> --subject <id> --sequence <n> --clock <ISO-UTC> --horizon <hours> --opt-in`,
  requiredInput: REQUIRED_RESULT_KINDS,
  note: "Neither Dify nor Ghost is required. The existing local result-reuse CLI is the useful direct path when a workflow runtime is unavailable or the task does not fit.",
});
