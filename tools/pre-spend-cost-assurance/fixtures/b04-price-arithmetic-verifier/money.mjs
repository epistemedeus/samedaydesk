/**
 * B04 money import-shape fixture.
 * Matches Neo packs/price-arithmetic-verifier/src/money.mjs exports used here.
 * Not a rewrite of B04's packet verifier.
 */

const DECIMAL_CANONICAL = /^(0|[1-9]\d*)\.\d+$/;
const INTEGER_STRING = /^(0|[1-9]\d*)$/;

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isIntegerString(value) {
  return typeof value === "string" && INTEGER_STRING.test(value);
}

export function moneyError(code, message, path) {
  const err = new Error(message);
  err.code = code;
  err.path = path;
  return err;
}

export function isCanonicalMoneyString(value, decimals) {
  if (typeof value !== "string") return false;
  if (/[eE+]/.test(value)) return false;
  if (value === "NaN" || value === "Infinity" || value === "-Infinity") return false;
  if (!DECIMAL_CANONICAL.test(value)) return false;
  const frac = value.split(".")[1] ?? "";
  return frac.length === decimals;
}

export function decimalToAtomic(amount, decimals) {
  if (!isCanonicalMoneyString(amount, decimals)) {
    throw moneyError(
      "noncanonical_money",
      `amount must be a canonical decimal string with ${decimals} fraction digits`,
      "amount",
    );
  }
  const [whole, frac = ""] = amount.split(".");
  const combined = `${whole}${frac}`;
  return BigInt(combined.replace(/^0+(?=\d)/, "") || "0");
}

export function atomicToDecimal(atomic, decimals) {
  const value = typeof atomic === "bigint" ? atomic : BigInt(atomic);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  const frac = digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function parseIntegerCount(value, path) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
      throw moneyError("float_money", `${path} must be a non-negative integer, not a float`, path);
    }
    return BigInt(value);
  }
  if (isIntegerString(value)) {
    return BigInt(value);
  }
  throw moneyError("noncanonical_money", `${path} must be an integer or integer string`, path);
}

export function moneyScale(currency) {
  if (currency === "USD") return 2;
  if (currency === "USDC") return 6;
  throw moneyError("currency_mismatch", `unsupported currency ${currency}`, "currency");
}

const MONEY_KEYS = new Set([
  "unitPrice",
  "beforeUnitPrice",
  "afterUnitPrice",
  "impact",
  "amount",
  "amountAtomic",
  "rate",
  "value",
  "total",
  "delta",
  "costCap",
  "cap",
  "amountUsd",
]);

const INTEGER_COUNT_KEYS = new Set([
  "quantity",
  "daysInEffect",
  "decimals",
  "pr",
  "schemaVersion",
  "daysPerBillingUnit",
  "httpStatus",
  "status",
]);

export function findNumberMoney(input, path = []) {
  if (typeof input === "number") {
    const key = path.length ? String(path[path.length - 1]) : "";
    if (INTEGER_COUNT_KEYS.has(key) && Number.isInteger(input) && Number.isSafeInteger(input) && input >= 0) {
      return null;
    }
    return {
      path,
      message: `${formatPath(path)} is a JS number; money must be a decimal string (IEEE float forbidden)`,
    };
  }
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      const hit = findNumberMoney(input[i], [...path, i]);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(input)) return null;
  for (const [key, value] of Object.entries(input)) {
    if (MONEY_KEYS.has(key) && typeof value === "number") {
      return {
        path: [...path, key],
        message: `${formatPath([...path, key])} must be a decimal/integer string, not a JS number (IEEE float forbidden)`,
      };
    }
    if (typeof value === "string" && MONEY_KEYS.has(key) && /[eE]/.test(value)) {
      return {
        path: [...path, key],
        message: `${formatPath([...path, key])} must not use exponent notation`,
      };
    }
    if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
      return {
        path: [...path, key],
        message: `${formatPath([...path, key])} must not be NaN or Infinity`,
      };
    }
    const hit = findNumberMoney(value, [...path, key]);
    if (hit) return hit;
  }
  return null;
}

function formatPath(path) {
  if (!path.length) return "$";
  return path
    .map((p, i) => (typeof p === "number" ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join("");
}

export function divBankers(numer, denom) {
  if (denom === 0n) {
    throw moneyError("arithmetic_mismatch", "division by zero", "div");
  }
  const q = numer / denom;
  const r = numer % denom;
  if (r === 0n) return q;
  const neg = numer < 0n !== denom < 0n;
  const absR = r < 0n ? -r : r;
  const absD = denom < 0n ? -denom : denom;
  const twice = absR * 2n;
  if (twice < absD) return q;
  if (twice > absD) return q + (neg ? -1n : 1n);
  if (q % 2n === 0n) return q;
  return q + (neg ? -1n : 1n);
}

export function lineImpactAtomic({ quantity, unitAtomic, daysInEffect, daysPerUnit }) {
  if (daysPerUnit === 0n) {
    throw moneyError("unit_mismatch", "daysPerUnit is zero", "unit");
  }
  return divBankers(quantity * unitAtomic * daysInEffect, daysPerUnit);
}
