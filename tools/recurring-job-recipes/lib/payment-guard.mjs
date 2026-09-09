/**
 * Payment authority stays outside the recipe runner.
 * A prior payment receipt never becomes an automatic replay.
 */

export function inspectPaymentAuthority(prior, operator) {
  const priorPayment = prior?.payment && typeof prior.payment === "object" ? prior.payment : {};
  const wantsReplay = Boolean(operator?.replayPayment || operator?.approvePayment || operator?.autoPay);
  const hasReceipt =
    priorPayment.attempted === true ||
    priorPayment.receiptId ||
    priorPayment.authorizationId ||
    priorPayment.charged === true;

  if (wantsReplay && hasReceipt) {
    return {
      ok: false,
      code: "payment_replay_blocked",
      attempted: false,
      replayBlocked: true,
      message:
        "prior payment or authorization evidence is present; recipes never automatically replay payment. Reconcile the unknown outcome separately.",
    };
  }

  if (wantsReplay && !hasReceipt) {
    return {
      ok: false,
      code: "payment_authority_required",
      attempted: false,
      replayBlocked: true,
      message:
        "recipes do not purchase. Use the merchant customer example with an explicit --approve and an injected wallet.",
    };
  }

  return {
    ok: true,
    attempted: false,
    replayBlocked: true,
    hasPriorReceipt: Boolean(hasReceipt),
  };
}
