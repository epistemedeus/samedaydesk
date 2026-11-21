import type { EarnedWorkStore } from "../../earned-work/src/store/types.js";
import type { ClaimPrincipalPort, WorkBindingPort, WorkEvidence, WorkEvidencePort } from "./types.js";
import type { ShowcaseSqlPool } from "./postgres.js";
/** An adapter over the existing kernel, with a separately resolved private principal directory. */
export declare function createEarnedWorkEvidencePort(deps: {
    kernel: Pick<EarnedWorkStore, "getTask">;
    bindings: WorkBindingPort;
    claims: ClaimPrincipalPort;
}): WorkEvidencePort;
/** Read-only FK adapter for the existing earned-work tables, with the existing schema validator. */
export declare function createPostgresClaimPrincipalPort(pool: Pick<ShowcaseSqlPool, "query">, schema?: string): ClaimPrincipalPort;
/** Validate at the receiving boundary, even if an adapter is typed. No payout/paid flags qualify work. */
export declare function acceptedWorkValid(value: unknown, requestedWorkId: string): value is WorkEvidence;
