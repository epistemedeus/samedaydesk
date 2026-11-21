import type { Pool } from "pg";
import type { ProjectLock } from "./correspondence.js";
/** Separate small pool from the correspondence pool (avoid nested-pool deadlock).
 * Transaction advisory lock survives callbacks, not connections or restarts.
 * All controllers must use this namespace for the same authoritative project ID. */
export declare class PostgresProjectLock implements ProjectLock {
    private readonly pool;
    constructor(pool: Pool);
    run<T>(projectId: string, action: () => Promise<T>): Promise<T>;
}
