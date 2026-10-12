import type { Server } from "node:http";
/** One wall-clock deadline covers the HTTP drain and the database pool drain. */
export declare function drainRuntime(server: Pick<Server, "close">, store: {
    close(): Promise<void>;
}, timeoutMs: number): Promise<{
    forced: boolean;
    failed: boolean;
}>;
