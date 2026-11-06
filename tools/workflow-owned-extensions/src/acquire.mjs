import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeMessages, encodeMessage } from "./mcp-framing.mjs";
import { registerExtension, removeExtension, updateExtension, readExtension } from "./lifecycle.mjs";
import { CONSUMERS, DIRECT_FALLBACK, INSTALLATION_STATUS, RUNTIME_EXECUTION_STATUS } from "./pins.mjs";
import { resolveSite } from "./sites.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const RESULT_REUSE_CLI = join(REPO_ROOT, "tools/result-reuse/cli.mjs");

const ACQUIRABLE = Object.freeze({
  native: Object.freeze({ entry: "runtime/local-entry.mjs", class: "native" }),
  mcp: Object.freeze({ entry: "runtime/mcp-stdio.mjs", class: "mcp_cli" }),
  review: Object.freeze({ entry: "runtime/local-entry.mjs", class: "dify_ghost_class" }),
});

const BLOCKED_INSTALLERS = Object.freeze({
  ghost: "Ghost installer is not reopened. The existing source adapter remains the unpublished-draft projection.",
  dify: "Dify cold install is unsupported. The source interface remains preview_reuse, export_reuse, and decide_or_reuse.",
  "dify-table-csv": "Dify table-csv installer is not duplicated.",
  n8n: "n8n installer is not duplicated.",
});

