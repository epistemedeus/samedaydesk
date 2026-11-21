import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt } from "node:crypto";
import { ApiError } from "../../earned-work/src/errors.js";
import { hashRequest, tokensEqual } from "../../earned-work/src/crypto.js";
const N = 32768;
const RECORD = /^scrypt-v1:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/;
const DUMMY = `scrypt-v1:${Buffer.alloc(16).toString("base64url")}:${Buffer.alloc(32).toString("base64url")}`;
// Bound KDF memory on this process. The durable receiving limits live in PostgreSQL.
let active = 0;
const waiting = [];
async function derive(password, salt) {
    if (active >= 2) {
        if (waiting.length >= 8)
            throw new ApiError(503, "unavailable", "Account service is busy. Retry with the same operation.");
        await new Promise(resolve => waiting.push(resolve));
    }
    else
        active += 1;
    try {
        return await new Promise((resolve, reject) => {
            scrypt(password, salt, 32, { N, r: 8, p: 1, maxmem: 40 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
        });
    }
    finally {
        const next = waiting.shift();
        if (next)
            next();
        else
            active -= 1;
    }
}
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt-v1:${salt.toString("base64url")}:${key.toString("base64url")}`;
}
export async function verifyPassword(password, record) {
    const match = RECORD.exec(record ?? DUMMY);
    if (!match)
        throw new ApiError(503, "unavailable", "Account credentials need repair.");
    const salt = Buffer.from(match[1], "base64url");
    const digest = Buffer.from(match[2], "base64url");
    if (salt.length !== 16 || digest.length !== 32 || salt.toString("base64url") !== match[1] || digest.toString("base64url") !== match[2]) {
        throw new ApiError(503, "unavailable", "Account credentials need repair.");
    }
    const candidate = await derive(password, salt);
    return tokensEqual(candidate.toString("hex"), digest.toString("hex")) && record !== null;
}
/** Encrypt only the bounded account operation result; no replacement kernel signer. */
export class AccountReceiptCipher {
    key;
    constructor(key) {
        if (key.byteLength !== 32)
            throw new Error("Account replayKey must be exactly 32 bytes");
        this.key = Buffer.from(key);
    }
    digest(value, purpose) {
        return createHmac("sha256", this.key).update(`${purpose}\0${hashRequest(value)}`).digest("hex");
    }
    seal(value, context) {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);
        cipher.setAAD(Buffer.from(context));
        const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
        return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
    }
    open(sealed, context) {
        try {
            if (typeof sealed !== "string" || sealed.length > 4096)
                throw new Error("malformed");
            const [version, ivRaw, tagRaw, dataRaw, extra] = sealed.split(".");
            if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw || extra !== undefined)
                throw new Error("malformed");
            const iv = Buffer.from(ivRaw, "base64url"), tag = Buffer.from(tagRaw, "base64url"), data = Buffer.from(dataRaw, "base64url");
            if (iv.length !== 12 || tag.length !== 16)
                throw new Error("malformed");
            const cipher = createDecipheriv("aes-256-gcm", this.key, iv);
            cipher.setAAD(Buffer.from(context));
            cipher.setAuthTag(tag);
            return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"));
        }
        catch {
            throw new ApiError(503, "unavailable", "Stored account result needs repair. Keep the same operation.");
        }
    }
}
//# sourceMappingURL=credentials.js.map