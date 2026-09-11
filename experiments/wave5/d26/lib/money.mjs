import { ERROR_CODES, STRIPE_CENT_DECIMALS, USDC_DECIMALS } from "./pins.mjs";
import { throwRefuse } from "./refuse.mjs";

export function ceilDiv(n, d) {
  if (d === 0n) throwRefuse(ERROR_CODES.INVALID_DECIMAL, "division by zero");
  if (n < 0n || d < 0n) throwRefuse(ERROR_CODES.INVALID_DECIMAL, "negative division");
  return (n + d - 1n) / d;
}

export function parseDecimal(text, decimals) {
  if (typeof text !== "string" || !/^\d+(\.\d+)?$/.test(text)) {
    throwRefuse(ERROR_CODES.INVALID_DECIMAL, `expected non-negative decimal string, got ${String(text)}`);
  }
  const [whole, frac = ""] = text.split(".");
  if (frac.length > decimals) {
    throwRefuse(
      ERROR_CODES.EXCESS_PRECISION,
      `more than ${decimals} fractional digits in ${text}`,
    );
  }
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function formatDecimal(atomic, decimals) {
  const scale = 10n ** BigInt(decimals);
  const neg = atomic < 0n;
  const n = neg ? -atomic : atomic;
  const whole = n / scale;
  const frac = (n % scale).toString().padStart(decimals, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

export function usdcAtomic(text) {
  return { unit: "usdc-atomic", value: parseDecimal(text, USDC_DECIMALS) };
}

export function usdCents(text) {
  return { unit: "usd-cents", value: parseDecimal(text, STRIPE_CENT_DECIMALS) };
}

export function formatUsdc(atomic) {
  return formatDecimal(atomic, USDC_DECIMALS);
}

/**
 * USDC atomic (6dp) and Stripe cents (2dp) stay distinct units.
 * Conversion requires an explicit peg object. Hashing them together is refused.
 */
export function assertDistinctUnits(a, b) {
  if (a?.unit && b?.unit && a.unit !== b.unit) {
    return true;
  }
  return a?.unit === b?.unit;
}

export function refuseForcedUnitEquality(a, b) {
  if (a?.unit && b?.unit && a.unit !== b.unit) {
    throwRefuse(
      ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL,
      `cannot treat ${a.unit} as equal to ${b.unit}`,
      { left: a, right: b },
    );
  }
}

export function centsToUsdcAtomic(centsAmount, peg) {
  if (!peg || peg.id !== "usd-usdc-1-1-assumed") {
    throwRefuse(ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL, "USD cents need an explicit USD/USDC peg");
  }
  if (centsAmount.unit !== "usd-cents") {
    throwRefuse(ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL, "centsToUsdcAtomic requires usd-cents");
  }
  return { unit: "usdc-atomic", value: centsAmount.value * 10n ** BigInt(USDC_DECIMALS - STRIPE_CENT_DECIMALS) };
}
