// Configured-tenant journey on the machine gateway: server quote, execution,
// result readback and recovery. Stages stay separate:
//   local preview  --dry-run on any command (nothing sent)
//   server quote   POST /v1/quote with the tenant bearer (quoteRoute). The
//                  backend binds tenant, route revision, price and exact input
//                  for 60 s. It has no separate reservation route.
//   execution      POST /v1/execute with Idempotency-Key (executeBoundQuote)
//   result         GET /v1/receipts/{id} (readPersistedReceipt), verified
//                  against the persisted request, input and quote digests.
//                  The backend has no acceptance route; acceptance here is the
//                  caller's local verification record.
//   settlement     free routes only. A paid route stops before execution with
//                  paid_route_requires_payment_authority: this CLI never builds
//                  a payment, signs, or pays.
//
// The state file is the existing direct client's caller-state v1
// (server/vendor/machine-gateway/bin/caller.mjs), so either client can resume
// the other's task. It is written (exclusive, 0600) before execution with the
// idempotency key; the dispatch record (sent_unconfirmed) is written before
// every POST. Recovery uses only what the backend supports: read back by
// receipt id, or resend the identical request with the same key, which the
// gateway answers from its stored receipt for that key and digest without
// running the route again. Nothing here claims single execution, or that a
// lost state file can be recovered.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute as absolute } from "node:path";
import { privateText, savePrivate } from "../../../server/vendor/machine-gateway/bin/client-io.mjs";
import { boundedJson, digest, sha256 } from "../../../server/vendor/machine-gateway/src/util.mjs";
import { CliError, describe } from "./errors.mjs";
import {
  ContinuationError, ERROR_CODES as TC_ERROR_CODES, HASH_ALG, advanceHandback, applyReadback, assertSameTask, beginDispatch, createHandback,
  loadHandbackFile, markResultUnknown, mintCorrelationId, recordResult, saveHandbackFile, taskBinding,
} from "../vendor/task-continuation/index.mjs";

// task-continuation 1.3.0 handback (nonsecret, 0600) beside the state file.
// Task binding: tool executeBoundQuote, the gateway origin, subject = digest of
// route and exact input, terms = digest of quote id, route digest and maxUnits.
// The idempotency key is the handback's pending.stepEventId, saved before the
// POST. The bearer stays in its own 0600 file and is never in either file.
export const HANDBACK_TOOL = "executeBoundQuote";
export const handbackPath = file => `${file}.handback.json`;
export function taskFor(state) {
  return taskBinding({ tool: HANDBACK_TOOL, origin: new URL(state.base).origin, subject: digest({ routeId: state.route, input: state.request.input }),
    termsVersion: `sha256:${digest({ quoteId: state.request.quoteId, routeDigest: state.cli?.serverQuote?.routeDigest ?? null, maxUnits: state.request.maxUnits })}` });
}

// CLI code for each continuation refusal. Where the module's own exit code
// collides with a different meaning in this CLI's table, the CLI code wins and
// evidence.continuation carries the module's row unchanged (documented in the
// manifest as continuationExitMap).
export const CONTINUATION_CLI_CODES = Object.freeze({
  continuation_task_changed: "continuation_task_changed",
  continuation_dispatch_pending: "continuation_dispatch_pending",
  continuation_result_unknown: "continuation_result_unknown",
  continuation_handback_invalid: "continuation_handback_invalid",
  continuation_state_invalid: "continuation_state_invalid",
  continuation_expired: "continuation_expired",
  continuation_revoked: "continuation_revoked",
  continuation_hash_legacy: "continuation_handback_invalid",
});
export function fromContinuation(error) {
  if (!(error instanceof ContinuationError)) return error;
  const row = TC_ERROR_CODES[error.code] ?? null;
  const code = CONTINUATION_CLI_CODES[error.code] ?? "continuation_file_invalid";
  return new CliError(code, { continuation: { code: error.code, ...(row ?? {}) }, ...(Array.isArray(error.changed) ? { changed: error.changed } : {}) });
}
async function tc(work) {
  try { return await work(); } catch (error) { throw fromContinuation(error); }
}
async function saveHandback(file, handback) {
  try { await saveHandbackFile(handbackPath(file), handback); }
  catch (error) { throw error instanceof ContinuationError ? new CliError("recovery_record_failed", { stateFile: file, continuation: { code: error.code } }) : error; }
}

