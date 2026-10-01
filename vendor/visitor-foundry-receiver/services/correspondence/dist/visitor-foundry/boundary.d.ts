import pg from "pg";
export declare class IntegrationError extends Error {
    status: number;
    code: string;
    nextAction: string;
    constructor(status: number, code: string, nextAction?: string);
}
export type Context = {
    projectId: string;
    token: string;
};
export declare class FoundryBoundary {
    private pool;
    private pending;
    readonly schema: string;
    constructor(url: string, options: {
        schema: string;
        poolMax?: number;
    });
    tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T>;
    authorize(c: pg.PoolClient, ctx: Context, write?: boolean): Promise<any>;
    now(c: pg.PoolClient): Promise<string>;
    migrate(): Promise<void>;
    checkReady(): Promise<void>;
    close(): Promise<void>;
}
