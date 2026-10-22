import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import { Role, TaskState } from "@a2a-js/sdk";
import { AgentEvent } from "@a2a-js/sdk/server";

const workerPath = join(dirname(fileURLToPath(import.meta.url)), "worker.mjs");

function nowIso() {
  return new Date().toISOString();
}

function agentMessage(taskId, contextId, text) {
  return {
    role: Role.ROLE_AGENT,
    messageId: crypto.randomUUID(),
    parts: [
      {
        content: { $case: "text", value: text },
        metadata: undefined,
        filename: "",
        mediaType: "text/plain",
      },
    ],
    taskId,
    contextId,
    extensions: [],
    metadata: {},
    referenceTaskIds: [],
  };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Official AgentExecutor. cancelTask requests stop; TASK_STATE_CANCELED is
 * published only after the disposable child actually exits.
 */
export class ChildProcessExecutor {
  constructor({ workRoot } = {}) {
    this.workRoot = workRoot || join(tmpdir(), `w5-a2a-work-${randomBytes(4).toString("hex")}`);
    this.jobs = new Map();
    this.journal = [];
  }

  record(event) {
    this.journal.push({ at: nowIso(), ...event });
  }

  async cancelTask(taskId, eventBus) {
    const job = this.jobs.get(taskId);
    this.record({ kind: "cancel_requested", taskId, hadJob: Boolean(job) });
    if (!job) return;
    job.cancelRequestedAt = nowIso();
    if (job.child && job.child.exitCode == null && !job.child.killed) {
      job.child.kill("SIGTERM");
      this.record({ kind: "sigterm_sent", taskId, pid: job.child.pid });
    }
    const exited = await job.exitPromise;
    this.record({
      kind: "child_exited",
      taskId,
      pid: job.child?.pid ?? null,
      exit: exited,
    });
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId: job.contextId,
        status: {
          state: TaskState.TASK_STATE_CANCELED,
          timestamp: nowIso(),
          message: agentMessage(
            taskId,
            job.contextId,
            `Confirmed stop after child exit (${exited?.reason || "unknown"}). Heartbeats already written are not rolled back.`,
          ),
        },
        metadata: {},
      }),
    );
  }

  async execute(requestContext, eventBus) {
    const userMessage = requestContext.userMessage;
    const taskId = requestContext.taskId;
    const contextId = requestContext.contextId;
    const text = textOf(userMessage);
    const mode = text.includes("short") ? "short" : "long";
    const stateDir = join(this.workRoot, taskId);
    mkdirSync(stateDir, { recursive: true });

    const taskSnapshot = requestContext.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: nowIso(),
        message: undefined,
      },
      artifacts: [],
      history: [userMessage],
      metadata: userMessage.metadata,
    };
    eventBus.publish(AgentEvent.task(taskSnapshot));
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: { state: TaskState.TASK_STATE_WORKING, timestamp: nowIso(), message: undefined },
        metadata: {},
      }),
    );

    let resolveExit;
    const exitPromise = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const child = spawn(process.execPath, [workerPath], {
      env: {
        ...process.env,
        W5_A2A_STATE_DIR: stateDir,
        W5_A2A_TASK_ID: taskId,
        W5_A2A_MODE: mode,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const job = {
      taskId,
      contextId,
      child,
      stateDir,
      mode,
      startedAt: nowIso(),
      cancelRequestedAt: null,
      exitPromise,
    };
    this.jobs.set(taskId, job);
    this.record({ kind: "child_spawned", taskId, pid: child.pid, mode });

    child.on("exit", (code, signal) => {
      const exit = readJson(join(stateDir, "exit")) || { reason: signal || `code:${code}` };
      resolveExit(exit);
    });

    try {
      if (mode === "short") {
        const exited = await exitPromise;
        if (job.cancelRequestedAt) return;
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: {
              state: TaskState.TASK_STATE_COMPLETED,
              timestamp: nowIso(),
              message: agentMessage(taskId, contextId, `Short job completed (${exited.reason}).`),
            },
            metadata: {},
          }),
        );
        this.record({ kind: "completed", taskId, pid: child.pid });
        return;
      }

      const exited = await exitPromise;
      if (!job.cancelRequestedAt) {
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId,
            contextId,
            status: {
              state: TaskState.TASK_STATE_COMPLETED,
              timestamp: nowIso(),
              message: agentMessage(taskId, contextId, `Long job timed out (${exited.reason}).`),
            },
            metadata: {},
          }),
        );
        this.record({ kind: "completed", taskId, pid: child.pid });
      }
    } finally {
      this.jobs.delete(taskId);
    }
  }

  snapshot(taskId) {
    const job = this.jobs.get(taskId);
    const stateDir = job?.stateDir || join(this.workRoot, taskId);
    return {
      running: Boolean(job && job.child && job.child.exitCode == null),
      pid: job?.child?.pid ?? readJson(join(stateDir, "pid")) ?? null,
      heartbeat: readJson(join(stateDir, "heartbeat")),
      exit: readJson(join(stateDir, "exit")),
      cancelRequestedAt: job?.cancelRequestedAt ?? null,
    };
  }

  async stopAll() {
    const pending = [...this.jobs.values()];
    for (const job of pending) {
      if (job.child && job.child.exitCode == null) job.child.kill("SIGTERM");
    }
    await Promise.all(pending.map((j) => j.exitPromise.catch(() => null)));
    this.jobs.clear();
  }
}

function textOf(message) {
  const parts = message?.parts || [];
  const texts = [];
  for (const part of parts) {
    if (part?.content?.$case === "text") texts.push(part.content.value);
    else if (typeof part?.text === "string") texts.push(part.text);
  }
  return texts.join(" ");
}