export const CALLER_STATE_SCHEMA = "neomorphic.machine-gateway.caller-state.v1";
export const TENANT_RESULT_SCHEMA = "samedaydesk.cli.tenant-result.v1";
const UUID_RE = /^[a-f0-9-]{36}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const KEY_RE = /^[A-Za-z0-9_.-]{16,128}$/;

// The gateway's own request digest (src/gateway.mjs execute): the body plus
// the sha256 of the payment header, which is empty on free routes.
export const expectedRequestDigest = request => digest({ ...request, paymentHeaderDigest: sha256("") });

function quoteChecks(quote, { routeId, input }) {
  if (quote?.schema !== "neomorphic.machine-gateway.quote.v1" || quote.routeId !== routeId || !HEX64.test(quote.inputDigest ?? "")) throw new CliError("response_invalid", { recovery: "remote_committed", stage: "server_quote" });
  if (quote.inputDigest !== digest(input)) throw new CliError("readback_mismatch", { stage: "server_quote", field: "inputDigest" });
}

function receiptChecks(receipt, state) {
  if (receipt?.schema !== "neomorphic.machine-gateway.receipt.v1" || !UUID_RE.test(receipt.id ?? "") || typeof receipt.status !== "string") throw new CliError("response_invalid", { recovery: "remote_committed", stage: "result" });
  const fields = [];
  if (receipt.quoteId !== state.request.quoteId) fields.push("quoteId");
  if (receipt.routeId !== state.route) fields.push("routeId");
  if (receipt.inputDigest !== digest(state.request.input)) fields.push("inputDigest");
  if (receipt.requestDigest !== expectedRequestDigest(state.request)) fields.push("requestDigest");
  if (state.receipt?.id && receipt.id !== state.receipt.id) fields.push("id");
  if (fields.length) throw new CliError("readback_mismatch", { stage: "result", fields });
}

export function readState(file) {
  if (!absolute(file || "")) throw new CliError("absolute_private_file_required", { flag: "state-file" });
  let state;
  try { state = boundedJson(privateText(file)); }
  catch (error) {
    if (error?.code === "ENOENT") throw new CliError("state_missing");
    throw new CliError("state_invalid");
  }
  if (state?.schema !== CALLER_STATE_SCHEMA || typeof state.base !== "string" || !HEX64.test(state.tenantBinding ?? "") || typeof state.route !== "string"
    || !UUID_RE.test(state.request?.quoteId ?? "") || typeof state.request?.input !== "object" || state.request?.maxUnits !== 0 || !KEY_RE.test(state.key ?? "")) throw new CliError("state_invalid");
  return state;
}

function save(file, state) {
  try { savePrivate(file, JSON.stringify(state)); }
  catch { throw new CliError("recovery_record_failed", { stateFile: file }); }
}

function bindingCheck(state, { base, credential }) {
  const fields = [];
  if (state.base !== base) fields.push("base");
  if (state.tenantBinding !== credential.binding) fields.push("tenantBinding");
  // Terms persisted by this CLI: a changed request is refused, never sent.
  if (state.cli?.expectedRequestDigest && state.cli.expectedRequestDigest !== expectedRequestDigest(state.request)) fields.push("request");
  if (state.cli?.serverQuote?.inputDigest && state.cli.serverQuote.inputDigest !== digest(state.request.input)) fields.push("input");
  if (fields.length) throw new CliError("state_binding_conflict", { fields });
}

