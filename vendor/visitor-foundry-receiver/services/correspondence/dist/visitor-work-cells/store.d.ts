import pg from "pg";
import { type Cell, type MutationReceipt, type ReceiptResolver } from "./contracts.js";
type Context = {
    projectId: string;
    token: string;
};
export declare class WorkCellStore {
    readonly schema: string;
    private readonly ident;
    private readonly pool;
    private inFlight;
    constructor(databaseUrl: string, options: {
        schema: string;
        poolMax?: number;
        resolveReceipt?: ReceiptResolver;
    });
    private readonly resolveReceipt?;
    migrate(): Promise<void>;
    close(): Promise<void>;
    checkReady(): Promise<void>;
    private tx;
    private now;
    private authorize;
    private activeLease;
    private requireFence;
    private lease;
    mutate(context: Context, cellId: string | null, raw: unknown, rawKey: string, installedClient?: pg.PoolClient): Promise<{
        receipt: MutationReceipt;
        replayed: boolean;
        nextStep: string;
    }>;
    private transition;
    private contributor;
    get(context: Context, cellId: string): Promise<{
        cell: Cell;
        leaseLive: boolean;
        observedAt: string;
        nextStep: string;
    }>;
    replay(context: Context, cellId: string, after?: unknown, limit?: number): Promise<{
        schema: string;
        receipts: MutationReceipt[];
        hasMore: boolean;
        throughRevision: number;
        nextCursor: string | null;
    }>;
}
export {};
