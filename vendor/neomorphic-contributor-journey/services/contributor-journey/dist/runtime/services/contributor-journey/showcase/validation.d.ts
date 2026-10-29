import type { ApprovedSummary, ConsentOperation, ConsentRecord, ProfilePublication, WorkBinding, WorkEvidence, WorkIdentity } from "./types.js";
export declare const digestText: (value: string) => string;
export declare const isRecord: (value: unknown) => value is Record<string, unknown>;
export declare const privateId: (value: unknown) => value is string;
export declare const publicId: (value: unknown) => value is string;
export declare const sha256: (value: unknown) => value is string;
export declare const nonnegative: (value: unknown) => value is number;
export declare const timestamp: (value: unknown) => value is string;
export declare function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown>;
export declare const identityKeys: readonly ["workId", "taskId", "reservationId", "submissionId", "obligationId", "verdictId", "termsVersion", "artifactDigestSha256"];
export declare function sameIdentity(a: WorkIdentity, b: WorkIdentity): boolean;
export declare function identityValid(value: unknown): value is WorkIdentity & Record<string, unknown>;
export declare function bindingValid(value: unknown): value is WorkBinding;
/** Plain, bounded publication text only; no link can expose an underlying transaction or offer amount. */
export declare function publicationText(value: unknown, max: number, forbidden?: string[]): value is string;
export declare function privatePublicationTokens(work: WorkEvidence): string[];
/** Exact private evidence strings cannot become an unedited public excerpt.
 * This is scoped to the accepted work; it does not inspect other holders or
 * change the independent alias policy. Rights-cleared summaries use new copy. */
export declare function privateEvidenceTokens(work: WorkEvidence): string[];
/** Approval binds the exact immutable artifact and obligation, not just the display name or task. */
export declare function summaryValid(value: unknown, work: WorkEvidence): value is ApprovedSummary;
export declare function profileValid(value: unknown, work: WorkEvidence): value is ProfilePublication;
/** Consent covers exact copy, approval, alias, profile visibility version and work lineage. */
export declare function summaryDigest(summary: ApprovedSummary, profile: ProfilePublication): string;
export declare function consentRecordValid(value: unknown): value is ConsentRecord;
export declare function operationValid(value: unknown): value is ConsentOperation;
