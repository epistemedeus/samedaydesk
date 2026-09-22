const DECIMAL_RE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,8})?$/;
const ATOMIC_RE = /^(?:0|[1-9][0-9]{0,20})$/;

export const USDC_DECIMALS = 6;

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function findNumberMoney(value, path = "$", hits = []) {
  if (typeof value === "number") {
    hits.push({ path, value });
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findNumberMoney(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === "agent402Corroboration") continue;
      findNumberMoney(item, `${path}.${key}`, hits);
    }
  }
  return hits;
}

export function decimalToAtomic(decimal, decimals = USDC_DECIMALS) {
  if (typeof decimal !== "string" || !DECIMAL_RE.test(decimal)) {
    throw new Error(`noncanonical decimal money: ${decimal}`);
  }
  const [whole, frac = ""] = decimal.split(".");
  if (frac.length > decimals) {
    throw new Error(`decimal has more than ${decimals} places: ${decimal}`);
  }
  const combined = `${whole}${frac.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  return combined.length === 0 ? "0" : combined;
}

export function atomicToDecimal(atomic, decimals = USDC_DECIMALS) {
  if (typeof atomic !== "string" || !ATOMIC_RE.test(atomic)) {
    throw new Error(`noncanonical atomic money: ${atomic}`);
  }
  const padded = atomic.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function assertAmountMatchesAtomic(amount, amountAtomic, decimals = USDC_DECIMALS) {
  const expected = decimalToAtomic(amount, decimals);
  if (expected !== String(amountAtomic)) {
    throw new Error(`atomic ${amountAtomic} is not ${amount} at ${decimals} decimals`);
  }
  return true;
}

export function canonicalAmountPair(amount, amountAtomic, decimals = USDC_DECIMALS) {
  if (amount != null && typeof amount !== "string") {
    return { ok: false, code: "float_money", message: "money must be a decimal string" };
  }
  if (amountAtomic != null && typeof amountAtomic !== "string") {
    return { ok: false, code: "float_money", message: "atomic money must be a decimal-digit string" };
  }
  if (amount == null && amountAtomic == null) {
    return { ok: false, code: "missing_amount", message: "amount or amountAtomic is required" };
  }
  try {
    const atomic = amountAtomic != null ? amountAtomic : decimalToAtomic(amount, decimals);
    const decimal = amount != null ? amount : atomicToDecimal(atomic, decimals);
    if (typeof atomic !== "string" || !ATOMIC_RE.test(atomic)) {
      return { ok: false, code: "noncanonical_money", message: "atomic money is not canonical" };
    }
    assertAmountMatchesAtomic(decimal, atomic, decimals);
    return { ok: true, amount: decimal, amountAtomic: atomic };
  } catch (cause) {
    const code = String(cause.message).includes("noncanonical") ? "noncanonical_money" : "atomic_decimal_mismatch";
    return { ok: false, code, message: cause.message };
  }
}
