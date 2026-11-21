export function unwrapTask(taskJson: any): any;
/**
 * Map F01/I01 task JSON (GET /v1/tasks/{id} envelope or task object) into a
 * resume-friendly CX progress document. Does not execute artifacts, fetch refs,
 * or invent a verifier.
 *
 * @param {object} taskJson
 * @param {{
 *   boundArtifact?: object,
 *   inFlight?: "submitting",
 *   attempt?: { kind: "submit", artifact: object, reservationId?: string },
 *   previous?: object,
 *   fetchRef?: boolean,
 *   execute?: boolean,
 *   paid?: boolean,
 *   settled?: boolean,
 *   evidenceClass?: string,
 * }} [options]
 */
export function projectProgress(taskJson: object, options?: {
    boundArtifact?: object;
    inFlight?: "submitting";
    attempt?: {
        kind: "submit";
        artifact: object;
        reservationId?: string;
    };
    previous?: object;
    fetchRef?: boolean;
    execute?: boolean;
    paid?: boolean;
    settled?: boolean;
    evidenceClass?: string;
}): {
    paid: boolean;
    settled: boolean;
    transfer: null;
};
/**
 * Apply a kernel HTTP error without treating it as a new progress step.
 * @param {object | null} document
 * @param {{ code: string, message?: string, status?: number }} error
 */
export function applyKernelError(document: object | null, error: {
    code: string;
    message?: string;
    status?: number;
}): {
    paid: boolean;
    settled: boolean;
    transfer: null;
};
