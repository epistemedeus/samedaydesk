/**
 * W4-exchange-06 / W5-E07 contributor session grant.
 * I01 (Neo PR54 current pin) is the authoritative runtime. Original F01
 * integer claim keys are rejected here rather than sent.
 */
export const PACK_ID = "contributor-session-grant";
export const PACK_VERSION = "0.2.0";
export const WAVE_ID = "W4-exchange-06";
export const WAVE5_ID = "W5-E07";
export const SUBPRODUCT = "walletless-first-job";

export const SCHEMA = Object.freeze({
  help: "neomorphic.contributor-session-grant.help.v1",
  error: "neomorphic.contributor-session-grant.error.v1",
  ownerState: "neomorphic.contributor-session-grant.owner-state.v1",
  contributorState: "neomorphic.contributor-session-grant.contributor-state.v1",
  grantAttempt: "neomorphic.contributor-session-grant.grant-attempt.v1",
  usability: "neomorphic.contributor-session-grant.usability.v1",
  envDump: "neomorphic.contributor-session-grant.env-dump.v1",
  receipt: "neomorphic.contributor-session-grant.receipt.v1",
});

export const OWNER_TOKEN_ENV = "EARNED_WORK_OWNER_TOKEN";
export const DATABASE_URL_ENV = "EARNED_WORK_DATABASE_URL";

export const TOKEN_FILE_NAME = "contributor.token";
export const GRANT_ATTEMPT_FILE = "grant-attempt.json";
export const OWNER_STATE_FILE = "owner-state.json";
export const CONTRIBUTOR_STATE_FILE = "contributor-state.json";
export const USABILITY_FILE = "usability.json";
export const ENV_DUMP_FILE = "env-dump.json";
export const TASK_FILE = "task.json";

export const ROLES = Object.freeze(["owner", "contributor"]);
export const OWNER_COMMANDS = Object.freeze([
  "issue",
  "prepare-reserved-task",
  "prepare-and-issue",
  "issue-ledger-grant",
  "reconcile",
]);
export const CONTRIBUTOR_COMMANDS = Object.freeze(["claim", "reconcile"]);

export const OUTCOME = Object.freeze({
  SUCCESS: "success",
  REFUSED: "refused",
  UNKNOWN: "unknown",
});

export const GRANT_BACKENDS = Object.freeze({
  EARNED_WORK: "earned-work",
  LEDGER: "ledger",
});

export const PROVENANCES = Object.freeze(["test", "fixture", "production"]);

/** I01 TermsVersion. Integer residual from original F01 is a seeded failure. */
export const TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;

export const HYPOTHESIS_REWARD = Object.freeze({
  amount: "0.10",
  asset: "USDC",
  network: "base",
});

export const FUNDS_BOUNDARY = "Neomorphic does not hold customer funds";
export const PAYMENT_AUTHORITY = "none";
export const TRANSFER = null;
export const NONPAYING_NOTE =
  "All payments in this wave are explicitly nonsettling prototypes. owed is not paid and not settled.";

export const PINS = Object.freeze({
  i01: {
    repo: "epistemedeus/neomorphic-io",
    ref: "fable/integration-earned-work",
    sha: "346bbd3cbe6943a83b2077c455174d74b7a493ad",
    pr: 54,
    note: "Historical PR54 OpenAPI pin. Comparison only. Live local-runtime boots E01 c4048401.",
  },
  e01: {
    repo: "epistemedeus/neomorphic-io",
    ref: "codex/w5-earnedwork-final-readiness-20260912",
    sha: "c4048401fa42e1272e61edf983afbf39a3e04555",
    tree: "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd",
    pr: 109,
    entry: "services/earned-work/dist/index.js",
    note: "Current E01 kernel. Live compiled HTTP+Postgres from a read-only worktree. Not 346bbd3c. Not 819fa637.",
  },
  inTree: {
    repo: "epistemedeus/neomorphic-io",
    ref: "codex/w5-earnedwork-final-readiness-20260912",
    sha: "c4048401fa42e1272e61edf983afbf39a3e04555",
    tree: "1a5dad7755fb81c75564dbc9d3667ab16db9bbcd",
    sourceSha: "c4048401fa42e1272e61edf983afbf39a3e04555",
    kernelRetryAuthority: "c4048401fa42e1272e61edf983afbf39a3e04555",
    pr: 109,
    entry: "services/earned-work/dist/index.js",
    note: "Live compiled HTTP+Postgres boots E01 c4048401 (tree 1a5dad77). Old I01 pins are pin_mismatch.",
  },
  e02: {
    repo: "epistemedeus/neomorphic-io",
    ref: "codex/w4-exchange-13-20260911",
    sha: "50f605e6ef459a500bd3a643165f16b5fbb5d680",
    pr: 85,
    note: "Wave4 Ex13 SDK pin consumed as method-map contract only. Not vendored.",
  },
  e03: {
    repo: "epistemedeus/neomorphic-io",
    ref: "codex/w4-exchange-08-20260911",
    sha: "037fbd0138de3a237536b006d51de89b48e015ad",
    pr: 72,
    note: "Wave4 Ex08 job-resume pin. Claim replay uses I01 Idempotency-Key; this pack does not copy that kernel.",
  },
  f01: {
    repo: "epistemedeus/neomorphic-io",
    ref: "fable/f01-s275-kernel",
    sha: "51d149a923978dfb7827d1b96d0b042304edd150",
  },
  f04: {
    repo: "epistemedeus/neomorphic-io",
    ref: "fable/f04-walletless-payout-ledger",
    sha: "280310d769de0ca4c4b21633a8da7ba6bbc943b0",
  },
  main: {
    repo: "epistemedeus/neomorphic-io",
    ref: "main",
    sha: "45391e02fb97ee1eed0a050a12a94d540e9eb495",
  },
  cx: {
    repo: "epistemedeus/pilot",
    ref: "codex/w4-plan-exchange-20260911",
    sha: "54cbdf443db9251993a1b9089c653a1dabe2bed6",
  },
});

