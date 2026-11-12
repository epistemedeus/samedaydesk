// Bounded JSONL batch over the supported read and readiness operations.
//
// Each input line is one item: {"id"?: string, "op": string, "args"?: object}.
// Only ops in BATCH_OPS run. They are all GET reads with recovery class
// safe_read_rerun, so a rerun of an unconfirmed item has no server effect.
// The executor still treats recovery generically: an item whose persisted
// recovery is sent_unconfirmed and whose class is not safe_read_rerun is never
// dispatched again (uncertain_mutation_not_replayed).
//
// State lives in --state-dir (0700). Before an item is dispatched its state
// record (0600, atomic rename) says sent_unconfirmed. A successful value is
// archived once in results/ (exclusive create, never overwritten). A later
// run with the same state dir skips completed items, refuses changed terms for
// an existing item id, and reruns the rest. Nothing here promises single
// execution, or that a lost state dir can be recovered.
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, createReadStream } from "node:fs";
import { isAbsolute, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { savePrivate } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { digest } from "../../../server/vendor/machine-gateway/src/util.mjs";
import { CliError, describe } from "./errors.mjs";

export const BATCH_SCHEMA = "samedaydesk.cli.batch.v1";
export const BATCH_STATE_SCHEMA = "samedaydesk.cli.batch-state.v1";
export const BATCH_ITEM_STATE_SCHEMA = "samedaydesk.cli.batch-item-state.v1";
export const BATCH_RESULT_SCHEMA = "samedaydesk.cli.batch-result.v1";
export const BATCH_LIMITS = Object.freeze({
  concurrency: Object.freeze({ default: 4, minimum: 1, maximum: 8 }),
  maxItems: Object.freeze({ default: 1000, minimum: 1, maximum: 10000 }),
  maxLineBytes: Object.freeze({ default: 16384, minimum: 256, maximum: 65536 }),
  timeoutMs: Object.freeze({ default: 15000, minimum: 100, maximum: 60000 }),
});
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const ROUTE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const RECEIPT_RE = /^[a-f0-9-]{36}$/;
export const URL_ARG_RE = /^(https?:\/\/)?[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[^\s]*)?$/;
const READINESS_SCHEMA = "agent-readiness.report.v1";
const HISTORY_MAX = 20;

const str = (re, max) => ({ type: "string", pattern: re.source, ...(max ? { maxLength: max } : {}) });
// The supported batch operations. Every one is a GET read on a real backend
// route that a single command already uses; wire operation ids are preserved.
export const BATCH_OPS = Object.freeze({
  "readiness.check": { base: "origin", operationId: "check_agent_readiness", auth: "none", args: { host: { ...str(HOST_RE), required: true } },
    path: args => `/agent-readiness?host=${encodeURIComponent(args.host)}&format=json`, accept: value => value?.schema === READINESS_SCHEMA },
  "gateway.health": { base: "gateway", operationId: "gatewayHealth", auth: "none", args: {}, path: () => "/healthz", accept: value => value?.schema === "neomorphic.machine-gateway.health.v1" },
  "gateway.routes": { base: "gateway", operationId: "discoverRoutes", auth: "none", args: {}, path: () => "/v1/discover", accept: value => Array.isArray(value?.routes) },
  "gateway.schema": { base: "gateway", operationId: "{route}_{kind}_schema", auth: "none",
    args: { route: { ...str(ROUTE_RE), required: true }, kind: { type: "string", enum: ["input", "output"] } },
    path: args => `/v1/routes/${args.route}/${args.kind ?? "input"}.schema.json`, accept: value => value !== null && typeof value === "object" },
  "gateway.receipt": { base: "gateway", operationId: "readPersistedReceipt", auth: "tenant", args: { id: { ...str(RECEIPT_RE), required: true } },
    path: args => `/v1/receipts/${args.id}`, accept: value => typeof value?.id === "string" && typeof value?.status === "string" },
  "tools.ai_readiness": { base: "origin", operationId: "check_ai_readiness", auth: "none", args: { url: { ...str(URL_ARG_RE, 2048), required: true } },
    path: args => `/api/tools/ai-readiness?url=${encodeURIComponent(args.url)}`, accept: value => Number.isInteger(value?.score) && Array.isArray(value?.checks) },
  "tools.llms_txt": { base: "origin", operationId: "generate_llms_txt", auth: "none", args: { url: { ...str(URL_ARG_RE, 2048), required: true } },
    path: args => `/api/tools/llms-txt?url=${encodeURIComponent(args.url)}`, accept: value => typeof value?.llmsTxt === "string" },
  "apex.health": { base: "origin", operationId: "getHealth", auth: "none", args: {}, path: () => "/api/health", accept: value => value?.ok === true },
  "market.profile": { base: "market", operationId: "machine.profile", auth: "none", args: {}, path: () => "/v1/market/profile", accept: value => value?.ok === true },
  "market.discover": { base: "market", operationId: "machine.discover", auth: "none",
    args: { limit: { type: "integer", minimum: 1, maximum: 20 }, cursor: { type: "string", maxLength: 512 } },
    path: args => `/v1/market/discover?limit=${args.limit ?? 20}${args.cursor ? `&cursor=${encodeURIComponent(args.cursor)}` : ""}`, accept: value => value?.ok === true && Array.isArray(value.value?.items) },
});
export const BATCH_OP_RECOVERY_CLASS = "safe_read_rerun";
export const batchOpsDescription = () => Object.fromEntries(Object.entries(BATCH_OPS).map(([id, op]) => [id, {
  operationId: op.operationId, auth: op.auth, effect: "read", recoveryClass: BATCH_OP_RECOVERY_CLASS,
  args: Object.fromEntries(Object.entries(op.args).map(([name, spec]) => [name, { ...spec, required: spec.required === true }])),
}]));

const itemId = item => item.id ?? `h:${digest({ op: item.op, args: item.args }).slice(0, 32)}`;

function validateItem(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new CliError("item_invalid", { reason: "not an object" });
  for (const key of Object.keys(raw)) if (!["id", "op", "args"].includes(key)) throw new CliError("item_invalid", { reason: "unknown key", key });
  if (typeof raw.op !== "string" || !Object.hasOwn(BATCH_OPS, raw.op)) throw new CliError("item_op_unsupported", { op: typeof raw.op === "string" ? raw.op.slice(0, 64) : null, supported: Object.keys(BATCH_OPS) });
  if (raw.id !== undefined && (typeof raw.id !== "string" || !ID_RE.test(raw.id))) throw new CliError("item_invalid", { reason: "id", pattern: ID_RE.source });
  const op = BATCH_OPS[raw.op];
  const args = raw.args ?? {};
  if (args === null || typeof args !== "object" || Array.isArray(args)) throw new CliError("item_invalid", { reason: "args" });
  for (const key of Object.keys(args)) if (!Object.hasOwn(op.args, key)) throw new CliError("item_invalid", { reason: "unknown arg", arg: key });
  for (const [name, spec] of Object.entries(op.args)) {
    const value = args[name];
    if (value === undefined) { if (spec.required) throw new CliError("item_invalid", { reason: "missing arg", arg: name }); continue; }
    if (spec.type === "integer" && (!Number.isInteger(value) || value < spec.minimum || value > spec.maximum)) throw new CliError("item_invalid", { reason: "arg", arg: name });
    if (spec.type === "string") {
      if (typeof value !== "string" || (spec.maxLength && value.length > spec.maxLength) || (spec.pattern && !new RegExp(spec.pattern).test(value))) throw new CliError("item_invalid", { reason: "arg", arg: name });
      if (spec.enum && !spec.enum.includes(value)) throw new CliError("item_invalid", { reason: "arg", arg: name });
    }
  }
  return { op: raw.op, args: Object.fromEntries(Object.keys(op.args).filter(name => args[name] !== undefined).map(name => [name, args[name]])), id: raw.id ?? null };
}

// Pull-based line reader: one chunk is read only when no complete line is
// buffered, so read-ahead is bounded by one chunk plus one line.
async function* lines(stream, maxLineBytes, signal) {
  const iterator = stream[Symbol.asyncIterator]();
  const stopped = new Promise(resolve => { if (signal.aborted) resolve({ done: true }); else signal.addEventListener("abort", () => resolve({ done: true }), { once: true }); });
  let buffer = Buffer.alloc(0);
  let lineNo = 0;
  try {
    while (true) {
      let index = buffer.indexOf(10);
      while (index === -1) {
        if (buffer.length > maxLineBytes) throw new CliError("batch_line_too_long", { line: lineNo + 1, maxLineBytes });
        const next = await Promise.race([iterator.next(), stopped]);
        if (signal.aborted) return;
        if (next.done) {
          if (buffer.length) { lineNo += 1; yield { lineNo, text: buffer.toString("utf8") }; }
          return;
        }
        buffer = Buffer.concat([buffer, Buffer.from(next.value)]);
        index = buffer.indexOf(10);
      }
      const line = buffer.subarray(0, index);
      buffer = buffer.subarray(index + 1);
      lineNo += 1;
      if (line.length > maxLineBytes) throw new CliError("batch_line_too_long", { line: lineNo, maxLineBytes });
      yield { lineNo, text: line.toString("utf8").replace(/\r$/, "") };
    }
  } finally { iterator.return?.().catch?.(() => {}); }
}

function openInput(file, stdin) {
  if (file === "-") {
    if (!stdin || stdin.isTTY) throw new CliError("input_required", { flag: "input-file" });
    return stdin;
  }
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new Error("not a file");
  } catch { if (fd !== undefined) closeSync(fd); throw new CliError("invalid_input_file"); }
  return createReadStream(null, { fd, highWaterMark: 65536 });
}

