export const TERMS_VERSION_PREFIX: "sha256:";
export const TERMS_VERSION_RE: RegExp;
export function isTermsVersionHash(value: unknown): boolean;
export function hashTermsVersion(input: unknown): string;
export function hashTermsIgnoringIntegerKey(input: unknown): string;
