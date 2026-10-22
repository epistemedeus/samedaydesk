/**
 * Contribution evidence is the submitted artifact digest (I01 submission),
 * an explicit contribution digest if present, or a caller boundArtifact overlay.
 * Lifecycle labels are not contribution evidence.
 */
export function contributionDigest(task: any, bound: any): string | null;
export function verdictFromTask(task: any): any;
/** Known cross-record contradictions are unsafe even before a verdict exists. */
export function hasForeignIdentity(task: any): boolean;
/** Bind every E01 verdict identity before interpreting any outcome. */
export function bindVerification(task: any, bound: any): {
    status: string;
    contributionDigest?: undefined;
    verdictDigest?: undefined;
    outcome?: undefined;
    digest?: undefined;
} | {
    status: string;
    contributionDigest: string | null;
    verdictDigest: string | null;
    outcome: any;
    digest?: undefined;
} | {
    status: any;
    digest: string | null;
    contributionDigest?: undefined;
    verdictDigest?: undefined;
    outcome?: undefined;
};
