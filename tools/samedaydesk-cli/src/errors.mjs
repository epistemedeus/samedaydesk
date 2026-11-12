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
  timeout: ["transport", true, "retry"],
  transport_failed: ["transport", true, "retry"],
  response_oversize: ["transport", false, "capabilities"],
  response_invalid: ["transport", true, "retry"],
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