export function installConsumer({
  consumer,
  site,
  store,
  sourceCommit,
  clock,
  version,
} = {}) {
  const blocked = blockedInstaller(consumer);
  if (blocked) return blocked;
  const resolved = resolveAcquirable(consumer);
  if (!resolved.ok) return resolved;
  const located = resolveSite(site);
  if (!located.ok) return located;
  const source = normalizeCommit(sourceCommit);
  if (!source.ok) return source;
  if (!store) return { ok: false, message: "acquire requires a local store directory" };
  const registered = registerExtension({
    store,
    consumer: resolved.consumer,
    version,
    clock,
    site: located.site.id,
    sourceCommit: source.commit,
  });
  if (!registered.ok) return registered;
  writePrefix({
    store,
    consumer: resolved.consumer,
    site: located.site.id,
    sourceCommit: source.commit,
    version: registered.record.version,
    entry: resolved.entry,
    className: resolved.className,
  });
  return {
    ok: true,
    action: registered.action,
    prepared: true,
    hostRuntimeInstalled: false,
    record: registered.record,
    prefix: prefixPath(store, resolved.consumer),
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

export function updateInstalled({
  consumer,
  store,
  version,
  clock,
  sourceCommit,
  site,
} = {}) {
  const blocked = blockedInstaller(consumer);
  if (blocked) return blocked;
  const resolved = resolveAcquirable(consumer);
  if (!resolved.ok) return resolved;
  const existing = readExtension({ store, consumer: resolved.consumer });
  if (!existing.ok) return existing;
  if (site && existing.record.site && site !== existing.record.site) {
    return { ok: false, message: "update keeps the original site; acquire a separate prefix for another site" };
  }
  const nextCommit = sourceCommit == null || sourceCommit === ""
    ? { ok: true, commit: existing.record.sourceCommit }
    : normalizeCommit(sourceCommit);
  if (!nextCommit.ok) return nextCommit;
  const updated = updateExtension({
    store,
    consumer: resolved.consumer,
    version,
    clock,
    sourceCommit: nextCommit.commit,
  });
  if (!updated.ok) return updated;
  writePrefix({
    store,
    consumer: resolved.consumer,
    site: updated.record.site,
    sourceCommit: updated.record.sourceCommit,
    version: updated.record.version,
    entry: resolved.entry,
    className: resolved.className,
  });
  return {
    ok: true,
    action: updated.action,
    prepared: true,
    hostRuntimeInstalled: false,
    record: updated.record,
    prefix: prefixPath(store, resolved.consumer),
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

export function removeInstalled({ consumer, store, clock } = {}) {
  const blocked = blockedInstaller(consumer);
  if (blocked) return blocked;
  const resolved = resolveAcquirable(consumer);
  if (!resolved.ok) return resolved;
  const removed = removeExtension({ store, consumer: resolved.consumer, clock });
  if (!removed.ok) return removed;
  rmSync(prefixPath(store, resolved.consumer), { recursive: true, force: true });
  return {
    ok: true,
    action: removed.action,
    prepared: false,
    hostRuntimeInstalled: false,
    record: removed.record,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

export function runInstalled({ consumer, store, job } = {}) {
  const blocked = blockedInstaller(consumer);
  if (blocked) return blocked;
  const resolved = resolveAcquirable(consumer);
  if (!resolved.ok) return resolved;
  const prefix = prefixPath(store, resolved.consumer);
  const source = readPrefix(prefix);
  if (!source) {
    return fallbackToCli({ consumer: resolved.consumer, job, reason: "selected runtime prefix is not prepared" });
  }
  const entry = join(PACKAGE_ROOT, source.entry || resolved.entry);
  try {
    readFileSync(entry);
  } catch {
    return fallbackToCli({ consumer: resolved.consumer, job, reason: "selected runtime entry is absent" });
  }
  if (resolved.consumer === "mcp") return runMcp({ entry, prefix, job, source });
  return runLocal({ entry, prefix, job });
}

export function acquireAndRun({
  consumer,
  site,
  store,
  sourceCommit,
  clock,
  version,
  job,
} = {}) {
  if (typeof consumer !== "string" || consumer.trim() === "") {
    return {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: "caller must name a consumer; no selection is made",
      published: false,
    };
  }
  const acquired = installConsumer({ consumer, site, store, sourceCommit, clock, version });
  if (!acquired.ok) return acquired;
  const ran = runInstalled({ consumer, store, job });
  return { ...ran, acquire: { action: acquired.action, prepared: acquired.prepared, hostRuntimeInstalled: false } };
}

function runLocal({ entry, prefix, job }) {
  const child = spawnSync(process.execPath, [entry, "--prefix", prefix], {
    input: JSON.stringify(job || {}),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseChild(child, "local entry");
}

function runMcp({ entry, prefix, job }) {
  const call = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: job?.tool || "preview_reuse",
      arguments: {
        input_json: job?.input,
        task_id: job?.task_id,
        subject: job?.subject,
        sequence: job?.sequence,
        clock: job?.clock,
        opt_in: job?.opt_in === true,
        horizon: job?.horizon,
        produced: job?.produced,
        decision: job?.decision,
        publish: job?.publish === true,
        select: job?.select,
        note: job?.note,
      },
    },
  };
  const list = { jsonrpc: "2.0", id: 3, method: "tools/list" };
  const init = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "samedaydesk-machine-caller", version: "0.1.0" },
    },
  };
  const input = encodeMessage(init)
    + encodeMessage({ jsonrpc: "2.0", method: "notifications/initialized" })
    + encodeMessage(list)
    + encodeMessage(call);
  const child = spawnSync(process.execPath, [entry, "--prefix", prefix], {
    input,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error) {
    return fallbackToCli({ consumer: "mcp", job, reason: child.error.message });
  }
  let messages;
  try {
    messages = decodeMessages(child.stdout || "");
  } catch (error) {
    return {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: `MCP/CLI response was not a framed result: ${error.message}`,
      stderr: child.stderr,
      published: false,
    };
  }
  const called = messages.find((message) => message.id === 2);
  const listed = messages.find((message) => message.id === 3);
  const text = called?.result?.content?.[0]?.text;
  if (!text) {
    return {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: called?.error?.message || "MCP/CLI tools/call returned no result",
      published: false,
      stderr: child.stderr,
    };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, executionDeclaration: "unsupported_execution", message: "MCP/CLI tool result was not JSON", published: false };
  }
  return {
    ...body,
    childPid: child.pid,
    mcp: {
      protocol: "2024-11-05",
      exitCode: child.status,
      pid: child.pid,
      tools: (listed?.result?.tools || []).map((tool) => tool.name),
    },
  };
}

function fallbackToCli({ consumer, job, reason }) {
  const route = { ...DIRECT_FALLBACK };
  if (!fittingJob(job)) {
    return {
      ok: true,
      fitting: false,
      capabilityApplied: false,
      fallback: true,
      executionDeclaration: "unsupported_execution",
      executionPath: "direct_sdk_fallback",
      selectedRuntime: { name: consumer, ran: false, pid: null },
      message: reason,
      usefulDirectRoute: route,
      observation: null,
      published: false,
      installationStatus: INSTALLATION_STATUS,
      runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
      hostRuntimeInstalled: false,
    };
  }
  const directory = mkdtempSync(join(tmpdir(), "woe-fallback-"));
  const inputPath = join(directory, "input.json");
  const outPath = join(directory, "observation.json");
  writeFileSync(inputPath, `${JSON.stringify(job.input)}\n`);
  const args = cliArgs(job, inputPath, outPath);
  const child = spawnSync(process.execPath, [RESULT_REUSE_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  rmSync(directory, { recursive: true, force: true });
  if (child.status !== 0) {
    return {
      ok: false,
      fitting: true,
      fallback: true,
      executionDeclaration: "unsupported_execution",
      executionPath: "direct_sdk_fallback",
      selectedRuntime: { name: consumer, ran: false, pid: null },
      message: reason,
      fallbackPid: child.pid,
      fallbackExit: child.status,
      usefulDirectRoute: route,
      stderr: child.stderr,
      published: false,
      installationStatus: INSTALLATION_STATUS,
      runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    return {
      ok: false,
      fallback: true,
      executionDeclaration: "unsupported_execution",
      message: "result-reuse CLI returned no JSON observation",
      published: false,
    };
  }
  return {
    ok: true,
    fitting: true,
    capabilityApplied: true,
    fallback: true,
    executionDeclaration: "unsupported_execution",
    executionPath: "direct_sdk_fallback",
    selectedRuntime: { name: consumer, ran: false, pid: null },
    message: reason,
    fallbackPid: child.pid,
    fallbackExit: child.status,
    observation: parsed.observation || null,
    usefulDirectRoute: route,
    published: false,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    hostRuntimeInstalled: false,
    consumer,
  };
}

function cliArgs(job, inputPath, outPath) {
  const tool = job.tool || "preview_reuse";
  const command = tool === "export_reuse" ? "export" : tool === "decide_or_reuse" ? "decide-or-reuse" : "preview";
  const args = [
    command,
    "--input", inputPath,
    "--task-id", String(job.task_id),
    "--subject", String(job.subject),
    "--sequence", String(job.sequence),
    "--clock", String(job.clock),
  ];
  if (job.opt_in === true) args.push("--opt-in");
  if (job.horizon != null) args.push("--horizon", String(job.horizon));
  if (command === "export" || (command === "decide-or-reuse" && job.produced)) {
    args.push("--out", outPath);
  }
  if (job.produced) {
    const producedPath = join(inputPath, "..", "produced.json");
    writeFileSync(producedPath, `${JSON.stringify(job.produced)}\n`);
    args.push("--produced", producedPath);
  }
  return args;
}

function fittingJob(job) {
  const input = job?.input;
  if (!input || typeof input !== "object") return false;
  if (input.schema === "pilot.task-commons.page-change-result.v1") return true;
  if (input.schema === "pilot/page-change-brief/v1" || input.report?.schema === "pilot/page-change-brief/v1") return true;
  if (input.product === "samedaydesk-extract-batch" || input.schemaVersion === "samedaydesk.extract-batch.v0") return true;
  if (Array.isArray(input.records)) return true;
  if (input.recipeId === "source-change-alert" && input.prior && input.capture) return true;
  return false;
}

function parseChild(child, label) {
  if (child.error || child.status == null) {
    return {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: child.error?.message || `${label} did not exit`,
      published: false,
    };
  }
  try {
    const body = JSON.parse(child.stdout);
    return { ...body, exitCode: child.status, childPid: child.pid };
  } catch {
    return {
      ok: false,
      executionDeclaration: "unsupported_execution",
      message: `${label} returned no JSON result`,
      stderr: child.stderr,
      published: false,
    };
  }
}

function writePrefix({ store, consumer, site, sourceCommit, version, entry, className }) {
  const prefix = prefixPath(store, consumer);
  mkdirSync(prefix, { recursive: true });
  const body = {
    schema: "samedaydesk.workflow-owned-extension-source.v1",
    consumer,
    class: className,
    version,
    sourceCommit,
    site,
    entry,
    capabilitySource: "tools/result-reuse",
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    hostRuntimeInstalled: false,
    published: false,
  };
  writeFileSync(join(prefix, "SOURCE.json"), `${JSON.stringify(body, null, 2)}\n`);
}

function readPrefix(prefix) {
  try {
    return JSON.parse(readFileSync(join(prefix, "SOURCE.json"), "utf8"));
  } catch {
    return null;
  }
}

function prefixPath(store, consumer) {
  return join(store, consumer, "prefix");
}

function resolveAcquirable(consumer) {
  const key = typeof consumer === "string" ? consumer.trim().toLowerCase() : "";
  const spec = ACQUIRABLE[key];
  if (!spec || !CONSUMERS[key]) {
    return { ok: false, message: "acquire consumer must be native, mcp, or review" };
  }
  return { ok: true, consumer: key, entry: spec.entry, className: spec.class };
}

function blockedInstaller(consumer) {
  const key = typeof consumer === "string" ? consumer.trim().toLowerCase() : "";
  const message = BLOCKED_INSTALLERS[key];
  if (!message) return null;
  return {
    ok: false,
    executionDeclaration: "unsupported_execution",
    message,
    hostRuntimeInstalled: false,
    published: false,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
  };
}

function normalizeCommit(value) {
  const commit = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    return { ok: false, message: "source commit must be a 40-character hex pin" };
  }
  return { ok: true, commit };
}
