import { FORBIDDEN_FIXTURE_LABELS } from "./constants.js";
export const FORBIDDEN_COMPLETION_LABEL = "actual_completion";
export function isForbiddenFixtureLabel(value) {
    if (typeof value !== "string")
        return false;
    if (FORBIDDEN_FIXTURE_LABELS.includes(value)) {
        return true;
    }
    return value === FORBIDDEN_COMPLETION_LABEL;
}
export function isProductionPayoutLabel(value) {
    if (typeof value !== "string")
        return false;
    const normalized = value.trim().toLowerCase();
    return (normalized === "production" ||
        normalized === "production_payout" ||
        normalized === "production-payout" ||
        normalized === "actual_completion");
}
export function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
const SECRET_KEY = /token|bearer|authorization|password|secret|private[_-]?key|mnemonic/i;
export function collectSecrets(...values) {
    const out = [];
    for (const value of values) {
        if (typeof value === "string" && value.length >= 8)
            out.push(value);
    }
    return out;
}
export function assertNoSecret(text, secrets, where) {
    for (const secret of secrets) {
        if (secret && text.includes(secret)) {
            throw new Error(`${where} must not contain bearer/token plaintext`);
        }
    }
}
export function redactSecrets(value, secrets) {
    if (typeof value === "string") {
        let out = value;
        for (const secret of secrets) {
            if (secret)
                out = out.split(secret).join("[redacted]");
        }
        return out;
    }
    if (Array.isArray(value))
        return value.map((item) => redactSecrets(item, secrets));
    if (isPlainObject(value)) {
        const copy = {};
        for (const [key, item] of Object.entries(value)) {
            if (SECRET_KEY.test(key) && typeof item === "string") {
                copy[key] = "[redacted]";
            }
            else {
                copy[key] = redactSecrets(item, secrets);
            }
        }
        return copy;
    }
    return value;
}
export function jsonWithoutSecrets(value, secrets) {
    const text = JSON.stringify(redactSecrets(value, secrets), null, 2);
    assertNoSecret(text, secrets, "desk JSON");
    return text;
}
//# sourceMappingURL=honesty.js.map