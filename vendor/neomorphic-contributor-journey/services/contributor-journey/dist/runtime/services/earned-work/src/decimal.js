import { ApiError } from "./errors.js";
/** Atomic decimal string. Never a float. */
export const DECIMAL_RE = /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/;
export function assertDecimal(value, field = "amount") {
    if (!DECIMAL_RE.test(value) || value.length > 40) {
        throw new ApiError(400, "invalid_input", `${field} must be an atomic decimal string`);
    }
    return value;
}
export function compareDecimal(a, b) {
    const left = assertDecimal(a);
    const right = assertDecimal(b);
    const [aw, af = ""] = left.split(".");
    const [bw, bf = ""] = right.split(".");
    const scale = Math.max(af.length, bf.length);
    const ai = BigInt(aw + af.padEnd(scale, "0"));
    const bi = BigInt(bw + bf.padEnd(scale, "0"));
    return ai < bi ? -1 : ai > bi ? 1 : 0;
}
export function decimalGte(a, b) {
    return compareDecimal(a, b) >= 0;
}
export function addDecimal(a, b) {
    const left = assertDecimal(a);
    const right = assertDecimal(b);
    const [aw, af = ""] = left.split(".");
    const [bw, bf = ""] = right.split(".");
    const scale = Math.max(af.length, bf.length);
    const sum = BigInt(aw + af.padEnd(scale, "0")) + BigInt(bw + bf.padEnd(scale, "0"));
    const raw = sum.toString().padStart(scale + 1, "0");
    if (scale === 0)
        return raw.replace(/^0+(?=\d)/, "") || "0";
    const whole = raw.slice(0, raw.length - scale).replace(/^0+(?=\d)/, "") || "0";
    const frac = raw.slice(raw.length - scale).replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole;
}
//# sourceMappingURL=decimal.js.map