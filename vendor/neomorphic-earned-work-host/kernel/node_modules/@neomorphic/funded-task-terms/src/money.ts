import { USDC_DECIMALS } from "./constants.js";

const DECIMAL_AMOUNT = /^(0|[1-9]\d*)(\.\d+)?$/;
const ATOMIC_AMOUNT = /^(0|[1-9]\d*)$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isDecimalAmountString(value: string): boolean {
  if (typeof value !== "string") return false;
  if (/[eE]/.test(value)) return false;
  if (value === "NaN" || value === "Infinity" || value === "-Infinity") return false;
  if (!DECIMAL_AMOUNT.test(value)) return false;
  return decimalIsPositive(value);
}

export function isAtomicAmountString(value: string): boolean {
  return typeof value === "string" && ATOMIC_AMOUNT.test(value) && value !== "0";
}

export function decimalIsPositive(amount: string): boolean {
  const [whole, frac = ""] = amount.split(".");
  if ((whole ?? "0") !== "0") return true;
  return /[1-9]/.test(frac);
}

export function decimalToAtomic(amount: string, decimals: number): string {
  if (!isDecimalAmountString(amount)) {
    throw new Error("amount is not a positive decimal string");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("decimals out of range");
  }
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) {
    throw new Error("amount has more fractional digits than decimals");
  }
  const padded = frac.padEnd(decimals, "0");
  const combined = `${whole ?? "0"}${padded}`.replace(/^0+(?=\d)/, "");
  const normalized = combined.replace(/^0+/, "") || "0";
  if (normalized === "0") {
    throw new Error("atomic amount must be positive");
  }
  return normalized;
}

export function assertUsdcDecimals(asset: string, decimals: number | undefined): void {
  if (asset === "USDC" && decimals != null && decimals !== USDC_DECIMALS) {
    throw new Error("USDC decimals must be 6");
  }
}

/**
 * Reject IEEE-754 / JS number money anywhere under `reward`.
 * Amounts must be decimal strings; atomic amounts must be integer strings.
 */
export function findNumberMoney(
  input: unknown,
): { path: Array<string | number>; message: string } | null {
  if (!isPlainObject(input)) return null;
  const reward = input.reward;
  if (typeof reward === "number") {
    return {
      path: ["reward"],
      message: "reward must be an object; JS numbers are not money",
    };
  }
  if (!isPlainObject(reward)) return null;
  for (const key of ["amount", "amountAtomic"] as const) {
    const value = reward[key];
    if (typeof value === "number") {
      return {
        path: ["reward", key],
        message: `reward.${key} must be a decimal/integer string, not a JS number (IEEE float forbidden)`,
      };
    }
    if (typeof value === "string" && /[eE]/.test(value)) {
      return {
        path: ["reward", key],
        message: `reward.${key} must not use exponent notation`,
      };
    }
    if (value === "NaN" || value === "Infinity" || value === "-Infinity") {
      return {
        path: ["reward", key],
        message: `reward.${key} must not be NaN or Infinity`,
      };
    }
  }
  if (typeof reward.decimals === "number" && !Number.isInteger(reward.decimals)) {
    return {
      path: ["reward", "decimals"],
      message: "reward.decimals must be an integer",
    };
  }
  return null;
}
