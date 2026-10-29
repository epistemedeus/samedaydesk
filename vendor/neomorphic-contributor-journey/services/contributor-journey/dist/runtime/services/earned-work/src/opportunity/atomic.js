/** Integer atomic amounts. Never IEEE floats. */
export function assertSafeAtomic(value, field) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative safe integer`);
    }
    return BigInt(value);
}
export function atomicToDecimal(atomic, scale) {
    if (scale < 0 || scale > 18)
        throw new Error("atomic scale out of range");
    const negative = atomic < 0n;
    const abs = negative ? -atomic : atomic;
    const base = 10n ** BigInt(scale);
    const whole = abs / base;
    const full = (abs % base).toString().padStart(scale, "0");
    const trimmed = full.replace(/0+$/, "");
    const frac = scale >= 2 && trimmed.length < 2 ? full.slice(0, 2) : trimmed;
    const text = frac ? `${whole.toString()}.${frac}` : whole.toString();
    return negative ? `-${text}` : text;
}
export function sumAtomic(values) {
    return values.reduce((total, value) => total + value, 0n);
}
//# sourceMappingURL=atomic.js.map