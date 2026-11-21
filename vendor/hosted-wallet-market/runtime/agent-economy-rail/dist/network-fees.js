import { requireThat, BoundaryError } from '../../agent-economy-foundation/dist/index.js';
/** OP Stack predeploys. An endpoint that answers them is not signer authority. */
export const GAS_PRICE_ORACLE = '0x420000000000000000000000000000000000000F';
export const L1_BLOCK = '0x4200000000000000000000000000000000000015';
/**
 * Published Base mainnet activations used only as timestamp bounds.
 * Exact seconds are those printed by the cited page. A date with no second
 * stays unknown on that calendar day and is a bound only after the next UTC day.
 */
export const BASE_MAINNET_UPGRADE_BOUNDS = [
    { name: 'isthmus', at: 1746806401, exact: true, source: 'https://docs.base.org/upgrades/isthmus/overview' },
    { name: 'jovian', at: 1764691201, exact: true, source: 'https://docs.base.org/upgrades/jovian/overview' },
    { name: 'azul', at: 1779991200, exact: true, source: 'https://docs.base.org/upgrades/azul/node-upgrade' },
    { name: 'beryl', at: Date.parse('2026-06-26T00:00:00Z') / 1000, exact: false, source: 'https://docs.base.org/upgrades/overview' },
    { name: 'cobalt', at: Date.parse('2026-10-01T00:00:00Z') / 1000, exact: false, source: 'https://docs.base.org/upgrades/overview' },
];
export function resolvePublishedUpgrade(timestamp) {
    requireThat(Number.isSafeInteger(timestamp) && timestamp > 0, 'fee_upgrade_unknown');
    const sources = [
        'https://docs.base.org/specifications/transactions/network-fees',
        'https://docs.base.org/upgrades/overview',
        'https://docs.optimism.io/stack/transactions/fees',
    ];
    const berylDay = Date.parse('2026-06-25T00:00:00Z') / 1000;
    const afterBerylDay = Date.parse('2026-06-26T00:00:00Z') / 1000;
    const cobaltDay = Date.parse('2026-09-30T00:00:00Z') / 1000;
    const afterCobaltDay = Date.parse('2026-10-01T00:00:00Z') / 1000;
    const missing = [];
    if (timestamp >= Date.parse('2026-11-01T00:00:00Z') / 1000)
        missing.push('denim_mainnet_activation');
    // A calendar day with no published second cannot name the upgrade.
    if (timestamp >= cobaltDay && timestamp < afterCobaltDay) {
        missing.push('cobalt_exact_activation_timestamp');
        return { upgrade: 'unknown', missing, sources };
    }
    if (timestamp >= berylDay && timestamp < afterBerylDay) {
        missing.push('beryl_exact_activation_timestamp');
        return { upgrade: 'unknown', missing, sources };
    }
    let upgrade = 'unknown';
    for (const bound of BASE_MAINNET_UPGRADE_BOUNDS)
        if (timestamp >= bound.at)
            upgrade = bound.name;
    if (upgrade === 'unknown')
        missing.push('upgrade_before_isthmus_not_resolved');
    if (upgrade === 'beryl')
        missing.push('beryl_exact_activation_timestamp');
    if (upgrade === 'cobalt')
        missing.push('cobalt_exact_activation_timestamp');
    return { upgrade, missing, sources };
}
/** Isthmus: constant + gas * scalar / 1e6. Jovian: constant + gas * scalar * 100. */
export function operatorWorst(gas, scalar, constant, formula) {
    if (formula === 'isthmus')
        return constant + (gas * scalar) / 1000000n;
    if (formula === 'jovian')
        return constant + gas * scalar * 100n;
    if (formula === 'pre-isthmus')
        return 0n;
    return null;
}
/** Compare observed getOperatorFee samples with the published formulas. Do not assume the fork. */
export function matchOperatorFormula(scalar, constant, samples) {
    requireThat(samples.length > 0, 'fee_upgrade_unknown');
    const isthmus = (gas) => constant + (gas * scalar) / 1000000n;
    const jovian = (gas) => constant + gas * scalar * 100n;
    const isIsthmus = samples.every(sample => sample.fee === isthmus(sample.gas));
    const isJovian = samples.every(sample => sample.fee === jovian(sample.gas));
    if (isIsthmus && isJovian)
        return 'undistinguished';
    if (isJovian)
        return 'jovian';
    if (isIsthmus)
        return 'isthmus';
    if (samples.every(sample => sample.fee === 0n))
        return 'pre-isthmus';
    return 'unknown';
}
export function assessFees(input) {
    const { limits, quote } = input;
    requireThat(limits.gasLimit > 0n && limits.maxFeePerGas >= 0n && limits.maxPriorityFeePerGas >= 0n, 'fee_limit');
    if (input.estimatedGas > limits.gasLimit)
        throw new BoundaryError('fee_limit_exceeded');
    if (quote.baseFee > limits.maxFeePerGas)
        throw new BoundaryError('fee_limit_exceeded');
    const priority = quote.suggestedPriority < limits.maxPriorityFeePerGas ? quote.suggestedPriority : limits.maxPriorityFeePerGas;
    if (quote.baseFee + priority > limits.maxFeePerGas)
        throw new BoundaryError('fee_limit_exceeded');
    const executionWorst = limits.gasLimit * limits.maxFeePerGas;
    const operator = quote.operatorFeeAtGasLimit ?? operatorWorst(limits.gasLimit, quote.operatorFeeScalar ?? 0n, quote.operatorFeeConstant ?? 0n, quote.operatorFormula);
    const l1 = quote.l1FeeUpperBound ?? quote.l1Fee;
    const allIn = operator !== null && l1 !== null ? executionWorst + operator + l1 : null;
    if (input.nativeRemaining !== undefined) {
        if (allIn === null)
            throw new BoundaryError('fee_estimate_unknown');
        if (allIn > input.nativeRemaining)
            throw new BoundaryError('native_budget_exhausted');
    }
    return {
        source: quote.source,
        block: quote.block,
        upgrade: quote.upgrade,
        executionWorst: executionWorst.toString(),
        operatorWorst: operator === null ? null : operator.toString(),
        l1Estimate: quote.l1Fee === null ? null : quote.l1Fee.toString(),
        l1UpperBound: quote.l1FeeUpperBound === null ? null : quote.l1FeeUpperBound.toString(),
        l1Status: 'estimate',
        l1Cap: 'not-enforceable',
        residual: 'unknown',
        allInEstimate: allIn === null ? null : allIn.toString(),
    };
}
export function holdNative(row, intentId, hold) {
    requireThat(!row.holds[intentId], 'native_hold_exists');
    const remaining = BigInt(row.remaining);
    if (hold > remaining)
        throw new BoundaryError('native_budget_exhausted');
    return { ...row, remaining: (remaining - hold).toString(), holds: { ...row.holds, [intentId]: hold.toString() }, unknown: [...row.unknown] };
}
/** Replace a worst-case hold with the observed fee. An unknown actual keeps the hold. L1 drift is never a cap. */
export function reconcileNative(row, intentId, actual) {
    const held = row.holds[intentId];
    requireThat(held !== undefined, 'native_hold_absent');
    if (actual === null) {
        const unknown = row.unknown.includes(intentId) ? row.unknown : [...row.unknown, intentId];
        return { row: { ...row, unknown }, l1Drift: 'unknown' };
    }
    const hold = BigInt(held);
    const holds = { ...row.holds };
    delete holds[intentId];
    const unknown = row.unknown.filter(id => id !== intentId);
    let remaining = BigInt(row.remaining);
    let spent = BigInt(row.spent);
    if (actual >= hold) {
        const extra = actual - hold;
        remaining = extra > remaining ? 0n : remaining - extra;
        spent += actual;
    }
    else {
        remaining += hold - actual;
        spent += actual;
    }
    return { row: { remaining: remaining.toString(), spent: spent.toString(), holds, unknown }, l1Drift: 'unknown' };
}
