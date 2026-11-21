import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DiscussionError } from "./validation.js";
/** Encrypt as well as authenticate: anonymous cursors must not disclose private
 * event counts, project IDs or account bindings. Stable key permits cold resume. */
export function createCursorCodec(rawKey) {
    if (rawKey.byteLength !== 32)
        throw new Error("discussion cursorKey must be 32 bytes");
    const key = Buffer.from(rawKey);
    function scopeDigest(scope) { return createHash("sha256").update(scope).digest("hex"); }
    return {
        encode(scope, sequence, visibility) {
            const iv = randomBytes(12);
            const cipher = createCipheriv("aes-256-gcm", key, iv);
            cipher.setAAD(Buffer.from("contributor-discussion-cursor-v1"));
            const data = Buffer.from(JSON.stringify([1, scopeDigest(scope), sequence, visibility]));
            const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
            return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
        },
        decode(scope, cursor) {
            if (cursor === undefined)
                return { sequence: 0, visibility: null };
            try {
                if (typeof cursor !== "string" || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))
                    throw new Error();
                const packed = Buffer.from(cursor, "base64url");
                if (packed.toString("base64url") !== cursor || packed.length < 29)
                    throw new Error();
                const cipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
                cipher.setAAD(Buffer.from("contributor-discussion-cursor-v1"));
                cipher.setAuthTag(packed.subarray(12, 28));
                const data = JSON.parse(Buffer.concat([cipher.update(packed.subarray(28)), cipher.final()]).toString("utf8"));
                if (!Array.isArray(data) || data.length !== 4 || data[0] !== 1 || data[1] !== scopeDigest(scope) ||
                    !Number.isSafeInteger(data[2]) || data[2] < 0 || typeof data[3] !== "string" || data[3].length > 64)
                    throw new Error();
                return { sequence: data[2], visibility: data[3] };
            }
            catch {
                throw new DiscussionError("invalid_cursor");
            }
        },
    };
}
//# sourceMappingURL=cursor.js.map