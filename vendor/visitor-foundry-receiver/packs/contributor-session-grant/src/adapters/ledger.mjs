import { PATHS, GRANT_BACKENDS, ERROR_CODE, EVIDENCE_CLASS } from "../constants.mjs";
import { fail } from "../errors.mjs";
import { requestJson } from "../http.mjs";

/**
 * F04 ledger grant adapter. Later integration binding.
 * A ledger contributor grant is not an earned-work claim credential.
 */
export function createLedgerHttpAdapter({
  baseUrl,
  fetchImpl = fetch,
  evidenceClass = EVIDENCE_CLASS.FIXTURE,
} = {}) {
  return {
    backend: GRANT_BACKENDS.LEDGER,
    evidenceClass,
    async issueContributorGrant(body, { adminToken } = {}) {
      if (!body?.contributorPublicId) {
        fail(ERROR_CODE.INVALID_INPUT, "contributorPublicId is required for contributor grants");
      }
      return requestJson({
        baseUrl,
        fetchImpl,
        method: "POST",
        path: PATHS.ledgerGrants,
        token: adminToken,
        forbidIdempotencyKey: true,
        body: {
          role: "contributor",
          contributorPublicId: body.contributorPublicId,
          expiresAt: body.expiresAt,
        },
        success: [201],
      });
    },
    claim() {
      fail(
        ERROR_CODE.LEDGER_GRANT_NOT_EARNED_WORK_CLAIM,
        "F04 /v1/grants role=contributor is a ledger grant, not an earned-work claim token",
      );
    },
  };
}
