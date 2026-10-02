import { performance } from "node:perf_hooks";
import { open, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class JourneyError extends Error {
  constructor(status, code, nextAction = "Inspect the supplied input and retry with the same operation when its outcome is unknown.") {
    super(code);
    this.status = status;
    this.code = code;
    this.nextAction = nextAction;
  }
}

export const DEFAULT_LIMITS = Object.freeze({ deadlineMs: 30_000, totalBytes: 524_288, outputBytes: 65_536 });
export const INPUT_MAX_BYTES = 65_536;

// One monotonic clock and byte ledger follow intake, materialization, child
// stdin/stdout/stderr, backend work and response. No timer reset between stages.
export class Budget {
  constructor({ deadlineMs = DEFAULT_LIMITS.deadlineMs, deadlineAt, totalBytes = DEFAULT_LIMITS.totalBytes, outputBytes = DEFAULT_LIMITS.outputBytes } = {}) {
    this.startedAt = Date.now();
    this.startedMono = performance.now();
    this.duration = Math.max(0, Math.min(deadlineMs, deadlineAt == null ? Infinity : deadlineAt - this.startedAt));
    this.deadlineAt = this.startedAt + this.duration;
    this.totalBytes = totalBytes;
    this.outputBytes = outputBytes;
    this.used = 0;
    this.counts = {};
  }
  remaining(reserve = 0) { return Math.max(0, Math.floor(this.duration - (performance.now() - this.startedMono) - reserve)); }
  check(reserve = 0) {
    if (this.remaining(reserve) < 1) throw new JourneyError(408, "deadline_exceeded", "Reload durable job status; do not assume the operation failed or create a new key.");
  }
  tighten(limits, deadlineAt = Infinity) {
    this.duration = Math.min(this.duration, limits.deadlineMs ?? Infinity, deadlineAt - this.startedAt);
    this.deadlineAt = this.startedAt + this.duration;
    this.totalBytes = Math.min(this.totalBytes, limits.totalBytes ?? Infinity);
    this.outputBytes = Math.min(this.outputBytes, limits.outputBytes ?? Infinity);
    this.check();
    if (this.used > this.totalBytes) throw new JourneyError(413, "allowance_exceeded");
  }
  inherit(bytes, stage = "hosted-work") {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new JourneyError(502, "invalid_budget_receipt");
    if (bytes > this.used) this.spend(bytes - this.used, stage);
  }
  spend(bytes, stage) {
    this.check();
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.used + bytes > this.totalBytes) throw new JourneyError(413, "allowance_exceeded");
    this.used += bytes;
    this.counts[stage] = (this.counts[stage] || 0) + bytes;
  }
  snapshot() { return { elapsedMs: Math.ceil(performance.now() - this.startedMono), bytes: this.used, stages: { ...this.counts }, limits: { deadlineMs: this.duration, totalBytes: this.totalBytes, outputBytes: this.outputBytes } }; }
}

export async function within(promise, budget, reserve = 0, onTimeout = () => {}) {
  budget.check(reserve);
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => {
        // Reject before cancellation can resolve a pending read as done. A
        // truncated timed-out response must not win the race as valid intake.
        reject(new JourneyError(408, "deadline_exceeded"));
        try { onTimeout(); } catch {}
      }, budget.remaining(reserve));
    })]);
  } finally { clearTimeout(timer); }
}

export async function readNodeStream(stream, budget, maxBytes = INPUT_MAX_BYTES, stage = "intake", { destroyOnError = true } = {}) {
  const chunks = [];
  let size = 0;
  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      const part = await within(iterator.next(), budget, 0, () => stream.destroy?.());
      if (part.done) break;
      const bytes = Buffer.from(part.value);
      size += bytes.length;
      if (size > maxBytes) throw new JourneyError(413, "input_too_large");
      budget.spend(bytes.length, stage);
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (destroyOnError) stream.destroy?.();
    else stream.pause?.();
    throw error;
  }
}

export async function readFileBounded(path, budget, maxBytes = INPUT_MAX_BYTES) {
  const file = await within(open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), budget);
  try {
    const stat = await within(file.stat(), budget);
    if (!stat.isFile()) throw new JourneyError(400, "regular_file_required");
    if (stat.size > maxBytes) throw new JourneyError(413, "input_too_large");
    return await readNodeStream(file.createReadStream({ autoClose: false, highWaterMark: 8192 }), budget, maxBytes, "file-intake");
  } finally { await file.close(); }
}

export async function readResponse(response, budget, maxBytes = budget.outputBytes) {
  const length = Number(response.headers.get("content-length"));
  if (length > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new JourneyError(413, "output_too_large");
  }
  if (!response.body?.getReader) throw new JourneyError(502, "response_stream_required");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await within(reader.read(), budget, 0, () => { void reader.cancel().catch(() => {}); });
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new JourneyError(413, "output_too_large");
      budget.spend(part.value.byteLength, "http-response");
      chunks.push(Buffer.from(part.value));
    }
    return Buffer.concat(chunks, size);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function parseJson(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new JourneyError(400, "invalid_json"); }
}

// Children are owned process groups. A silent/stuck producer or inherited pipe
// cannot outlive the same deadline. Error paths never print raw stderr/inputs.
export async function runChild(script, input, budget, { reserveMs = 2000, signal } = {}) {
  budget.check(reserveMs);
  if (signal?.aborted) throw new JourneyError(409, "execution_cancelled");
  const bytes = Buffer.from(JSON.stringify(input));
  budget.spend(bytes.length, "child-stdin");
  const inputDir = await within(mkdtemp(join(tmpdir(), "sds-useful-owned-")), budget, reserveMs);
  try { return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      detached: true, stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH || "", LANG: "C", LC_ALL: "C", NODE_ENV: "production",
        USEFUL_CHILD_DEADLINE_AT: String(budget.deadlineAt - reserveMs),
        USEFUL_CHILD_INPUT_DIR: inputDir,
        USEFUL_CHILD_ALLOWANCE: String(budget.totalBytes - budget.used),
        USEFUL_CHILD_OUTPUT: String(budget.outputBytes) },
    });
    const chunks = [];
    let outputBytes = 0;
    let failure;
    let settled = false;
    const stop = (error) => {
      failure ||= error;
      if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      // Resolve the bounded operation immediately after killing the owned group;
      // close still reaps the child through Node's process handle.
      finish(error);
    };
    const timer = setTimeout(() => stop(new JourneyError(408, "execution_deadline")), budget.remaining(reserveMs));
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      error ? reject(error) : resolve(value);
    };
    const cancelled = () => stop(new JourneyError(409, "execution_cancelled"));
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) cancelled();
    child.stdin.on("error", () => {});
    for (const [stream, stage] of [[child.stdout, "child-stdout"], [child.stderr, "child-stderr"]]) {
      stream.on("data", chunk => {
        try {
          outputBytes += chunk.length;
          if (outputBytes > budget.outputBytes) throw new JourneyError(413, "output_too_large");
          budget.spend(chunk.length, stage);
          if (stream === child.stdout) chunks.push(chunk);
        } catch (error) { stop(error); }
      });
    }
    child.once("error", () => finish(new JourneyError(503, "executor_unavailable")));
    child.once("close", code => {
      if (failure) return finish(failure);
      if (code !== 0) return finish(new JourneyError(502, "executor_failed"));
      try { finish(null, parseJson(Buffer.concat(chunks))); }
      catch { finish(new JourneyError(502, "invalid_executor_output")); }
    });
    child.stdin.end(bytes);
  }); } finally { await within(rm(inputDir, { recursive: true, force: true }), budget); }
}
