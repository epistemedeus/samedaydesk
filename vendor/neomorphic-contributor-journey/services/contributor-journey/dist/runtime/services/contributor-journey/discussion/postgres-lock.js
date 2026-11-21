/** Separate small pool from the correspondence pool (avoid nested-pool deadlock).
 * Transaction advisory lock survives callbacks, not connections or restarts.
 * All controllers must use this namespace for the same authoritative project ID. */
export class PostgresProjectLock {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async run(projectId, action) {
        const client = await this.pool.connect();
        let discard = false;
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL lock_timeout = '5s'");
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`contributor-discussion-v1:${projectId}`]);
            const result = await action();
            await client.query("COMMIT");
            return result;
        }
        catch (error) {
            try {
                await client.query("ROLLBACK");
            }
            catch {
                discard = true;
            }
            throw error;
        }
        finally {
            client.release(discard);
        }
    }
}
//# sourceMappingURL=postgres-lock.js.map