function summarize(receipt) {
  return { id: receipt.id, status: receipt.status, routeId: receipt.routeId, routeVersion: receipt.routeVersion, quoteId: receipt.quoteId,
    requestDigest: receipt.requestDigest, inputDigest: receipt.inputDigest, createdAt: receipt.createdAt, deadlineAt: receipt.deadlineAt, completedAt: receipt.completedAt,
    price: receipt.price, payment: receipt.payment, error: receipt.error, readbackPath: receipt.readbackPath };
}

function acceptance(receipt, state) {
  return { kind: "local_verification", serverAcceptanceRoute: null,
    note: "The gateway has no acceptance route. These checks compare the server receipt with the persisted request.",
    requestDigestMatches: receipt.requestDigest === expectedRequestDigest(state.request), inputDigestMatches: receipt.inputDigest === digest(state.request.input),
    quoteMatches: receipt.quoteId === state.request.quoteId, routeMatches: receipt.routeId === state.route,
    outputDigest: receipt.output === null || receipt.output === undefined ? null : digest(receipt.output) };
}

// Turns a final receipt into the command outcome.
function outcome(receipt, state, file, stagesSoFar, handback = null) {
  const result = { schema: TENANT_RESULT_SCHEMA, stateFile: file, receipt: summarize(receipt), output: receipt.output ?? null, acceptance: acceptance(receipt, state),
    recovery: state.dispatch?.recovery ?? "remote_committed", stages: { ...stagesSoFar, result: { route: "readPersistedReceipt", verified: true } },
    settlement: receipt.price?.amount === 0 ? "not_required (free route)" : "not handled by this CLI", handback, singleExecutionClaimed: false };
  const evidence = { receiptId: receipt.id, status: receipt.status, stateFile: file, recovery: result.recovery, handback };
  if (receipt.status === "completed") return result;
  if (receipt.status === "running") throw new CliError("execution_pending", evidence);
  if (receipt.status === "uncertain") throw new CliError("execution_uncertain", { ...evidence, receiptError: receipt.error });
  throw new CliError("execution_failed", { ...evidence, receiptError: receipt.error });
}

async function readback(ctx, state, file, credential) {
  const { value } = await ctx.call(state.base, `/v1/receipts/${state.receipt.id}`, { credential, sleep: ctx.sleep, signal: ctx.signal });
  receiptChecks(value, state);
  if (state.receipt.status && state.receipt.status !== "running" && state.receipt.requestDigest && digest(state.receipt) !== digest(value)) throw new CliError("readback_mismatch", { stage: "result", fields: ["receipt"] });
  state.receipt = value;
  if (state.dispatch) state.dispatch.recovery = value.status === "failed" && ["execution_aborted", "request_aborted"].includes(value.error?.code) ? "remote_cancelled" : "remote_committed";
  save(file, state);
  return value;
}

// One POST /v1/execute with the persisted key. The dispatch record is saved
// first; if that fails nothing is sent. With a handback, a lost or refused
// reply moves it to result_unknown (saved) before the error is reported.
async function dispatch(ctx, state, file, credential, hb) {
  state.dispatch = { schema: "neomorphic.machine-gateway.dispatch-record.v1", method: "POST", path: "/v1/execute", idempotencyKeySha256: sha256(state.key),
    recovery: "sent_unconfirmed", attempts: (state.dispatch?.attempts ?? 0) + 1, at: ctx.now().toISOString() };
  save(file, state);
  let value;
  try { ({ value } = await ctx.call(state.base, "/v1/execute", { body: state.request, key: state.key, credential, sleep: ctx.sleep, signal: ctx.signal })); }
  catch (error) {
    const described = describe(error);
    state.dispatch.recovery = described.evidence?.recovery ?? "sent_unconfirmed";
    try { savePrivate(file, JSON.stringify(state)); } catch {}
    if (hb.handback) {
      try { hb.handback = markResultUnknown(hb.handback); await saveHandbackFile(handbackPath(file), hb.handback); } catch {}
    }
    error.evidence = { ...(error.evidence || {}), stage: "execution", stateFile: file,
      ...(hb.handback ? { continuation: { state: hb.handback.state, stepEventId: hb.handback.pending?.stepEventId ?? null } } : {}),
      next: "gateway resume --state-file (the gateway answers a repeated key from its stored attempt and never admits the same key twice)" };
    throw error;
  }
  receiptChecks(value, state);
  // Keep the server id before the readback so a fresh process reads it back.
  state.receipt = { id: value.id, status: "running" };
  state.dispatch.recovery = "remote_committed";
  save(file, state);
  return value;
}

