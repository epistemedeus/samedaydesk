/**
 * Decimal-string USDC (six decimals). Atomic 5000 is 0.005 USDC.
 * JS numbers, exponent notation, NaN, and Infinity are refused.
 */
import { ERROR_CODES, USDC_DECIMALS } from "./constants.mjs";

const INTEGER_STRING = /^(0|[1-9]\d*)$/;
const DECIMAL_STRING = /^(0|[1-9]\d*)(\.\d{1,6})?$/;

export const MONEY_KEYS = new Set([
  "amount",
  "amountAtomic",
  "unitPrice",
  "price",
  "rate",
  "value",
  "total",
  "delta",
  "impact",
  "cap",
]);

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function moneyError(code, message, path) {
  const err = new Error(message);
  err.code = code;
  err.path = path;
  return err;
}

export function isIntegerString(value) {
  return typeof value === "string" && INTEGER_STRING.test(value);
}

export function parseAtomicString(value, path) {
  if (typeof value === "number") {
    throw moneyError(
      ERROR_CODES.FLOAT_MONEY,
      `${path} must be an integer string, not a JS number`,
      path,
    );
  }
  if (!isIntegerString(value)) {
    throw moneyError(
      ERROR_CODES.NONCANONICAL_MONEY,
      `${path} must be a non-negative integer string`,
      path,
    );
  }
  return BigInt(value);
}

/**
 * Parse a USDC decimal string into atomic units.
 * "0.005" and "0.005000" both become 5000n.
 */
export function parseUsdcDecimal(value, path) {
  if (typeof value === "number") {
    throw moneyError(
      ERROR_CODES.FLOAT_MONEY,
      `${path} must be a decimal string, not a JS number`,
      path,
    );
  }
  if (typeof value !== "string") {
    throw moneyError(ERROR_CODES.NONCANONICAL_MONEY, `${path} must be a decimal string`, path);
  }
  if (/[eE+]/.test(value) || value === "NaN" || value === "Infinity" || value === "-Infinity") {
    throw moneyError(
      ERROR_CODES.NONCANONICAL_MONEY,
      `${path} rejects exponent, plus, NaN, and Infinity`,
      path,
    );
  }
  if (!DECIMAL_STRING.test(value)) {
    throw moneyError(
      ERROR_CODES.NONCANONICAL_MONEY,
      `${path} must be a non-negative decimal with at most ${USDC_DECIMALS} fraction digits`,
      path,
    );
  }
  const [whole, frac = ""] = value.split(".");
  const padded = frac.padEnd(USDC_DECIMALS, "0");
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, "") || "0";
  return BigInt(combined);
}

export function atomicToDecimal(atomic, decimals = USDC_DECIMALS) {
  const negative = atomic < 0n;
  const abs = negative ? -atomic : atomic;
  const digits = abs.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  const frac = digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function formatCompactUsdc(atomic) {
  const full = atomicToDecimal(atomic);
  const [whole, frac = ""] = full.split(".");
  const trimmed = frac.replace(/0+$/, "");
  if (!trimmed) return `${whole}.0`;
  return `${whole}.${trimmed}`;
}

export function findNumberMoney(node, trail = ["$"]) {
  if (typeof node === "number") {
    const key = trail[trail.length - 1];
    if (MONEY_KEYS.has(key) || key === "amountAtomic" || key === "amount") {
      return {
        path: trail.join("."),
        message: `${trail.join(".")} is a JS number; money must be a decimal or integer string`,
      };
    }
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const hit = findNumberMoney(node[i], [...trail, String(i)]);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(node)) return null;
  for (const [key, value] of Object.entries(node)) {
    const hit = findNumberMoney(value, [...trail, key]);
    if (hit) return hit;
  }
  return null;
}

export function assertAmountMatchesAtomic(amount, amountAtomic, path) {
  const atomic = parseAtomicString(amountAtomic, `${path}.amountAtomic`);
  const fromDecimal = parseUsdcDecimal(amount, `${path}.amount`);
  if (atomic !== fromDecimal) {
    throw moneyError(
      ERROR_CODES.ATOMIC_DECIMAL_MISMATCH,
      `${path}: amount ${JSON.stringify(amount)} does not match amountAtomic ${JSON.stringify(amountAtomic)} (atomic 5000 is 0.005 USDC, not 5000 dollars)`,
      path,
    );
  }
  return atomic;
}
