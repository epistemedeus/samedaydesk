/** Atomic decimal string. Never a float. */
export declare const DECIMAL_RE: RegExp;
export declare function assertDecimal(value: string, field?: string): string;
export declare function compareDecimal(a: string, b: string): number;
export declare function decimalGte(a: string, b: string): boolean;
export declare function addDecimal(a: string, b: string): string;
