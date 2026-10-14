// Per-capture floor. Non-negative atoms only, so BigInt division matches floor.
// A sum of per-capture fees is not the fee of the summed gross.

const ATOM = /^(0|[1-9][0-9]*)$/;

export function parseAtoms(value) {
  if (typeof value === "bigint") {
    if (value < 0n) return { ok: false, code: "negative_atoms" };
    return { ok: true, value };
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return { ok: false, code: "unsafe_integer" };
    return { ok: true, value: BigInt(value) };
  }
  if (typeof value === "string" && ATOM.test(value)) return { ok: true, value: BigInt(value) };
  return { ok: false, code: "invalid_atoms" };
}

export function feeAtoms(gross) {
  return (gross * 500n) / 10000n;
}

export function quoteCaptures(captures) {
  const fees = captures.map((gross) => feeAtoms(gross));
  const feeSum = fees.reduce((sum, fee) => sum + fee, 0n);
  const grossSum = captures.reduce((sum, gross) => sum + gross, 0n);
  const combinedFee = feeAtoms(grossSum);
  return {
    perCaptureFeeAtoms: fees.map(String),
    perCaptureNetAtoms: captures.map((gross, index) => String(gross - fees[index])),
    feeAtoms: String(feeSum),
    combinedGrossAtoms: String(grossSum),
    combinedGrossFeeAtoms: String(combinedFee),
    perCaptureDiffersFromCombined: feeSum !== combinedFee,
  };
}
