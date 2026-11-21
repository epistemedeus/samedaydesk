import { OFFER_ID, REWARD, REWARD_ATOMIC } from "./constants.mjs";

/** Native Base USDC. Same contract the canonical receipt reader binds. */
export const NATIVE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const HEX64 = /^[0-9a-f]{64}$/;
const TX = /^0x[0-9a-f]{64}$/;

/**
 * A paid row is an obligation whose stored settlement is one successful
 * canonical receipt. A verified flag without that binding is not paid.
 */
export function isObservedPaid(row) {
  if (!row || row.paid !== true || row.state !== "paid" || row.payoutState !== "paid" || row.settled !== true) return false;
  if (row.kernel?.paid === true || row.kernel?.settled === true || row.kernel?.transfer != null) return false;
  if (row.reward !== REWARD || row.rewardAtomic !== REWARD_ATOMIC.toString()) return false;
  const settlement = row.settlement;
  if (!settlement || settlement.chainObserved !== true || settlement.verified !== true || settlement.paid !== true) return false;
  if (settlement.kind !== "verified" || settlement.partial === true || settlement.addressesIncluded !== false) return false;
  if (settlement.reason !== "public_receipt_matches_obligation") return false;
  if (typeof settlement.transactionHash !== "string" || !TX.test(settlement.transactionHash)) return false;
  if (settlement.network !== "base" || settlement.asset !== "USDC") return false;
  if (typeof settlement.tokenContract !== "string" || settlement.tokenContract.toLowerCase() !== NATIVE_USDC) return false;
  if (settlement.amount !== REWARD || settlement.amountAtomic !== REWARD_ATOMIC.toString()) return false;
  if (settlement.obligationId !== row.obligationId || settlement.reservationId !== row.reservationId) return false;
  if (settlement.taskId !== OFFER_ID) return false;
  if (!HEX64.test(settlement.sourceSha256 ?? "") || !HEX64.test(settlement.destinationSha256 ?? "")) return false;
  if (!Number.isSafeInteger(settlement.blockNumber) || settlement.blockNumber < 0) return false;
  if (typeof settlement.timestamp !== "string" || Number.isNaN(Date.parse(settlement.timestamp))) return false;
  return true;
}

/** Spend is the sum of distinct observed receipts. A repeated hash does not count twice. */
export function observedSpentAtomic(obligations) {
  const rows = Array.isArray(obligations) ? obligations : Object.values(obligations ?? {});
  const seen = new Set();
  let spent = 0n;
  for (const row of rows) {
    if (!isObservedPaid(row)) continue;
    const tx = row.settlement.transactionHash.toLowerCase();
    if (seen.has(tx)) return { ok: false, reason: "duplicate_receipt", spent: 0n, count: seen.size };
    seen.add(tx);
    spent += BigInt(row.rewardAtomic);
  }
  return { ok: true, spent, count: seen.size };
}