// Record a read-back receipt in the handback: execution or result_unknown ->
// result (applyReadback), then acceptance when every local check passed.
async function settleHandback(file, hb, receipt, state) {
  if (!hb.handback) return null;
  await tc(async () => {
    const event = hb.handback.pending?.stepEventId ?? hb.handback.result?.stepEventId;
    if (hb.handback.state === "execution" || hb.handback.state === "result_unknown") {
      const applied = applyReadback(hb.handback, { found: true, stepEventId: event, digest: digest(receipt) });
      hb.handback = applied.handback;
    } else if (hb.handback.state === "result" && hb.handback.result.digest !== digest(receipt) && receipt.status !== "running") {
      throw new CliError("readback_mismatch", { stage: "result", fields: ["handback.result.digest"] });
    }
    const checks = acceptance(receipt, state);
    if (hb.handback.state === "result" && receipt.status === "completed" && checks.requestDigestMatches && checks.inputDigestMatches && checks.quoteMatches && checks.routeMatches) {
      hb.handback = advanceHandback(hb.handback, "acceptance");
    }
  });
  await saveHandback(file, hb.handback);
  return { file: handbackPath(file), state: hb.handback.state, correlationId: hb.handback.correlationId, step: hb.handback.step, stepEventId: hb.handback.result?.stepEventId ?? null };
}

export async function tenantQuote(ctx, { base, routeId, input, credential }) {
  const { value } = await ctx.call(base, "/v1/quote", { body: { routeId, input }, credential, sleep: ctx.sleep, signal: ctx.signal });
  quoteChecks(value, { routeId, input });
  return value;
}

export async function execute(ctx, { base, routeId, input, credential, file }) {
  if (!absolute(file || "")) throw new CliError("absolute_private_file_required", { flag: "state-file" });
  if (existsSync(file) || existsSync(handbackPath(file))) throw new CliError("state_exists", { stateFile: file });
  const quote = await tenantQuote(ctx, { base, routeId, input, credential });
  const serverQuote = { route: "quoteRoute", quoteId: quote.quoteId, routeDigest: quote.routeDigest, inputDigest: quote.inputDigest, expiresAt: quote.expiresAt, price: quote.price, tenantBound: quote.tenantBound, executable: quote.executable };
  if (quote.tenantBound !== true || !UUID_RE.test(quote.quoteId ?? "")) throw new CliError("quote_not_executable", { stage: "server_quote", tenantBound: quote.tenantBound === true });
  if (quote.price?.amount !== 0) {
    throw new CliError("paid_route_requires_payment_authority", { stage: "server_quote", price: quote.price, requirements: quote.requirements ?? null, quoteId: quote.quoteId,
      handoff: "An operator-approved payer must supply the payment for this exact quote. This CLI sends no payment and stops before execution." });
  }
  if (quote.executable !== true) throw new CliError("quote_not_executable", { stage: "server_quote" });
  const state = { schema: CALLER_STATE_SCHEMA, base, tenantBinding: credential.binding, route: routeId,
    request: { quoteId: quote.quoteId, input, maxUnits: 0 }, key: null, receipt: null,
    cli: { createdBy: "samedaydesk-cli", serverQuote, expectedRequestDigest: null, handback: null } };
  state.cli.expectedRequestDigest = expectedRequestDigest(state.request);
  // Handback: quote state, then pending before the POST. Its stepEventId is
  // the idempotency key. Saved before the state file and before dispatch.
  const hb = { handback: null };
  await tc(async () => {
    const issued = { tool: HANDBACK_TOOL, correlationId: mintCorrelationId(), step: 0, expiresAt: new Date(quote.expiresAt).toISOString(), hashAlg: HASH_ALG };
    hb.handback = beginDispatch(createHandback({ task: taskFor(state), issued, state: "quote" }), { nowMs: ctx.now().getTime() });
  });
  state.key = hb.handback.pending.stepEventId;
  state.cli.handback = { file: handbackPath(file), correlationId: hb.handback.correlationId, step: hb.handback.step };
  await saveHandback(file, hb.handback);
  try { savePrivate(file, JSON.stringify(state), { exclusive: true }); }
  catch (error) { throw new CliError(error?.code === "EEXIST" ? "state_exists" : "recovery_record_failed", { stateFile: file }); }
  await dispatch(ctx, state, file, credential, hb);
  const receipt = await readback(ctx, state, file, credential);
  const handback = await settleHandback(file, hb, receipt, state);
  return outcome(receipt, state, file, { serverQuote, reservation: "none (the tenant quote is the server-side binding)", execution: { route: "executeBoundQuote", idempotencyKeySha256: sha256(state.key) } }, handback);
}

