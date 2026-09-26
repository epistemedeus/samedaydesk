import { PATHS, GRANT_BACKENDS, EVIDENCE_CLASS, ERROR_CODE, OUTCOME } from "../constants.mjs";
import { fail } from "../errors.mjs";
import { assertLoopbackBaseUrl, requestJson } from "../http.mjs";
import { parseClaimTermsVersion } from "../terms-version.mjs";
import { idempotencyKey } from "../hash.mjs";

/**
 * Injected earned-work HTTP adapter. Calls I01 public paths only.
 * createContributorToken matches E02 method-map: idempotency false.
 */
export function createEarnedWorkHttpAdapter({
  baseUrl,
  fetchImpl = fetch,
  evidenceClass = EVIDENCE_CLASS.LOCAL_RUNTIME,
} = {}) {
  return {
    backend: GRANT_BACKENDS.EARNED_WORK,
    evidenceClass,
    claimTarget(taskId) {
      return { origin: assertLoopbackBaseUrl(baseUrl), method: "POST", path: PATHS.claims(taskId) };
    },
    async healthz() {
      return requestJson({
        baseUrl,
        fetchImpl,
        method: "GET",
        path: PATHS.healthz,
        success: [200, 503],
      });
    },
    async createTask(body, { ownerToken, idempotencyKey: key } = {}) {
      const result = await requestJson({
        baseUrl,
        fetchImpl,
        method: "POST",
        path: PATHS.tasks,
        token: ownerToken,
        idempotencyKey: key || idempotencyKey("create"),
        body,
        success: [200, 201],
      });
      if (!result.body?.task?.id) {
        fail(ERROR_CODE.UNKNOWN_OUTCOME, "HTTP create-task success without task.id is unknown", {
          status: result.status,
          outcome: OUTCOME.UNKNOWN,
        });
      }
      return result;
    },
    async reserveFunding(taskId, { ownerToken, idempotencyKey: key } = {}) {
      return requestJson({
        baseUrl,
        fetchImpl,
        method: "POST",
        path: PATHS.reserve(taskId),
        token: ownerToken,
        idempotencyKey: key || idempotencyKey("reserve"),
        body: {},
        success: [200, 201],
      });
    },
    async getTask(taskId, { token } = {}) {
      return requestJson({
        baseUrl,
        fetchImpl,
        method: "GET",
        path: PATHS.task(taskId),
        token,
        success: [200],
      });
    },
    async issueContributorToken(body, { ownerToken, idempotencyKey: key } = {}) {
      if (key) {
        fail(
          ERROR_CODE.GRANT_IDEMPOTENCY_HEADER_FORBIDDEN,
          "POST /v1/contributor-tokens has no Idempotency-Key. Reconcile the attempt directory; do not invent a header.",
        );
      }
      const result = await requestJson({
        baseUrl,
        fetchImpl,
        method: "POST",
        path: PATHS.contributorTokens,
        token: ownerToken,
        forbidIdempotencyKey: true,
        body,
        success: [201],
      });
      if (typeof result.body?.token !== "string" || !result.body.token) {
        fail(
          ERROR_CODE.UNKNOWN_OUTCOME,
          "HTTP 201 contributor-tokens without token plaintext is unknown, not a grant",
          { status: result.status, outcome: OUTCOME.UNKNOWN },
        );
      }
      return result;
    },
    async claim(taskId, body, { contributorToken, idempotencyKey: key } = {}) {
      const termsVersion = parseClaimTermsVersion(body.termsVersion);
      const result = await requestJson({
        baseUrl,
        fetchImpl,
        method: "POST",
        path: PATHS.claims(taskId),
        token: contributorToken,
        idempotencyKey: key || idempotencyKey("claim"),
        body: { termsVersion },
        success: [200, 201],
      });
      const reservation = result.body?.reservation;
      if (!reservation || typeof reservation.id !== "string" || !reservation.status) {
        fail(
          ERROR_CODE.UNKNOWN_OUTCOME,
          "HTTP 201 with an empty or reservation-less body is unknown, not a claim",
          { status: result.status, outcome: OUTCOME.UNKNOWN },
        );
      }
      return result;
    },
  };
}
