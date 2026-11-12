// Typed CLI errors. Exit categories follow the agent-economy-client 0.3.0 EXIT
// map (vendor/hosted-wallet-market/client/agent-economy-client-0.3.0.tgz,
// src/errors.mjs) for 0 to 7 and add the categories the CLI plan requires.
export const EXIT = Object.freeze({
  ok: 0,
  input: 1,
  transport: 2,
  auth: 3,
  origin: 4,
  not_found: 5,
  conflict: 6,
  funding: 7,
  unavailable: 8,
  retryable: 9,
  unknown_mutation_outcome: 10,
  pending: 11,
  partial: 12,
  all_failed: 13,
  output_closed: 14,
  remote_failed: 15,
  cancelled: 130,
});

// code -> [category, retryable, nextAction]
const CODES = {
  usage: ["input", false, "help"],
  invalid_arguments: ["input", false, "schema"],
  secret_in_argv_refused: ["input", false, "schema"],
  unknown_command: ["input", false, "help"],
  input_required: ["input", false, "schema"],
  invalid_input: ["input", false, "schema"],
  invalid_input_file: ["input", false, "schema"],
  input_too_large: ["input", false, "schema"],
  route_unknown: ["input", false, "gateway routes"],
  host_refused: ["input", false, "schema"],
  http_refused: ["input", false, "schema"],
  // Server refusal code from the market 400 body, kept verbatim in
  // evidence.server. Same code as the ae SERVER_CODES entry. Never retried.
  cursor_refused: ["input", false, "market discover (restart without --cursor)"],
  // Repaired market (PR #398): mc1 cursors. malformed: not a cursor this
  // server could emit. unrecognized: well formed but not issued by this server
  // or no longer valid. Both: restart pagination without the cursor.
  cursor_malformed: ["input", false, "market discover (restart without --cursor)"],
  cursor_unrecognized: ["input", false, "market discover (restart without --cursor)"],
  absolute_private_file_required: ["input", false, "schema"],
  invalid_private_file: ["input", false, "schema"],
  result_file_invalid: ["input", false, "readiness check"],
  output_exists: ["conflict", false, "result show"],
  recovery_record_failed: ["input", false, "pass a new absolute --recovery-file path; nothing was sent"],
  origin_refused: ["origin", false, "schema"],
  unauthorized: ["auth", false, "capabilities"],
  not_found: ["not_found", false, "capabilities"],
  conflict: ["conflict", false, "capabilities"],
  unavailable: ["unavailable", true, "capabilities"],
  rate_limited: ["retryable", true, "retry later"],
  request_timeout: ["transport", true, "retry"],
  response_interrupted: ["transport", false, "read back by operation identity; do not resend a POST"],
  cancelled: ["cancelled", false, "rerun; check recovery before resending a POST"],
  transport_failed: ["transport", true, "retry"],
  response_oversize: ["transport", false, "capabilities"],
  response_invalid: ["transport", true, "retry"],
  // Credentials (src/auth.mjs). Evidence never holds the value.
  credential_unavailable: ["auth", false, "name an existing 0600 --credential-file or pipe it with --credential-stdin"],
  credential_invalid: ["auth", false, "check the credential source; the value is never printed"],
  credential_required: ["auth", false, "schema"],
  credential_scope_refused: ["origin", false, "the credential is bound to another origin or scope; nothing was sent"],
  // Batch (src/batch.mjs).
  item_invalid: ["input", false, "schema batch.run"],
  item_op_unsupported: ["input", false, "schema batch.run (supported ops are reads only)"],
  item_duplicate: ["conflict", false, "give each item a unique id"],
  item_terms_changed: ["conflict", false, "use a new item id or a new --state-dir; archived results are kept"],
  uncertain_mutation_not_replayed: ["unknown_mutation_outcome", false, "read back by operation identity; never resend"],
  batch_too_many_items: ["input", false, "split the input or raise --max-items (hard cap 10000)"],
  batch_line_too_long: ["input", false, "shorten the line or raise --max-line-bytes (hard cap 65536)"],
  batch_state_invalid: ["input", false, "pass a new absolute --state-dir"],
  batch_state_origin_mismatch: ["origin", false, "a state dir is bound to one origin; pass a new --state-dir"],
  batch_state_locked: ["conflict", false, "another run holds this state dir; wait for it or pass a new --state-dir"],
  batch_partial: ["partial", false, "rerun with the same --state-dir; completed items are skipped"],
  batch_all_failed: ["all_failed", false, "rerun with the same --state-dir after fixing the cause"],
  output_closed: ["output_closed", false, "rerun with the same --state-dir; state was persisted"],
  // Tenant journey (gateway execute, resume, result).
  quote_not_executable: ["input", false, "gateway quote with a tenant credential for a route the tenant may run"],
  paid_route_requires_payment_authority: ["funding", false, "paid execution needs an operator-approved payment authority; this CLI never pays"],
  state_exists: ["conflict", false, "gateway resume --state-file, or a new absolute --state-file"],
  state_missing: ["input", false, "gateway execute --state-file NEW"],
  state_invalid: ["input", false, "pass the state file written by gateway execute or the direct client"],
  state_binding_conflict: ["conflict", false, "the state file is bound to another origin, credential, route or input; start a new state file"],
  receipt_unknown: ["input", false, "gateway resume --state-file (no receipt id was received yet)"],
  readback_mismatch: ["conflict", false, "do not resend; report the receipt id to the operator"],
  execution_pending: ["pending", true, "gateway result --state-file later"],
  execution_uncertain: ["unknown_mutation_outcome", false, "do not resend; the receipt is uncertain at its deadline"],
  execution_failed: ["remote_failed", false, "read evidence.receiptError; a new attempt needs a new quote and state file"],
  // task-continuation 1.3.0 refusals as CLI codes. evidence.continuation keeps
  // the module's own { code, exitCategory, exitCode, retryable } row.
  continuation_task_changed: ["conflict", false, "the tool, origin, terms or subject changed; start a new state file (the old task is not rebound)"],
  continuation_dispatch_pending: ["conflict", false, "gateway resume (read back by key); never a new dispatch"],
  continuation_result_unknown: ["unknown_mutation_outcome", true, "gateway resume later; do not dispatch again"],
  continuation_handback_invalid: ["input", false, "the handback file does not validate; reconcile the receipt out of band and start a new state file"],
  continuation_state_invalid: ["input", false, "follow quote, execution, result, acceptance in order"],
  continuation_expired: ["input", false, "the quote expired before dispatch; gateway execute with a new state file"],
  continuation_revoked: ["auth", false, "start a new task; do not retry"],
  continuation_file_invalid: ["input", false, "the continuation file does not validate"],
  internal: ["input", false, "help"],
};

export class CliError extends Error {
  constructor(code, evidence = null) {
    const known = Object.hasOwn(CODES, code) ? code : "internal";
    super(known);
    this.code = known;
    this.evidence = evidence;
  }
}

export function describe(error) {
  const code = error instanceof CliError ? error.code : "internal";
  const [category, retryable, nextAction] = CODES[code];
  return { code, category, exit: EXIT[category], retryable, nextAction, evidence: error?.evidence ?? null };
}

export const ERROR_CODES = Object.freeze(Object.keys(CODES));