async function loadHandbackFor(state, file) {
  if (!existsSync(handbackPath(file))) {
    if (state.cli?.handback) throw new CliError("continuation_handback_invalid", { reason: "handback file missing", file: handbackPath(file) });
    return { handback: null };
  }
  const handback = await tc(() => loadHandbackFile(handbackPath(file)));
  await tc(async () => assertSameTask(handback, taskFor(state)));
  const event = handback.pending?.stepEventId ?? handback.result?.stepEventId ?? null;
  if (event && event !== state.key) throw new CliError("state_binding_conflict", { fields: ["key"] });
  return { handback };
}

export async function resume(ctx, { base, credential, file }) {
  const state = readState(file);
  bindingCheck(state, { base, credential });
  const hb = await loadHandbackFor(state, file);
  if (!state.receipt?.id) {
    if (hb.handback && (hb.handback.state === "preview" || hb.handback.state === "quote")) {
      // Never dispatched: open the dispatch now, saved before the POST.
      await tc(async () => { hb.handback = beginDispatch(hb.handback, { nowMs: ctx.now().getTime() }); });
      await saveHandback(file, hb.handback);
    }
    // execution or result_unknown: the identical request with the same key is
    // the gateway's read back by key. It returns the stored attempt, or admits
    // the key once if it never arrived; the gateway never admits a key twice.
    await dispatch(ctx, state, file, credential, hb);
  }
  const receipt = await readback(ctx, state, file, credential);
  const handback = await settleHandback(file, hb, receipt, state);
  return outcome(receipt, state, file, { serverQuote: state.cli?.serverQuote ?? { quoteId: state.request.quoteId }, execution: { route: "executeBoundQuote", resumed: true, idempotencyKeySha256: sha256(state.key) } }, handback);
}

export async function result(ctx, { base, credential, file }) {
  const state = readState(file);
  bindingCheck(state, { base, credential });
  const hb = await loadHandbackFor(state, file);
  if (!state.receipt?.id) throw new CliError("receipt_unknown", { stateFile: file, recovery: state.dispatch?.recovery ?? "not_sent", ...(hb.handback ? { continuation: { state: hb.handback.state } } : {}) });
  const receipt = await readback(ctx, state, file, credential);
  const handback = await settleHandback(file, hb, receipt, state);
  return outcome(receipt, state, file, { serverQuote: state.cli?.serverQuote ?? { quoteId: state.request.quoteId } }, handback);
}
