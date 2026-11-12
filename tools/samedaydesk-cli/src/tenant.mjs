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
function outcome(receipt, state, file, stagesSoFar) {
  const result = { schema: TENANT_RESULT_SCHEMA, stateFile: file, receipt: summarize(receipt), output: receipt.output ?? null, acceptance: acceptance(receipt, state),
    recovery: state.dispatch?.recovery ?? "remote_committed", stages: { ...stagesSoFar, result: { route: "readPersistedReceipt", verified: true } },
    settlement: receipt.price?.amount === 0 ? "not_required (free route)" : "not handled by this CLI", singleExecutionClaimed: false };
  const evidence = { receiptId: receipt.id, status: receipt.status, stateFile: file, recovery: result.recovery };
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
// first; if that fails nothing is sent.
async function dispatch(ctx, state, file, credential) {
  state.dispatch = { schema: "neomorphic.machine-gateway.dispatch-record.v1", method: "POST", path: "/v1/execute", idempotencyKeySha256: sha256(state.key),
    recovery: "sent_unconfirmed", attempts: (state.dispatch?.attempts ?? 0) + 1, at: ctx.now().toISOString() };
  save(file, state);
  let value;
  try { ({ value } = await ctx.call(state.base, "/v1/execute", { body: state.request, key: state.key, credential, sleep: ctx.sleep, signal: ctx.signal })); }
  catch (error) {
    const described = describe(error);
    state.dispatch.recovery = described.evidence?.recovery ?? "sent_unconfirmed";
    try { savePrivate(file, JSON.stringify(state)); } catch {}
    error.evidence = { ...(error.evidence || {}), stage: "execution", stateFile: file,
      next: ["not_sent", "remote_refused"].includes(state.dispatch.recovery) && described.evidence?.server?.code !== "idempotency_conflict"
        ? "gateway resume --state-file (resends the identical request with the same key)"
        : "gateway resume --state-file (the gateway answers a repeated key from its stored receipt; it does not run the route twice)" };
    throw error;
  }
  receiptChecks(value, state);
  // Keep the server id before the readback so a fresh process reads it back.
  state.receipt = { id: value.id, status: "running" };
  state.dispatch.recovery = "remote_committed";
  save(file, state);
  return value;
}

export async function tenantQuote(ctx, { base, routeId, input, credential }) {
  const { value } = await ctx.call(base, "/v1/quote", { body: { routeId, input }, credential, sleep: ctx.sleep, signal: ctx.signal });
  quoteChecks(value, { routeId, input });
  return value;
}

export async function execute(ctx, { base, routeId, input, credential, file }) {
  if (!absolute(file || "")) throw new CliError("absolute_private_file_required", { flag: "state-file" });
  if (existsSync(file)) throw new CliError("state_exists", { stateFile: file });
  const quote = await tenantQuote(ctx, { base, routeId, input, credential });
  const serverQuote = { route: "quoteRoute", quoteId: quote.quoteId, routeDigest: quote.routeDigest, inputDigest: quote.inputDigest, expiresAt: quote.expiresAt, price: quote.price, tenantBound: quote.tenantBound, executable: quote.executable };
  if (quote.tenantBound !== true || !UUID_RE.test(quote.quoteId ?? "")) throw new CliError("quote_not_executable", { stage: "server_quote", tenantBound: quote.tenantBound === true });
  if (quote.price?.amount !== 0) {
    throw new CliError("paid_route_requires_payment_authority", { stage: "server_quote", price: quote.price, requirements: quote.requirements ?? null, quoteId: quote.quoteId,
      handoff: "An operator-approved payer must supply the payment for this exact quote. This CLI sends no payment and stops before execution." });
  }
  if (quote.executable !== true) throw new CliError("quote_not_executable", { stage: "server_quote" });
  const state = { schema: CALLER_STATE_SCHEMA, base, tenantBinding: credential.binding, route: routeId,
    request: { quoteId: quote.quoteId, input, maxUnits: 0 }, key: randomUUID(), receipt: null,
    cli: { createdBy: "samedaydesk-cli", serverQuote, expectedRequestDigest: null } };
  state.cli.expectedRequestDigest = expectedRequestDigest(state.request);
  try { savePrivate(file, JSON.stringify(state), { exclusive: true }); }
  catch (error) { throw new CliError(error?.code === "EEXIST" ? "state_exists" : "recovery_record_failed", { stateFile: file }); }
  await dispatch(ctx, state, file, credential);
  const receipt = await readback(ctx, state, file, credential);
  return outcome(receipt, state, file, { serverQuote, reservation: "none (the tenant quote is the server-side binding)", execution: { route: "executeBoundQuote", idempotencyKeySha256: sha256(state.key) } });
}

export async function resume(ctx, { base, credential, file }) {
  const state = readState(file);
  bindingCheck(state, { base, credential });
  if (!state.receipt?.id) await dispatch(ctx, state, file, credential);
  const receipt = await readback(ctx, state, file, credential);
  return outcome(receipt, state, file, { serverQuote: state.cli?.serverQuote ?? { quoteId: state.request.quoteId }, execution: { route: "executeBoundQuote", resumed: true, idempotencyKeySha256: sha256(state.key) } });
}

export async function result(ctx, { base, credential, file }) {
  const state = readState(file);
  bindingCheck(state, { base, credential });
  if (!state.receipt?.id) throw new CliError("receipt_unknown", { stateFile: file, recovery: state.dispatch?.recovery ?? "not_sent" });
  const receipt = await readback(ctx, state, file, credential);
  return outcome(receipt, state, file, { serverQuote: state.cli?.serverQuote ?? { quoteId: state.request.quoteId } });
}
