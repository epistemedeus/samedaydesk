export const ATOMIC_RE = /^[1-9][0-9]{0,20}$/;
export const DISPLAY_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function atomicToDisplay(atomic, decimals = 6) {
  if (typeof atomic !== "string" || !ATOMIC_RE.test(atomic)) return null;
  const n = BigInt(atomic);
  const scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  const frac = n % scale;
  if (frac === 0n) return String(whole);
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function addr(value) {
  return String(value || "").toLowerCase();
}
