/**
 * Requester decision desk constants.
 * F01/I01 owns HTTP. W3-01 owns decide/appeal. This pack is the CX client.
 */
export declare const SCHEMA: "neomorphic.requester-decision-desk.v1";
export declare const FIXTURE_SCHEMA: "neomorphic.requester-decision-desk.fixture.v1";
export declare const SCHEMA_VERSION: 1;
export declare const PACK_ID = "W4-exchange-03";
export declare const WAVE5_ID = "W5-E09";
export declare const I01_OPENAPI_PIN: {
    readonly repo: "epistemedeus/neomorphic-io";
    readonly ref: "fable/integration-earned-work";
    readonly sha: "346bbd3cbe6943a83b2077c455174d74b7a493ad";
    readonly pr: 54;
    readonly path: "services/earned-work/openapi.json";
    readonly note: "Current Neo54 obligation contract consumed by this desk. E01 may amend later; this is the version tested.";
};
export declare const W3_PIN: {
    readonly repo: "epistemedeus/neomorphic-io";
    readonly ref: "fable/w3-01-a03-requester-decision";
    readonly sha: "0c1440fe46f8fe1fa744b9e67c82b26d702728b7";
};
export declare const F01_ORIGINAL_PIN: {
    readonly repo: "epistemedeus/neomorphic-io";
    readonly ref: "fable/f01-s275-kernel";
    readonly sha: "51d149a923978dfb7827d1b96d0b042304edd150";
    readonly note: "contrast only; I01 hash termsVersion is the consumer default";
};
export declare const TERMS_VERSION_RE: RegExp;
export declare const DIGEST_HEX: RegExp;
export declare const OWNER_TOKEN_ENV = "EARNED_WORK_OWNER_TOKEN";
export declare const BASE_URL_ENV = "EARNED_WORK_BASE_URL";
export declare const CONTRIBUTOR_TOKEN_ENV = "EARNED_WORK_CONTRIBUTOR_TOKEN";
export declare const DEFAULT_OWNER_TOKEN = "dev-owner-token-s275";
export declare const OBLIGATION_KIND: "owed_record";
export declare const OBLIGATION_ADAPTER: "typed_owed_record_v0";
export declare const NULL_PAYOUT_ADAPTER: "null_nonpaying_v0";
export declare const FIXTURE_LABEL: "desk_fixture";
export declare const INSUFFICIENT_FOR_LIVE_GATE = "desk_fixture speaks the I01 OpenAPI accept/reject/obligation/payout shapes for local execution. It is insufficient for the live gate. Local-runtime is a listening F01/I01 earned-work service (EARNED_WORK_BASE_URL) backed by real Postgres.";
export declare const HYPOTHESIS_REWARD: Readonly<{
    amount: "0.10";
    asset: "USDC";
    network: "base";
}>;
export declare const TARGET_KIND: Readonly<{
    LOCAL_RUNTIME: "local-runtime";
    FIXTURE: "fixture";
    INJECTED: "injected";
}>;
export declare const NEXT_ACTION: Readonly<{
    WAIT_REQUESTER_ACCEPT: "wait_requester_accept";
    APPEAL: "appeal";
    WAIT_OWED: "wait_owed";
    DO_NOT_START_WORK: "do_not_start_work";
}>;
export declare const ERROR_CODES: Readonly<{
    INVALID_INPUT: "invalid_input";
    UNAUTHORIZED: "unauthorized";
    FORGED_ACCEPTANCE_REJECTED: "forgedAcceptanceRejected";
    ARTIFACT_CHANGED: "artifact_changed";
    PAID_SETTLED_PROJECTION_REJECTED: "paid_settled_projection_rejected";
    EMPTY_PAYOUT_NOT_OWED: "empty_payout_not_owed";
    LLM_VERDICT_NOT_PAYOUT_AUTHORITY: "llm_verdict_is_not_payout_authority";
    INTEGER_TERMS_VERSION: "integer_termsVersion";
    TERMS_VERSION_MISMATCH: "terms_version_mismatch";
    FORBIDDEN_FIXTURE_LABEL: "forbidden_fixture_label";
    MISSING_OWNER_BEARER: "missing_owner_bearer";
    SECRET_IN_URL: "secret_in_url";
    VERDICT_REQUIRED: "verdict_required";
    NOT_FOUND: "not_found";
    LOOPBACK_ONLY: "loopback_only";
    TUPLE_MISMATCH: "tuple_mismatch";
    ALREADY_OWED: "already_owed";
}>;
export declare const FORBIDDEN_FIXTURE_LABELS: readonly string[];
export declare const BODY_LIMIT_BYTES: number;
