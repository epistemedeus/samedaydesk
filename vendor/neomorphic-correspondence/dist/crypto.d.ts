export declare function deriveOwnerToken(adminSecret: string, idempotencyKey: string): string;
export declare function issueToken(prefix: string): string;
export declare function hashToken(token: string): string;
export declare function tokensEqual(presented: string, expected: string): boolean;
export declare function hashRequest(value: unknown): string;
export declare function newId(prefix: string): string;
