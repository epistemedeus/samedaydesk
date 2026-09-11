/** Atomic decimal strings. Never IEEE floats for money. */

const ATOMIC = /^(0|[1-9]\d*)(\.\d+)?$/;
const SIGNED = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const SCALE = 18n;

export function atomicDecimalString(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    if (!Number.isInteger(value)) return null;
    return String(value);
  }
  const raw = String(value).trim();
  if (!ATOMIC.test(raw)) return null;
  const [wholeRaw, fracRaw = ""] = raw.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Signed decimal for ranking nets (effort can exceed gross). Rewards still use atomicDecimalString. */
export function signedDecimalString(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return String(value);
  }
  const raw = String(value).trim();
  if (!SIGNED.test(raw)) return null;
  const neg = raw.startsWith("-");
  const mag = atomicDecimalString(neg ? raw.slice(1) : raw);
  if (mag == null) return null;
  if (mag === "0") return "0";
  return neg ? `-${mag}` : mag;
}

export function isPositiveAmount(s) {
  const v = atomicDecimalString(s);
  if (v == null) return false;
  return v !== "0";
}

function toScaled(s) {
  const v = signedDecimalString(s);
  if (v == null) return null;
  const neg = v.startsWith("-");
  const mag = neg ? v.slice(1) : v;
  const [w, f = ""] = mag.split(".");
  const frac = (f + "0".repeat(Number(SCALE))).slice(0, Number(SCALE));
  const n = BigInt(w) * 10n ** SCALE + BigInt(frac);
  return neg ? -n : n;
}

function fromScaled(n) {
  const neg = n < 0n;
  const v = neg ? -n : n;
  const scale = 10n ** SCALE;
  const w = v / scale;
  const f = (v % scale).toString().padStart(Number(SCALE), "0").replace(/0+$/, "");
  const s = f ? `${w.toString()}.${f}` : w.toString();
  return neg ? `-${s}` : s;
}

export function addDecimal(a, b) {
  const x = toScaled(a);
  const y = toScaled(b);
  if (x == null || y == null) return null;
  return fromScaled(x + y);
}

export function subDecimal(a, b) {
  const x = toScaled(a);
  const y = toScaled(b);
  if (x == null || y == null) return null;
  return fromScaled(x - y);
}

export function mulDecimal(a, b) {
  const x = toScaled(a);
  const y = toScaled(b);
  if (x == null || y == null) return null;
  return fromScaled((x * y) / 10n ** SCALE);
}

export function cmpDecimal(a, b) {
  const x = toScaled(a);
  const y = toScaled(b);
  if (x == null || y == null) return null;
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/** factor in [0,1] as decimal string (e.g. "0.7"). */
export function applyFactor(amount, factor) {
  return mulDecimal(amount, factor);
}

export function bpsFactor(bps) {
  const n = atomicDecimalString(bps);
  if (n == null) return null;
  return subDecimal("1", mulDecimal(n, "0.0001"));
}
