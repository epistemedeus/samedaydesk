export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, record: string | null): Promise<boolean>;
/** Encrypt only the bounded account operation result; no replacement kernel signer. */
export declare class AccountReceiptCipher {
    private readonly key;
    constructor(key: Uint8Array);
    digest(value: unknown, purpose: string): string;
    seal(value: unknown, context: string): string;
    open(sealed: string, context: string): unknown;
}
