import { CODE } from "./constants.mjs";

export class DeskError extends Error {
  /**
   * @param {object} input
   * @param {string} input.code
   * @param {string} input.message
   * @param {number} [input.status]
   * @param {boolean} [input.rejected]
   * @param {boolean} [input.killed]
   * @param {object} [input.details]
   */
  constructor({ code, message, status = 400, rejected = false, killed = false, details = null } = {}) {
    super(message || code || "contributor desk error");
    this.name = "DeskError";
    this.code = code || CODE.INVALID_INPUT;
    this.status = status;
    this.rejected = rejected === true;
    this.killed = killed === true;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      rejected: this.rejected,
      killed: this.killed,
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }
}

export function deskHoldsSecretError(details) {
  return new DeskError({
    code: CODE.DESK_HOLDS_EARNED_WORK_SECRET,
    message:
      "Contributor desk refuses to start while holding an EARNED_WORK secret. Owner tokens and payout credentials stay off this process.",
    status: 403,
    rejected: true,
    killed: false,
    details,
  });
}

export function contributorHoldsPayoutKeyError(details) {
  return new DeskError({
    code: CODE.CONTRIBUTOR_HOLDS_PAYOUT_KEY,
    message:
      "Kill: a contributor session holds payout-key material. The desk will not continue. Late address is an allowlisted destination, not a signing key.",
    status: 403,
    rejected: false,
    killed: true,
    details,
  });
}
