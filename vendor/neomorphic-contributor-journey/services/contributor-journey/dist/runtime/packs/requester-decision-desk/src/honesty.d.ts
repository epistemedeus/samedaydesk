export declare const FORBIDDEN_COMPLETION_LABEL = "actual_completion";
export declare function isForbiddenFixtureLabel(value: unknown): boolean;
export declare function isProductionPayoutLabel(value: unknown): boolean;
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
export declare function collectSecrets(...values: Array<string | null | undefined>): string[];
export declare function assertNoSecret(text: string, secrets: string[], where: string): void;
export declare function redactSecrets(value: unknown, secrets: string[]): unknown;
export declare function jsonWithoutSecrets(value: unknown, secrets: string[]): string;
