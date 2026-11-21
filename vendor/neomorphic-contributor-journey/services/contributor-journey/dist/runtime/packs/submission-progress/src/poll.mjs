import { ERROR_CODES } from "./constants.mjs";
import { ProgressError } from "./errors.mjs";
import { createTaskPollAdapter, assertFetchRefForbidden } from "./http.mjs";
import { applyKernelError, projectProgress } from "./project.mjs";

/**
 * Poll GET /v1/tasks/{id} through an injected adapter and project progress.
 * Never fetches artifact.ref.
 */
export async function pollTaskProgress(options) {
  assertFetchRefForbidden(options);
  const { baseUrl, taskId } = options;
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new ProgressError(ERROR_CODES.INVALID_INPUT, "taskId is required");
  }
  const artifactRefs = [];
  if (options.boundArtifact?.ref) artifactRefs.push(options.boundArtifact.ref);
  const adapter =
    options.adapter ??
    createTaskPollAdapter({
      fetchImpl: options.fetchImpl,
      baseUrl,
      bearer: options.bearer ?? null,
      artifactRefs,
    });
  if (options.boundArtifact?.ref && adapter.forbidRef) adapter.forbidRef(options.boundArtifact.ref);

  const url = new URL(`/v1/tasks/${encodeURIComponent(taskId.trim())}`, baseUrl);
  const response = await adapter(url.href, { method: "GET", signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProgressError(ERROR_CODES.INVALID_INPUT, "GET /v1/tasks/{id} did not return JSON", {
        status: response.status,
      });
    }
  }
  if (response.status === 404) {
    throw new ProgressError(ERROR_CODES.NOT_FOUND, "task not found", { status: 404 });
  }
  if (!response.ok) {
    const code = body?.error?.code;
    if (code) return applyKernelError(options.previous ?? null, { code, message: body.error.message, status: response.status });
    throw new ProgressError(ERROR_CODES.HTTP_ERROR, `GET /v1/tasks/{id} status ${response.status}`, {
      status: response.status,
    });
  }
  return projectProgress(body, {
    boundArtifact: options.boundArtifact,
    inFlight: options.inFlight,
    previous: options.previous,
    evidenceClass: options.evidenceClass ?? "local_runtime",
  });
}
