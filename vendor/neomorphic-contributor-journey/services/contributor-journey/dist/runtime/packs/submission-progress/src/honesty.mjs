import { ERROR_CODES, FORBIDDEN_PROGRESS, NULL_PAYOUT } from "./constants.mjs";
import { ProgressError } from "./errors.mjs";

export function assertNotPaidOrSettled(input, document) {
  if (input == null || typeof input !== "object") return;
  const paid = input.paid === true || input.payoutPaid === true;
  const settled = input.settled === true || input.payoutSettled === true;
  const progress = input.progress;
  if (paid || settled || FORBIDDEN_PROGRESS.includes(progress)) {
    throw new ProgressError(
      ERROR_CODES.PROGRESS_PAID_OR_SETTLED,
      "progress is not paid and not settled; this prototype never projects paid or settled",
      { document },
    );
  }
}

export function assertNoExecute(options = {}) {
  if (options.execute === true || options.fetchAndExecute === true) {
    throw new ProgressError(
      ERROR_CODES.EXECUTE_FORBIDDEN,
      "submission-progress never executes artifacts",
    );
  }
}

export function freezeHonesty({ evidenceClass, fetchRef = false }) {
  return Object.freeze({
    progressIsNotReputation: true,
    progressIsNotPayout: true,
    executeArtifact: false,
    fetchRef: fetchRef === true ? true : false,
    lifecycleDoesNotVerify: true,
    nonpayingPrototype: true,
    adapter: NULL_PAYOUT.adapter,
    transfer: null,
    paid: false,
    settled: false,
    evidenceClass,
  });
}

export function forceNonpaying(fields = {}) {
  return {
    ...fields,
    paid: false,
    settled: false,
    transfer: null,
  };
}
