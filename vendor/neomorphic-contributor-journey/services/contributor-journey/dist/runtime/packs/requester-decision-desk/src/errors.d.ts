export declare class DeskError extends Error {
    readonly code: string;
    readonly status: number | null;
    readonly details: Record<string, unknown> | undefined;
    constructor(message: string, code?: string, status?: number | null, details?: Record<string, unknown>);
}
export declare function deskError(code: string, message: string, details?: Record<string, unknown>, status?: number | null): DeskError;
export declare function isDeskError(value: unknown): value is DeskError;