const keyOf = id => createHash("sha256").update(id).digest("hex").slice(0, 40);

function readJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077)) throw new CliError("batch_state_invalid", { file: path.split("/").slice(-2).join("/") });
  return JSON.parse(readFileSync(path, "utf8"));
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === "EPERM"; }
}

// Opens or creates the state dir and takes its lock. A lock whose pid is gone
// (a crashed run) is taken over; its items keep the recovery they persisted.
export function openState(dir, origin, now, cliVersion) {
  if (!isAbsolute(dir || "")) throw new CliError("absolute_private_file_required", { flag: "state-dir" });
  if (!existsSync(dir)) { try { mkdirSync(dir, { mode: 0o700 }); } catch { throw new CliError("batch_state_invalid"); } }
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || (stat.mode & 0o077)) throw new CliError("batch_state_invalid", { reason: "state dir must be a 0700 directory" });
  for (const sub of ["items", "results"]) if (!existsSync(join(dir, sub))) mkdirSync(join(dir, sub), { mode: 0o700 });
  const metaPath = join(dir, "batch.json");
  let meta;
  if (existsSync(metaPath)) {
    try { meta = readJson(metaPath); } catch (error) { throw error instanceof CliError ? error : new CliError("batch_state_invalid"); }
    if (meta?.schema !== BATCH_STATE_SCHEMA) throw new CliError("batch_state_invalid");
    if (meta.origin !== origin) throw new CliError("batch_state_origin_mismatch", { stateOrigin: meta.origin });
  } else {
    meta = { schema: BATCH_STATE_SCHEMA, origin, createdAt: now().toISOString(), createdBy: `samedaydesk-cli ${cliVersion}` };
    savePrivate(metaPath, `${JSON.stringify(meta)}\n`);
  }
  const lockPath = join(dir, "lock");
  const runId = randomUUID();
  const take = () => savePrivate(lockPath, `${JSON.stringify({ pid: process.pid, runId })}\n`, { exclusive: true });
  let tookOver = null;
  try { take(); }
  catch (error) {
    if (error?.code !== "EEXIST") throw new CliError("batch_state_invalid");
    let holder = null;
    try { holder = JSON.parse(readFileSync(lockPath, "utf8")); } catch {}
    if (holder && Number.isInteger(holder.pid) && processAlive(holder.pid)) throw new CliError("batch_state_locked", { pid: holder.pid });
    unlinkSync(lockPath);
    try { take(); } catch { throw new CliError("batch_state_locked"); }
    tookOver = holder?.runId ?? "unknown";
  }
  return {
    dir, meta, runId, tookOver,
    release() { try { const holder = JSON.parse(readFileSync(lockPath, "utf8")); if (holder.runId === runId) unlinkSync(lockPath); } catch {} },
    itemPath: id => join(dir, "items", `${keyOf(id)}.json`),
    resultPath: (id, suffix = "") => join(dir, "results", `${keyOf(id)}${suffix}.json`),
    counts() { return { items: readdirSync(join(dir, "items")).filter(name => name.endsWith(".json")).length, results: readdirSync(join(dir, "results")).filter(name => name.endsWith(".json")).length }; },
  };
}

