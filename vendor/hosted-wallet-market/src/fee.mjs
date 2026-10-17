export const ROUNDING_PROFILE = 'commerce-payments-v1.1.0-single-capture';
export const FEE_BPS = 500;

export function atomic(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value)) {
    throw Object.assign(new Error('atomic_refused'), {codeName: 'atomic_refused'});
  }
  return BigInt(value);
}

export function feePerCapture(amount) {
  return (atomic(amount) * BigInt(FEE_BPS) / 10000n).toString();
}

export function quoteEconomics({gross, railCost, captures}) {
  const grossA = atomic(gross);
  const railA = atomic(railCost);
  if (grossA <= 0n) throw Object.assign(new Error('gross_refused'), {codeName: 'gross_refused'});
  const parts = captures?.length ? captures : [gross];
  if (parts.length !== 1) throw Object.assign(new Error('unsupported_partial_capture'), {codeName: 'unsupported_partial_capture'});
  let sum = 0n;
  let fee = 0n;
  const rows = parts.map(amount => {
    const part = atomic(amount);
    if (part <= 0n) throw Object.assign(new Error('capture_refused'), {codeName: 'capture_refused'});
    sum += part;
    const partFee = atomic(feePerCapture(amount));
    fee += partFee;
    return {amountAtomic: part.toString(), feeAtomic: partFee.toString()};
  });
  if (sum !== grossA) throw Object.assign(new Error('captures_must_sum_to_gross'), {codeName: 'captures_must_sum_to_gross'});
  if (railA > grossA - fee) throw Object.assign(new Error('rail_exceeds_net'), {codeName: 'rail_exceeds_net'});
  const net = grossA - fee - railA;
  return {
    roundingProfile: ROUNDING_PROFILE,
    feeBps: FEE_BPS,
    feeBasis: 'new_job_gross',
    grossAtomic: grossA.toString(),
    railCostAtomic: railA.toString(),
    captures: rows,
    platformFeeAtomic: fee.toString(),
    contributorNetAtomic: net.toString(),
    exactFivePercentAtEveryAtomicAmount: false,
    thisQuoteFeeIsExactFivePercent: fee * 10000n === grossA * BigInt(FEE_BPS),
  };
}
