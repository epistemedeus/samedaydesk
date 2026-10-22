/** Integer atomic amounts. Never IEEE floats. */
export declare function assertSafeAtomic(value: unknown, field: string): bigint;
export declare function atomicToDecimal(atomic: bigint, scale: number): string;
export declare function sumAtomic(values: bigint[]): bigint;
