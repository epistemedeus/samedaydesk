/**
 * Apply receipts. This is the client's record of which accepted records it has
 * applied downstream (the external effect), keyed by the journey idempotency key
 * (the job-contract request digest) plus the record key. It is not an acceptance
 * store: acceptance and its replay stay with the Useful Commerce effect projection
 * keyed by the same request digest. Receipts only stop the client from applying
 * the same accepted record twice and keep the termsVersion it was accepted under.
 */
export const RECEIPT_KIND = "samedaydesk.workflow-kits-n12-changed-period.apply-receipt.v1";

export function ledgerKeyOf(idempotencyKey, recordKey) {
  return `${idempotencyKey}:${recordKey}`;
}

export function createApplyReceipts() {
  const byKey = new Map();
  const byPeriodRecord = new Map();
  let effects = 0;
  return {
    get(ledgerKey) {
      return byKey.get(ledgerKey) ?? null;
    },
    forPeriodRecord(periodId, recordKey) {
      return byPeriodRecord.get(`${periodId}\u0000${recordKey}`) ?? null;
    },
    /** Write once. Returns { applied, receipt }; a second write for the same key applies nothing. */
    apply(draft) {
      const existing = byKey.get(draft.ledgerKey);
      if (existing) return { applied: false, receipt: existing };
      const receipt = Object.freeze({ kind: RECEIPT_KIND, ...draft, applyCount: 1 });
      byKey.set(draft.ledgerKey, receipt);
      byPeriodRecord.set(`${draft.periodId}\u0000${draft.recordKey}`, receipt);
      effects += 1;
      return { applied: true, receipt };
    },
    effects() {
      return effects;
    },
    snapshot() {
      return [...byKey.values()].sort((a, b) => (a.periodId === b.periodId ? a.recordKey.localeCompare(b.recordKey) : a.periodId.localeCompare(b.periodId)));
    },
  };
}
