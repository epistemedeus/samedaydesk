/** Submission-progress CX projector. Not reputation. Not payout. Not a verifier. */
export const PACKAGE_ID: "W4-exchange-07-submission-progress";
export const SCHEMA: "neomorphic.submission-progress.v1";
export const SCHEMA_VERSION: 1;
/** I01 / F17 public claim key. Integer termsVersion is invalid_input. */
export const TERMS_VERSION_RE: RegExp;
/** I01 / F02 artifact digest. */
export const DIGEST_RE: RegExp;
export const MEDIA_TYPE_RE: RegExp;
export const ABSOLUTE_BYTES_CAP: 1000000;
export const DEFAULT_MAX_ARTIFACT_BYTES: 65536;
export const REF_MAX: 2048;
/** CX pending states named in the Wave 4 assignment. */
export const CX_PENDING_PROGRESS: readonly string[];
/** Full projector progress set. failed/rejected/open are mapped, not payout labels. */
export const PROGRESS: readonly string[];
/** F02 / I01 verdict enum. Map when a verdict object is present. Do not invent a verifier. */
export const VERDICT: Readonly<{
    PASS: "pass";
    FAIL: "fail";
    NEEDS_REVIEW: "needs_review";
}>;
export const VERDICT_OUTCOMES: readonly string[];
/** From earned-work-cx.v1.json nextAction.neverImplies paymentAuthority. */
export const NEXT_ACTION: Readonly<{
    READ_TERMS: "read_terms";
    ASSENT_TERMS: "assent_terms";
    CLAIM: "claim";
    SUBMIT_ARTIFACT_METADATA: "submit_artifact_metadata";
    WAIT_VERDICT: "wait_verdict";
    WAIT_REQUESTER_ACCEPT: "wait_requester_accept";
    APPEAL: "appeal";
    ATTACH_DESTINATION: "attach_destination";
    WAIT_OWED: "wait_owed";
    DO_NOT_START_WORK: "do_not_start_work";
}>;
export const ERROR_CODES: Readonly<{
    INVALID_INPUT: "invalid_input";
    INTEGER_TERMS_VERSION: "integer_terms_version";
    DUPLICATE_SUBMISSION: "duplicate_submission";
    OVERSIZE: "oversize";
    MALFORMED_ARTIFACT: "malformed_artifact";
    PROGRESS_PAID_OR_SETTLED: "progress_paid_or_settled";
    FETCH_REF_FORBIDDEN: "fetch_ref_forbidden";
    EXECUTE_FORBIDDEN: "execute_forbidden";
    HTTP_ERROR: "http_error";
    NOT_FOUND: "not_found";
    MISSING_VERIFICATION: "missing_verification";
    FOREIGN_EVIDENCE: "foreign_evidence";
}>;
export const FORBIDDEN_PROGRESS: readonly string[];
export const EVIDENCE_CLASS: Readonly<{
    FIXTURE: "fixture";
    LOCAL_RUNTIME: "local_runtime";
    EXTERNAL: "external";
}>;
export const NULL_PAYOUT: Readonly<{
    adapter: "null_nonpaying_v0";
    transfer: null;
    paid: false;
    settled: false;
}>;
export const I01_PIN: Readonly<{
    repo: "epistemedeus/neomorphic-io";
    ref: "fable/integration-earned-work";
    sha: "346bbd3cbe6943a83b2077c455174d74b7a493ad";
    pr: 54;
    path: "services/earned-work/openapi.json";
}>;
export const F01_ORIGINAL_PIN: Readonly<{
    repo: "epistemedeus/neomorphic-io";
    ref: "fable/f01-s275-kernel";
    sha: "51d149a923978dfb7827d1b96d0b042304edd150";
    path: "services/earned-work/openapi.json";
}>;
export const F02_PIN: Readonly<{
    repo: "epistemedeus/neomorphic-io";
    ref: "fable/f02-earned-work-verification";
    sha: "fe9eb73753276c061ab6e34f3539eafb6cdaccf2";
    paths: string[];
}>;
export const CX_PIN: Readonly<{
    repo: "epistemedeus/pilot";
    ref: "codex/w4-plan-exchange-20260911";
    sha: "54cbdf443db9251993a1b9089c653a1dabe2bed6";
    path: "overview/research/cursor-wave4-20260911/planning/exchange/contracts/earned-work-cx.v1.json";
}>;
export const HONESTY_NOTES: readonly string[];
