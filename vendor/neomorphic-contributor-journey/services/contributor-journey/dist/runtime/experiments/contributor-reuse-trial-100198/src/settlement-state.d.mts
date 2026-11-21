/**
 * A paid row is an obligation whose stored settlement is one successful
 * canonical receipt. A verified flag without that binding is not paid.
 */
export function isObservedPaid(row: any): boolean;
/** Spend is the sum of distinct observed receipts. A repeated hash does not count twice. */
export function observedSpentAtomic(obligations: any): {
    ok: boolean;
    reason: string;
    spent: bigint;
    count: number;
} | {
    ok: boolean;
    spent: bigint;
    count: number;
    reason?: undefined;
};
/** Native Base USDC. Same contract the canonical receipt reader binds. */
export const NATIVE_USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
