import type { PublishedSource, ShareRecord, ShareSelection, SourceEvent } from './types.js';
export declare const SHARE_REF: RegExp;
export declare const EVENT_REF: RegExp;
export declare const DIGEST: RegExp;
export declare const id: (v: unknown) => v is string;
export declare const instant: (v: unknown) => v is string;
export declare const exact: (v: unknown, keys: string[]) => v is Record<string, unknown>;
export declare const hash: (v: unknown) => string;
export declare function fields(v: unknown): v is ShareSelection['fields'];
export declare const nextAction: (v: unknown) => v is ShareSelection["nextAction"];
export declare function selection(v: unknown, now: string): v is ShareSelection;
export declare function publishedSource(v: unknown): v is PublishedSource;
export declare function safeProjection(s: PublishedSource, f: ShareSelection['fields']): boolean;
/** Version alone is insufficient: bind the exact work, text and consent state. */
export declare const sourceBinding: (s: PublishedSource) => string;
export declare function shareRecord(v: unknown): v is ShareRecord;
export declare function eventRecord(v: unknown): v is SourceEvent;
