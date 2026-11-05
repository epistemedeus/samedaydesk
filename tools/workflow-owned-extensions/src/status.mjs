import {
  CAPABILITY,
  CAPABILITY_SOURCE,
  DEFAULT_CONSUMER,
  DIRECT_FALLBACK,
  EXECUTION_PATH,
  EXTENSION_SCHEMA,
  FORBIDDEN_INSTALLATION_STATUSES,
  FORBIDDEN_RUNTIME_STATUSES,
  INSTALLATION_STATUS,
  INVOCATION_SCHEMA,
  PACKAGE_VERSION,
  RUNTIME_EXECUTION_STATUS,
  resolveConsumer,
} from "./pins.mjs";
import { inspectRuntime } from "./runtime.mjs";

export function assertHonestStatuses({
  installationStatus = INSTALLATION_STATUS,
  runtimeExecutionStatus = RUNTIME_EXECUTION_STATUS,
} = {}) {
  if (FORBIDDEN_INSTALLATION_STATUSES.includes(String(installationStatus).toLowerCase())) {
    return {
      ok: false,
      message: "manifests must not claim installation passed",
    };
  }
  if (installationStatus !== INSTALLATION_STATUS) {
    return {
      ok: false,
      message: `installationStatus must stay ${INSTALLATION_STATUS}`,
    };
  }
  if (FORBIDDEN_RUNTIME_STATUSES.includes(String(runtimeExecutionStatus).toLowerCase())) {
    return {
      ok: false,
      message: "runtime execution status must stay explicit and unexecuted",
    };
  }
  if (runtimeExecutionStatus !== RUNTIME_EXECUTION_STATUS) {
    return {
      ok: false,
      message: `runtimeExecutionStatus must stay "${RUNTIME_EXECUTION_STATUS}"`,
    };
  }
  return { ok: true };
}

export function invocationEnvelope({
  consumer = DEFAULT_CONSUMER,
  tool,
  fitting,
  capabilityApplied,
  sdk = null,
  ok,
  message,
  extra = {},
} = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) {
    return {
      schema: INVOCATION_SCHEMA,
      ok: false,
      fitting: false,
      capabilityApplied: false,
      message: resolved.message,
      runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
      installationStatus: INSTALLATION_STATUS,
      usefulDirectRoute: DIRECT_FALLBACK,
      sdk: null,
    };
  }
  const runtime = inspectRuntime({ consumer: resolved.consumer.key });
  const status = assertHonestStatuses();
  if (!status.ok) return status;
  const sdkOk = sdk == null ? true : sdk.ok !== false;
  return {
    schema: INVOCATION_SCHEMA,
    ok: typeof ok === "boolean" ? ok : sdkOk,
    fitting: Boolean(fitting),
    capabilityApplied: Boolean(capabilityApplied),
    capability: CAPABILITY,
    capabilitySource: CAPABILITY_SOURCE,
    extensionId: resolved.consumer.id,
    extensionVersion: PACKAGE_VERSION,
    consumerKind: resolved.consumer.kind,
    tool: tool ?? null,
    runtime: resolved.consumer.runtime,
    runtimeAvailable: runtime.available,
    runtimeProbed: runtime.probed,
    runtimeCalled: runtime.called,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    installationStatus: INSTALLATION_STATUS,
    catalogListed: false,
    hostedCodeExecution: false,
    executionPath: EXECUTION_PATH,
    message: message ?? null,
    usefulDirectRoute: DIRECT_FALLBACK,
    sdk,
    ...extra,
  };
}

export function extensionRecord({
  consumer = DEFAULT_CONSUMER,
  version = PACKAGE_VERSION,
  clock,
  previousVersions = [],
  removed = false,
  removedAt = null,
} = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  const status = assertHonestStatuses();
  if (!status.ok) return status;
  if (typeof clock !== "string" || Number.isNaN(Date.parse(clock))) {
    return { ok: false, message: "extension records require an explicit ISO-UTC clock" };
  }
  return {
    ok: true,
    record: {
      schema: EXTENSION_SCHEMA,
      id: resolved.consumer.id,
      version,
      runtime: resolved.consumer.runtime,
      consumerKind: resolved.consumer.kind,
      capability: CAPABILITY,
      capabilitySource: CAPABILITY_SOURCE,
      authorOwnership: "workflow_author",
      rights: "source_only_extension_no_hosted_execution",
      installationStatus: INSTALLATION_STATUS,
      runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
      runtimeAvailable: false,
      runtimeCalled: false,
      catalogListed: false,
      hostedCodeExecution: false,
      createdAt: clock,
      updatedAt: clock,
      previousVersions,
      removed,
      removedAt,
    },
  };
}
