import { atomic, immutable, requireThat } from '../../agent-economy-foundation/dist/index.js';
export const PER_CAPTURE_FLOOR_500 = immutable({ id: 'per_capture_floor_500', bps: 500, rounding: 'per_capture_floor', denominator: 10000 });
/** Qualification profile. F1 currently permits only one full capture in its quote schema. */
export function capturePlan(amounts) {
    requireThat(amounts.length > 0, 'empty_capture_plan');
    const legs = amounts.map(amount => {
        const gross = atomic(amount);
        requireThat(gross > 0n && gross < 2n ** 120n, 'capture_amount');
        const fee = gross * 500n / 10000n;
        return { amount, feeAmount: fee.toString(), net: (gross - fee).toString() };
    });
    const gross = legs.reduce((n, l) => n + BigInt(l.amount), 0n), fee = legs.reduce((n, l) => n + BigInt(l.feeAmount), 0n);
    return immutable({ profile: PER_CAPTURE_FLOOR_500, legs, gross: gross.toString(), feeAmount: fee.toString(), net: (gross - fee).toString(), cumulativeFloorDelta: (gross * 500n / 10000n - fee).toString() });
}
