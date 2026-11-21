/**
 * Injected GET adapter for GET /v1/tasks/{id} only.
 * Refuses artifact.ref and any other URL. Does not execute artifacts.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   baseUrl: string,
 *   bearer?: string | null,
 *   artifactRefs?: string[],
 * }} options
 */
export function createTaskPollAdapter(options: {
    fetchImpl?: typeof fetch;
    baseUrl: string;
    bearer?: string | null;
    artifactRefs?: string[];
}): {
    (url: any, init?: {}): Promise<Response>;
    calls: any[];
    forbidRef(ref: any): void;
};
export function assertFetchRefForbidden(options?: {}): void;