export const PATHS = Object.freeze({
  healthz: "/healthz",
  openapi: "/openapi.json",
  contributorTokens: "/v1/contributor-tokens",
  tasks: "/v1/tasks",
  claims: (taskId) => `/v1/tasks/${encodeURIComponent(taskId)}/claims`,
  reserve: (taskId) => `/v1/tasks/${encodeURIComponent(taskId)}/funding/reserve`,
  task: (taskId) => `/v1/tasks/${encodeURIComponent(taskId)}`,
  ledgerGrants: "/v1/grants",
});

export const ERROR_CODE = Object.freeze({
  UNKNOWN_COMMAND: "unknown_command",
  UNKNOWN_FLAG: "unknown_flag",
  INVALID_ROLE: "invalid_role",
  OWNER_ONLY_GRANT: "owner_only_grant",
  OWNER_TOKEN_IN_CONTRIBUTOR_PROCESS: "owner_token_in_contributor_process",
  SECRET_LEAK: "secret_leak",
  UNKNOWN_GRANT_NO_AUTO_RETRY: "unknown_grant_no_auto_retry",
  GRANT_OUT_DIR_NOT_EMPTY: "grant_out_dir_not_empty",
  INTEGER_TERMS_VERSION: "integer_terms_version",
  INVALID_TERMS_VERSION: "invalid_terms_version",
  MISSING_TOKEN_FILE: "missing_token_file",
  MISSING_OWNER_TOKEN: "missing_owner_token",
  LOOPBACK_ONLY: "loopback_only",
  NOT_CONFIGURED: "not_configured",
  HTTP_ERROR: "http_error",
  INVALID_INPUT: "invalid_input",
  UNKNOWN_OUTCOME: "unknown_outcome",
  GRANT_IDEMPOTENCY_HEADER_FORBIDDEN: "grant_idempotency_header_forbidden",
  LEDGER_GRANT_NOT_EARNED_WORK_CLAIM: "ledger_grant_not_earned_work_claim",
  FOREIGN_CREDENTIAL: "foreign_credential",
  TARGET_CHANGED: "target_changed",
  MISSING_CLAIM_ATTEMPT: "missing_claim_attempt",
});

export const LATER_INTEGRATION_BINDINGS = Object.freeze([
  {
    id: "F04-ledger-contributor-grant",
    path: "POST /v1/grants role=contributor",
    owner: "F04 / W4-exchange-05 late-address UX",
    status: "adapter-ready",
    note: "Does not authorize earned-work claim. Contributor claim remains I01 POST /v1/contributor-tokens.",
  },
  {
    id: "W4-exchange-04-walletless-first-job",
    path: "packs/contributor-walletless-job/",
    owner: "W4-exchange-04 sibling",
    status: "consume-this-cli",
    note: "Missing sibling must not block. Inject this pack's owner/contributor CLI.",
  },
  {
    id: "W4-exchange-13-sdk",
    path: "packs/earned-work-sdk/",
    owner: "W4-exchange-13 sibling",
    status: "later",
    note: "Typed SDK can wrap the same injected earned-work adapter. W5-E07 tested the Wave4 pin 50f605e6 method map (createContributorToken idempotency:false). Remaining binding: a later E02 export may add typed unknown-outcome envelopes; this pack already classifies empty 201 locally.",
  },
  {
    id: "W5-E03-job-resume",
    path: "packs/job-resume/",
    owner: "W5-E03 / Wave4 Ex08 037fbd01",
    status: "consume-claim-key-replay",
    note: "Claim resume stays on I01 Idempotency-Key. This pack stores that key and replays it. Grant POST still has no key.",
  },
]);

export const EVIDENCE_CLASS = Object.freeze({
  FIXTURE: "fixture",
  LOCAL_RUNTIME: "local-runtime",
  EXTERNAL: "external",
});