function readItemState(state, id) {
  const path = state.itemPath(id);
  if (!existsSync(path)) return null;
  const record = readJson(path);
  if (record?.schema !== BATCH_ITEM_STATE_SCHEMA || record.id !== id) throw new CliError("batch_state_invalid", { id });
  return record;
}

function writeItemState(state, record) {
  savePrivate(state.itemPath(record.id), `${JSON.stringify(record)}\n`);
}

function archivedResult(state, record) {
  if (!record?.resultFile) return null;
  try {
    const archived = readJson(join(state.dir, record.resultFile));
    if (archived?.schema === BATCH_RESULT_SCHEMA && digest(archived.value) === record.resultDigest && archived.termsDigest === record.termsDigest) return archived;
  } catch {}
  return null;
}

// ctx: { origin, bases: {origin, gateway, market}, transport, credential,
//        stdin, stdout, signal, now, sleep, cliVersion }
export async function runBatch(flags, ctx) {
  const concurrency = flags.concurrency ?? BATCH_LIMITS.concurrency.default;
  const maxItems = flags["max-items"] ?? BATCH_LIMITS.maxItems.default;
  const maxLineBytes = flags["max-line-bytes"] ?? BATCH_LIMITS.maxLineBytes.default;
  const timeoutMs = flags["timeout-ms"] ?? BATCH_LIMITS.timeoutMs.default;
  const dryRun = Boolean(flags["dry-run"]);
  const stdout = ctx.stdout;
  const stderr = ctx.stderr;

  // Validate everything that can fail before the first JSONL line.
  const state = dryRun ? null : openState(flags["state-dir"], ctx.origin, ctx.now, ctx.cliVersion);
  let input;
  try { input = openInput(flags["input-file"], ctx.stdin); }
  catch (error) { state?.release(); throw error; }

  const controller = new AbortController();
  let stdoutClosed = false;
  let interrupted = false;
  const onAbort = () => { interrupted = true; controller.abort(ctx.signal.reason); };
  if (ctx.signal?.aborted) onAbort(); else ctx.signal?.addEventListener("abort", onAbort, { once: true });
  const markClosed = () => { if (!stdoutClosed) { stdoutClosed = true; controller.abort(Object.assign(new Error("stdout closed"), { name: "AbortError" })); } };
  const onStdoutError = () => markClosed();
  stdout.on?.("error", onStdoutError);
  const emit = value => new Promise(resolve => {
    if (stdoutClosed) return resolve(false);
    try { stdout.write(`${JSON.stringify(value)}\n`, error => { if (error) markClosed(); resolve(!error); }); }
    catch { markClosed(); resolve(false); }
  });

  const counts = { total: 0, ok: 0, skippedCompleted: 0, failed: 0, refused: 0, cancelled: 0, preview: 0 };
  const seen = new Set();
  await emit({ schema: BATCH_SCHEMA, type: "start", cliVersion: ctx.cliVersion, origin: ctx.origin, dryRun, stateDir: state?.dir ?? null,
    runId: state?.runId ?? null, tookOverStaleLock: state?.tookOver ?? null, concurrency, maxItems, maxLineBytes, timeoutMs, ops: Object.keys(BATCH_OPS) });

  const itemRecord = (seq, fields) => ({ schema: BATCH_SCHEMA, type: "item", seq, ...fields });
  const refuse = async (seq, error, extra = {}) => {
    counts.refused += 1;
    await emit(itemRecord(seq, { ...extra, status: "refused", recovery: "not_sent", error: describe(error) }));
  };

  async function processItem(seq, item) {
    const op = BATCH_OPS[item.op];
    const id = itemId(item);
    const idSource = item.id ? "caller" : "derived";
    const base = ctx.bases[op.base];
    const path = op.path(item.args);
    const termsDigest = digest({ op: item.op, args: item.args, origin: ctx.origin });
    const common = { id, idSource, op: item.op, operationId: op.operationId, recoveryClass: BATCH_OP_RECOVERY_CLASS, termsDigest };
    if (seen.has(id)) return refuse(seq, new CliError("item_duplicate", { id }), common);
    seen.add(id);
    if (dryRun) {
      counts.preview += 1;
      return emit(itemRecord(seq, { ...common, status: "preview", kind: "local_preview", sent: false, request: { method: "GET", url: `${base}${path}` }, auth: op.auth }));
    }
    let previous;
    try { previous = readItemState(state, id); }
    catch (error) { return refuse(seq, error, common); }
    if (previous && previous.termsDigest !== termsDigest) {
      return refuse(seq, new CliError("item_terms_changed", { id, storedTermsDigest: previous.termsDigest }), { ...common, archivedResultFile: previous.resultFile ?? null });
    }
    if (previous?.status === "completed") {
      const archived = archivedResult(state, previous);
      if (archived) {
        counts.skippedCompleted += 1;
        return emit(itemRecord(seq, { ...common, status: "skipped_completed", recovery: "remote_committed", attempts: 0, resultFile: previous.resultFile, resultDigest: previous.resultDigest, receivedAt: archived.receivedAt, result: archived.value }));
      }
    }
    if (previous && previous.recovery === "sent_unconfirmed" && previous.recoveryClass !== BATCH_OP_RECOVERY_CLASS) {
      return refuse(seq, new CliError("uncertain_mutation_not_replayed", { id }), common);
    }
    if (op.auth === "tenant" && !ctx.credential) return refuse(seq, new CliError("credential_required", { op: item.op }), common);
    if (controller.signal.aborted) {
      counts.cancelled += 1;
      return emit(itemRecord(seq, { ...common, status: "cancelled", recovery: "not_sent", error: describe(new CliError(stdoutClosed ? "output_closed" : "cancelled", { recovery: "not_sent" })) }));
    }
    const history = [...(previous?.history ?? [])].slice(-(HISTORY_MAX - 1));
    const record = { schema: BATCH_ITEM_STATE_SCHEMA, id, op: item.op, args: item.args, operationId: op.operationId, origin: ctx.origin, termsDigest,
      recoveryClass: BATCH_OP_RECOVERY_CLASS, status: "dispatching", recovery: "sent_unconfirmed", runId: state.runId, updatedAt: ctx.now().toISOString(),
      attempts: previous?.attempts ?? 0, history, resultFile: previous?.resultFile ?? null, resultDigest: previous?.resultDigest ?? null };
    // Persist before dispatch. If this fails, nothing is sent.
    try { writeItemState(state, record); }
    catch { return refuse(seq, new CliError("recovery_record_failed"), common); }
    let outcome;
    try {
      const { value, attempts } = await ctx.transport.call(base, path, { sleep: ctx.sleep, signal: controller.signal, itemTimeoutMs: timeoutMs,
        credential: op.auth === "tenant" ? ctx.credential : null });
      if (!op.accept(value)) throw Object.assign(new CliError("response_invalid", { recovery: "remote_committed" }), { attempts });
      outcome = { value, attempts };
    } catch (error) {
      const described = describe(error);
      const cancelled = described.code === "cancelled" || (controller.signal.aborted && described.code !== "request_timeout");
      const recovery = described.evidence?.recovery ?? "sent_unconfirmed";
      const attempts = described.evidence?.attempts ?? error?.attempts ?? 1;
      const status = cancelled ? "cancelled" : "failed";
      const shown = cancelled && stdoutClosed ? { ...describe(new CliError("output_closed", described.evidence)) } : described;
      record.status = status; record.recovery = recovery; record.attempts += attempts; record.updatedAt = ctx.now().toISOString();
      record.history.push({ runId: state.runId, at: record.updatedAt, status, code: described.code, recovery });
      try { writeItemState(state, record); } catch {}
      counts[cancelled ? "cancelled" : "failed"] += 1;
      return emit(itemRecord(seq, { ...common, status, recovery, attempts, error: shown }));
    }
    const receivedAt = ctx.now().toISOString();
    const resultDigest = digest(outcome.value);
    const archived = { schema: BATCH_RESULT_SCHEMA, id, op: item.op, operationId: op.operationId, origin: ctx.origin, termsDigest, receivedAt, runId: state.runId, value: outcome.value };
    let resultFile = `results/${keyOf(id)}.json`;
    try { savePrivate(state.resultPath(id), `${JSON.stringify(archived)}\n`, { exclusive: true }); }
    catch (error) {
      // An earlier archive for this id exists (a run that crashed after the
      // archive and before its state write). Keep it and add this one.
      resultFile = `results/${keyOf(id)}.${state.runId}.json`;
      try { savePrivate(state.resultPath(id, `.${state.runId}`), `${JSON.stringify(archived)}\n`, { exclusive: true }); } catch { resultFile = null; }
    }
    record.status = "completed"; record.recovery = "remote_committed"; record.attempts += outcome.attempts; record.updatedAt = receivedAt;
    record.resultFile = resultFile; record.resultDigest = resultDigest;
    record.history.push({ runId: state.runId, at: receivedAt, status: "completed", recovery: "remote_committed" });
    try { writeItemState(state, record); } catch {}
    counts.ok += 1;
    return emit(itemRecord(seq, { ...common, status: "ok", recovery: "remote_committed", attempts: outcome.attempts, resultFile, resultDigest, receivedAt, result: outcome.value }));
  }

  const active = new Set();
  let batchError = null;
  let seq = 0;
  try {
    for await (const line of lines(input, maxLineBytes, controller.signal)) {
      if (!line.text.trim()) continue;
      seq += 1;
      if (seq > maxItems) throw new CliError("batch_too_many_items", { maxItems, line: line.lineNo });
      counts.total += 1;
      while (active.size >= concurrency) await Promise.race(active);
      let item;
      try { item = validateItem(JSON.parse(line.text)); }
      catch (error) {
        await refuse(seq, error instanceof CliError ? error : new CliError("item_invalid", { reason: "not JSON" }), { line: line.lineNo });
        continue;
      }
      if (controller.signal.aborted && !dryRun) {
        counts.cancelled += 1;
        await emit(itemRecord(seq, { id: itemId(item), idSource: item.id ? "caller" : "derived", op: item.op, status: "cancelled", recovery: "not_sent", error: describe(new CliError(stdoutClosed ? "output_closed" : "cancelled", { recovery: "not_sent" })) }));
        break;
      }
      const task = processItem(seq, item).catch(() => { counts.failed += 1; }).finally(() => active.delete(task));
      active.add(task);
    }
  } catch (error) {
    batchError = error instanceof CliError ? error : new CliError("invalid_input_file");
  }
  await Promise.allSettled([...active]);
  try { input.destroy?.(); } catch {}
  ctx.signal?.removeEventListener?.("abort", onAbort);
  state?.release();

  const done = counts.ok + counts.skippedCompleted;
  const bad = counts.failed + counts.refused;
  let code = null;
  if (stdoutClosed) code = "output_closed";
  else if (interrupted || counts.cancelled) code = "cancelled";
  else if (batchError) code = batchError.code;
  else if (bad && done) code = "batch_partial";
  else if (bad) code = "batch_all_failed";
  const described = code ? describe(batchError && code === batchError.code ? batchError : new CliError(code)) : null;
  const exit = described ? described.exit : 0;
  const summary = { schema: BATCH_SCHEMA, type: "summary", ok: exit === 0, exit, counts, stateDir: state?.dir ?? null, runId: state?.runId ?? null,
    stdoutClosed, cancelled: interrupted, error: described, singleExecutionClaimed: false,
    note: "Completed items are skipped on rerun with the same --state-dir. Unconfirmed reads are rerun; they have no server effect." };
  if (stdoutClosed) {
    await new Promise(resolve => { try { stderr.write(`${JSON.stringify({ schema: "samedaydesk.cli.diagnostic.v1", code: "output_closed", exit, counts })}\n`, () => resolve()); } catch { resolve(); } });
  } else {
    await emit(summary);
    if (described) await new Promise(resolve => { try { stderr.write(`${JSON.stringify({ schema: "samedaydesk.cli.diagnostic.v1", code: described.code, exit })}\n`, () => resolve()); } catch { resolve(); } });
  }
  stdout.off?.("error", onStdoutError);
  return { streamed: true, exit };
}
