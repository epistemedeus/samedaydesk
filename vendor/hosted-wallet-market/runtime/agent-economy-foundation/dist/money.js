import { checkedQuote, requireThat, immutable } from './contracts.js';
import { PRODUCTION_ASSETS } from './assets.js';
export { BASE_USDC, PRODUCTION_ASSETS } from './assets.js';
export function atomic(v) {
    requireThat(typeof v === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(v), 'invalid_atomic');
    return BigInt(v);
}
export function usdc(v) {
    requireThat(typeof v === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(v), 'invalid_decimal');
    const [whole, fraction = ''] = v.split('.');
    return atomic((BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString()).toString();
}
export function decimal(v) {
    const n = atomic(v);
    return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`;
}
export function assetDecimal(v, decimals) {
    requireThat(Number.isInteger(decimals) && decimals >= 0 && decimals <= 36, 'asset_decimals');
    const n = atomic(v), scale = 10n ** BigInt(decimals);
    return decimals === 0 ? n.toString() : `${n / scale}.${(n % scale).toString().padStart(decimals, '0')}`;
}
export function assetAtomic(v, decimals) {
    requireThat(Number.isInteger(decimals) && decimals >= 0 && decimals <= 36, 'asset_decimals');
    requireThat(typeof v === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(v), 'invalid_decimal');
    const [whole, fraction = ''] = v.split('.');
    requireThat(fraction.length <= decimals, 'invalid_decimal');
    return atomic((BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')).toString()).toString();
}
export function feeAt(gross, bps = 500) {
    requireThat(bps === 500, 'fee_policy');
    return (atomic(gross) * BigInt(bps) / 10000n).toString();
}
/** Cumulative accepted gross included in settlement. Explicit costs are bounded by the frozen quote. */
export function allocate(q, cumulativeGross, railCost) {
    checkedQuote(q);
    const g = atomic(cumulativeGross), cost = atomic(railCost);
    if (q.schemaVersion === 'pilot.agent-economy.v2' && q.fee.profile.mode === 'single_capture') {
        requireThat(g === 0n || cumulativeGross === q.gross, 'unsupported_partial_capture');
    }
    requireThat(g <= atomic(q.gross), 'gross_exceeds_quote');
    requireThat(cost <= atomic(q.rail.costCap), 'cost_exceeds_quote');
    requireThat(g !== 0n || cost === 0n || q.rail.mode === 'platform_subsidy', 'unaccepted_cost');
    const fee = atomic(feeAt(cumulativeGross, q.fee.bps));
    const subsidy = q.rail.mode === 'platform_subsidy' ? cost : 0n;
    const net = g - fee - cost + subsidy;
    requireThat(net >= 0n, 'cost_exceeds_net');
    const result = { gross: g.toString(), contributorNet: net.toString(), platformFee: fee.toString(),
        railCost: cost.toString(), subsidy: subsidy.toString(), refund: (atomic(q.gross) - g).toString(),
        platformMargin: (fee - subsidy).toString() };
    assertConservation(result);
    return result;
}
export function assertConservation(a) {
    requireThat(atomic(a.gross) + atomic(a.subsidy) === atomic(a.contributorNet) + atomic(a.platformFee) + atomic(a.railCost), 'money_not_conserved');
}
/** Signed reversal deltas are recovery proposals, never permission to claw back an earned debt. */
export function settlementDelta(q, before, after) {
    const a = allocate(q, before.gross, before.railCost), b = allocate(q, after.gross, after.railCost);
    const delta = Object.fromEntries(Object.keys(a).map(k => [k, (BigInt(b[k]) - BigInt(a[k])).toString()]));
    requireThat(BigInt(delta.gross) + BigInt(delta.subsidy) === BigInt(delta.contributorNet) + BigInt(delta.platformFee) + BigInt(delta.railCost), 'delta_not_conserved');
    return { ...delta, requiresRecovery: BigInt(delta.contributorNet) < 0n || BigInt(delta.platformFee) < 0n };
}
export function freezeQuote(value, assets = PRODUCTION_ASSETS) {
    const q = checkedQuote(value);
    assets.registration(q.asset);
    requireThat(q.requesterId !== q.contributorId && q.evaluatorId !== q.contributorId, 'actor_conflict');
    requireThat(q.fundingAuthorityId !== q.settlementAuthorityId, 'authority_conflation');
    requireThat(atomic(q.gross) > 0n, 'zero_quote');
    if (q.schemaVersion === 'pilot.agent-economy.v2' && q.fee.profile.mode === 'single_capture') {
        requireThat(q.rail.mode === 'platform_subsidy' || q.rail.costCap === '0', 'unsupported_capture_cost_deduction');
        requireThat(atomic(q.gross) < 2n ** 120n, 'commerce_amount_overflow');
    }
    const total = allocate(q, q.gross, q.rail.costCap);
    requireThat(q.contributorNet === total.contributorNet && q.platformFee === total.platformFee && q.subsidy === total.subsidy, 'quote_totals');
    return immutable(q);
}
/** Variable cost only; fixed costs/profit remain outside this lower bound. */
export function breakEvenGross(cost) { return (atomic(cost) * 20n).toString(); }
