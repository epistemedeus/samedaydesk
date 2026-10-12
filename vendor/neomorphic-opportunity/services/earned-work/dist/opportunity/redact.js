import { ApiError } from "../errors.js";
const PRIVATE_KEY = /^(email|emailaddress|mailbox|wallet|walletdestination|payoutdestination|destination|token|secret|authorization|rawbody|messagebody|sentid|password|privatekey|credentialref|assignedscope|contributortokenid|credentialgrant)$/i;
const EMAIL_SOURCE = "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}";
const PUBLIC_CONTACT = "contact@neomorphic.io";
function hasPrivateEmail(text) {
    const matches = text.match(new RegExp(EMAIL_SOURCE, "gi"));
    if (!matches)
        return false;
    return matches.some((item) => item.toLowerCase() !== PUBLIC_CONTACT);
}
const WALLET = /0x[a-fA-F0-9]{40}/;
const BEARER = /Bearer\s+\S+/i;
const TOKEN_PREFIX = /ew_ctr_[A-Za-z0-9_-]{8,}/;
const SK = /sk-[A-Za-z0-9_-]{8,}/;
function walk(value, visit) {
    if (typeof value === "string") {
        visit(null, value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            walk(item, visit);
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            visit(key, key);
            walk(item, visit);
        }
    }
}
export function assertNoPrivate(value, field = "body") {
    walk(value, (key, text) => {
        if (key && PRIVATE_KEY.test(key.replace(/[-_]/g, "")) && !(field === "import" && key === "credentialRef")) {
            throw new ApiError(400, "private_input", `${field} must not carry personal data, tokens, or destinations`);
        }
        if (hasPrivateEmail(text) || WALLET.test(text) || BEARER.test(text) || TOKEN_PREFIX.test(text) || SK.test(text)) {
            throw new ApiError(400, "private_input", `${field} must not carry personal data, tokens, or destinations`);
        }
    });
}
const PUBLIC_DROP = new Set([
    "credentialRef",
    "contributorTokenId",
    "token",
    "credentialGrant",
    "assignedScope",
]);
export function publicJson(value, options) {
    return strip(value, options?.retainAssignedScope === true);
}
function strip(value, retainAssignedScope) {
    if (typeof value === "string" && (hasPrivateEmail(value) || WALLET.test(value) || BEARER.test(value) || TOKEN_PREFIX.test(value) || SK.test(value)))
        return "[redacted]";
    if (Array.isArray(value))
        return value.map((item) => strip(item, retainAssignedScope));
    if (!value || typeof value !== "object")
        return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (PUBLIC_DROP.has(key) && !(retainAssignedScope && key === "assignedScope"))
            continue;
        if (PRIVATE_KEY.test(key.replace(/[-_]/g, "")) && !(retainAssignedScope && key === "assignedScope"))
            continue;
        out[key] = strip(item, retainAssignedScope);
    }
    return out;
}
//# sourceMappingURL=redact.js.map