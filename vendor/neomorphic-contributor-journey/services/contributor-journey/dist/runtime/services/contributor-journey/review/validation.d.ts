import type { SourceBinding, Target, ReviewSource, Handoff, AccessBinding, ClarificationEntry } from "./types.js";
export declare class ReviewError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare function fail(status: number, code: string, message: string): never;
export declare function object(value: unknown, keys: string[]): Record<string, unknown>;
export declare function text(value: unknown, max?: number): string;
export declare function id(value: unknown): string;
export declare function key(value: unknown): string;
export declare function target(value: unknown): Target;
export declare function source(value: unknown): SourceBinding;
export declare const same: (a: unknown, b: unknown) => boolean;
export declare function sourceOf(record: ReviewSource, expected: Target): SourceBinding;
export declare function handoffOf(record: ReviewSource, bound: SourceBinding): Handoff | null;
export declare function validateEntries(entries: ClarificationEntry[], bound: SourceBinding, access: AccessBinding, maxRounds: number): void;
