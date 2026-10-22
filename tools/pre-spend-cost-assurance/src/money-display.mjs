/**
 * Display helper for the journey cap string.
 * B04 atomicToDecimal(15000n, 6) → "0.015000"; journey requires "0.015".
 */
export function stripTrailingZeros(decimal) {
  if (typeof decimal !== "string" || !decimal.includes(".")) return decimal;
  const [whole, frac = ""] = decimal.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole;
}

export function atomicToCapString(atomicToDecimal, atomic, decimals) {
  return stripTrailingZeros(atomicToDecimal(atomic, decimals));
}
