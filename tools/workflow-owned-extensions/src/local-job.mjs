import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { invoke } from "./adapter.mjs";
import { INSTALLATION_STATUS, RUNTIME_EXECUTION_STATUS } from "./pins.mjs";

const PROCESS_DECLARATION = Object.freeze({
  native: "native_package_executed",
  mcp: "mcp_stdio_executed",
  review: "review_draft_executed",
});

const EXTERNAL_INSTALLERS = Object.freeze({
  ghost: "unsupported_execution",
  dify: "unsupported_execution",
  n8n: "unsupported_execution",
});

export function executeLocalJob({ source, job, prefix } = {}) {
  if (!source || typeof source !== "object") {
    return unsupported("installed source pin is missing");
  }
  if (!PROCESS_DECLARATION[source.consumer]) {
    return unsupported("local job only runs the native, MCP/CLI, or review-draft consumer");
  }
  if (job?.consumer && job.consumer !== source.consumer) {
    return unsupported("job consumer does not match the installed prefix");
  }
  if (job?.publish === true) {
    return {
      ...processEnvelope({ source, fitting: false, capabilityApplied: false }),
      ok: false,
      executionDeclaration: "unsupported_execution",
      selectedRuntime: selected(source, true),
      message: "human publication is reserved and was not performed",
      published: false,
      observation: null,
    };
  }
  const invocation = invoke({
    consumer: source.consumer,
    tool: job?.tool || "preview_reuse",
    input: job?.input,
    task_id: job?.task_id,
    subject: job?.subject,
    sequence: job?.sequence,
    clock: job?.clock,
    opt_in: job?.opt_in,
    horizon: job?.horizon,
    produced: job?.produced,
    decision: job?.decision,
    select: job?.select,
    note: job?.note,
    owner_scope: job?.owner_scope,
    class: job?.class,
    corrects_sequence: job?.corrects_sequence,
    withdraw_opt_in: job?.withdraw_opt_in,
  });
  const observation = observationOf(invocation);
  let draft = null;
  if (source.consumer === "review" && invocation.fitting === true && invocation.ok === true && observation) {
    draft = writeDraft({ prefix, source, job, observation });
  }
  return {
    ...processEnvelope({
      source,
      fitting: invocation.fitting === true,
      capabilityApplied: invocation.capabilityApplied === true,
    }),
    ok: invocation.ok !== false,
    executionDeclaration: PROCESS_DECLARATION[source.consumer],
    selectedRuntime: selected(source, true),
    message: invocation.message,
    published: false,
    observation,
    inputSha256: sha256(job?.input),
    draft,
    sdkEnvelope: invocation,
  };
}

export function draftPaths(prefix, taskId, subject) {
  const key = draftKey(taskId, subject);
  const root = join(prefix, "drafts", key);
  return {
    key,
    root,
    current: join(root, "current.md"),
    history: join(root, "history.json"),
  };
}

function writeDraft({ prefix, source, job, observation }) {
  const paths = draftPaths(prefix, job.task_id, job.subject);
  mkdirSync(paths.root, { recursive: true });
  let history = [];
  try {
    history = JSON.parse(readFileSync(paths.history, "utf8"));
  } catch {
    history = [];
  }
  let previous = null;
  try {
    previous = readFileSync(paths.current, "utf8");
  } catch {
    previous = null;
  }
  if (previous) {
    const sequenceMatch = previous.match(/^sequence: (\d+)$/m);
    history.push({
      sequence: sequenceMatch ? Number(sequenceMatch[1]) : null,
      retained: previous,
    });
    writeFileSync(paths.history, `${JSON.stringify(history, null, 2)}\n`);
  }
  const statement = typeof observation.statement === "string" ? observation.statement : "";
  const body = [
    "---",
    "published: false",
    "status: unpublished_pending_human_review",
    `site: ${source.site}`,
    `consumer: ${source.consumer}`,
    `version: ${source.version}`,
    `sourceCommit: ${source.sourceCommit}`,
    `sequence: ${job.sequence}`,
    "---",
    "",
    statement,
    "",
  ].join("\n");
  writeFileSync(paths.current, body);
  return {
    path: paths.current,
    published: false,
    status: "unpublished_pending_human_review",
    historyCount: history.length,
    sequence: job.sequence,
  };
}

function processEnvelope({ source, fitting, capabilityApplied }) {
  return {
    consumer: source.consumer,
    site: source.site,
    version: source.version,
    sourceCommit: source.sourceCommit,
    fitting,
    capabilityApplied,
    published: false,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    externalInstallers: EXTERNAL_INSTALLERS,
    pid: process.pid,
  };
}

function selected(source, ran) {
  const name = source.consumer === "review" ? "review-draft" : source.consumer;
  return {
    name,
    class: source.class,
    ran,
    pid: ran ? process.pid : null,
  };
}

function unsupported(message) {
  return {
    ok: false,
    fitting: false,
    capabilityApplied: false,
    executionDeclaration: "unsupported_execution",
    selectedRuntime: { name: null, ran: false, pid: null },
    message,
    published: false,
    observation: null,
    installationStatus: INSTALLATION_STATUS,
    runtimeExecutionStatus: RUNTIME_EXECUTION_STATUS,
    externalInstallers: EXTERNAL_INSTALLERS,
    pid: process.pid,
  };
}

function observationOf(invocation) {
  return invocation?.sdk?.observation
    || invocation?.sdk?.decision?.observation
    || null;
}

function draftKey(taskId, subject) {
  const raw = `${taskId}--${subject}`;
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return safe || "draft";
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
